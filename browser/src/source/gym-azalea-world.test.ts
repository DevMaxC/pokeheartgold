import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {AzaleaGymWorld,animateAzaleaTicks,applyAzaleaJointFrame,disposeAzaleaGymResources,type AzaleaGymHooks,type AzaleaGymResources,type AzaleaResourceManifest,type AzaleaTicks} from './gym-azalea-world.ts';
import {azaleaGymRideFrame,initialAzaleaGymState,planAzaleaGymRide} from './gym-azalea-plan.ts';
import {originalMaterial} from './render-repair.ts';

const source=new URL('../../public/source/',import.meta.url),read=(path:string)=>readFile(new URL(path,source)),hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const map=JSON.parse(await (await read('maps/180.json')).toString());
async function resources():Promise<AzaleaGymResources>{
 const manifest=JSON.parse((await read('azalea-gym/resources.json')).toString())as AzaleaResourceManifest,models=new Map<number,THREE.Group>(),patterns=new Map<string,THREE.Texture>();
 for(const[id,entry]of Object.entries(manifest.models)){
  const bytes=await read(entry.asset);assert.equal(hash(bytes),(entry as any).glbSHA256);const size=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+size).toString());
  delete doc.images;delete doc.textures;delete doc.samplers;for(const material of doc.materials??[])delete material.pbrMetallicRoughness?.baseColorTexture;
  let text=JSON.stringify(doc);text+=' '.repeat((-Buffer.byteLength(text))&3);const json=Buffer.from(text),tail=bytes.subarray(20+size),out=Buffer.alloc(20+json.length+tail.length);bytes.copy(out,0,0,20);out.writeUInt32LE(out.length,8);out.writeUInt32LE(json.length,12);json.copy(out,20);tail.copy(out,20+json.length);
  const gltf=await new GLTFLoader().parseAsync(out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength),'');gltf.scene.animations=gltf.animations;
  gltf.scene.traverse(object=>{if(object instanceof THREE.Mesh){const convert=(material:THREE.Material)=>originalMaterial(material as THREE.MeshStandardMaterial);object.material=Array.isArray(object.material)?object.material.map(convert):convert(object.material);}});models.set(Number(id),gltf.scene);
  for(const animation of entry.animations)if(animation.kind==='pattern')for(const track of animation.tracks)for(const key of track.keys){assert.equal(hash(await read(key.asset)),key.imageSHA256);const texture=new THREE.Texture();texture.name=key.asset;patterns.set(key.asset,texture);}
 }
 return{manifest,models,patterns};
}
const immediate:AzaleaTicks=async(count,frame,signal)=>{for(let i=1;i<=count;i++){if(signal.aborted)throw new Error('aborted');frame(i);}};
function hooks(world:AzaleaGymWorld,station=0){
 const plan=planAzaleaGymRide(world.state!,station),events:any[]=[],player={...plan.boarding.from,y:0},follower={x:player.x,y:0,z:player.z+1},owned={held:false,manual:false};
 const ports:AzaleaGymHooks={waitFollower:async()=>{events.push('waitFollower');},player:()=>player,releaseRiders:()=>{owned.manual=false;events.push('release');},captureRiders:()=>{const p={...player},f={...follower};return()=>{Object.assign(player,p);Object.assign(follower,f);events.push('restore');};},stepRiders:async(direction,phase)=>{events.push({phase,direction});const dz=direction===0?-1:1;player.z+=dz;follower.z+=dz;},holdPlayer:movement=>{owned.held=movement===73;events.push({hold:movement});},placeRiders:frame=>{owned.manual=true;Object.assign(player,frame.player);Object.assign(follower,frame.follower);events.push({rider:frame});},dockRiders:frame=>{owned.manual=false;events.push({dock:frame});},cameraOffset:z=>{events.push({camera:z});},trackPlayer:enabled=>{events.push({trackPlayer:enabled});},facing:()=>1,robotSound:playing=>{events.push({robot:playing});},switchSound:async()=>{events.push('switchSound');},commitState:state=>{events.push({commit:state,player:{...player},model:world.spiderModels[plan.spiderIndex]?.position.toArray()});}};
 return{ports,events,plan,player,follower,owned};
}

