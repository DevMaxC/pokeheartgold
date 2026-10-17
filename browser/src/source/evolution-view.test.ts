import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {WorldEvolutionView,evolutionArtPath,loadEvolutionArt,type EvolutionArt} from './evolution-view.ts';
import {evolutionScene,viewFixture} from './evolution-test-fixtures.ts';
import {OriginalWorld} from './world.ts';
import {createMon,loadData} from './data.ts';

const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
async function finish(view:WorldEvolutionView){view.beginReturn();for(let i=0;i<240&&!view.cameraReturned;i++)view.update(1/60);assert.ok(view.cameraReturned);view.complete();}

test('real 3D field paper art keeps native image identity/crop and free orbit, and returns smoothly without resetting orbit',async()=>{
 const f=viewFixture(),backdrop=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());f.world.scene.add(backdrop);const scene=evolutionScene(),before=structuredClone(scene);await f.view.begin(scene,new AbortController().signal);
 assert.deepEqual(f.requests,['/source/pokemon/155-male-front.png','/source/pokemon/156-male-front.png']);assert.equal(f.world.fieldEffect,f.view);assert.equal(backdrop.parent,f.world.scene);assert.deepEqual(f.view.group.position.toArray(),[12.5,3,9.5]);assert.equal(f.actors[0].visible,false);assert.equal(f.actors[1].visible,false);
 const old=f.view.group.children.find(object=>object instanceof THREE.Mesh&&object.material instanceof THREE.ShaderMaterial&&object.material.uniforms.art.value===f.oldArt.texture)as THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>;assert.ok(old);const uv=old.geometry.getAttribute('uv');assert.equal(uv.getX(0),Math.fround(.1));assert.equal(uv.getY(0),Math.fround(.95));assert.match(old.material.fragmentShader,/c\.a<0\.15/);
 const position=f.world.camera.position.clone();f.world.yaw+=.4;f.world.pitch+=.1;f.view.update(1/60);assert.ok(f.world.camera.position.distanceTo(position)>0);assert.deepEqual([f.world.yaw,f.world.pitch,f.world.distance],[1.5,.55,13]);
 f.world.scriptCameraPosition={x:8,y:4,z:7};f.view.beginReturn();const returning=f.world.camera.position.clone();f.view.update(1/60);assert.equal(f.view.cameraReturned,false);assert.ok(f.world.camera.position.distanceTo(returning)<2,'camera must move rather than snap');await finish(f.view);
 assert.equal(f.world.fieldEffect,null);assert.equal(f.actors[0].visible,true);assert.equal(f.actors[1].visible,false);assert.equal(backdrop.parent,f.world.scene);assert.equal(f.world.scriptCameraPosition.x,8);assert.deepEqual(scene,before);
});

test('native source scale steps animate actual silhouettes and particles have real finite, disposed lifetimes',async()=>{
 const f=viewFixture();await f.view.begin(evolutionScene(),new AbortController().signal);f.view.setPhase('oscillate');assert.equal(f.view.particlesActive,true);
 const sprites=f.view.group.children.filter(object=>object instanceof THREE.Mesh&&object.material instanceof THREE.ShaderMaterial)as THREE.Mesh[];assert.equal(sprites.length,2);f.view.tick();assert.equal(sprites[0].scale.x,248/256);assert.equal(sprites[1].scale.x,8/256);
 for(let i=1;i<32;i++)f.view.tick();assert.equal(sprites[0].scale.x,0);assert.equal(sprites[1].scale.x,1);
 const particles=f.view.group.children.filter(object=>object instanceof THREE.Mesh&&object.geometry instanceof THREE.OctahedronGeometry)as THREE.Mesh[];const first=particles[0],position=first.position.clone();f.view.tick();assert.ok(first.position.distanceTo(position)>0);for(let i=33;i<119;i++)f.view.tick();assert.equal(f.view.particlesActive,true);f.view.tick();assert.equal(f.view.particlesActive,false);assert.ok(particles.every(p=>p.parent===null));
 f.view.setPhase('widen');assert.equal(f.view.particlesActive,true);f.view.fade(0xffffff,0,16);for(let i=0;i<15;i++)f.view.tick();assert.equal(f.view.paletteActive,true);f.view.tick();assert.equal(f.view.paletteActive,false);assert.equal(f.view.particlesActive,false);assert.equal((sprites[1].material as THREE.ShaderMaterial).uniforms.white.value,1);
 f.view.startPose('new');for(let i=0;i<15;i++)f.view.tick();assert.equal(f.view.poseActive,true);f.view.tick();assert.equal(f.view.poseActive,false);assert.ok(Math.abs(sprites[1].position.y)<1e-10);f.view.cancel();
});

