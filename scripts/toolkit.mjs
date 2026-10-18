import fs from 'node:fs/promises';
import path from 'node:path';
import { mergeSettings } from './setup.mjs';

export const commands = ['status', 'add', 'sync', 'publish', 'doctor'];
export const help = '/toolkit status | add npm:paquete@1.2.3 | sync | publish | doctor';
const allowedRoots = ['config/', 'extensions/', 'skills/common/', 'prompts/', 'themes/', 'scripts/', 'test/', '.github/workflows/'];
const allowedFiles = new Set(['README.md', 'LICENSE', 'AGENTS.md', 'package.json', 'package-lock.json', '.gitignore', '.gitattributes']);
export function safePath(name) {
  return !name.includes('\\') && !name.split('/').some(p => p === '..' || p === '.' || /^(?:\.env(?:\..*)?|auth\.json|sessions|local|backups|node_modules)$/i.test(p)) && !name.startsWith('/') && (allowedFiles.has(name) || allowedRoots.some(p => name.startsWith(p)));
}
export function assertNoSecrets(text, label = 'contenido') {
  if (/-----BEGIN (?:[A-Z ]*PRIVATE KEY)-----|\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}|\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}|\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}/.test(text)) {
    throw new Error(`Posible secreto en ${label}. No se publica. Revísalo sin imprimir credenciales.`);
  }
}
const splitNull = value => value.split('\0').filter(Boolean);