test('display-rate clock catches up every native tick and cancels without granting another frame',async()=>{
 const previous={performance:Object.getOwnPropertyDescriptor(globalThis,'performance'),request:globalThis.requestAnimationFrame,cancel:globalThis.cancelAnimationFrame};let next=0;const queue=new Map<number,FrameRequestCallback>();Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>0}});globalThis.requestAnimationFrame=callback=>{queue.set(++next,callback);return next;};globalThis.cancelAnimationFrame=id=>{queue.delete(id);};
 const at=(now:number)=>{const[id,callback]=queue.entries().next().value!;queue.delete(id);callback(now);};
 try{const frames:number[]=[],controller=new AbortController(),pending=animateAzaleaTicks(3,tick=>frames.push(tick),controller.signal);at(16);assert.deepEqual(frames,[]);at(50);assert.deepEqual(frames,[1]);at(100);await pending;assert.deepEqual(frames,[1,2,3]);assert.equal(queue.size,0);const stopped=new AbortController(),cancelled=animateAzaleaTicks(2,()=>{throw Error('stale tick');},stopped.signal);stopped.abort();await assert.rejects(cancelled,{name:'AbortError'});assert.equal(queue.size,0);}finally{Object.defineProperty(globalThis,'performance',previous.performance!);globalThis.requestAnimationFrame=previous.request;globalThis.cancelAnimationFrame=previous.cancel;}
});

test('sequential source phases retain the fractional tick deadline across display frames',async()=>{
 const previous={performance:Object.getOwnPropertyDescriptor(globalThis,'performance'),request:globalThis.requestAnimationFrame,cancel:globalThis.cancelAnimationFrame};let next=0,now=0;const queue=new Map<number,FrameRequestCallback>();Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>now}});globalThis.requestAnimationFrame=callback=>{queue.set(++next,callback);return next;};globalThis.cancelAnimationFrame=id=>{queue.delete(id);};
 const at=(value:number)=>{now=value;const[id,callback]=queue.entries().next().value!;queue.delete(id);callback(now);};
 try{const frames:string[]=[],controller=new AbortController();const first=animateAzaleaTicks(1,()=>frames.push('first'),controller.signal);at(50);await first;const second=animateAzaleaTicks(1,()=>frames.push('second'),controller.signal);at(70);assert.deepEqual(frames,['first','second'],'second source deadline is 66.67ms, not a restarted 83.33ms');await second;assert.equal(queue.size,0);}finally{Object.defineProperty(globalThis,'performance',previous.performance!);globalThis.requestAnimationFrame=previous.request;globalThis.cancelAnimationFrame=previous.cancel;}
});

test('actual Azalea room resources spawn four source spiders and reset only native transition entries',async()=>{
 const r=await resources(),scene=new THREE.Scene(),world=new AzaleaGymWorld(scene,async()=>r,immediate);
 await world.enter(map);assert.deepEqual(world.state,initialAzaleaGymState());assert.deepEqual(world.spiderModels.map(m=>m.position.toArray()),[[3.5,0,31],[9.5,0,31],[15.5,0,31],[9.5,0,16]]);assert.equal(scene.children[0].children.length,10);
 const saved={spiders:[4,1,2,7]as[number,number,number,number],switches:3 as const};await world.enter(map,saved,'continue');assert.deepEqual(world.state,saved);assert.notEqual(world.state,saved);await world.enter(map,saved,'connection');assert.deepEqual(world.state,initialAzaleaGymState());
 world.leave();assert.equal(scene.children.length,0);assert.equal(world.active,false);disposeAzaleaGymResources(r);
});

test('a model with a foreign joint scaling rule rejects before publishing any placed room resources',async()=>{
 const r=await resources(),scene=new THREE.Scene(),world=new AzaleaGymWorld(scene,async()=>r,immediate);(r.manifest.models[118]as any).scalingRule=1;await assert.rejects(world.enter(map),/scaling\/rest ABI/);assert.equal(scene.children.length,0);assert.equal(world.active,false);assert.equal(r.models.size,5);disposeAzaleaGymResources(r);
});