test('cached native textures survive while each temporary geometry/material is released once and stale actors are not resurrected',async()=>{
 const f=viewFixture();await f.view.begin(evolutionScene(),new AbortController().signal);f.view.setPhase('oscillate');let textures=0;f.oldArt.texture.addEventListener('dispose',()=>textures++);f.newArt.texture.addEventListener('dispose',()=>textures++);
 const geometry=new Map<THREE.BufferGeometry,number>(),material=new Map<THREE.Material,number>();f.view.group.traverse(object=>{if(object instanceof THREE.Mesh){geometry.set(object.geometry,0);for(const value of Array.isArray(object.material)?object.material:[object.material])material.set(value,0);}});for(const entry of geometry.keys())entry.addEventListener('dispose',()=>geometry.set(entry,geometry.get(entry)!+1));for(const entry of material.keys())entry.addEventListener('dispose',()=>material.set(entry,material.get(entry)!+1));
 f.stale();f.view.cancel(Error('Map unloaded'));f.view.cancel();assert.equal(f.actors[0].visible,false);assert.equal(textures,0);assert.ok([...geometry.values()].every(n=>n===1));assert.ok([...material.values()].every(n=>n===1));assert.equal(f.view.group.children.length,0);
});

test('late art completion cannot revive an aborted view, field transition cancellation restores only the owned camera',async()=>{
 let resolve!:(art:EvolutionArt)=>void;const pending=new Promise<EvolutionArt>(done=>resolve=done),f=viewFixture(()=>pending),snapshot={position:f.world.camera.position.clone(),target:f.world.target.clone(),rotation:f.world.camera.quaternion.clone()};const loading=f.view.begin(evolutionScene(),new AbortController().signal);const rejected=assert.rejects(loading,/Map reload/);f.view.update(.05);f.view.cancel(Error('Map reload'));await rejected;assert.deepEqual(f.world.camera.position.toArray(),snapshot.position.toArray());assert.deepEqual(f.world.target.toArray(),snapshot.target.toArray());assert.deepEqual(f.world.camera.quaternion.toArray(),snapshot.rotation.toArray());resolve(f.oldArt);await flush();assert.equal(f.view.group.children.length,0);assert.equal(f.world.fieldEffect,null);
 const g=viewFixture();await g.view.begin(evolutionScene(),new AbortController().signal);const next={active:true,update(){},cancel(){}};g.world.fieldEffect=next;g.world.camera.position.set(99,88,77);g.view.update(1/60);assert.deepEqual(g.world.camera.position.toArray(),[99,88,77]);assert.equal(g.world.fieldEffect,next);assert.equal(g.view.active,false);assert.equal(g.actors[0].visible,false);
});

