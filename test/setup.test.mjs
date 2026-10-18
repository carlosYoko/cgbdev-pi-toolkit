import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { apply, mergeSettings, root } from '../scripts/setup.mjs';
const shared = { defaultTools: ['+codemode'], codemode: { mode: 'on' } };

test('conserva ajustes locales, paquetes y filtros; no muta el original', () => {
  const original = { defaultModel: 'local', deviceId: 'local-only', skills: ['/local/skills'], packages: [{ source: root, skills: [] }, 'npm:local@1.0.0'], codemode: { inlineBudget: 500 } };
  const snapshot = structuredClone(original);
  const result = mergeSettings(original, shared, root);
  assert.equal(result.defaultModel, 'local');
  assert.deepEqual(result.skills, original.skills);
  assert.deepEqual(result.packages, original.packages);
  assert.equal(result.codemode.inlineBudget, 500);
  assert.deepEqual(original, snapshot);
  assert.deepEqual(mergeSettings(result, shared, root), result);
});

test('conserva selección explícita de herramientas', () => {
  assert.deepEqual(mergeSettings({defaultTools:['read','write','-codemode']}, shared, root).defaultTools, ['read','write','+codemode']);
});

test('rechaza claves compartidas sensibles, dependencias sin fijar y opciones inválidas', () => {
  assert.throws(() => mergeSettings({}, {auth: {}}, root));
  assert.throws(() => mergeSettings({}, shared, root, ['npm:plugin']));
  assert.throws(() => mergeSettings({}, shared, root, ['npm:plugin@latest']));
  assert.throws(() => mergeSettings({}, {codemode:{mode:'invalid'}}, root));
});

test('actualiza dependencia fijada sin perder sus filtros', () => {
  const result = mergeSettings({packages:[{source:'npm:@example/tools@1.0.0',skills:[]}]}, shared, root, ['npm:@example/tools@2.0.0']);
  assert.deepEqual(result.packages[0], {source:'npm:@example/tools@2.0.0',skills:[]});
  assert.equal(result.packages.length, 2);
});

test('dry-run y check no escriben; aplica con backup e idempotencia', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-toolkit-test-'));
  try {
    const original = JSON.stringify({defaultModel:'keep',skills:['local']});
    await fs.writeFile(path.join(dir,'settings.json'), original);
    await fs.writeFile(path.join(dir,'auth.json'), 'DO NOT TOUCH');
    const options = {agentDir:dir,log:()=>{}};
    assert.equal((await apply({...options,dryRun:true})).changed,true);
    assert.equal((await apply({...options,check:true})).changed,true);
    assert.deepEqual((await fs.readdir(dir)).sort(),['auth.json','settings.json']);
    await apply(options);
    assert.equal(await fs.readFile(path.join(dir,'auth.json'),'utf8'),'DO NOT TOUCH');
    const backups = await fs.readdir(path.join(dir,'toolkit-backups'));
    assert.equal(backups.length,1);
    assert.equal(await fs.readFile(path.join(dir,'toolkit-backups',backups[0]),'utf8'),original);
    assert.equal((await apply(options)).changed,false);
    assert.equal((await apply({...options,check:true})).changed,false);
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});

test('un JSON local inválido no se sobrescribe', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'pi-toolkit-test-'));
  try {
    await fs.writeFile(path.join(dir,'settings.json'),'{invalid');
    await assert.rejects(apply({agentDir:dir,log:()=>{}}));
    assert.equal(await fs.readFile(path.join(dir,'settings.json'),'utf8'),'{invalid');
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});

test('crea una configuración nueva sin tocar otros archivos', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'pi-toolkit-test-'));
  try {
    const agentDir=path.join(dir,'agent');
    await apply({agentDir,log:()=>{}});
    const settings=JSON.parse(await fs.readFile(path.join(agentDir,'settings.json'),'utf8'));
    assert.deepEqual(settings.defaultTools,['+codemode']);
    assert.deepEqual(settings.packages,[root]);
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});