test('switches apply original rail zero-scale poses and actual PAT PNG pairs without recoloring source templates',async()=>{
 const r=await resources(),world=new AzaleaGymWorld(new THREE.Scene(),async()=>r,immediate);await world.enter(map);const p=(world as any).placed as{model:number;root:THREE.Group}[];
 const rail=p.find(p=>p.model===115)!,entry=r.manifest.models[115],joint=()=>{let value:THREE.Object3D|undefined;rail.root.traverse(object=>{if(object.userData.nativeAzaleaJoint===2)value=object;});return value!;};assert.equal(joint().matrix.determinant(),0,'native zero stays exactly zero, not converter2e-6');
 const originalColor=new Map<THREE.Material,number>(),originalMaps=new Map<THREE.Material,THREE.Texture|null>();for(const root of r.models.values())root.traverse(object=>{if(object instanceof THREE.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material]){originalColor.set(material,(material as THREE.MeshBasicMaterial).color.getHex());originalMaps.set(material,(material as THREE.MeshBasicMaterial).map);}});
 await world.flipSwitch(1,{switchSound:async()=>{},commitState:()=>{}});assert.notEqual(joint().matrix.determinant(),0);assert.equal(world.state!.switches,2);assert.equal(entry.animations.length,2);
 for(const model of [117,122]){const animation=r.manifest.models[model].animations[model===122?1:0];assert.equal(animation.kind,'pattern');if(animation.kind!=='pattern')throw Error();for(const placed of p.filter(p=>p.model===model))placed.root.traverse(object=>{if(object instanceof THREE.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material])if(material.name===animation.tracks[0].material)assert.equal((material as THREE.MeshBasicMaterial).map,r.patterns.get(animation.tracks[0].keys[0].asset));});}
 for(const[material,color]of originalColor){assert.equal((material as THREE.MeshBasicMaterial).color.getHex(),color);assert.equal((material as THREE.MeshBasicMaterial).map,originalMaps.get(material));}world.leave();disposeAzaleaGymResources(r);
});

test('native spider poses retain source geometry/UV/color bytes and use exact non-normalized SDK matrices',async()=>{
 const r=await resources(),template=r.models.get(118)!,animation=r.manifest.models[118].animations[0];assert.equal(animation.kind,'joint');if(animation.kind!=='joint')throw Error();assert.equal(animation.frameCount,30);
 const arrays=new Map<THREE.BufferAttribute,string>();template.traverse(object=>{if(object instanceof THREE.Mesh)for(const attribute of Object.values(object.geometry.attributes))arrays.set(attribute as THREE.BufferAttribute,hash(new Uint8Array(attribute.array.buffer,attribute.array.byteOffset,attribute.array.byteLength)));});
 const positions:number[][]=[];for(const frame of [0,7,15,29]){applyAzaleaJointFrame(template,animation,frame);let joint:THREE.Object3D|undefined;template.traverse(object=>{if(object.userData.nativeAzaleaJoint===1)joint=object;});const p=animation.nativeFrames[frame][1],m=joint!.matrix.elements;assert.equal(m[0],p.rotationFx32[0]*p.scaleFx32[0]/16777216);assert.equal(m[1],p.rotationFx32[1]*p.scaleFx32[0]/16777216);positions.push([...m]);}
 assert.notDeepEqual(positions[0],positions[2]);for(const[attribute,value]of arrays)assert.equal(hash(new Uint8Array(attribute.array.buffer,attribute.array.byteOffset,attribute.array.byteLength)),value);assert.throws(()=>applyAzaleaJointFrame(template,animation,30),RangeError);disposeAzaleaGymResources(r);
});

test('native rest replaces normalized converter TRS and changed skin poses invalidate cached culling bounds',async()=>{
 const r=await resources(),world=new AzaleaGymWorld(new THREE.Scene(),async()=>r,immediate);await world.enter(map);const spider=world.spiderModels[0],entry=r.manifest.models[118],animation=entry.animations[0];if(animation.kind!=='joint')throw Error();let rootJoint:THREE.Object3D|undefined;spider.traverse(object=>{if(object.userData.nativeAzaleaJoint===0)rootJoint=object;});assert.equal(rootJoint!.matrix.elements[0],3686/4096);assert.equal(rootJoint!.matrix.elements[13],-2);assert.equal(rootJoint!.matrix.elements[14],37273/4096);
 applyAzaleaJointFrame(spider,animation,0);const meshes:THREE.SkinnedMesh[]=[];spider.traverse(object=>{if(object instanceof THREE.SkinnedMesh){object.computeBoundingSphere();object.computeBoundingBox();meshes.push(object);}});assert.ok(meshes.length>0);applyAzaleaJointFrame(spider,animation,3);for(const mesh of meshes){assert.equal(mesh.boundingSphere,null);assert.equal(mesh.boundingBox,null);mesh.computeBoundingSphere();for(let i=0;i<mesh.geometry.getAttribute('position').count;i++){const position=mesh.getVertexPosition(i,new THREE.Vector3());assert.ok(position.distanceTo(mesh.boundingSphere!.center)<=mesh.boundingSphere!.radius);}}
 const before=(world as any).tick;world.updateNativeTick();world.init(undefined,'warp');assert.equal((world as any).tick,before+1,'native Init resets saved routes, not the shared animation clock');world.leave();disposeAzaleaGymResources(r);
});