test('external abort and map changes cancel live effects, and unsupported form/shiny identities fail before claiming the field',async()=>{
 const f=viewFixture(),abort=new AbortController();await f.view.begin(evolutionScene(),abort.signal);abort.abort(Error('Source action rollback'));assert.equal(f.view.active,false);assert.equal(f.actors[0].visible,true);assert.equal(f.world.fieldEffect,null);
 const g=viewFixture();await g.view.begin(evolutionScene(),new AbortController().signal);g.field.map++;g.view.update(1/60);assert.equal(g.view.active,false);
 for(const patch of[{form:1},{personality:0,id:8,provenance:{otId:0}},{species:494},{gender:'invalid'}]){const h=viewFixture(),scene=evolutionScene();Object.assign(scene.before,patch);await assert.rejects(h.view.begin(scene,new AbortController().signal),/not exported|identity/);assert.equal(h.world.fieldEffect,null);assert.deepEqual(h.requests,[]);}
 const scene=evolutionScene();assert.equal(evolutionArtPath({...scene.before,species:81,gender:'genderless'}),'/source/pokemon/81-male-front.png');assert.equal(evolutionArtPath({...scene.before,gender:'female'}),'/source/pokemon/155-female-front.png');
});

test('an old rejected artwork waiter cannot cancel a replacement scene on the same view',async()=>{
 let resolve!:(art:EvolutionArt)=>void,first=true;const pending=new Promise<EvolutionArt>(done=>resolve=done),f=viewFixture(async()=>first?pending:f.oldArt),scene=evolutionScene();const old=f.view.begin(scene,new AbortController().signal),rejected=assert.rejects(old,/Old load cancelled/);f.view.cancel(Error('Old load cancelled'));first=false;const replacement=f.view.begin(scene,new AbortController().signal);await rejected;await replacement;assert.equal(f.view.active,true);assert.equal(f.world.fieldEffect,f.view);resolve(f.oldArt);await flush();assert.equal(f.view.active,true);f.view.cancel();
});

test('a hung injected art loader has a technical deadline and cannot retain camera/actor ownership',async()=>{
 const f=viewFixture(),view=new WorldEvolutionView(f.world,()=>f.field,{art:()=>new Promise(()=>{}),artTimeoutMs:15});await assert.rejects(view.begin(evolutionScene(),new AbortController().signal),/artwork preparation timed out/);assert.equal(f.world.fieldEffect,null);assert.equal(view.active,false);assert.equal(f.actors[0].visible,true);
});

test('actual native-art cache evicts a timed-out decode without a late old completion removing its successful retry',async t=>{
 const previous=THREE.TextureLoader.prototype.loadAsync,priorDocument=globalThis.document,requests:{resolve:(texture:THREE.Texture)=>void}[]=[];let lateDisposals=0;
 t.mock.timers.enable({apis:['setTimeout']});THREE.TextureLoader.prototype.loadAsync=function(){return new Promise<THREE.Texture>(resolve=>requests.push({resolve}));};
 globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({drawImage(){},getImageData:()=>({data:new Uint8ClampedArray([255,0,0,255,0,0,0,0,0,0,0,0,255,0,0,255])})})})}as any;
 try{const first=loadEvolutionArt('/test-native-cache-front.png',new AbortController().signal),rejected=assert.rejects(first,/preparation timed out/);t.mock.timers.tick(4000);await rejected;
  const retry=loadEvolutionArt('/test-native-cache-front.png',new AbortController().signal);assert.equal(requests.length,2);const next=new THREE.Texture({width:2,height:2}as any);requests[1].resolve(next);const result=await retry;assert.equal(result.texture,next);const late=new THREE.Texture();late.addEventListener('dispose',()=>lateDisposals++);requests[0].resolve(late);await Promise.resolve();await Promise.resolve();assert.equal(lateDisposals,1);
  assert.equal((await loadEvolutionArt('/test-native-cache-front.png',new AbortController().signal)).texture,next);assert.equal(requests.length,2);
 }finally{THREE.TextureLoader.prototype.loadAsync=previous;globalThis.document=priorDocument;t.mock.timers.reset();}
});

