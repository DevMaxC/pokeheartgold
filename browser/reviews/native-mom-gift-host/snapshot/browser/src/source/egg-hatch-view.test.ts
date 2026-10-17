import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {WorldEggHatchView,playNativeHatchCry,type EggHatchVisualScene,type HatchArt} from './egg-hatch-view.ts';
import {OriginalWorld} from './world.ts';

const scene:EggHatchVisualScene={kind:'standard',hatched:{species:175,gender:'male'},field:{map:67,x:12.5,z:9.5,facing:0},cry:{species:175,form:0}};
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
function art(){const texture=new THREE.Texture();return{texture,aspect:.8,uv:[.1,.05,.9,.95]}as HatchArt;}
function fixture(){
 const camera=new THREE.PerspectiveCamera(52),target=new THREE.Vector3(12.5,3.9,9.5),field={map:67,x:12.5,y:3,z:9.5,hideActors:[new THREE.Group(),new THREE.Group()]};field.hideActors[1].visible=false;
 const world={scene:new THREE.Scene(),cells:new Map(),camera,target,yaw:1.1,pitch:.45,distance:13,fieldEffect:null,battleStage:null,scriptCameraPosition:null,height:()=>3}as unknown as OriginalWorld;
 camera.position.set(20,9,16);camera.lookAt(target);const egg=art(),pokemon=art(),requests:string[]=[],cries:EggHatchVisualScene[]=[];
 const view=new WorldEggHatchView(world,()=>field,{art:async path=>{requests.push(path);return path.includes('egg-icon')?egg:pokemon;},cry:async value=>{cries.push(value);}});
 return{world,field,view,egg,pokemon,requests,cries};
}
async function complete(view:WorldEggHatchView,action:Promise<void>){
 let done=false,error:unknown;void action.then(()=>done=true,cause=>{error=cause;done=true;});
 for(let frame=0;frame<160&&!done;frame++){await flush();view.update(.05);}assert.ok(done,'field animation must settle');if(error)throw error;await action;
}

test('hatch remains in the real 3D field, uses original paper assets, accepts detached helper scenes and preserves free orbit',async()=>{
 const f=fixture(),backdrop=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());f.world.scene.add(backdrop);
 const input=structuredClone(scene);await complete(f.view,f.view.reveal(input));
 assert.deepEqual(f.requests,['/source/eggs/egg-icon.png','/source/pokemon/175-male-front.png']);assert.equal(f.world.fieldEffect,f.view);assert.equal(f.view.active,true);assert.equal(backdrop.parent,f.world.scene);
 assert.equal(f.field.hideActors[0].visible,false);assert.deepEqual(f.view.group.position.toArray(),[12.5,3,9.5]);assert.deepEqual([f.world.yaw,f.world.pitch,f.world.distance],[1.1,.45,13]);
 const planes:THREE.Mesh[]=[];f.view.group.traverse(object=>{if(object instanceof THREE.Mesh&&object.material instanceof THREE.MeshBasicMaterial&&object.material.map===f.pokemon.texture)planes.push(object);});assert.equal(planes.length,1);assert.equal(planes[0].visible,true);
 const previous=f.world.camera.position.clone();f.world.yaw+=.4;f.view.update(1/60);assert.equal(f.world.yaw,1.5);assert.ok(f.world.camera.position.distanceTo(previous)>0);
 await f.view.cry(structuredClone(input));assert.equal(f.cries.length,1);assert.deepEqual(input,scene);
 await complete(f.view,f.view.finish());assert.equal(f.view.active,false);assert.equal(f.world.fieldEffect,null);assert.equal(f.field.hideActors[0].visible,true);assert.equal(f.field.hideActors[1].visible,false);assert.deepEqual([f.world.yaw,f.world.pitch,f.world.distance],[1.5,.45,13]);assert.equal(backdrop.parent,f.world.scene);
});

test('standard hatch presentation selects the native nonfemale sprite slot without changing a genderless scene identity',async()=>{
 for(const species of[81,100]){
  const f=fixture(),input:EggHatchVisualScene={...structuredClone(scene),hatched:{species,gender:'genderless'},cry:{species,form:0}},before=structuredClone(input);
  await complete(f.view,f.view.reveal(input));assert.deepEqual(f.requests,['/source/eggs/egg-icon.png',`/source/pokemon/${species}-male-front.png`]);assert.equal(f.view.active,true);assert.deepEqual(input,before);
  // Artwork selection does not claim the separate Togepi-only audio export supports these cries.
  await assert.rejects(playNativeHatchCry(input,new AbortController().signal),/Original hatch cry not exported/);
  await complete(f.view,f.view.finish());assert.deepEqual(input,before);assert.equal(f.world.fieldEffect,null);
 }
 const f=fixture(),female:EggHatchVisualScene={...structuredClone(scene),hatched:{species:175,gender:'female'}};await complete(f.view,f.view.reveal(female));assert.equal(f.requests[1],'/source/pokemon/175-female-front.png');await complete(f.view,f.view.finish());
});

