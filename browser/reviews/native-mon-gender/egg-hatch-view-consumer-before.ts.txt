import * as THREE from 'three';
import type {OriginalWorld} from './world.ts';
import type {Mon} from './types.ts';
import {fieldCameraObstacles} from './camera.ts';

/** Structural subset of EggHatchScene; the helper retains all game mutations. */
export type EggHatchVisualScene={kind:'standard'|'manaphy';hatched:Pick<Mon,'species'|'gender'>;field:{map:number;x:number;z:number;facing:number};cry:{species:number;form:number}};
export type EggHatchField={map:number;x:number;y?:number;z:number;hideActors?:THREE.Object3D[]};
export type HatchArt={texture:THREE.Texture;aspect:number;uv:[number,number,number,number]};
type Ports={art?:(path:string)=>Promise<HatchArt>;cry?:(scene:EggHatchVisualScene,signal:AbortSignal)=>Promise<void>;signal?:AbortSignal};
type Motion={seconds:number;elapsed:number;update:(progress:number)=>void;resolve:()=>void;reject:(reason:unknown)=>void};
const cachedArt=new Map<string,Promise<HatchArt>>();
const cancelled=(reason?:unknown)=>reason instanceof Error?reason:new Error('Egg hatch presentation cancelled');

/** Textures belong to this native-art cache, never to a temporary hatch view. */
export function hatchArt(path:string):Promise<HatchArt>{
 if(!cachedArt.has(path)){
  let loaded:THREE.Texture|undefined;
  const loading=new THREE.TextureLoader().loadAsync(path).then(texture=>{loaded=texture;
   texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;
   const image=texture.image as HTMLImageElement,canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
   if(!image.width||!image.height)throw Error(`Empty original hatch artwork ${path}`);
   const context=canvas.getContext('2d');if(!context)throw Error('Native hatch artwork needs a canvas decoder');context.drawImage(image,0,0);
   const pixels=context.getImageData(0,0,image.width,image.height).data;let left=image.width,right=0,top=image.height,bottom=0;
   for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)if(pixels[(y*image.width+x)*4+3]>30){left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);}
   if(right<=left||bottom<=top)throw Error(`Transparent original hatch artwork ${path}`);
   return{texture,aspect:(right-left)/(bottom-top),uv:[left/image.width,1-bottom/image.height,right/image.width,1-top/image.height]as[number,number,number,number]};
  }).catch(error=>{cachedArt.delete(path);loaded?.dispose();throw error;});cachedArt.set(path,loading);
 }
 return cachedArt.get(path)!;
}

type NativeCry={file:string;frames:number;sampleRate:number;durationSeconds:number};
let cryManifest:Promise<{cries:Record<string,NativeCry>}>|null=null;
/** Await real playback, not a made-up delay or a substitute species' cry. */
export async function playNativeHatchCry(scene:EggHatchVisualScene,signal:AbortSignal){
 if(signal.aborted)throw cancelled(signal.reason);
 if(scene.cry.form!==0||scene.cry.species!==175)throw Error(`Original hatch cry not exported: ${scene.cry.species} form${scene.cry.form}`);
 cryManifest??=fetch('/source/hatching/audio.json').then(async response=>{if(!response.ok)throw Error('Original hatch audio manifest could not load');return response.json();}).catch(error=>{cryManifest=null;throw error;});
 const manifest=await cryManifest,entry=manifest.cries[String(scene.cry.species)];
 if(!entry||entry.file!==`cry-${scene.cry.species}.wav`||entry.frames<=0||entry.sampleRate<=0||Math.abs(entry.durationSeconds-entry.frames/entry.sampleRate)>1e-12)throw Error('Invalid original hatch cry metadata');
 if(signal.aborted)throw cancelled(signal.reason);
 const audio=new Audio('/source/hatching/'+entry.file);audio.volume=.6;
 await new Promise<void>((resolve,reject)=>{
  let settled=false,timer:ReturnType<typeof setTimeout>|undefined;
  const done=(error?:unknown)=>{if(settled)return;settled=true;if(timer)clearTimeout(timer);signal.removeEventListener('abort',abort);audio.removeEventListener('ended',ended);audio.removeEventListener('error',failed);audio.pause();audio.removeAttribute('src');audio.load();if(error)reject(error);else resolve();};
  const abort=()=>done(cancelled(signal.reason)),ended=()=>done(),failed=()=>done(Error('Original hatch cry could not play'));
  signal.addEventListener('abort',abort,{once:true});audio.addEventListener('ended',ended,{once:true});audio.addEventListener('error',failed,{once:true});
  if(signal.aborted){abort();return;}
  // This bounds a broken media element; successful playback resolves on ended.
  timer=setTimeout(()=>done(Error('Original hatch cry did not finish')),entry.durationSeconds*1000+2500);
  try{void audio.play().catch(done);}catch(error){done(error);}
 });
}

