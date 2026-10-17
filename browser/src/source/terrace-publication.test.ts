import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,copyFile,symlink,writeFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {currentTerraceGeneration} from '../../scripts/terrace_stage.ts';

test('fresh source validation publishes a complete staged terrace field and preserves the last field on rejection',async()=>{
 const browser=fileURLToPath(new URL('../../',import.meta.url)),temporary=await mkdtemp(join(tmpdir(),'hg-terrace-publication-'));
 try{
  await mkdir(join(temporary,'scripts'));await mkdir(join(temporary,'public/source/terraces'),{recursive:true});await mkdir(join(temporary,'.generated/terraces'),{recursive:true});
  await writeFile(join(temporary,'package.json'),' {"type":"module"}\n');
  for(const name of['export_ledge_profiles.ts','terrace_stage.ts','ledge_corner_art.ts','export_terraces.py','ledge_corner_topology.py'])await copyFile(join(browser,'scripts',name),join(temporary,'scripts',name));
  await symlink(join(browser,'src'),join(temporary,'src'));await symlink(join(browser,'node_modules'),join(temporary,'node_modules'));
  for(const entry of await readdir(join(browser,'public/source')))if(entry==='land'){await mkdir(join(temporary,'public/source/land'));for(const asset of await readdir(join(browser,'public/source/land')))if(asset==='1-2.glb')await copyFile(join(browser,'public/source/land',asset),join(temporary,'public/source/land',asset));else await symlink(join(browser,'public/source/land',asset),join(temporary,'public/source/land',asset));}else if(entry!=='terraces')await symlink(join(browser,'public/source',entry),join(temporary,'public/source',entry));
  const published=join(temporary,'public/source/terraces/0.json'),staged=join(temporary,'.generated/terraces/0.json'),original=await readFile(join(browser,'public/source/terraces/0.json'),'utf8');await writeFile(published,original);
  const foundation=join(temporary,'public/source/terraces/foundations-0.json');await copyFile(join(browser,'public/source/terraces/foundations-0.json'),foundation);const foundationBytes=await readFile(foundation);
  const generation=await currentTerraceGeneration(pathToFileURL(temporary+'/'),0),execute=(promote=true)=>spawnSync(process.execPath,['--experimental-transform-types',join(temporary,'scripts/export_ledge_profiles.ts'),'0',...(promote?['--staged']:[])],{cwd:temporary,encoding:'utf8',timeout:120000,maxBuffer:1024*1024});
  const stale=JSON.parse(original);stale._generation=generation;stale.publicationFixture='old-stage';await writeFile(staged,JSON.stringify(stale));await writeFile(foundation,Buffer.concat([foundationBytes,Buffer.from('\n')]));
  const staleResult=execute();assert.equal(staleResult.status,1);assert.match(staleResult.stderr,/Stale terrace stage input public\/source\/terraces\/foundations-0.json/);assert.equal(await readFile(published,'utf8'),original);
  const revalidate=execute(false);assert.equal(revalidate.status,0,revalidate.stderr);assert.match(revalidate.stdout,/"input":"published"/);assert.equal(await readFile(published,'utf8'),original);await access(staged);await writeFile(foundation,foundationBytes);
  const unsupported=JSON.parse(original);unsupported._generation=generation;delete unsupported.nativeCornerEdges;unsupported.cornerEdges.push([605,396,56],[605,396,59]);await writeFile(staged,JSON.stringify(unsupported));
  const rejected=execute();assert.equal(rejected.error,undefined);assert.equal(rejected.status,1,rejected.stderr);assert.match(rejected.stderr,/Corner has no supported physical drop|Unproven native ledge corner/);
  assert.equal(await readFile(published,'utf8'),original,'A rejected candidate cannot replace the field used by the game');await access(staged);
  const nativeAsset=join(temporary,'public/source/land/1-2.glb'),nativeBytes=await readFile(nativeAsset),length=nativeBytes.readUInt32LE(12),model=JSON.parse(nativeBytes.subarray(20,20+length).toString());for(const scene of model.scenes)scene.nodes=[];
  let encoded=JSON.stringify(model);encoded+=' '.repeat((4-Buffer.byteLength(encoded)%4)%4);const chunk=Buffer.from(encoded),tail=nativeBytes.subarray(20+length),empty=Buffer.alloc(20+chunk.length+tail.length);nativeBytes.copy(empty,0,0,20);empty.writeUInt32LE(empty.length,8);empty.writeUInt32LE(chunk.length,12);chunk.copy(empty,20);tail.copy(empty,20+chunk.length);await writeFile(nativeAsset,empty);
  const missingFloor=JSON.parse(original);missingFloor.ledges=[];missingFloor.cornerEdges=[[603,396,56],[603,396,59]];missingFloor._generation=await currentTerraceGeneration(pathToFileURL(temporary+'/'),0);await writeFile(staged,JSON.stringify(missingFloor));const fallback=execute();assert.equal(fallback.status,1);assert.match(fallback.stderr,/Missing native visible-floor corner profile/);assert.equal(await readFile(published,'utf8'),original);await writeFile(nativeAsset,nativeBytes);
  for(const edges of[[[603,396,0]],[[603,396,56],[603,396,56]]]){const invalid=JSON.parse(original);invalid.ledges=[];invalid.cornerEdges=edges;invalid._generation=generation;await writeFile(staged,JSON.stringify(invalid));const rejectedSector=execute();assert.equal(rejectedSector.status,1);assert.match(rejectedSector.stderr,/Invalid corner direction|Invalid corner sector/);assert.equal(await readFile(published,'utf8'),original);}
  const nonFinite=JSON.parse(original);nonFinite.ledges=[];nonFinite.cornerEdges=[[603,396,56],[603,396,59]];nonFinite.scale=0;nonFinite._generation=generation;await writeFile(staged,JSON.stringify(nonFinite));const rejectedHeight=execute();assert.equal(rejectedHeight.status,1);assert.match(rejectedHeight.stderr,/Corner has no supported physical drop/);assert.equal(await readFile(published,'utf8'),original);
  const complete=JSON.parse(original);complete._generation=generation;for(const key in complete.nativeEdges)complete.nativeEdges[key]=[-999];for(const key in complete.nativeCornerEdges)complete.nativeCornerEdges[key]=[-999];complete.publicationFixture='freshly-verified';await writeFile(staged,JSON.stringify(complete));
  const accepted=execute();assert.equal(accepted.error,undefined);assert.equal(accepted.status,0,accepted.stderr);const result=JSON.parse(await readFile(published,'utf8'));
  assert.equal(result.publicationFixture,'freshly-verified','The staged candidate is promoted, not the previous public field');assert.equal(result._generation,undefined);assert.equal(Object.keys(result.nativeCornerEdges).length,96);assert.deepEqual(result.nativeEdges,JSON.parse(original).nativeEdges,'Every corrupt original profile is recomputed');assert.deepEqual(result.nativeCornerEdges,JSON.parse(original).nativeCornerEdges,'Every corrupt corner profile is recomputed');
  await assert.rejects(access(staged),{code:'ENOENT'});await assert.rejects(access(join(temporary,'.generated/terraces/0.verified.json')),{code:'ENOENT'});
  assert.equal(await readFile(join(browser,'public/source/terraces/0.json'),'utf8'),original,'The isolated producer test does not mutate the serving source');
 }finally{await rm(temporary,{recursive:true,force:true});}
});
