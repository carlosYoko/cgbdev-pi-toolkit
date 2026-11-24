import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceOf = value => typeof value === 'string' ? value : value?.source;

export function mergeSettings(current, shared, packageRoot, packages = []) {
  const supported = new Set(['defaultProvider', 'defaultModel', 'fullscreenExitOutput', 'defaultTools', 'defaultThinkingLevel', 'theme', 'hideThinkingBlock', 'showCacheMissNotices', 'steeringMode', 'followUpMode', 'doubleEscapeAction', 'treeFilterMode', 'quietStartup', 'tuiMode', 'fullscreenScrollbar', 'fullscreenCopyOnSelect', 'outputPad', 'autocompleteMaxVisible', 'showHardwareCursor']);
  for (const key of Object.keys(shared)) {
    if (!supported.has(key)) throw new Error(`Clave compartida no autorizada: ${key}`);
  }
  const result = structuredClone(current);
  if (shared.defaultTools !== undefined) {
    if (!Array.isArray(shared.defaultTools) || shared.defaultTools.some(x => typeof x !== 'string' || !x.startsWith('+'))) {
      throw new Error('defaultTools compartido solo admite adiciones +nombre.');
    }
    if (result.defaultTools !== undefined && !Array.isArray(result.defaultTools)) throw new Error('defaultTools local debe ser un array.');
    let tools = [...(result.defaultTools ?? [])];
    for (const addition of shared.defaultTools) {
      const name = addition.slice(1);
      tools = tools.filter(x => x !== `-${name}`);
      if (!tools.includes(name) && !tools.includes(addition)) tools.push(addition);
    }
    result.defaultTools = tools;
  }
  const enums = {
    defaultThinkingLevel: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    steeringMode: ['all', 'one-at-a-time'], followUpMode: ['all', 'one-at-a-time'],
    doubleEscapeAction: ['tree', 'fork', 'none'],
    treeFilterMode: ['default', 'no-tools', 'user-only', 'labeled-only', 'all'],
    tuiMode: ['regular', 'fullscreen'], fullscreenScrollbar: ['auto', 'always', 'hidden'],
  };
  for (const [key, options] of Object.entries(enums)) if (shared[key] !== undefined && !options.includes(shared[key])) throw new Error(`${key} inválido.`);
  for (const key of ['theme', 'defaultProvider', 'defaultModel', 'fullscreenExitOutput']) if (shared[key] !== undefined && (typeof shared[key] !== 'string' || !shared[key].trim())) throw new Error(`${key} debe ser texto no vacío.`);
  for (const key of ['hideThinkingBlock', 'showCacheMissNotices', 'fullscreenCopyOnSelect', 'showHardwareCursor']) if (shared[key] !== undefined && typeof shared[key] !== 'boolean') throw new Error(`${key} debe ser booleano.`);
  if (shared.quietStartup !== undefined && typeof shared.quietStartup !== 'boolean' && shared.quietStartup !== 'header') throw new Error('quietStartup inválido.');
  if (shared.outputPad !== undefined && ![0, 1].includes(shared.outputPad)) throw new Error('outputPad inválido.');
  if (shared.autocompleteMaxVisible !== undefined && (!Number.isSafeInteger(shared.autocompleteMaxVisible) || shared.autocompleteMaxVisible < 3 || shared.autocompleteMaxVisible > 20)) throw new Error('autocompleteMaxVisible inválido.');
  for (const key of Object.keys(shared)) if (key !== 'defaultTools') result[key] = shared[key];
  if (!Array.isArray(packages)) throw new Error('packages.json debe ser un array.');
  for (const source of packages) {
    // Keep dependency declarations explicit and versioned; never execute shell strings.
    const exactNpm = /^npm:(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
    const pinnedGit = /^git:(?:(?:https:\/\/)?[a-zA-Z0-9.-]+\/|git@[a-zA-Z0-9.-]+:)[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+@(?:[a-fA-F0-9]{7,40}|v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;
    if (typeof source !== 'string' || !(exactNpm.test(source) || pinnedGit.test(source))) {
      throw new Error('Cada paquete debe usar versión npm exacta (1.2.3) o commit/tag Git de versión (v1.2.3), sin credenciales en la URL.');
    }
  }
  if (result.packages !== undefined && !Array.isArray(result.packages)) throw new Error('packages local debe ser un array.');
  result.packages = [...(result.packages ?? [])];
  for (const source of [packageRoot, ...packages]) {
    const found = result.packages.some(entry => {
      const existing = sourceOf(entry);
      if (existing === source) return true;
      return typeof existing === 'string' && path.isAbsolute(existing) && path.isAbsolute(source) && path.resolve(existing) === path.resolve(source);
    });
    if (!found) {
      const identity = s => s.startsWith('npm:') || s.startsWith('git:') ? s.slice(0, s.lastIndexOf('@')) : s;
      const index = result.packages.findIndex(entry => typeof sourceOf(entry) === 'string' && identity(sourceOf(entry)) === identity(source));
      if (index < 0) result.packages.push(source);
      else if (typeof result.packages[index] === 'string') result.packages[index] = source;
      else result.packages[index] = { ...result.packages[index], source };
    }
  }
  return result;
}

export async function apply({ agentDir, dryRun = false, check = false, packageRoot = root, log = console.log }) {
  const [shared, packages] = await Promise.all([
    fs.readFile(path.join(packageRoot, 'config/settings.shared.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(packageRoot, 'config/packages.json'), 'utf8').then(JSON.parse),
  ]);
  const target = path.join(agentDir, 'settings.json');
  const appendTarget = path.join(agentDir, 'APPEND_SYSTEM.md');
  const appendSource = path.join(packageRoot, 'APPEND_SYSTEM.md');
  let original;
  try { original = await fs.readFile(target, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const appendContent = await fs.readFile(appendSource, 'utf8');
  const appendOriginal = await fs.readFile(appendTarget, 'utf8').catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
  const current = original === undefined ? {} : JSON.parse(original);
  if (!current || typeof current !== 'object' || Array.isArray(current)) throw new Error('settings.json debe contener un objeto.');
  const merged = mergeSettings(current, shared, packageRoot, packages);
  const keys = Object.keys(merged).filter(k => JSON.stringify(current[k]) !== JSON.stringify(merged[k]));
  const appendChanged = appendOriginal !== appendContent;
  if (!keys.length && !appendChanged) { log('Configuración al día.'); return { changed: false }; }
  if (keys.length) log(`Claves a actualizar: ${keys.join(', ')}. No se muestran valores locales.`);
  if (appendChanged) log('APPEND_SYSTEM.md se instalará o actualizará.');
  if (check || dryRun) return { changed: true };
  await fs.mkdir(agentDir, { recursive: true });
  if (original !== undefined || (appendChanged && appendOriginal !== undefined)) {
    const backupDir = path.join(agentDir, 'toolkit-backups');
    await fs.mkdir(backupDir, { recursive: true });
    const suffix = `${Date.now()}-${process.pid}-${Math.random().toString(16).slice(2)}`;
    const name = `settings-${suffix}.json`;
    if (original !== undefined) {
      await fs.writeFile(path.join(backupDir, name), original, { mode: 0o600, flag: 'wx' });
      log(`Copia de seguridad: ${path.join(backupDir, name)}`);
    }
    if (appendChanged && appendOriginal !== undefined) {
      const appendBackup = path.join(backupDir, `APPEND_SYSTEM-${suffix}.md`);
      await fs.writeFile(appendBackup, appendOriginal, { mode: 0o600, flag: 'wx' });
      log(`Copia de seguridad de APPEND_SYSTEM.md creada.`);
    }
  }
  if (appendChanged) await fs.writeFile(appendTarget, appendContent, { mode: 0o600 });
  if (!keys.length) { log('APPEND_SYSTEM.md aplicado.'); return { changed: true }; }
  const temporary = `${target}.toolkit-${process.pid}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(merged, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    await fs.rename(temporary, target);
  } finally { await fs.rm(temporary, { force: true }); }
  log('Aplicado. Ejecuta /reload en Pi o reinícialo.');
  return { changed: true };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    let agentDir = process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.pi', 'agent');
    let check = false, dryRun = false;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--check') check = true;
      else if (args[i] === '--dry-run') dryRun = true;
      else if (args[i] === '--agent-dir' && args[i + 1]) agentDir = path.resolve(args[++i]);
      else throw new Error(`Argumento desconocido o incompleto: ${args[i]}`);
    }
    const result = await apply({ agentDir, check, dryRun });
    if (check && result.changed) process.exitCode = 1;
  } catch (error) { console.error(`No aplicado: ${error.message}`); process.exitCode = 1; }
}
