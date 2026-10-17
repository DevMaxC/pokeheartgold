import * as THREE from 'three';
import type {BattleEvolutionScene,EvolutionMonSnapshot} from './battle-evolution-types.ts';
import {fieldCameraObstacles} from './camera.ts';

export type EvolutionArt={texture:THREE.Texture;aspect:number;uv:readonly[number,number,number,number]};
export type EvolutionField={map:number;x:number;y:number;z:number;actors:readonly {object:THREE.Object3D;current:()=>boolean}[]};
export type EvolutionFieldWorld={scene:THREE.Scene;camera:THREE.PerspectiveCamera;target:THREE.Vector3;yaw:number;pitch:number;distance:number;cells:Map<unknown,{group:THREE.Group}>;scriptCameraPosition?:{x:number;y:number;z:number}|null;fieldEffect:{active:boolean;update:(dt:number)=>void;cancel:(reason?:unknown)=>void}|null;battleStage?:{active:boolean}|null};
export type EvolutionPhase='opening'|'old-cry'|'gather'|'narrow'|'oscillate'|'widen'|'reveal'|'new-cry'|'congratulations'|'learning'|'cancel'|'cancel-cry'|'closing';
type Ports={art?:(path:string,signal:AbortSignal)=>Promise<EvolutionArt>;artTimeoutMs?:number};
type Particle=THREE.Mesh<THREE.OctahedronGeometry,THREE.MeshBasicMaterial>&{userData:{age:number;life:number;angle:number;radius:number}};
const artCache=new Map<string,Promise<EvolutionArt>>();
const abortError=(reason?:unknown)=>reason instanceof Error?reason:new DOMException('Evolution presentation interrupted','AbortError');
const check=(signal:AbortSignal)=>{if(signal.aborted)throw abortError(signal.reason);};

/** These exports contain the original base-form, non-shiny front art only. */
export function evolutionArtPath(mon:EvolutionMonSnapshot){
 if(!Number.isInteger(mon.species)||mon.species<1||mon.species>493||!['male','female','genderless'].includes(mon.gender)||!Number.isInteger(mon.personality)||mon.personality<0||mon.personality>0xffffffff)throw Error('Invalid original evolution artwork identity');
 if((mon.form??0)!==0)throw Error(`Original evolution form artwork is not exported: ${mon.species} form${mon.form}`);
 const ot=mon.provenance?.otId??mon.id;
 if(!Number.isInteger(ot)||ot<0||ot>0xffffffff)throw Error('Original evolution artwork needs a valid OT identity');
 if(((ot>>>16)^(ot&65535)^(mon.personality>>>16)^(mon.personality&65535))<8)throw Error(`Original shiny evolution artwork is not exported: ${mon.species}`);
 return `/source/pokemon/${mon.species}-${mon.gender==='female'?'female':'male'}-front.png`;
}

/** Cached native textures are borrowed. A view disposes only its own meshes. */
export async function loadEvolutionArt(path:string,signal:AbortSignal):Promise<EvolutionArt>{
 check(signal);
 let promise=artCache.get(path);
 if(!promise){let texture:THREE.Texture|undefined,expired=false,timer:ReturnType<typeof setTimeout>|undefined;
  const decoded=new THREE.TextureLoader().loadAsync(path).then(loaded=>{if(expired){loaded.dispose();throw Error('Late evolution artwork was discarded');}texture=loaded;loaded.colorSpace=THREE.SRGBColorSpace;loaded.magFilter=THREE.NearestFilter;loaded.minFilter=THREE.NearestFilter;loaded.generateMipmaps=false;
   const image=loaded.image as HTMLImageElement;if(!image.width||!image.height)throw Error(`Empty original evolution artwork ${path}`);
   const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d');if(!context)throw Error('Evolution artwork requires its real image decoder');context.drawImage(image,0,0);
   const pixels=context.getImageData(0,0,image.width,image.height).data;let left=image.width,right=0,top=image.height,bottom=0;
   for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)if(pixels[(y*image.width+x)*4+3]>30){left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);}
   if(right<=left||bottom<=top)throw Error(`Transparent original evolution artwork ${path}`);
   return{texture:loaded,aspect:(right-left)/(bottom-top),uv:[left/image.width,1-bottom/image.height,right/image.width,1-top/image.height]as const};
  });
  const evict=()=>{if(artCache.get(path)===promise)artCache.delete(path);};
  promise=new Promise<EvolutionArt>((resolve,reject)=>{timer=setTimeout(()=>{expired=true;evict();reject(Error('Original evolution artwork preparation timed out'));},4000);decoded.then(value=>{if(timer)clearTimeout(timer);if(!expired)resolve(value);},error=>{if(timer)clearTimeout(timer);evict();texture?.dispose();reject(error);});});artCache.set(path,promise);
 }
 return new Promise((resolve,reject)=>{const abort=()=>reject(abortError(signal.reason));signal.addEventListener('abort',abort,{once:true});promise!.then(value=>{signal.removeEventListener('abort',abort);if(signal.aborted)reject(abortError(signal.reason));else resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});if(signal.aborted)abort();});
}