/** A temporary paper Egg/Pokémon in the live native field and free camera. */
export class WorldEggHatchView {
 active=false;
 readonly group=new THREE.Group();
 private scene:EggHatchVisualScene|null=null;
 private controller=new AbortController();
 private failure:Error|null=null;
 private motion:Motion|null=null;
 private pending=new Set<(reason:unknown)=>void>();
 private hidden:{object:THREE.Object3D;visible:boolean}[]=[];
 private snapshot:{target:THREE.Vector3;position:THREE.Vector3;rotation:THREE.Quaternion;fov:number}|null=null;
 private anchor=new THREE.Vector3();private focus=new THREE.Vector3();private returnProgress=0;
 private egg:THREE.Group|null=null;private halves:THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>[]=[];
 private pokemon:THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>|null=null;
 private glow:THREE.Mesh<THREE.SphereGeometry,THREE.MeshBasicMaterial>|null=null;
 private sparks:THREE.Mesh[]=[];
 private externalAbort:()=>void;
 constructor(readonly world:OriginalWorld,private readonly field:()=>EggHatchField,private readonly ports:Ports={}){
  this.group.name='native-egg-hatch-in-field';this.externalAbort=()=>this.cancel(ports.signal?.reason);
 }
 private guard(){if(!this.active||this.controller.signal.aborted)throw cancelled(this.controller.signal.reason);if(this.field().map!==this.scene?.field.map)throw Error('Egg hatch field changed');}
 private async awaiting<T>(promise:Promise<T>):Promise<T>{
  this.guard();let reject!:(reason:unknown)=>void;const stopped=new Promise<never>((_resolve,fail)=>reject=fail);this.pending.add(reject);
  try{const value=await Promise.race([promise,stopped]);this.guard();return value;}finally{this.pending.delete(reject);}
 }
 private animate(seconds:number,update:(progress:number)=>void){
  this.guard();if(this.motion)throw Error('Overlapping Egg hatch animation');
  return new Promise<void>((resolve,reject)=>{this.motion={seconds,elapsed:0,update,resolve,reject};update(0);});
 }
 private plane(art:HatchArt,height:number,lower=0,upper=1){
  const geometry=new THREE.PlaneGeometry(height*art.aspect,height*(upper-lower)),uv=geometry.getAttribute('uv'),[u0,v0,u1,v1]=art.uv;
  for(let i=0;i<uv.count;i++){const u=uv.getX(i),v=lower+uv.getY(i)*(upper-lower);uv.setXY(i,u0+(u1-u0)*u,v0+(v1-v0)*v);}uv.needsUpdate=true;
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:art.texture,transparent:true,alphaTest:.15,side:THREE.DoubleSide}));return mesh;
 }
 private hideFieldActors(field:EggHatchField){
  for(const object of field.hideActors??[]){if(!this.hidden.some(actor=>actor.object===object))this.hidden.push({object,visible:object.visible});object.visible=false;}
 }
 private build(egg:HatchArt,pokemon:HatchArt){
  this.egg=new THREE.Group();this.group.add(this.egg);
  this.halves=[this.plane(egg,1.35,0,.5),this.plane(egg,1.35,.5,1)];this.halves.forEach((half,index)=>{half.position.y=.3375+index*.675;this.egg!.add(half);});
  this.pokemon=this.plane(pokemon,1.65);this.pokemon.geometry.translate(0,.825,0);this.pokemon.visible=false;this.group.add(this.pokemon);
  const shadow=new THREE.Mesh(new THREE.CircleGeometry(.5,24),new THREE.MeshBasicMaterial({color:'#203029',transparent:true,opacity:.2,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.025;this.group.add(shadow);
  this.glow=new THREE.Mesh(new THREE.SphereGeometry(.8,16,12),new THREE.MeshBasicMaterial({color:'#fff3ce',transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));this.glow.position.y=.7;this.group.add(this.glow);
  const geometry=new THREE.OctahedronGeometry(.07),material=new THREE.MeshBasicMaterial({color:'#fff6bb',transparent:true,opacity:0,depthWrite:false});
  for(let i=0;i<10;i++){const spark=new THREE.Mesh(geometry,material);spark.userData.angle=i*Math.PI*2/10;this.sparks.push(spark);this.group.add(spark);}
 }
 async reveal(scene:EggHatchVisualScene){
  if(this.active||this.world.fieldEffect?.active||this.world.battleStage?.active)throw Error('The field already has an active presentation');
  if(scene.kind!=='standard')throw Error('Original Manaphy Egg artwork has not been exported');
  if(scene.cry.species!==scene.hatched.species||!['male','female'].includes(scene.hatched.gender))throw Error('Invalid native hatch species artwork');
  const field=this.field();if(field.map!==scene.field.map)throw Error('Egg hatch field changed');
  this.controller=new AbortController();this.failure=null;this.scene=scene;this.returnProgress=0;
  this.snapshot={target:this.world.target.clone(),position:this.world.camera.position.clone(),rotation:this.world.camera.quaternion.clone(),fov:this.world.camera.fov};
  this.anchor.set(field.x,field.y??this.world.height(field.x,field.z),field.z);this.focus.copy(this.anchor).add(new THREE.Vector3(0,.85,0));this.group.position.copy(this.anchor);
  this.active=true;this.world.fieldEffect=this;this.world.scene.add(this.group);this.ports.signal?.addEventListener('abort',this.externalAbort,{once:true});
  try{
   if(this.ports.signal?.aborted)throw cancelled(this.ports.signal.reason);
   const art=this.ports.art??hatchArt,[egg,pokemon]=await this.awaiting(Promise.all([art('/source/eggs/egg-icon.png'),art(`/source/pokemon/${scene.hatched.species}-${scene.hatched.gender}-front.png`)]));
   this.hideFieldActors(field);this.build(egg,pokemon);
   await this.animate(1.5,t=>{this.egg!.rotation.z=Math.sin(t*Math.PI*10)*.14*t;this.egg!.position.y=Math.abs(Math.sin(t*Math.PI*5))*.09;this.glow!.material.opacity=Math.max(0,t-.65)*.9;});
   this.guard();
   await this.animate(.45,t=>{this.egg!.rotation.z=0;this.egg!.position.y=0;this.halves[0].position.set(-t*.25,.3375-t*.15,0);this.halves[1].position.set(t*.3,1.0125+t*.55,0);this.halves[0].rotation.z=-t*.5;this.halves[1].rotation.z=t*.6;for(const half of this.halves)half.material.opacity=1-t;this.glow!.material.opacity=.8*Math.sin(t*Math.PI/2);});
   this.guard();
   this.egg!.visible=false;this.pokemon!.visible=true;
   await this.animate(.65,t=>{this.pokemon!.scale.setScalar(.2+.8*t);this.pokemon!.position.y=Math.sin(t*Math.PI)*.2;this.glow!.material.opacity=.8*(1-t);for(const spark of this.sparks){const angle=spark.userData.angle as number;spark.position.set(Math.cos(angle)*t*1.2,.6+Math.sin(t*Math.PI)*.7,Math.sin(angle)*t*1.2);(spark.material as THREE.MeshBasicMaterial).opacity=1-t;}});
   this.guard();
   this.pokemon!.scale.setScalar(1);this.pokemon!.position.y=0;
  }catch(error){this.cancel(error);throw error;}
 }
 async cry(scene:EggHatchVisualScene){
  try{this.guard();const active=this.scene!;if(scene.field.map!==active.field.map||scene.hatched.species!==active.hatched.species||scene.hatched.gender!==active.hatched.gender||scene.cry.species!==active.cry.species||scene.cry.form!==active.cry.form)throw Error('Egg hatch cry belongs to a different scene');await this.awaiting((this.ports.cry??playNativeHatchCry)(scene,this.controller.signal));}catch(error){this.cancel(error);throw error;}
 }
 update(dt:number){
  if(!this.active)return;
  try{this.guard();}catch(error){this.cancel(error);return;}
  const motion=this.motion;
  if(motion){motion.elapsed+=Math.max(0,dt);const t=Math.min(1,motion.elapsed/motion.seconds);motion.update(t);if(t===1){this.motion=null;motion.resolve();}}
  const camera=this.world.camera,viewer=camera.position.clone().sub(this.anchor),yaw=Math.atan2(viewer.x,viewer.z);if(this.egg)this.egg.rotation.y=yaw;if(this.pokemon)this.pokemon.rotation.y=yaw;
  const current=this.field();if(this.egg)this.hideFieldActors(current);const script=this.world.scriptCameraPosition,fieldTarget=script?new THREE.Vector3(script.x,script.y+.9,script.z):new THREE.Vector3(current.x,(current.y??this.world.height(current.x,current.z))+.9,current.z),look=this.focus.clone().lerp(fieldTarget,this.returnProgress);
  this.world.target.lerp(look,1-Math.exp(-dt*8));
  const orbit=new THREE.Vector3(Math.sin(this.world.yaw)*Math.cos(this.world.pitch),Math.sin(this.world.pitch),Math.cos(this.world.yaw)*Math.cos(this.world.pitch)),distance=this.world.distance*(.72+.28*this.returnProgress);
  const obstacles=[...this.world.cells.values()].flatMap(cell=>fieldCameraObstacles(cell.group)),ray=new THREE.Raycaster(this.world.target,orbit,.5,distance),hit=ray.intersectObjects(obstacles,false).find(hit=>hit.distance>1.2),safeDistance=hit?Math.max(2.2,hit.distance-.6):distance;
  camera.position.lerp(this.world.target.clone().addScaledVector(orbit,safeDistance),1-Math.exp(-dt*8));camera.lookAt(this.world.target);
 }
 async finish(){
  if(!this.active){if(this.failure)throw this.failure;return;}
  try{await this.animate(.4,t=>{this.returnProgress=t;if(this.pokemon)this.pokemon.material.opacity=1-t;});this.guard();this.cleanup(false);}catch(error){this.cancel(error);throw error;}
 }
 cancel(reason?:unknown){
  if(!this.active)return;const error=cancelled(reason);this.failure=error;this.controller.abort(error);const motion=this.motion;this.motion=null;motion?.reject(error);for(const reject of this.pending)reject(error);this.pending.clear();this.cleanup(true);
 }
 private cleanup(restoreCamera:boolean){
  this.active=false;this.ports.signal?.removeEventListener('abort',this.externalAbort);for(const actor of this.hidden)actor.object.visible=actor.visible;this.hidden=[];
  if(restoreCamera&&this.snapshot&&this.world.fieldEffect===this){this.world.target.copy(this.snapshot.target);this.world.camera.position.copy(this.snapshot.position);this.world.camera.quaternion.copy(this.snapshot.rotation);this.world.camera.fov=this.snapshot.fov;this.world.camera.updateProjectionMatrix();}
  this.world.scene.remove(this.group);const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();this.group.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);}});for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();this.group.clear();
  this.egg=null;this.pokemon=null;this.glow=null;this.halves=[];this.sparks=[];this.scene=null;this.snapshot=null;if(this.world.fieldEffect===this)this.world.fieldEffect=null;
 }
}
