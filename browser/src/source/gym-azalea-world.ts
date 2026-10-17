import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {originalMaterial} from './render-repair.ts';
import {azaleaGymEntryState,azaleaGymRideFrame,azaleaGymShakeOffsets,completeAzaleaGymRide,flipAzaleaGymSwitch,planAzaleaGymRide,type AzaleaGymState} from './gym-azalea-plan.ts';
import {NATIVE_AZALEA_GYM} from './azalea-gym-rules.ts';

export const AZALEA_GYM_KEY='MAP_AZALEA_GYM';
/** The host skips these original static placements only while this controller
 * owns the same map; it must not suppress these model IDs in other rooms. */
export const AZALEA_MANAGED_MODELS=new Set([115,116,117,122]);
type Pose={translationFx32:number[];rotationFx32:number[];scaleFx32:number[];inverseScaleFx32:number[]};
type JointAnimation={kind:'joint';archive:number;name:string;frameCount:number;nativeFrames:Pose[][]};
type PatternAnimation={kind:'pattern';archive:number;name:string;frameCount:number;nativeTextureParameters:Record<string,{width:number;height:number;format:number;color0Transparent:boolean;samplerFlags:number}>;tracks:{material:string;keys:{frame:number;texture:string;palette:string;asset:string;imageSHA256:string}[]}[]};
type Animation=JointAnimation|PatternAnimation;
export type AzaleaResourceManifest={version:1;map:180;key:typeof AZALEA_GYM_KEY;matrix:105;ticksPerSecond:30;apiculaFramesPerSecond:60;models:Record<string,{asset:string;nativeJointCount:number;scalingRule:0;rest:JointAnimation;animations:Animation[]}>};
export type AzaleaGymResources={manifest:AzaleaResourceManifest;models:Map<number,THREE.Group>;patterns:Map<string,THREE.Texture>};
export type AzaleaPose=ReturnType<typeof azaleaGymRideFrame>;
export type AzaleaMap={id:number;key:string;cells:{x:number;z:number;altitude:number;props:{id:number;position:number[];rotation:number[];scale:number[]}[]}[]};
export type AzaleaTicks=(count:number,tick:(index:number)=>void,signal:AbortSignal)=>Promise<void>;
export type AzaleaGymHooks={
 waitFollower:(signal:AbortSignal)=>Promise<void>;
 player:()=>{x:number;y:number;z:number};
 captureRiders:()=>()=>void;
 /** Release only this controller's manual rider override, including on unload.
  * Idempotent; never restore coordinates captured in a departed field. */
 releaseRiders:()=>void;
 stepRiders:(direction:0|1,phase:'board'|'disembark',signal:AbortSignal)=>Promise<void>;
 holdPlayer:(movement:73|74)=>void;
 placeRiders:(pose:AzaleaPose)=>void;
 dockRiders:(pose:AzaleaPose)=>void;
 cameraOffset:(z:number)=>void;
 trackPlayer:(enabled:boolean)=>void;
 facing:()=>number;
 robotSound:(playing:boolean)=>void;
 switchSound:(signal:AbortSignal)=>Promise<void>;
 commitState:(state:AzaleaGymState)=>void;
};
export class AzaleaGymCancelled extends Error{constructor(){super('Azalea Gym action was unloaded');this.name='AbortError';}}
export class UnsupportedAzaleaResource extends Error{constructor(message:string){super(message);this.name='UnsupportedAzaleaResource';}}
function check(signal:AbortSignal){if(signal.aborted)throw new AzaleaGymCancelled();}
function abortable<T>(pending:Promise<T>,signal:AbortSignal){return new Promise<T>((resolve,reject)=>{
 const abort=()=>{signal.removeEventListener('abort',abort);reject(new AzaleaGymCancelled());};
 // A host can cancel reentrantly before returning an already rejected promise.
 // Attach both handlers even when cancellation has already won the race.
 pending.then(value=>{signal.removeEventListener('abort',abort);resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
 if(signal.aborted){abort();return;}signal.addEventListener('abort',abort,{once:true});
});}
const copy=(state:AzaleaGymState):AzaleaGymState=>({spiders:[...state.spiders],switches:state.switches});

/** Execute every literal 30 Hz source tick, including catch-up ticks. Native
 * pose selection never runs a converted 60fps clip at display-frame speed. */
const tickCursors=new WeakMap<AbortSignal,{start:number;through:number}>();
export const animateAzaleaTicks:AzaleaTicks=(count,tick,signal)=>new Promise((resolve,reject)=>{
 if(!Number.isInteger(count)||count<0){reject(RangeError('Invalid native tick count'));return;}
 let request=0,done=0;
 const cleanup=()=>{cancelAnimationFrame(request);signal.removeEventListener('abort',abort);};
 const abort=()=>{cleanup();tickCursors.delete(signal);reject(new AzaleaGymCancelled());};
 if(signal.aborted){reject(new AzaleaGymCancelled());return;}if(count===0){resolve();return;}
 let cursor=tickCursors.get(signal);if(!cursor){cursor={start:performance.now(),through:0};tickCursors.set(signal,cursor);}const phase=cursor.through;
 signal.addEventListener('abort',abort,{once:true});
 const frame=(now:number)=>{try{check(signal);while(done<count&&now>=cursor.start+(phase+done+1)*1000/30){check(signal);tick(++done);cursor.through=phase+done;}if(done===count){cleanup();resolve();}else request=requestAnimationFrame(frame);}catch(error){cleanup();tickCursors.delete(signal);reject(error);}};
 request=requestAnimationFrame(frame);
});

/** Dedicated loader: World.asset currently discards animation clips. Keep
 * native clips for inspection, exact SDK pose tables for playback, and actual
 * PAT texture/palette PNGs. It intentionally runs no generic exterior repair. */
export async function loadAzaleaGymResources(base='/source/'):Promise<AzaleaGymResources>{
 const response=await fetch(base+'azalea-gym/resources.json');if(!response.ok)throw Error('Azalea resource manifest failed: '+response.status);
 const manifest=await response.json()as AzaleaResourceManifest;
 if(manifest.version!==1||manifest.key!==AZALEA_GYM_KEY||manifest.ticksPerSecond!==30||manifest.apiculaFramesPerSecond!==60)throw new UnsupportedAzaleaResource('Unsupported original Azalea resource version');
 for(const entry of Object.values(manifest.models)){
  if(entry.scalingRule!==0||entry.rest?.kind!=='joint'||entry.rest.frameCount!==1)throw new UnsupportedAzaleaResource('Unsupported original joint scaling/rest ABI');
  for(const animation of entry.animations)if(animation.kind==='pattern'){
   if(animation.tracks.length!==1||animation.tracks[0].keys.length!==1||animation.tracks[0].keys[0].frame!==0)throw new UnsupportedAzaleaResource('Unsupported original PAT layout');
   const params=animation.nativeTextureParameters?.[animation.tracks[0].keys[0].texture];
   if(!params||params.width!==32||params.height!==32||params.format!==3||!params.color0Transparent||params.samplerFlags!==0)throw new UnsupportedAzaleaResource('Unsupported original PAT sampling ABI');
  }
 }
 const resources:AzaleaGymResources={manifest,models:new Map(),patterns:new Map()},loader=new GLTFLoader();
 const jobs:Promise<void>[]=[];
 for(const[id,entry]of Object.entries(manifest.models))jobs.push(loader.loadAsync(base+entry.asset).then(gltf=>{
  gltf.scene.animations=gltf.animations;
  gltf.scene.traverse(object=>{if(object instanceof THREE.Mesh){const convert=(material:THREE.Material)=>originalMaterial(material as THREE.MeshStandardMaterial);object.material=Array.isArray(object.material)?object.material.map(convert):convert(object.material);}});
  resources.models.set(Number(id),gltf.scene);
 }));
 const images=new Set<string>();for(const entry of Object.values(manifest.models))for(const animation of entry.animations)if(animation.kind==='pattern')for(const track of animation.tracks)for(const key of track.keys)images.add(key.asset);
 for(const path of images)jobs.push(new THREE.TextureLoader().loadAsync(base+path).then(texture=>{texture.flipY=false;texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;resources.patterns.set(path,texture);}));
 const results=await Promise.allSettled(jobs),failure=results.find(result=>result.status==='rejected');
 if(failure?.status==='rejected'){disposeAzaleaGymResources(resources);throw failure.reason;}
 // PAT swaps the image/palette, retaining the model material's UV sampler.
 // These resources use one material per pattern image; they are cache-owned.
 try{for(const[id,entry]of Object.entries(manifest.models))for(const animation of entry.animations)if(animation.kind==='pattern')for(const track of animation.tracks){let original:THREE.Texture|null=null;resources.models.get(Number(id))!.traverse(object=>{if(object instanceof THREE.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material])if(material.name===track.material)original=(material as THREE.MeshBasicMaterial).map;});if(!original)throw new UnsupportedAzaleaResource('Original PAT sampler unavailable');const from=original as THREE.Texture;for(const key of track.keys){const texture=resources.patterns.get(key.asset)!;if(from.image?.width!==32||from.image?.height!==32||texture.image?.width!==32||texture.image?.height!==32)throw new UnsupportedAzaleaResource('Original PAT image dimensions mismatch');texture.wrapS=from.wrapS;texture.wrapT=from.wrapT;texture.channel=from.channel;texture.offset.copy(from.offset);texture.repeat.copy(from.repeat);texture.center.copy(from.center);texture.rotation=from.rotation;texture.updateMatrix();}}}catch(error){disposeAzaleaGymResources(resources);throw error;}
 return resources;
}

/** Resource-cache owner calls this after all placed controllers are gone.
 * Controller.leave only disposes clone skeletons and clone PAT materials. */
export function disposeAzaleaGymResources(resources:AzaleaGymResources){
 const geometry=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set(resources.patterns.values()),skeletons=new Set<THREE.Skeleton>();
 for(const group of resources.models.values())group.traverse(object=>{if(object instanceof THREE.SkinnedMesh)skeletons.add(object.skeleton);if(object instanceof THREE.Mesh){geometry.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material]){materials.add(material);const map=(material as THREE.MeshBasicMaterial).map;if(map)textures.add(map);}}});
 for(const value of skeletons)value.dispose();for(const value of geometry)value.dispose();for(const value of materials)value.dispose();for(const value of textures)value.dispose();resources.models.clear();resources.patterns.clear();
}