/**
 * An intentional 3D paper-art adaptation in the existing field scene. Source
 * ticks drive real mesh/particle lifetimes; draw(dt) only smooths the free
 * camera. This does not emulate the DS particle resource or pokepic script.
 */
export class WorldEvolutionView{
 active=false;
 readonly group=new THREE.Group();
 phase:EvolutionPhase='opening';
 private scene:BattleEvolutionScene|null=null;
 private signal:AbortSignal|null=null;
 private external:AbortSignal|null=null;
 private controller=new AbortController();
 private generation=Symbol('evolution-view');
 private signalAbort=()=>this.cancel(this.external?.reason);
 private failure:unknown=null;
 private hidden:{object:THREE.Object3D;visible:boolean;current:()=>boolean}[]=[];
 private snapshot:{target:THREE.Vector3;position:THREE.Vector3;rotation:THREE.Quaternion;fov:number}|null=null;
 private old:THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>|null=null;
 private next:THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>|null=null;
 private particles:Particle[]=[];
 private anchor=new THREE.Vector3();
 private pose:{which:'old'|'new';frame:number}|null=null;
 private palette:{color:number;from:number;to:number;frame:number}|null=null;
 private oldScale=256;private newScale=0;private scaleStep=8;private oldShrinks=true;
 private returning=false;private returnBlend=0;
 private lastCameraTarget=new THREE.Vector3();private lastCameraPosition=new THREE.Vector3();
 constructor(readonly world:EvolutionFieldWorld,private readonly field:()=>EvolutionField,private readonly ports:Ports={}){this.group.name='native-evolution-paper-field';}
 // beforeMap is kept outside the immutable controller scene.
 private beforeMap=-1;
 private guarded(){if(!this.active||this.failure)throw abortError(this.failure);if(!this.signal)throw Error('Evolution has no lifecycle');check(this.signal);if(this.world.fieldEffect!==this)throw Error('Evolution presentation lost the field owner');if(this.field().map!==this.beforeMap)throw Error('Evolution presentation changed map');}
 get owner(){return this.active?this.generation:null;}
 assertOwned(owner:symbol){this.guarded();if(owner!==this.generation)throw Error('Evolution presentation belongs to a newer scene');}
 private plane(art:EvolutionArt){
  if(!(art.texture instanceof THREE.Texture)||!Number.isFinite(art.aspect)||art.aspect<=0||art.uv.length!==4||art.uv.some(v=>!Number.isFinite(v))||art.uv[0]<0||art.uv[1]<0||art.uv[2]>1||art.uv[3]>1||art.uv[0]>=art.uv[2]||art.uv[1]>=art.uv[3])throw Error('Invalid original evolution texture crop');
  const geometry=new THREE.PlaneGeometry(1.8*art.aspect,1.8);geometry.translate(0,.9,0);const uv=geometry.getAttribute('uv'),[u0,v0,u1,v1]=art.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,u0+(u1-u0)*uv.getX(i),v0+(v1-v0)*uv.getY(i));
  return new THREE.Mesh(geometry,new THREE.ShaderMaterial({transparent:true,side:THREE.DoubleSide,uniforms:{art:{value:art.texture},white:{value:0},opacity:{value:1}},vertexShader:'varying vec2 artUV;void main(){artUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'uniform sampler2D art;uniform float white;uniform float opacity;varying vec2 artUV;void main(){vec4 c=texture2D(art,artUV);if(c.a<0.15)discard;gl_FragColor=vec4(mix(c.rgb,vec3(1.0),white),c.a*opacity);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'}));
 }
 async begin(scene:BattleEvolutionScene,signal:AbortSignal){
  if(this.active||this.world.fieldEffect?.active||this.world.battleStage?.active)throw Error('Evolution requires sole field presentation ownership');check(signal);
  const timeout=this.ports.artTimeoutMs??4000;if(!Number.isFinite(timeout)||timeout<=0)throw Error('Invalid evolution artwork watchdog');
  const paths=[evolutionArtPath(scene.before),evolutionArtPath(scene.after)],field=this.field();if(!Number.isInteger(field.map)||![field.x,field.y,field.z].every(Number.isFinite))throw Error('Invalid live evolution anchor');
  this.controller=new AbortController();this.generation=Symbol('evolution-view');const generation=this.generation;this.external=signal;this.scene=scene;this.signal=this.controller.signal;this.failure=null;this.beforeMap=field.map;this.returning=false;this.returnBlend=0;this.phase='opening';this.oldScale=256;this.newScale=0;this.scaleStep=8;this.oldShrinks=true;
  this.snapshot={target:this.world.target.clone(),position:this.world.camera.position.clone(),rotation:this.world.camera.quaternion.clone(),fov:this.world.camera.fov};this.anchor.set(field.x,field.y,field.z);this.group.position.copy(this.anchor);
  this.active=true;this.world.fieldEffect=this;this.world.scene.add(this.group);signal.addEventListener('abort',this.signalAbort,{once:true});
  try{const art=await this.waitArt(Promise.all(paths.map(path=>(this.ports.art??loadEvolutionArt)(path,this.signal!))));this.assertOwned(generation);this.old=this.plane(art[0]);this.group.add(this.old);this.next=this.plane(art[1]);this.next.visible=false;this.group.add(this.next);
   const shadow=new THREE.Mesh(new THREE.CircleGeometry(.6,32),new THREE.MeshBasicMaterial({color:0x143127,transparent:true,opacity:.2,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.02;this.group.add(shadow);this.hideActors();
  }catch(error){if(this.generation===generation)this.cancel(error);throw error;}
 }
 private waitArt<T>(promise:Promise<T>):Promise<T>{const signal=this.signal!,timeout=this.ports.artTimeoutMs??4000;if(!Number.isFinite(timeout)||timeout<=0)throw Error('Invalid evolution artwork watchdog');return new Promise((resolve,reject)=>{const finish=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);},abort=()=>{finish();reject(abortError(signal.reason));},timer=setTimeout(()=>{finish();reject(Error('Original evolution artwork preparation timed out'));},timeout);signal.addEventListener('abort',abort,{once:true});promise.then(value=>{finish();if(signal.aborted)reject(abortError(signal.reason));else resolve(value);},error=>{finish();reject(error);});if(signal.aborted)abort();});}
 private hideActors(){for(const actor of this.field().actors)if(actor.current()&&!this.hidden.some(entry=>entry.object===actor.object)){this.hidden.push({...actor,visible:actor.object.visible});actor.object.visible=false;}}
 setPhase(phase:EvolutionPhase){this.guarded();this.phase=phase;if(phase==='oscillate'){this.spawn(18,120);this.oldScale=256;this.newScale=0;this.scaleStep=8;this.oldShrinks=true;}if(phase==='widen'){this.oldScale=0;this.newScale=256;this.spawn(14,16);}if(phase==='reveal')this.spawn(10,16);if(phase==='cancel'){this.clearParticles();this.oldScale=256;this.newScale=0;}if(phase==='gather')this.spawn(12,40);}
 startPose(which:'old'|'new'){this.guarded();this.pose={which,frame:0};}
 get poseActive(){return this.pose!==null;}
 fade(color:number,from:number,to:number){this.guarded();this.palette={color,from,to,frame:0};}
 get paletteActive(){return this.palette!==null;}
 get particlesActive(){return this.particles.length>0;}
 private spawn(count:number,life:number){for(let i=0;i<count;i++){const mesh=new THREE.Mesh(new THREE.OctahedronGeometry(.045),new THREE.MeshBasicMaterial({color:0xfff4c8,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}))as Particle;mesh.userData={age:0,life,angle:i*Math.PI*2/count,radius:.6+i%3*.12};this.particles.push(mesh);this.group.add(mesh);}}
 private clearParticles(){for(const particle of this.particles){this.group.remove(particle);particle.geometry.dispose();particle.material.dispose();}this.particles=[];}
 /** Exactly one call per admitted source evolution task tick, never a dt catch-up loop. */
 tick(){this.guarded();this.hideActors();
  if(this.phase==='oscillate'){if(this.oldShrinks){this.oldScale=Math.max(0,this.oldScale-this.scaleStep);this.newScale=Math.min(256,this.newScale+this.scaleStep);if(this.oldScale===0)this.oldShrinks=false;}else{this.oldScale=Math.min(256,this.oldScale+this.scaleStep);this.newScale=Math.max(0,this.newScale-this.scaleStep);if(this.newScale===0){this.oldShrinks=true;this.scaleStep=Math.min(64,this.scaleStep*2);}}}
  if(this.old&&this.next){this.old.scale.setScalar(this.oldScale/256);this.next.scale.setScalar(this.newScale/256);this.old.visible=this.oldScale>0;this.next.visible=this.newScale>0;}
  if(this.pose){const t=++this.pose.frame/16,pic=this.pose.which==='old'?this.old:this.next;if(pic){pic.rotation.z=Math.sin(t*Math.PI*2)*.045;pic.position.y=Math.sin(t*Math.PI)*.08;}if(t>=1)this.pose=null;}
  if(this.palette){const t=Math.min(1,++this.palette.frame/16),value=this.palette.from+(this.palette.to-this.palette.from)*t;for(const pic of[this.old,this.next])if(pic){if(this.palette.color===0xffffff)pic.material.uniforms.white.value=value/16;else pic.material.uniforms.opacity.value=1-value/16;}if(t===1)this.palette=null;}
  const alive:Particle[]=[];for(const particle of this.particles){const t=++particle.userData.age/particle.userData.life;if(t>=1){this.group.remove(particle);particle.geometry.dispose();particle.material.dispose();continue;}const angle=particle.userData.angle+t*Math.PI*4,radius=particle.userData.radius*(.6+Math.sin(t*Math.PI));particle.position.set(Math.cos(angle)*radius,.15+t*1.8,Math.sin(angle)*radius);particle.material.opacity=Math.sin(t*Math.PI);alive.push(particle);}this.particles=alive;
 }
 update(dt:number){if(!this.active)return;try{this.guarded();if(!Number.isFinite(dt)||dt<0)throw Error('Invalid evolution camera delta');const smooth=1-Math.exp(-Math.min(dt,.1)*8);if(this.returning)this.returnBlend+=(1-this.returnBlend)*smooth;
   const field=this.field(),script=this.world.scriptCameraPosition,fieldTarget=script?new THREE.Vector3(script.x,script.y+.9,script.z):new THREE.Vector3(field.x,field.y+.9,field.z),look=this.anchor.clone().add(new THREE.Vector3(0,.9,0)).lerp(fieldTarget,this.returnBlend);
   this.world.target.lerp(look,smooth);const orbit=new THREE.Vector3(Math.sin(this.world.yaw)*Math.cos(this.world.pitch),Math.sin(this.world.pitch),Math.cos(this.world.yaw)*Math.cos(this.world.pitch)),distance=this.world.distance*(.72+.28*this.returnBlend);
   const obstacles=[...this.world.cells.values()].flatMap(cell=>fieldCameraObstacles(cell.group)),ray=new THREE.Raycaster(this.world.target,orbit,.5,distance),hit=ray.intersectObjects(obstacles,false).find(value=>value.distance>1.2),safe=hit?Math.max(2.2,hit.distance-.6):distance;
   this.lastCameraTarget.copy(fieldTarget);this.lastCameraPosition.copy(fieldTarget).addScaledVector(orbit,this.returning?Math.min(this.world.distance,safe):this.world.distance);
   this.world.camera.position.lerp(this.world.target.clone().addScaledVector(orbit,safe),smooth);this.world.camera.lookAt(this.world.target);const yaw=Math.atan2(this.world.camera.position.x-this.anchor.x,this.world.camera.position.z-this.anchor.z);for(const pic of[this.old,this.next])if(pic)pic.rotation.y=yaw;
  }catch(error){this.cancel(error);}}
 beginReturn(){this.guarded();this.returning=true;}
 get cameraReturned(){return this.returning&&this.returnBlend>.999&&this.world.target.distanceTo(this.lastCameraTarget)<.01&&this.world.camera.position.distanceTo(this.lastCameraPosition)<.02;}
 complete(){this.guarded();if(!this.cameraReturned)throw Error('Evolution camera has not completed its owned return');this.cleanup(false);}
 cancel(reason?:unknown){if(!this.active)return;this.failure=abortError(reason);this.controller.abort(this.failure);this.cleanup(true);}
 private cleanup(restore:boolean){const owns=this.world.fieldEffect===this;this.active=false;this.external?.removeEventListener('abort',this.signalAbort);this.clearParticles();for(const actor of this.hidden)if(owns&&actor.current()&&actor.object.visible===false)actor.object.visible=actor.visible;this.hidden=[];
  if(restore&&owns&&this.snapshot){this.world.target.copy(this.snapshot.target);this.world.camera.position.copy(this.snapshot.position);this.world.camera.quaternion.copy(this.snapshot.rotation);this.world.camera.fov=this.snapshot.fov;this.world.camera.updateProjectionMatrix();}
  this.world.scene.remove(this.group);const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();this.group.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);}});for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();this.group.clear();this.old=null;this.next=null;this.pose=null;this.palette=null;this.scene=null;this.snapshot=null;if(owns)this.world.fieldEffect=null;
 }
}