test('native genderless artwork support does not bypass invalid-scene or unexported Manaphy presentation guards',async()=>{
 for(const input of[{...scene,kind:'manaphy',hatched:{species:490,gender:'genderless'},cry:{species:490,form:0}},{...scene,hatched:{species:175,gender:'invalid'}},{...scene,cry:{species:81,form:0}}]){
  const f=fixture();await assert.rejects(f.view.reveal(input as EggHatchVisualScene),/Original Manaphy Egg artwork has not been exported|Invalid native hatch species artwork/);assert.deepEqual(f.requests,[]);assert.equal(f.view.active,false);assert.equal(f.world.fieldEffect,null);
 }
});

test('temporary geometry/materials dispose exactly once while cached native textures and existing script focus survive',async()=>{
 const f=fixture(),focus={map:67,x:8.5,y:4,z:6.5};Object.assign(f.world,{scriptCameraPosition:focus});await complete(f.view,f.view.reveal(scene));
 let textureDisposals=0;f.egg.texture.addEventListener('dispose',()=>textureDisposals++);f.pokemon.texture.addEventListener('dispose',()=>textureDisposals++);
 const geometries=new Map<THREE.BufferGeometry,number>(),materials=new Map<THREE.Material,number>();f.view.group.traverse(object=>{if(!(object instanceof THREE.Mesh))return;geometries.set(object.geometry,0);for(const material of Array.isArray(object.material)?object.material:[object.material])materials.set(material,0);});for(const geometry of geometries.keys())geometry.addEventListener('dispose',()=>geometries.set(geometry,geometries.get(geometry)!+1));for(const material of materials.keys())material.addEventListener('dispose',()=>materials.set(material,materials.get(material)!+1));
 const newFollower=new THREE.Group();f.field.hideActors.push(newFollower);f.view.update(1/60);assert.equal(newFollower.visible,false);newFollower.visible=true;f.view.update(1/60);assert.equal(newFollower.visible,false);
 await complete(f.view,f.view.finish());f.view.cancel();await f.view.finish();assert.equal(textureDisposals,0);assert.ok([...geometries.values()].every(n=>n===1));assert.ok([...materials.values()].every(n=>n===1));assert.equal(f.view.group.children.length,0);assert.equal(f.world.scriptCameraPosition,focus);assert.equal(newFollower.visible,true);assert.deepEqual(f.egg.texture.repeat.toArray(),[1,1]);assert.deepEqual(f.egg.texture.offset.toArray(),[0,0]);
});

test('cancellation during loading restores the exact rig immediately and late cached artwork never revives the effect',async()=>{
 const f=fixture(),target=f.world.target.clone(),position=f.world.camera.position.clone(),rotation=f.world.camera.quaternion.clone();let resolve!:(value:HatchArt)=>void;
 const pending=new Promise<HatchArt>(done=>resolve=done),view=new WorldEggHatchView(f.world,()=>f.field,{art:()=>pending}),loading=view.reveal(scene);await flush();view.update(.1);view.cancel(Error('Map reload'));
 await assert.rejects(loading,/Map reload/);assert.deepEqual(f.world.target.toArray(),target.toArray());assert.deepEqual(f.world.camera.position.toArray(),position.toArray());assert.deepEqual(f.world.camera.quaternion.toArray(),rotation.toArray());assert.equal(f.world.fieldEffect,null);resolve(f.egg);await flush();assert.equal(view.group.children.length,0);assert.equal(view.active,false);await assert.rejects(view.finish(),/Map reload/);
});

test('a field change or failed real cry rejects, restores actors and frees owned effects',async()=>{
 const f=fixture(),loading=f.view.reveal(scene);await flush();f.field.map=68;f.view.update(.1);await assert.rejects(loading,/field changed/);assert.equal(f.field.hideActors[0].visible,true);assert.equal(f.world.fieldEffect,null);
 const other=fixture(),view=new WorldEggHatchView(other.world,()=>other.field,{art:async()=>other.egg,cry:async()=>{throw Error('Native sound missing');}});await complete(view,view.reveal(scene));await assert.rejects(view.cry(structuredClone(scene)),/Native sound missing/);assert.equal(other.field.hideActors[0].visible,true);assert.equal(view.group.children.length,0);
});

test('an external cancellation during the hatch announcement prevents later successful completion on the same map',async()=>{
 const f=fixture(),abort=new AbortController(),view=new WorldEggHatchView(f.world,()=>f.field,{signal:abort.signal,art:async()=>f.egg,cry:async()=>{}});await complete(view,view.reveal(scene));await view.cry(structuredClone(scene));abort.abort(Error('Scene interrupted'));assert.equal(view.active,false);assert.equal(f.field.hideActors[0].visible,true);await assert.rejects(view.finish(),/Scene interrupted/);
});