function nativeJoints(root:THREE.Object3D,count:number){const joints=new Map<number,THREE.Object3D>();root.traverse(object=>{const index=object.userData.nativeAzaleaJoint;if(Number.isInteger(index)){if(joints.has(index))throw new UnsupportedAzaleaResource('Duplicate original joint index');joints.set(index,object);}});if(joints.size!==count)throw new UnsupportedAzaleaResource('Missing original Azalea joint bindings');return joints;}
/** Native row-vector matrices have the same storage order as Three's
 * column-vector transpose. Preserve zero scales and nonorthogonal fixed-point
 * rotation entries: quaternion conversion would normalize away native data. */
export function applyAzaleaJointFrame(root:THREE.Object3D,animation:JointAnimation,frame:number){
 if(!Number.isInteger(frame)||frame<0||frame>=animation.frameCount)throw RangeError('Invalid native animation frame');
 const poses=animation.nativeFrames[frame];if(!poses)throw new UnsupportedAzaleaResource('Missing native frame');const joints=nativeJoints(root,poses.length);
 for(let i=0;i<poses.length;i++){
  const p=poses[i],r=p.rotationFx32,t=p.translationFx32,s=p.scaleFx32,object=joints.get(i)!;
  if(r.length!==9||t.length!==3||s.length!==3||![...r,...t,...s].every(Number.isInteger))throw new UnsupportedAzaleaResource('Invalid native fixed-point pose');
  object.matrixAutoUpdate=false;object.matrix.fromArray([r[0]*s[0]/16777216,r[1]*s[0]/16777216,r[2]*s[0]/16777216,0,r[3]*s[1]/16777216,r[4]*s[1]/16777216,r[5]*s[1]/16777216,0,r[6]*s[2]/16777216,r[7]*s[2]/16777216,r[8]*s[2]/16777216,0,t[0]/4096,t[1]/4096,t[2]/4096,1]);object.matrixWorldNeedsUpdate=true;
 }
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);
 // Three caches skinned bounds; a previous pose's sphere is not authoritative.
 root.traverse(object=>{if(object instanceof THREE.SkinnedMesh){object.boundingSphere=null!;object.boundingBox=null!;}});
}
type Placed={model:number;root:THREE.Group;rest:Map<THREE.Object3D,{matrix:THREE.Matrix4;auto:boolean}>;nativeRest:JointAnimation;ownedMaterials:Set<THREE.Material>};
function placedModel(resources:AzaleaGymResources,id:number):Placed{
 const template=resources.models.get(id),entry=resources.manifest.models[id];if(!template||!entry)throw new UnsupportedAzaleaResource('Original room model '+id+' is unavailable');
 if(entry.scalingRule!==0||entry.rest?.kind!=='joint'||entry.rest.frameCount!==1)throw new UnsupportedAzaleaResource('Unsupported original joint scaling/rest ABI');
 const root=clone(template)as THREE.Group,rest=new Map<THREE.Object3D,{matrix:THREE.Matrix4;auto:boolean}>(),ownedMaterials=new Set<THREE.Material>();nativeJoints(root,entry.nativeJointCount);
 root.traverse(object=>{object.updateMatrix();rest.set(object,{matrix:object.matrix.clone(),auto:object.matrixAutoUpdate});if(object instanceof THREE.Mesh&&(id===117||id===122)){const create=(material:THREE.Material)=>{const result=material.clone();ownedMaterials.add(result);return result;};object.material=Array.isArray(object.material)?object.material.map(create):create(object.material);}});
 applyAzaleaJointFrame(root,entry.rest,0);return{model:id,root,rest,nativeRest:entry.rest,ownedMaterials};
}
function disposePlaced(placed:Placed){const skeletons=new Set<THREE.Skeleton>();placed.root.traverse(object=>{if(object instanceof THREE.SkinnedMesh)skeletons.add(object.skeleton);});for(const value of skeletons)value.dispose();for(const value of placed.ownedMaterials)value.dispose();placed.root.removeFromParent();}

