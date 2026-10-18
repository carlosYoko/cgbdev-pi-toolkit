import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceOf = value => typeof value === 'string' ? value : value?.source;

export function mergeSettings(current, shared, packageRoot, packages = []) {
  const supported = new Set(['defaultTools', 'codemode']);
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
  if (shared.codemode !== undefined) {
    if (!shared.codemode || typeof shared.codemode !== 'object' || Array.isArray(shared.codemode)) throw new Error('codemode debe ser un objeto.');
    if (Object.keys(shared.codemode).some(k => !['mode', 'inlineBudget'].includes(k))) throw new Error('Opción codemode no autorizada.');
    if (shared.codemode.mode !== undefined && !['on', 'only'].includes(shared.codemode.mode)) throw new Error('Modo codemode inválido.');
    if (shared.codemode.inlineBudget !== undefined && (!Number.isSafeInteger(shared.codemode.inlineBudget) || shared.codemode.inlineBudget < 0)) throw new Error('inlineBudget inválido.');
    result.codemode = { ...result.codemode, ...shared.codemode };
  }
  if (!Array.isArray(packages)) throw new Error('packages.json debe ser un array.');
  for (const source of packages) {
    // Keep dependency declarations explicit and versioned; never execute shell strings.
    if (typeof source !== 'string' || !( /^npm:(?:@[^/]+\/)?[^@]+@[^\s]+$/.test(source) || /^git:[^\s]+@[^\s]+$/.test(source))) {
      throw new Error('Cada paquete externo debe fijar una versión npm o referencia Git.');
    }
    if (/[@](latest|next|main|master)$/.test(source) || source.includes('*') || source.includes('^') || source.includes('~')) throw new Error('Usa versiones o referencias estables, no rangos ni ramas móviles.');
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
  let original;
  try { original = await fs.readFile(target, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const current = original === undefined ? {} : JSON.parse(original);
  if (!current || typeof current !== 'object' || Array.isArray(current)) throw new Error('settings.json debe contener un objeto.');
  const merged = mergeSettings(current, shared, packageRoot, packages);
  const keys = Object.keys(merged).filter(k => JSON.stringify(current[k]) !== JSON.stringify(merged[k]));
  if (!keys.length) { log('Configuración al día.'); return { changed: false }; }
  log(`Claves a actualizar: ${keys.join(', ')}. No se muestran valores locales.`);
  if (check || dryRun) return { changed: true };
  await fs.mkdir(agentDir, { recursive: true });
  if (original !== undefined) {
    const backupDir = path.join(agentDir, 'toolkit-backups');
    await fs.mkdir(backupDir, { recursive: true });
    const name = `settings-${Date.now()}-${process.pid}.json`;
    await fs.writeFile(path.join(backupDir, name), original, { mode: 0o600, flag: 'wx' });
    log(`Copia de seguridad: ${path.join(backupDir, name)}`);
  }
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
