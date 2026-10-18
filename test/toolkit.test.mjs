import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createToolkit, safePath, assertNoSecrets } from '../scripts/toolkit.mjs';
import { mergeSettings } from '../scripts/setup.mjs';
const execute = promisify(execFile);

test('rutas compartibles y detección de secretos', () => {
  for (const name of ['extensions/test.ts','skills/common/a/SKILL.md','README.md']) assert.equal(safePath(name),true);
  for (const name of ['auth.json','skills/work/a/SKILL.md','local/test','../README.md','extensions/.env','extensions/../auth.json','/README.md']) assert.equal(safePath(name),false);
  assert.throws(() => assertNoSecrets('ghp_' + 'a'.repeat(30)));
  assert.throws(() => assertNoSecrets(['-----BEGIN','PRIVATE KEY-----'].join(' ')));
  assert.doesNotThrow(() => assertNoSecrets('ordinary documentation'));
});

test('solo versiones exactas y fuentes sin credenciales', () => {
  for (const source of ['npm:foo@1','npm:foo@latest','npm:foo@^1.2.3','git:github.com/org/repo@feature','git:https://secret@example.com/org/repo@v1.2.3']) assert.throws(() => mergeSettings({}, {}, '/toolkit', [source]));
  for (const source of ['npm:@example/foo@1.2.3','git:github.com/org/repo@v1.2.3','git:github.com/org/repo@abcdef1234567']) assert.doesNotThrow(() => mergeSettings({}, {}, '/toolkit', [source]));
});

async function fixture(t, { answers = [], input = async () => 'Test shared change' } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-command-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const git = async (...args) => (await execute('git', args, {cwd:root})).stdout;
  await git('init','-b','main');
  await git('config','user.name','Toolkit Test');
  await git('config','user.email','toolkit@example.invalid');
  await git('config','commit.gpgsign','false');
  await git('config','core.autocrlf','false');
  await fs.mkdir(path.join(root,'config'));
  await fs.writeFile(path.join(root,'package.json'),JSON.stringify({name:'cgbdev-pi-toolkit'}));
  await fs.writeFile(path.join(root,'README.md'),'Initial\n');
  await fs.writeFile(path.join(root,'config/packages.json'),'[]\n');
  await fs.writeFile(path.join(root,'config/settings.shared.json'),'{}\n');
  await git('add','package.json','README.md','config');
  await git('commit','-m','Initial');
  await git('remote','add','origin','https://github.com/carlosYoko/cgbdev-pi-toolkit.git');
  await git('update-ref','refs/remotes/origin/main','HEAD');
  const calls=[], notifications=[], prompts=[];
  const run = async (command,args,options) => {
    calls.push({command,args:[...args]});
    if(command !== 'git') return {stdout:'',stderr:'',code:0};
    const realArgs=args[0]==='--literal-pathspecs'?args.slice(1):args;
    if (realArgs[0]==='fetch' || realArgs[0]==='push') return {stdout:'',stderr:'',code:0};
    try {const r=await execute(command,args,{cwd:options.cwd});return {stdout:r.stdout,stderr:r.stderr,code:0};}
    catch(error){return {stdout:error.stdout??'',stderr:error.stderr??'',code:error.code??1};}
  };
  const handle=createToolkit({root,agentDir:path.join(root,'local-agent'),run,
    confirm:async(title,message)=>{prompts.push({title,message});return answers.shift()??false;},
    input,notify:message=>notifications.push(message),piCommand:{command:'fake-pi',args:[]},piVersion:'test'});
  return {root,git,handle,calls,notifications,prompts};
}
const gitCalls = f => f.calls.filter(c=>c.command==='git').map(c=>c.args.slice(1));

test('status no hace fetch ni modifica el repositorio', async t => {
  const f=await fixture(t);await f.handle('status');
  assert.match(f.notifications[0],/Sin cambios locales/);
  assert.equal(gitCalls(f).some(a=>['fetch','add','commit','push'].includes(a[0])),false);
});

test('add cancelado no modifica el manifiesto', async t => {
  const f=await fixture(t);await f.handle('add npm:example@1.2.3');
  assert.equal(await fs.readFile(path.join(f.root,'config/packages.json'),'utf8'),'[]\n');
  assert.equal(f.calls.some(c=>c.command==='fake-pi'),false);
});