test('unchanged PAT selection does not invalidate the material every native tick',async()=>{
 const r=await resources(),world=new AzaleaGymWorld(new THREE.Scene(),async()=>r,immediate);await world.enter(map);const versions=new Map<THREE.Material,number>();for(const p of (world as any).placed)if(p.model===117||p.model===122)p.root.traverse((object:THREE.Object3D)=>{if(object instanceof THREE.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material])versions.set(material,material.version);});world.updateNativeTick();world.updateNativeTick();for(const[material,version]of versions)assert.equal(material.version,version);world.leave();disposeAzaleaGymResources(r);
});

test('ride executes source tick positions, awaited boarding/docking/shake and commits only at the last movement endpoint',async()=>{
 const r=await resources(),phases:number[]=[],world=new AzaleaGymWorld(new THREE.Scene(),async()=>r,async(n,tick,signal)=>{phases.push(n);await immediate(n,tick,signal);});await world.enter(map);const h=hooks(world);await world.ride(0,h.ports);
 assert.deepEqual(phases,[5,209,1,7,9]);const poses=h.events.filter(e=>e.rider).map(e=>e.rider);assert.equal(poses.length,209);for(let i=0;i<poses.length;i++)assert.deepEqual(poses[i],azaleaGymRideFrame(h.plan,i+1));
 const commits=h.events.filter(e=>e.commit);assert.equal(commits.length,1);assert.deepEqual(commits[0].commit.spiders,[4,1,2,7]);assert.deepEqual(commits[0].model,[9.5,0,24]);assert.deepEqual(commits[0].player,{x:9.5,y:0,z:24.5});assert.deepEqual(h.player,{x:9.5,y:0,z:23.5});assert.deepEqual(h.follower,{x:9.5,y:0,z:24.5});
 assert.deepEqual(h.events.filter(e=>e.trackPlayer!==undefined).map(e=>e.trackPlayer),[false,true,false,true]);
 assert.ok(h.events.indexOf('waitFollower')<h.events.findIndex(e=>e.phase==='board'));assert.ok(h.events.findIndex(e=>e.commit)<h.events.findIndex(e=>e.dock));assert.deepEqual(h.events.filter(e=>e.camera).map(e=>e.camera),[1/16,1/16,1/16,1/16]);assert.equal(h.events.filter(e=>e.camera===0).length,4);assert.equal(world.moving,false);world.leave();disposeAzaleaGymResources(r);
});

test('failed docking restores current-map state and rider checkpoint without inventing a completed ride',async()=>{
 const r=await resources(),world=new AzaleaGymWorld(new THREE.Scene(),async()=>r,immediate);await world.enter(map);const h=hooks(world),before={...h.player};h.ports.dockRiders=()=>{throw Error('native docking unavailable');};await assert.rejects(world.ride(0,h.ports),/docking unavailable/);assert.deepEqual(world.state,initialAzaleaGymState());assert.deepEqual(h.player,before);assert.deepEqual(world.spiderModels[0].position.toArray(),[3.5,0,31]);assert.equal(h.events.at(-1),'restore');world.leave();disposeAzaleaGymResources(r);
});

test('return ride boards in the opposite direction and a falsely completed boarding host never starts movement',async()=>{
 const r=await resources(),world=new AzaleaGymWorld(new THREE.Scene(),async()=>r,immediate);await world.enter(map,{spiders:[4,1,2,7],switches:0},'continue');const reverse=hooks(world,4);await world.ride(4,reverse.ports);assert.deepEqual(reverse.events.filter(e=>e.phase).map(e=>[e.phase,e.direction]),[['board',1],['disembark',1]]);assert.deepEqual(world.state,initialAzaleaGymState());assert.deepEqual(reverse.player,{x:3.5,y:0,z:33.5});
 const failed=hooks(world);failed.ports.stepRiders=async()=>{};await assert.rejects(world.ride(0,failed.ports),/boarding movement did not complete/);assert.equal(failed.events.filter(e=>e.rider).length,0);assert.equal(failed.events.filter(e=>e.robot===true).length,0);assert.deepEqual(world.state,initialAzaleaGymState());world.leave();disposeAzaleaGymResources(r);
});

