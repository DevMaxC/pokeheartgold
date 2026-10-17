import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,copyFile,symlink,writeFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

test('fresh source validation publishes a complete staged terrace field and preserves the last field on rejection',async()=>{
 const browser=fileURLToPath(new URL('../../',import.meta.url)),temporary=await mkdtemp(join(tmpdir(),'hg-terrace-publication-'));
 try{
  await mkdir(join(temporary,'scripts'));await mkdir(join(temporary,'public/source/terraces'),{recursive:true});await mkdir(join(temporary,'.generated/terraces'),{recursive:true});
  await writeFile(join(temporary,'package.json'),' {"type":"module"}\n');
  await copyFile(join(browser,'scripts/export_ledge_profiles.ts'),join(temporary,'scripts/export_ledge_profiles.ts'));
  await symlink(join(browser,'src'),join(temporary,'src'));await symlink(join(browser,'node_modules'),join(temporary,'node_modules'));
  for(const entry of await readdir(join(browser,'public/source')))if(entry!=='terraces')await symlink(join(browser,'public/source',entry),join(temporary,'public/source',entry));
  const published=join(temporary,'public/source/terraces/0.json'),staged=join(temporary,'.generated/terraces/0.json'),original=await readFile(join(browser,'public/source/terraces/0.json'),'utf8');await writeFile(published,original);
  const execute=()=>spawnSync(process.execPath,['--experimental-transform-types',join(temporary,'scripts/export_ledge_profiles.ts')],{cwd:temporary,encoding:'utf8',timeout:120000,maxBuffer:1024*1024});
  const unsupported=JSON.parse(original);delete unsupported.nativeCornerEdges;unsupported.cornerEdges.push([605,396,56],[605,396,59]);await writeFile(staged,JSON.stringify(unsupported));
  const rejected=execute();assert.equal(rejected.error,undefined);assert.equal(rejected.status,1,rejected.stderr);assert.match(rejected.stderr,/Corner has no supported physical drop|Unproven native ledge corner/);
  assert.equal(await readFile(published,'utf8'),original,'A rejected candidate cannot replace the field used by the game');await access(staged);
  const complete=JSON.parse(original);delete complete.nativeCornerEdges;complete.publicationFixture='freshly-verified';await writeFile(staged,JSON.stringify(complete));
  const accepted=execute();assert.equal(accepted.error,undefined);assert.equal(accepted.status,0,accepted.stderr);const result=JSON.parse(await readFile(published,'utf8'));
  assert.equal(result.publicationFixture,'freshly-verified','The staged candidate is promoted, not the previous public field');assert.equal(Object.keys(result.nativeCornerEdges).length,96);assert.equal(Object.keys(result.nativeEdges).length,1453);assert.deepEqual(result.nativeCornerEdges,JSON.parse(original).nativeCornerEdges);
  await assert.rejects(access(staged),{code:'ENOENT'});await assert.rejects(access(join(temporary,'.generated/terraces/0.verified.json')),{code:'ENOENT'});
  assert.equal(await readFile(join(browser,'public/source/terraces/0.json'),'utf8'),original,'The isolated producer test does not mutate the serving source');
 }finally{await rm(temporary,{recursive:true,force:true});}
});