test('add registra versión fijada y reconcilia sin publicar', async t => {
  const f=await fixture(t,{answers:[true]});await f.handle('add npm:example@1.2.3');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.root,'config/packages.json'),'utf8')),['npm:example@1.2.3']);
  assert.equal(f.calls.some(c=>c.command==='fake-pi'&&c.args.join(' ')==='update --extensions'),true);
  assert.equal(gitCalls(f).some(a=>a[0]==='push'),false);
});

test('sync se detiene con cambios locales antes del fetch', async t => {
  const f=await fixture(t);await fs.writeFile(path.join(f.root,'README.md'),'Local edit');
  await assert.rejects(f.handle('sync'),/cambios locales/);
  assert.equal(gitCalls(f).some(a=>a[0]==='fetch'),false);
});

test('sync cancelado no ejecuta código ni hace merge', async t => {
  const f=await fixture(t);await f.handle('sync');
  assert.equal(f.calls.some(c=>c.command!=='git'),false);
  assert.equal(gitCalls(f).some(a=>a[0]==='merge'),false);
});

test('sync confirmado solo hace avance rápido y ejecuta tests/setup', async t => {
  const f=await fixture(t,{answers:[true]});await f.handle('sync');
  assert.equal(gitCalls(f).some(a=>a[0]==='merge'&&a[1]==='--ff-only'),true);
  assert.equal(f.calls.some(c=>c.command===process.execPath&&c.args[0]==='--test'),true);
  assert.equal(f.calls.some(c=>c.args[0]==='scripts/setup.mjs'),true);
});

test('rechaza otro repositorio remoto', async t => {
  const f=await fixture(t);await f.git('remote','set-url','origin','https://github.com/other/repo.git');
  await assert.rejects(f.handle('sync'),/origin no es/);
});

test('publish se detiene con secretos o rutas no compartibles', async t => {
  const f=await fixture(t);
  await fs.writeFile(path.join(f.root,'README.md'),'ghp_'+'a'.repeat(30));
  await assert.rejects(f.handle('publish'),/Posible secreto/);
  assert.equal(gitCalls(f).some(a=>a[0]==='add'),false);
  await fs.writeFile(path.join(f.root,'README.md'),'Initial\n');
  await fs.writeFile(path.join(f.root,'auth.json'),'{}');
  await assert.rejects(f.handle('publish'),/Ruta no compartible/);
});

test('publish no utiliza un índice preparado previamente', async t => {
  const f=await fixture(t);await fs.writeFile(path.join(f.root,'README.md'),'Changed');await f.git('add','README.md');
  await assert.rejects(f.handle('publish'),/índice/);
});

test('publish revisa diff, añade rutas explícitas y pide confirmación para push', async t => {
  const f=await fixture(t,{answers:[true,true]});await fs.writeFile(path.join(f.root,'README.md'),'Shared update\n');
  await f.handle('publish');
  assert.match(f.prompts[0].message,/Shared update/);
  assert.equal(f.prompts.length,2);
  assert.deepEqual(gitCalls(f).find(a=>a[0]==='add'),['add','--','README.md']);
  const push=gitCalls(f).find(a=>a[0]==='push');
  assert.equal(push[1],'origin');assert.match(push[2],/^[a-f0-9]{40}:refs\/heads\/main$/);
});

test('rechazar push conserva el commit local sin publicar', async t => {
  const f=await fixture(t,{answers:[true,false]});await fs.writeFile(path.join(f.root,'README.md'),'Shared update\n');
  await f.handle('publish');
  assert.equal((await f.git('rev-list','--count','origin/main..HEAD')).trim(),'1');
  assert.equal(gitCalls(f).some(a=>a[0]==='push'),false);
});

test('publish detecta cambios durante la revisión', async t => {
  let f;
  f=await fixture(t,{answers:[true],input:async()=>{await fs.writeFile(path.join(f.root,'README.md'),'Changed after review');return 'Message';}});
  await fs.writeFile(path.join(f.root,'README.md'),'First review');
  await assert.rejects(f.handle('publish'),/cambió durante la revisión/);
  assert.equal(gitCalls(f).some(a=>a[0]==='add'),false);
});