test('cancellation at the final render frame wins over a resolved animation before its continuation can commit',async()=>{
 const f=fixture();await complete(f.view,f.view.reveal(scene));const finishing=f.view.finish();f.view.update(.4);f.view.cancel(Error('Cancelled at return boundary'));await assert.rejects(finishing,/Cancelled at return boundary/);assert.equal(f.view.active,false);assert.equal(f.world.fieldEffect,null);assert.equal(f.field.hideActors[0].visible,true);
});

test('World field-effect branch renders the same scene and a real field transition cancels it before loading',()=>{
 const world=Object.create(OriginalWorld.prototype)as any;let updates=0,renders=0,cancelled=0;
 Object.assign(world,{cameraTransition:false,grassTime:0,battleStage:null,fieldEffect:{active:true,update(){updates++;},cancel(){cancelled++;world.fieldEffect=null;}},npcSprites:new Map(),scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),sky:{update(){}},renderer:{render(scene:THREE.Scene,camera:THREE.Camera){assert.equal(scene,world.scene);assert.equal(camera,world.camera);renders++;}},height:()=>3});
 world.draw(1,2,1/60,3);assert.equal(updates,1);assert.equal(renders,1);world.beginFieldTransition();assert.equal(cancelled,1);world.draw(1,2,1/60,3);assert.equal(renders,1);
});

const audioRoot=new URL('../../public/source/hatching/',import.meta.url),repo=new URL('../../../',import.meta.url);
test('Togepi cry WAV is the exact original SWAR175 PCM with source-backed rate, byte count and duration',async()=>{
 const manifest=JSON.parse(await readFile(new URL('audio.json',audioRoot),'utf8')),entry=manifest.cries['175'],native=await readFile(new URL(manifest.source,repo)),wav=await readFile(new URL(entry.file,audioRoot)),hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
 assert.equal(hash(native),manifest.sourceSHA256);assert.equal(native.toString('ascii',entry.sourceSWAROffset,entry.sourceSWAROffset+4),'SWAR');assert.equal(native.readUInt32LE(entry.sourceSWAROffset+0x38),1);assert.equal(entry.sourceSWAROffset+native.readUInt32LE(entry.sourceSWAROffset+0x3c)+12,entry.sourcePCMOffset);
 assert.equal(native[entry.sourcePCMOffset-12],0);assert.equal(native.readUInt16LE(entry.sourcePCMOffset-10),10512);assert.equal(entry.archive,'WAVE_ARC_PV175');assert.equal(entry.frames,5380);assert.equal(entry.durationSeconds,5380/10512);
 assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.toString('ascii',8,12),'WAVE');assert.equal(wav.readUInt16LE(22),1);assert.equal(wav.readUInt16LE(34),8);assert.equal(wav.readUInt32LE(24),entry.sampleRate);assert.equal(wav.readUInt32LE(40),entry.frames);assert.equal(hash(wav),entry.wavSHA256);
 const signed=Buffer.from(Array.from(wav.subarray(44),value=>(value+128)&255));assert.equal(hash(signed),entry.signedPCMSourceSHA256);assert.deepEqual(signed,native.subarray(entry.sourcePCMOffset,entry.sourcePCMOffset+entry.frames));
});

test('native cry adapter waits for ended, stops on abort and rejects missing species instead of substituting',async()=>{
 const manifest=JSON.parse(await readFile(new URL('audio.json',audioRoot),'utf8')),instances:any[]=[];const previousAudio=globalThis.Audio,previousFetch=globalThis.fetch;
 class AudioStub extends EventTarget{paused=false;removed=false;volume=0;constructor(readonly src:string){super();instances.push(this);}play(){return Promise.resolve();}pause(){this.paused=true;}removeAttribute(name:string){assert.equal(name,'src');this.removed=true;}load(){}}
 globalThis.Audio=AudioStub as any;globalThis.fetch=async()=>new Response(JSON.stringify(manifest));
 try{
  let done=false;const signal=new AbortController(),playing=playNativeHatchCry(scene,signal.signal).then(()=>done=true);for(let i=0;i<10&&!instances.length;i++)await flush();assert.equal(instances[0].src,'/source/hatching/cry-175.wav');assert.equal(done,false);instances[0].dispatchEvent(new Event('ended'));await playing;assert.equal(done,true);assert.ok(instances[0].paused&&instances[0].removed);
  const abort=new AbortController(),interrupted=playNativeHatchCry(scene,abort.signal);await flush();abort.abort(Error('Field reloaded'));await assert.rejects(interrupted,/Field reloaded/);assert.ok(instances[1].paused&&instances[1].removed);
  await assert.rejects(playNativeHatchCry({...scene,cry:{species:183,form:0}},new AbortController().signal),/not exported/);assert.equal(instances.length,2);
 }finally{globalThis.Audio=previousAudio;globalThis.fetch=previousFetch;}
});