export class AzaleaGymWorld{
 private generation=0;private controller:AbortController|null=null;private resources:AzaleaGymResources|null=null;private stateValue:AzaleaGymState|null=null;private mapID=-1;private tick=0;
 private actionCleanup:(()=>void)|null=null;
 private placed:Placed[]=[];private carts:Placed[]=[];private group:THREE.Group|null=null;
 moving=false;
 constructor(private scene:THREE.Scene,private load:()=>Promise<AzaleaGymResources>,private ticks:AzaleaTicks=animateAzaleaTicks){}
 get active(){return this.group!==null;}
 get loadedMapId(){return this.mapID;}
 get state(){return this.stateValue?copy(this.stateValue):null;}
 get spiderModels(){return this.carts.map(cart=>cart.root);}
 cancel(){this.controller?.abort();}
 dispose(){this.leave();}
 private assertReady(){if(!this.resources||!this.stateValue||!this.group)throw Error('Azalea Gym original resources are not loaded');}
 async enter(map:AzaleaMap,saved?:AzaleaGymState,kind:'continue'|'connection'|'warp'='warp'){
  this.leave();const generation=this.generation;if(map.key!==AZALEA_GYM_KEY)return;
  const state=azaleaGymEntryState(saved,kind),resources=await this.load();if(generation!==this.generation)return;
  if(map.id!==resources.manifest.map)throw new UnsupportedAzaleaResource('Azalea resource map ownership mismatch');
  const group=new THREE.Group();group.name='native-azalea-gym';const placed:Placed[]=[],carts:Placed[]=[];
  try{
   for(const cell of map.cells)for(const prop of cell.props){if(!AZALEA_MANAGED_MODELS.has(prop.id))continue;const p=placedModel(resources,prop.id);placed.push(p);p.root.scale.set(prop.scale[0]/16,prop.scale[1]/16,prop.scale[2]/16);p.root.position.set(cell.x*32+16+prop.position[0],cell.altitude*.5+prop.position[1],cell.z*32+16+prop.position[2]);p.root.rotation.set(...prop.rotation.map(value=>value*Math.PI/180)as[number,number,number]);group.add(p.root);}
   if(placed.length!==6||[115,116,122].some(id=>placed.filter(p=>p.model===id).length!==1)||placed.filter(p=>p.model===117).length!==3)throw new UnsupportedAzaleaResource('Original Azalea static placements are incomplete');
   for(const station of state.spiders){const p=placedModel(resources,118);placed.push(p);carts.push(p);p.root.scale.setScalar(1/16);const[x,z]=NATIVE_AZALEA_GYM.stations[station];p.root.position.set(x+.5,0,z);group.add(p.root);}
   this.resources=resources;this.stateValue=state;this.mapID=map.id;this.placed=placed;this.carts=carts;this.group=group;this.tick=0;this.applySwitches();this.scene.add(group);group.updateMatrixWorld(true);return copy(state);
  }catch(error){if(this.group===group)this.leave();else for(const p of placed)disposePlaced(p);throw error;}
 }
 leave(){this.generation++;this.controller?.abort();const cleanup=this.actionCleanup;this.actionCleanup=null;this.controller=null;this.moving=false;try{cleanup?.();}finally{for(const p of this.placed)disposePlaced(p);this.group?.removeFromParent();this.placed=[];this.carts=[];this.group=null;this.resources=null;this.stateValue=null;this.mapID=-1;this.tick=0;}}
 /** Synchronous original AzaleaGymInit hook after resources are admitted.
  * Only ordinary Continue retains its saved stations/switches. */
 init(saved?:AzaleaGymState,kind:'continue'|'connection'|'warp'='warp'){
  this.assertReady();if(this.moving)throw Error('Azalea Gym is busy');const state=azaleaGymEntryState(saved,kind);this.stateValue=state;
  for(let i=0;i<4;i++){const cart=this.carts[i],[x,z]=NATIVE_AZALEA_GYM.stations[state.spiders[i]];this.resetCart(cart);cart.root.position.set(x+.5,0,z);}this.applySwitches();return copy(state);
 }
 private applySwitches(){this.assertReady();const resources=this.resources!,state=this.stateValue!;for(const p of this.placed){if(p.model===118)continue;const bit=p.model===115||p.model===122?(state.switches>>1)&1:state.switches&1,animation=resources.manifest.models[p.model].animations[bit];if(!animation)throw new UnsupportedAzaleaResource('Original switch pose is unavailable');if(animation.kind==='joint')applyAzaleaJointFrame(p.root,animation,this.tick%animation.frameCount);else for(const track of animation.tracks){const frame=this.tick%animation.frameCount,key=[...track.keys].reverse().find(key=>key.frame<=frame);if(!key)throw new UnsupportedAzaleaResource('Original PAT keyframe missing');const map=resources.patterns.get(key.asset);if(!map)throw new UnsupportedAzaleaResource('Original PAT palette PNG unavailable');let matched=0;p.root.traverse(object=>{if(object instanceof THREE.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material])if(material.name===track.material){if((material as THREE.MeshBasicMaterial).map!==map){(material as THREE.MeshBasicMaterial).map=map;material.needsUpdate=true;}matched++;}});if(!matched)throw new UnsupportedAzaleaResource('Original PAT material binding missing');}}}
 /** Parent may run this from its native field clock; static tracks share a
  * continuously advancing source phase, even when not currently selected. */
 updateNativeTick(){if(!this.active)return;this.tick++;this.applySwitches();}
 async flipSwitch(index:number,hooks:Pick<AzaleaGymHooks,'switchSound'|'commitState'>){
  this.assertReady();if(this.moving)throw Error('Azalea Gym is busy');const generation=this.generation,previous=copy(this.stateValue!),next=flipAzaleaGymSwitch(previous,index),controller=new AbortController();this.controller=controller;this.moving=true;
  try{this.stateValue=next;this.applySwitches();hooks.commitState(copy(next));await abortable(hooks.switchSound(controller.signal),controller.signal);check(controller.signal);return copy(next);}catch(error){if(generation===this.generation){this.stateValue=previous;this.applySwitches();hooks.commitState(copy(previous));}throw error;}finally{if(generation===this.generation){this.controller=null;this.moving=false;}}
 }
 private resetCart(p:Placed){for(const[object,rest]of p.rest){object.matrix.copy(rest.matrix);object.matrixAutoUpdate=rest.auto;object.matrixWorldNeedsUpdate=true;}applyAzaleaJointFrame(p.root,p.nativeRest,0);}
 private runTicks(count:number,tick:(index:number)=>void,signal:AbortSignal){check(signal);return abortable(this.ticks(count,index=>{check(signal);tick(index);},signal),signal);}
 async ride(station:number,hooks:AzaleaGymHooks){
  this.assertReady();if(this.moving)throw Error('Azalea Gym is busy');const previous=copy(this.stateValue!),plan=planAzaleaGymRide(previous,station),player=hooks.player();
  if(player.x!==plan.boarding.from.x||player.z!==plan.boarding.from.z||player.y!==0)throw Error('Azalea ride requires a rider at the original boarding tile');
  const cart=this.carts[plan.spiderIndex],animation=this.resources!.manifest.models[118].animations[0];if(animation.kind!=='joint')throw new UnsupportedAzaleaResource('Native spider joint animation missing');
  const generation=this.generation,controller=new AbortController(),signal=controller.signal,restoreRiders=hooks.captureRiders();this.controller=controller;this.moving=true;let completed=false,sound=false,shake=false,mustResetTrack=false,held=false,released=false;
  const segmentStarts=new Map<number,number>();let start=1;for(const segment of plan.segments){segmentStarts.set(start,segment.velocity.x/2);start+=segment.ticks;}
  this.actionCleanup=()=>{if(released)return;released=true;const stopSound=sound,resetCamera=shake,resetTrack=mustResetTrack,releaseHold=held;sound=false;shake=false;mustResetTrack=false;held=false;try{if(releaseHold)hooks.holdPlayer(74);}finally{try{hooks.releaseRiders();}finally{try{if(stopSound)hooks.robotSound(false);}finally{try{if(resetCamera)hooks.cameraOffset(0);}finally{if(resetTrack)hooks.trackPlayer(true);}}}}};
  const pose=(tick:number)=>{const frame=azaleaGymRideFrame(plan,tick);cart.root.position.set(frame.model.x,frame.model.y,frame.model.z);hooks.placeRiders(frame);return frame;};
  try{
   await abortable(hooks.waitFollower(signal),signal);check(signal);
   await abortable(hooks.stepRiders(plan.direction,'board',signal),signal);check(signal);
   const boarded=hooks.player();if(boarded.x!==plan.boarding.onto.x||boarded.z!==plan.boarding.onto.z||boarded.y!==0)throw Error('Original Azalea boarding movement did not complete');held=true;hooks.holdPlayer(73);check(signal);
   await this.runTicks(NATIVE_AZALEA_GYM.phases.afterBoardWaitTicks,()=>{},signal);check(signal);
   applyAzaleaJointFrame(cart.root,animation,0);sound=true;hooks.robotSound(true);
   await this.runTicks(plan.movementTicks,tick=>{const xComponent=segmentStarts.get(tick);if(xComponent!==undefined){if(!mustResetTrack&&xComponent!==0&&xComponent!==4096){mustResetTrack=true;hooks.trackPlayer(false);}else if(mustResetTrack){mustResetTrack=false;hooks.trackPlayer(true);}}pose(tick);if(tick===plan.movementTicks){this.stateValue=completeAzaleaGymRide(this.stateValue!,plan);this.resetCart(cart);hooks.commitState(copy(this.stateValue));hooks.robotSound(false);sound=false;}else applyAzaleaJointFrame(cart.root,animation,tick%animation.frameCount);},signal);check(signal);
   await this.runTicks(1,()=>{hooks.dockRiders(azaleaGymRideFrame(plan,plan.movementTicks));hooks.holdPlayer(74);held=false;},signal);check(signal);
   const offsets=azaleaGymShakeOffsets(hooks.facing());shake=true;await this.runTicks(offsets.length,tick=>hooks.cameraOffset(offsets[tick-1]),signal);check(signal);hooks.cameraOffset(0);shake=false;
   await this.runTicks(NATIVE_AZALEA_GYM.phases.beforeDisembarkWaitTicks,()=>{},signal);check(signal);
   await abortable(hooks.stepRiders(plan.direction,'disembark',signal),signal);check(signal);const arrived=hooks.player();if(arrived.x!==plan.arrival.disembarked.x||arrived.z!==plan.arrival.disembarked.z||arrived.y!==0)throw Error('Original Azalea disembark movement did not complete');completed=true;return copy(this.stateValue!);
  }finally{
   if(generation===this.generation){try{try{this.actionCleanup?.();}finally{if(!completed&&generation===this.generation){this.stateValue=previous;this.resetCart(cart);const[x,z]=NATIVE_AZALEA_GYM.stations[station];cart.root.position.set(x+.5,0,z);try{hooks.commitState(copy(previous));}finally{if(generation===this.generation)restoreRiders();}}}}finally{if(generation===this.generation){this.actionCleanup=null;this.controller=null;this.moving=false;}}}
  }
 }
}