test('unload aborts pending hosts and prevents stale native tick callbacks from publishing into the next entry',async()=>{
 const r=await resources(),scene=new THREE.Scene();let late:(()=>void)|undefined;const clock:AzaleaTicks=async(n,tick,signal)=>{if(n===209){tick(1);await new Promise<void>(resolve=>{late=()=>{tick(2);resolve();};});}else await immediate(n,tick,signal);};const world=new AzaleaGymWorld(scene,async()=>r,clock);await world.enter(map);const h=hooks(world),pending=world.ride(0,h.ports);for(let i=0;i<10&&!late;i++)await Promise.resolve();assert.ok(late);world.leave();await assert.rejects(pending,{name:'AbortError'});const oldEvents=h.events.length;await world.enter(map);assert.throws(()=>late!(),{name:'AbortError'});assert.equal(h.events.length,oldEvents);assert.deepEqual(world.state,initialAzaleaGymState());assert.ok(h.events.some(e=>e.robot===false));assert.deepEqual(h.events.filter(e=>e.hold).map(e=>e.hold),[73,74]);assert.equal(h.events.filter(e=>e==='release').length,1);assert.equal(h.events.filter(e=>e==='restore').length,0);assert.deepEqual(h.owned,{held:false,manual:false});world.leave();disposeAzaleaGymResources(r);
});

test('reentrant host cancellation handles its rejected promise and releases controller-owned rider state once',async()=>{
 const r=await resources(),world=new AzaleaGymWorld(new THREE.Scene(),async()=>r,immediate);await world.enter(map);const h=hooks(world);h.ports.waitFollower=()=>{world.cancel();return Promise.reject(Error('host cancelled reentrantly'));};await assert.rejects(world.ride(0,h.ports),{name:'AbortError'});await new Promise(resolve=>setImmediate(resolve));assert.equal(h.events.filter(e=>e==='release').length,1);assert.equal(h.events.filter(e=>e==='restore').length,1);
 const next=hooks(world);next.ports.holdPlayer=movement=>{next.events.push({hold:movement});if(movement===73)world.leave();};await assert.rejects(world.ride(0,next.ports),{name:'AbortError'});assert.deepEqual(next.events.filter(e=>e.hold).map(e=>e.hold),[73,74]);assert.equal(next.events.filter(e=>e==='release').length,1);assert.equal(next.events.filter(e=>e==='restore').length,0);assert.equal(world.active,false);disposeAzaleaGymResources(r);
});

test('superseded asset load never publishes clones and clone unload does not dispose cached buffers or PAT images',async()=>{
 const r=await resources(),scene=new THREE.Scene();let resolve!:(r:AzaleaGymResources)=>void;const world=new AzaleaGymWorld(scene,()=>new Promise(r=>resolve=r),immediate),enter=world.enter(map);world.leave();resolve(r);await enter;assert.equal(scene.children.length,0);
 const active=new AzaleaGymWorld(scene,async()=>r,immediate);await active.enter(map);let sharedDisposals=0,cloneSkeletons=0;for(const group of r.models.values())group.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.addEventListener('dispose',()=>sharedDisposals++);for(const material of Array.isArray(object.material)?object.material:[object.material])material.addEventListener('dispose',()=>sharedDisposals++);}});for(const texture of r.patterns.values())texture.addEventListener('dispose',()=>sharedDisposals++);
 const ownedSkeletons=new Set<THREE.Skeleton>();scene.traverse(object=>{if(object instanceof THREE.SkinnedMesh)ownedSkeletons.add(object.skeleton);});for(const skeleton of ownedSkeletons){const dispose=skeleton.dispose.bind(skeleton);skeleton.dispose=()=>{cloneSkeletons++;dispose();};}active.leave();assert.equal(sharedDisposals,0);assert.ok(ownedSkeletons.size>=10);assert.equal(cloneSkeletons,ownedSkeletons.size);disposeAzaleaGymResources(r);assert.ok(sharedDisposals>0);
});