// All processes use argument arrays, never shell strings. UI and process execution are injected.
export function createToolkit({ root, agentDir, run, confirm, input, notify, piCommand, piVersion = 'unknown' }) {
  let busy = false;
  async function exec(command, args, options = {}) {
    const result = await run(command, args, { cwd: root, timeout: 120000, ...options });
    if (result.killed || result.code !== 0) throw new Error(`Falló ${path.basename(command)} ${args[0] ?? ''} (código ${result.code}). No se muestra la salida para evitar exponer datos locales. Revisa la operación manualmente.`);
    return result.stdout;
  }
  const git = (...args) => exec('git', ['--literal-pathspecs', ...args]);
  const node = (...args) => exec(process.versions.bun ? 'node' : process.execPath, args, { timeout: 180000 });
  const setupArgs = ['scripts/setup.mjs', '--agent-dir', agentDir];
  async function identity() {
    const top = await fs.realpath((await git('rev-parse', '--show-toplevel')).trim());
    if (top !== await fs.realpath(root)) throw new Error('La raíz Git no coincide con el toolkit.');
    const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
    if (pkg.name !== 'cgbdev-pi-toolkit') throw new Error('Este comando solo gestiona cgbdev-pi-toolkit.');
  }
  async function branchAndRemote() {
    if ((await git('branch', '--show-current')).trim() !== 'main') throw new Error('Operación disponible solo en main; no se cambia de rama automáticamente.');
    for (const option of [[], ['--push']]) {
      const remote = (await git('remote', 'get-url', ...option, 'origin')).trim();
      if (!/^(?:https:\/\/github\.com\/|git@github\.com:)carlosYoko\/cgbdev-pi-toolkit(?:\.git)?$/.test(remote)) throw new Error('origin no es el repositorio esperado de GitHub. Revisa fetch/push URL.');
    }
  }
  async function clean() {
    if ((await git('status', '--porcelain')).trim()) throw new Error('Hay cambios locales. Publícalos o resuélvelos antes; no se guardan, borran ni mezclan automáticamente.');
  }
  async function ask(title, message) {
    if (!await confirm(title, message)) { notify('Cancelado.'); return false; }
    return true;
  }
  async function dependencies() {
    const packages = JSON.parse(await fs.readFile(path.join(root, 'config/packages.json'), 'utf8'));
    if (!packages.length) return;
    if (!piCommand) throw new Error('No se localizó el ejecutable de Pi. Ejecuta pi update --extensions manualmente.');
    await exec(piCommand.command, [...piCommand.args, 'update', '--extensions'], { timeout: 300000 });
  }
  async function status() {
    const branch = (await git('branch', '--show-current')).trim();
    const files = await git('status', '--short');
    let counts = 'Sin referencia origin/main.';
    try { counts = (await git('rev-list', '--left-right', '--count', 'HEAD...origin/main')).trim().replace(/\s+/, ' por publicar / ') + ' por descargar (referencia local, sin fetch).'; } catch {}
    notify(`Toolkit: ${root}\nRama: ${branch}\n${counts}\n${files || 'Sin cambios locales.'}`);
  }
  async function doctor() {
    const settings = await fs.readFile(path.join(agentDir, 'settings.json'), 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return {}; throw error; });
    const shared = JSON.parse(await fs.readFile(path.join(root, 'config/settings.shared.json'), 'utf8'));
    const packages = JSON.parse(await fs.readFile(path.join(root, 'config/packages.json'), 'utf8'));
    const merged = mergeSettings(settings, shared, root, packages);
    const applied = JSON.stringify(settings) === JSON.stringify(merged);
    await node('--test');
    const gitVersion = (await exec('git', ['--version'])).trim();
    notify(`Node ${process.version}; Pi ${piVersion}; ${gitVersion}\nPruebas: correctas. Ajustes compartidos: ${applied ? 'aplicados' : 'pendientes; ejecuta npm run setup en el toolkit'}.\nNo se comprueban credenciales ni conectividad de cada plugin.`);
  }
  async function add(source) {
    if (!source || source.split(/\s+/).length !== 1) throw new Error('Uso: /toolkit add npm:paquete@1.2.3 (o git:repositorio@commit/tag).');
    mergeSettings({}, {}, root, [source]); // Reuse pinned-source validation.
    const file = path.join(root, 'config/packages.json');
    const before = await fs.readFile(file, 'utf8');
    const packages = JSON.parse(before);
    const id = s => s.slice(0, s.lastIndexOf('@'));
    const next = packages.filter(s => id(s) !== id(source));
    next.push(source);
    if (!await ask('Añadir al toolkit compartido', `${source}\nSe registrará para ambos equipos y se aplicará aquí. Después se reconciliarán TODOS los paquetes declarados en Pi, incluidos los locales. Pueden ejecutar código. No se publicará en GitHub.\n¿Has revisado y confías en este paquete?`)) return;
    await fs.writeFile(file, JSON.stringify(next, null, 2) + '\n');
    // Do not roll back files/settings blindly if installation fails; report that state explicitly.
    try {
      await node(...setupArgs);
      await dependencies();
      await node('--test');
    } catch (error) {
      throw new Error(`${error.message}\nEl manifiesto ya está registrado y los ajustes pueden estar aplicados; no se ha publicado. Revisa /toolkit status antes de reintentar.`);
    }
    notify('Paquete registrado y reconciliación completada. Ejecuta /reload para cargarlo y comprobarlo. Publica cuando hayas verificado que funciona.');
  }
  async function sync() {
    await branchAndRemote();
    await clean();
    await git('fetch', 'origin', 'main');
    await git('merge-base', '--is-ancestor', 'HEAD', 'origin/main');
    const head = (await git('rev-parse', 'HEAD')).trim();
    const target = (await git('rev-parse', 'origin/main')).trim();
    const summary = head === target ? 'Sin commits nuevos.' : await git('diff', '--stat', head, target);
    if (!await ask('Sincronizar toolkit', `${summary}\nSe aplicará el commit ${target}. Se ejecutarán pruebas/setup del repositorio y se reconciliarán paquetes declarados (también los locales). Solo acepta cambios revisados y de confianza. ¿Continuar?`)) return;
    await clean();
    if ((await git('rev-parse', 'HEAD')).trim() !== head) throw new Error('HEAD cambió durante la confirmación. Reintenta.');
    await git('merge', '--ff-only', target);
    await node('--test');
    await node(...setupArgs);
    await dependencies();
    notify('Sincronizado. Ejecuta /reload. Las skills y credenciales locales no se han copiado al repositorio.');
  }
  async function publicationFiles() {
    const changed = splitNull(await git('diff', '--name-only', '--no-renames', '-z', 'HEAD'));
    const untracked = splitNull(await git('ls-files', '--others', '--exclude-standard', '-z'));
    const names = [...new Set([...changed, ...untracked])].sort();
    for (const name of names) {
      if (!safePath(name)) throw new Error(`Ruta no compartible: ${JSON.stringify(name)}. Mantenla fuera del toolkit.`);
      const full = path.join(root, name);
      try {
        // Reject symlinked files AND ancestor directories, including paths leading outside root.
        let cursor = full;
        while (cursor !== root) {
          if ((await fs.lstat(cursor)).isSymbolicLink()) throw new Error(`No se publican enlaces simbólicos: ${name}`);
          cursor = path.dirname(cursor);
        }
        const stat = await fs.stat(full);
        if (!stat.isFile() || stat.size > 200000) throw new Error(`Archivo no revisable o demasiado grande: ${name}`);
        const content = await fs.readFile(full, 'utf8');
        if (content.includes('\0')) throw new Error(`Archivo binario no permitido: ${name}`);
        assertNoSecrets(content, name);
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return names;
  }
  async function publish() {
    await branchAndRemote();
    if ((await git('diff', '--cached', '--name-only')).trim()) throw new Error('Hay archivos ya preparados en el índice. Revísalos y retíralos del índice antes de usar publish.');
    await git('fetch', 'origin', 'main');
    await git('merge-base', '--is-ancestor', 'origin/main', 'HEAD');
    const names = await publicationFiles();
    await node('--test');
    if (names.length) {
      const trackedDiff = await git('diff', '--no-ext-diff', '--no-textconv', '--no-renames', 'HEAD', '--', ...names);
      assertNoSecrets(trackedDiff, 'diff');
      let preview = trackedDiff;
      const untracked = new Set(splitNull(await git('ls-files', '--others', '--exclude-standard', '-z')));
      for (const name of names.filter(n => untracked.has(n))) preview += `\n--- NUEVO: ${name}\n${await fs.readFile(path.join(root, name), 'utf8')}\n`;
      if (preview.length > 40000) throw new Error('Diff demasiado grande para revisar aquí. Divídelo o publica manualmente tras revisarlo.');
      const reviewedHead = (await git('rev-parse', 'HEAD')).trim();
      const reviewed = new Map();
      for (const name of names) reviewed.set(name, await fs.readFile(path.join(root, name)).catch(e => { if (e.code === 'ENOENT') return null; throw e; }));
      if (!await ask('Revisar cambios compartidos', `${preview}\n\n${names.length} archivos. ¿Confirmas que no contienen datos personales, corporativos ni secretos? El escáner es solo una ayuda, no una garantía.`)) return;
      // Recheck exact content after the human review, before staging.
      const message = await input('Mensaje del commit', 'Describe el cambio compartido');
      if (!message?.trim()) { notify('Cancelado.'); return; }
      if ((await git('rev-parse', 'HEAD')).trim() !== reviewedHead) throw new Error('HEAD cambió durante la revisión.');
      const now = await publicationFiles();
      if (JSON.stringify(now) !== JSON.stringify(names)) throw new Error('Cambió la lista de archivos durante la revisión. Reintenta.');
      for (const [name, bytes] of reviewed) {
        const current = await fs.readFile(path.join(root, name)).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
        if (bytes === null ? current !== null : current === null || !bytes.equals(current)) throw new Error('Un archivo cambió durante la revisión. Reintenta.');
      }
      if ((await git('diff', '--cached', '--name-only')).trim()) throw new Error('El índice cambió durante la revisión.');
      await git('add', '--', ...names);
      await git('diff', '--cached', '--check');
      await git('commit', '-m', message.trim());
    }
    const commits = (await git('log', '--oneline', 'origin/main..HEAD')).trim();
    if (!commits) { notify('Nada que publicar.'); return; }
    // Scan every outgoing commit, including files removed again in later commits.
    const outgoing = await git('log', '--format=', '--no-ext-diff', '--no-textconv', '-p', 'origin/main..HEAD');
    assertNoSecrets(outgoing, 'historial por publicar');
    const outgoingPaths = splitNull(await git('log', '--format=', '--name-only', '-z', 'origin/main..HEAD')).map(s => s.trim()).filter(Boolean);
    if (outgoingPaths.some(name => !safePath(name))) throw new Error('Hay rutas no compartibles en commits pendientes. Revísalos manualmente.');
    const reviewedHead = (await git('rev-parse', 'HEAD')).trim();
    if (!await ask('Publicar en GitHub', `${commits}\nDestino: carlosYoko/cgbdev-pi-toolkit (origin/main). ¿Hacer push sin force?`)) return;
    await branchAndRemote();
    if ((await git('rev-parse', 'HEAD')).trim() !== reviewedHead) throw new Error('HEAD cambió después de revisar la publicación.');
    await git('push', 'origin', `${reviewedHead}:refs/heads/main`);
    notify('Publicado. En el otro equipo: /toolkit sync.');
  }
  return async function handle(args = '') {
    if (busy) throw new Error('Ya hay una operación del toolkit en curso.');
    const [command = 'help', ...rest] = args.trim().split(/\s+/).filter(Boolean);
    if (!commands.includes(command)) { notify(help); return; }
    if (command !== 'add' && rest.length) throw new Error(help);
    busy = true;
    try {
      await identity();
      if (command === 'status') await status();
      else if (command === 'doctor') await doctor();
      else if (command === 'add') await add(rest.join(' '));
      else if (command === 'sync') await sync();
      else await publish();
    } finally { busy = false; }
  };
}