test('155/156 native front art really exists with PNG payloads, no generated sprite is substituted',async()=>{
 for(const species of[155,156])for(const gender of['male','female']){const png=await readFile(new URL(`../../public/source/pokemon/${species}-${gender}-front.png`,import.meta.url));assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.ok(png.readUInt32BE(16)>0&&png.readUInt32BE(20)>0);}
});

test('actual World field-effect draw and transition hooks drive/release this view without replacing the field scene',async()=>{
 const f=viewFixture(),world=Object.create(OriginalWorld.prototype)as OriginalWorld;let renders=0;
 const {scriptCameraPosition,...surface}=f.world;void scriptCameraPosition;
 Object.assign(world,{...surface,activeHeader:67,cameraTransition:false,grassTime:0,npcSprites:new Map(),sky:{update(){}},renderer:{render(scene:THREE.Scene,camera:THREE.Camera){assert.equal(scene,world.scene);assert.equal(camera,world.camera);renders++;}},height:()=>3});
 const view=new WorldEvolutionView(world,()=>f.field,{art:async()=>f.oldArt});await view.begin(evolutionScene(),new AbortController().signal);const before=world.camera.position.clone();world.draw(f.field.x,f.field.z,1/60,f.field.y);assert.equal(renders,1);assert.ok(world.camera.position.distanceTo(before)>0);assert.equal(world.fieldMapRunning,false);assert.equal(view.group.parent,world.scene);
 world.beginFieldTransition();assert.equal(view.active,false);assert.equal(world.fieldEffect,null);assert.equal(f.actors[0].visible,true);world.draw(f.field.x,f.field.z,1/60,f.field.y);assert.equal(renders,1);
});


test('legacy createMon random identity never substitutes for native OT when selecting evolution art',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
 let mon:ReturnType<typeof createMon>;try{mon=createMon(await loadData(),155,14,'Gold',()=>.5);}finally{globalThis.fetch=previous;}
 assert.equal(mon.personality,0x80000000);assert.equal(mon.id,0x7fffffff);assert.equal(mon.provenance,undefined);
 assert.equal(((mon.id>>>16)^(mon.id&65535)^(mon.personality>>>16)^(mon.personality&65535)),0,'before-failure witness: unrelated random identity falsely appears shiny');
 const original=structuredClone(mon),scene={...evolutionScene(),before:mon,after:{...structuredClone(mon),species:156}};
 assert.equal(evolutionArtPath(mon),`/source/pokemon/155-${mon.gender}-front.png`);const f=viewFixture();await f.view.begin(scene,new AbortController().signal);assert.deepEqual(f.requests,[`/source/pokemon/155-${mon.gender}-front.png`,`/source/pokemon/156-${mon.gender}-front.png`]);assert.equal(f.actors[0].visible,false);f.view.cancel();assert.equal(f.actors[0].visible,true);assert.deepEqual(mon,original,'art policy never synthesizes provenance or changes gameplay identity');
 const legacy={...evolutionScene().before,id:0,personality:0};assert.equal(evolutionArtPath(legacy),'/source/pokemon/155-male-front.png');
});

test('known native provenance controls shiny-art availability independently of browser identity',()=>{
 const mon=evolutionScene().before,provenance={otId:0,otGender:'boy' as const,language:2,gameVersion:7,metLevel:1,pokeball:4,metLocation:1,metDate:{year:26,month:10,day:17},eggLocation:0,eggDate:{year:0,month:0,day:0},fatefulEncounter:false};
 const nativeShiny={...mon,id:8,personality:0,provenance};assert.throws(()=>evolutionArtPath(nativeShiny),/shiny evolution artwork is not exported/);
 const nativeRegular={...nativeShiny,id:0,provenance:{...provenance,otId:8}};assert.equal(evolutionArtPath(nativeRegular),'/source/pokemon/155-male-front.png');
 for(const otId of[-1,0x100000000,NaN,undefined])assert.throws(()=>evolutionArtPath({...nativeRegular,provenance:{...provenance,otId}} as any),/valid OT identity/);
});
