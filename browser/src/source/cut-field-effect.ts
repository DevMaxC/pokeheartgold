import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';

type JointPose={translationFx32:number[];scaleFx32:number[];inverseScaleFx32:number[]};
type AudioAsset={file:string;sampleRate:number;frames:number;channels:number;wavSHA256:string};
export type NativeCutManifest={version:1;asset:string;glbSHA256:string;nativeNodeNames:string[];ticksPerSecond:30;modelFinishedAfterUpdates:45;completionAfterQueueUpdates:47;joint:{frameCount:45;nativeFrames:JointPose[][]};color:{frameCount:45;tracks:Record<string,{colors:number[];alpha:number[]}>};texture:{frameCount:45;tracks:Record<string,{dimensions:number[];matricesFx32:number[][]}>};audio:{sound:AudioAsset&{id:1610;key:'SEQ_SE_DP_FW015'};cries:Record<string,AudioAsset>;cryPattern:0;crySequence:{nativeInitialVolume:100;volume:120}}};
export type CutFieldPerformer={x:number;y:number;z:number;facing:number};
export type CutField={map:number;mapRunning:boolean;player:CutFieldPerformer;follower?:CutFieldPerformer|null};
export type CutEffectContext={map:number;object:number;signal:AbortSignal};
export type CutOwnedSound={admission?:'playing'|'muted'|'failed-admission';ended:Promise<void>;stop:(reason?:unknown)=>void};
export type CutSoundPort={startSE:(signal:AbortSignal)=>CutOwnedSound};
const ROOT='/source/cut/',error=(value?:unknown)=>value??Error('Original Cut presentation cancelled');
function check(signal:AbortSignal){if(signal.aborted)throw error(signal.reason);}
function observe<T>(work:()=>Promise<T>,signal:AbortSignal):Promise<T>{return new Promise((resolve,reject)=>{let settled=false;const finish=(success:boolean,value?:T,reason?:unknown)=>{if(settled)return;settled=true;signal.removeEventListener('abort',abort);if(success)resolve(value!);else reject(reason);},abort=()=>finish(false,undefined,error(signal.reason));if(signal.aborted){abort();return;}signal.addEventListener('abort',abort,{once:true});try{void work().then(value=>finish(true,value),reason=>finish(false,undefined,reason));}catch(reason){finish(false,undefined,reason);}});}
async function io<T>(work:(signal:AbortSignal)=>Promise<T>,signal:AbortSignal,milliseconds=4000):Promise<T>{
 const controller=new AbortController(),abort=()=>controller.abort(error(signal.reason));if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>controller.abort(Error('Original Cut resource preparation timed out')),milliseconds);
 try{return await observe(()=>work(controller.signal),controller.signal);}finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
}
async function checksum(bytes:ArrayBuffer,expected:string,signal:AbortSignal){if(!/^[a-f0-9]{64}$/.test(expected))throw Error('Invalid original Cut checksum');const hash=await observe(()=>crypto.subtle.digest('SHA-256',bytes),signal);if(Array.from(new Uint8Array(hash),value=>value.toString(16).padStart(2,'0')).join('')!==expected)throw Error('Original Cut resource checksum mismatch');}

/** Dispose only an owned template or a fully independent instance. */
export function disposeCutObject(root:THREE.Object3D){
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>(),skeletons=new Set<THREE.Skeleton>();
 root.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material]){materials.add(material);const map=(material as THREE.MeshBasicMaterial).map;if(map)textures.add(map);}}if(object instanceof THREE.SkinnedMesh)skeletons.add(object.skeleton);});
 for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();for(const texture of textures)texture.dispose();for(const skeleton of skeletons)skeleton.dispose();root.removeFromParent();root.clear();
}

/** Static original assets belong to this owner, never to a temporary effect. */
export class NativeCutResources{
 disposed=false;
 constructor(readonly manifest:NativeCutManifest,readonly template:THREE.Group){
  const m=manifest;if(m.version!==1||m.ticksPerSecond!==30||m.modelFinishedAfterUpdates!==45||m.completionAfterQueueUpdates!==47||m.nativeNodeNames.length!==12||m.joint.frameCount!==45||m.joint.nativeFrames.length!==45||m.joint.nativeFrames.some(row=>row.length!==12)||m.color.frameCount!==45||m.texture.frameCount!==45)throw Error('Invalid original Cut animation resources');
  for(const row of m.joint.nativeFrames)for(const pose of row)for(const values of[pose.translationFx32,pose.scaleFx32,pose.inverseScaleFx32])if(values.length!==3||!values.every(Number.isInteger))throw Error('Invalid original Cut joint frame');
  for(const track of Object.values(m.color.tracks))if(track.colors.length!==4||track.alpha.length!==45||!track.alpha.every(value=>Number.isInteger(value)&&value>=0&&value<=31))throw Error('Invalid original Cut color frame');
  for(const track of Object.values(m.texture.tracks))if(track.dimensions.length!==2||!track.dimensions.every(value=>value===8)||track.matricesFx32.length!==45||track.matricesFx32.some(row=>row.length!==6||!row.every(Number.isInteger)))throw Error('Invalid original Cut texture frame');
 }
 instance(){
  if(this.disposed)throw Error('Original Cut resources are disposed');const instance=clone(this.template)as THREE.Group,geometries=new Map<THREE.BufferGeometry,THREE.BufferGeometry>(),materials=new Map<THREE.Material,THREE.Material>(),textures=new Map<THREE.Texture,THREE.Texture>();
  const material=(source:THREE.Material)=>{let value=materials.get(source);if(!value){value=source.clone();const copy=value as THREE.MeshBasicMaterial;copy.transparent=true;copy.depthWrite=false;copy.alphaTest=1/255;if(copy.map){let texture=textures.get(copy.map);if(!texture){texture=copy.map.clone();texture.matrixAutoUpdate=false;textures.set(copy.map,texture);}copy.map=texture;}materials.set(source,value);}return value;};
  instance.traverse(object=>{if(object instanceof THREE.Mesh){const source=object.geometry as THREE.BufferGeometry,geometry=geometries.get(source)??source.clone();geometries.set(source,geometry);object.geometry=geometry;object.material=Array.isArray(object.material)?object.material.map(material):material(object.material);object.frustumCulled=false;}});return instance;
 }
 dispose(){if(this.disposed)return;this.disposed=true;disposeCutObject(this.template);}
}

/** Bounded preparation must finish before dispatching the original script.
 * Starting a not-yet-loaded effect would detach Wait7 from the visible slash.
 */
export async function loadNativeCutResources(signal:AbortSignal):Promise<NativeCutResources>{
 return io(async input=>{
  const response=await observe(()=>fetch(ROOT+'resources.json',{signal:input}),input);if(!response.ok)throw Error('Original Cut manifest could not load');const manifest=await observe(()=>response.json()as Promise<NativeCutManifest>,input);
  if(manifest.asset!=='model.glb')throw Error('Invalid original Cut model path');const model=await observe(()=>fetch(ROOT+manifest.asset,{signal:input}),input);if(!model.ok)throw Error('Original Cut model could not load');const bytes=await observe(()=>model.arrayBuffer(),input);await checksum(bytes,manifest.glbSHA256,input);
  const parsing=new GLTFLoader().parseAsync(bytes,'');let result;
  try{result=await observe(()=>parsing,input);check(input);return new NativeCutResources(manifest,result.scene);}catch(reason){if(result)disposeCutObject(result.scene);else void parsing.then(value=>disposeCutObject(value.scene),()=>{});throw reason;}
 },signal);
}

/** Native BASIC-joint scaling and Maya texture matrices in original texels.
 * The converter emits white vertex colors for these NORMAL-lit leaf polygons.
 * Apply literal BMA diffuse once as an unlit palette mapping; this deliberately
 * does not recreate DS global-light ambient/specular shading. Geometry/UV/skin
 * remain original, including the converter's native positionScale8 binding.
 */
export function applyNativeCutFrame(instance:THREE.Group,manifest:NativeCutManifest,frame:number){
 if(!Number.isInteger(frame)||frame<0||frame>=45)throw RangeError('Invalid original Cut frame');let bones=0;const painted=new Set<THREE.Material>();
 instance.traverse(object=>{
  const index=object.userData.nativeCutJoint;if(index!==undefined){if(!Number.isInteger(index)||index<0||index>=12)throw Error('Invalid original Cut joint identity');const pose=manifest.joint.nativeFrames[frame][index];object.matrixAutoUpdate=false;object.matrix.makeScale(...pose.scaleFx32.map(value=>value/4096)as[number,number,number]);object.matrix.setPosition(...pose.translationFx32.map(value=>value/4096)as[number,number,number]);object.matrixWorldNeedsUpdate=true;bones++;}
  if(object instanceof THREE.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material]){if(painted.has(material))continue;painted.add(material);const color=manifest.color.tracks[material.name];if(!color)throw Error('Original Cut material was not preserved');material.opacity=color.alpha[frame]/31;const diffuse=color.colors[0];(material as THREE.MeshBasicMaterial).color.setRGB((diffuse&31)/31,(diffuse>>5&31)/31,(diffuse>>10&31)/31,THREE.SRGBColorSpace);
   const texture=manifest.texture.tracks[material.name],map=(material as THREE.MeshBasicMaterial).map;if(texture){if(!map)throw Error('Original Cut texture is missing');const[a,b,c,d,x,y]=texture.matricesFx32[frame],[w,h]=texture.dimensions;map.matrixAutoUpdate=false;map.matrix.set(a/4096,c*h/w/4096,x/w/65536,b*w/h/4096,d/4096,y/h/65536,0,0,1);}
  }
 });
 if(bones!==12)throw Error('Original Cut model skeleton was not preserved');instance.updateMatrixWorld(true);instance.traverse(object=>{if(object instanceof THREE.SkinnedMesh)object.skeleton.update();});
}

/** A field-only model effect. It changes no tree/actor/State/camera data.
 * The host ticks this alongside normal camera rendering, not as a camera-owning
 * hatch scene. Source VM alone owns Wait7, HidePerson and the completion var.
 */
export class NativeCutFieldEffect{
 readonly group=new THREE.Group();active=false;
 private run:{context:CutEffectContext;instance:THREE.Group;controller:AbortController;sound:CutOwnedSound;frame:number;wrapperState:0|1;elapsed:number;resolve:()=>void;reject:(reason:unknown)=>void;detach:()=>void;finishing:boolean}|null=null;
 constructor(readonly resources:NativeCutResources,private readonly ports:{scene:THREE.Scene;field:()=>CutField;audio:CutSoundPort}){this.group.name='native-cut-field-effect';}
 start(kind:0|3,context:CutEffectContext):Promise<void>{
  return new Promise((resolve,reject)=>{
   let instance:THREE.Group|undefined,sound:CutOwnedSound|undefined,controller:AbortController|undefined;
   try{
    check(context.signal);if(this.active)throw Error('Original Cut effect already active');if(kind!==0&&kind!==3)throw Error('Unsupported original field move effect');const field=this.ports.field();if(field.map!==context.map)throw Error('Original Cut field changed');if(typeof field.mapRunning!=='boolean')throw Error('Original Cut requires actual field-map running state');const actor=kind===0?field.player:field.follower;if(!actor)throw Error('Original Cut follower is not present');if(![actor.x,actor.y,actor.z].every(Number.isFinite)||!Number.isInteger(actor.facing)||actor.facing<0||actor.facing>3)throw Error('Invalid original Cut performer');
    instance=this.resources.instance();const deltas=[[0,-1],[0,1],[-1,0],[1,0]],delta=deltas[actor.facing];this.group.position.set(Math.floor(actor.x)+.5+delta[0],actor.y,Math.floor(actor.z)+.5+delta[1]);this.group.scale.setScalar(1/16);this.group.visible=field.mapRunning;this.group.add(instance);applyNativeCutFrame(instance,this.resources.manifest,0);
    controller=new AbortController();sound=this.ports.audio.startSE(controller.signal);if(!sound||typeof sound.stop!=='function'||!sound.ended||typeof sound.ended.then!=='function')throw Error('Original Cut audio must return an owned voice');
    const abort=()=>this.cancel(error(context.signal.reason)),run={context,instance,controller,sound,frame:0,wrapperState:0 as 0|1,elapsed:0,resolve,reject,detach:()=>context.signal.removeEventListener('abort',abort),finishing:false};this.run=run;this.active=true;this.ports.scene.add(this.group);context.signal.addEventListener('abort',abort,{once:true});if(context.signal.aborted){abort();return;}
    // Native Cut ignores PlaySE admission/completion; the audio port owns status
    // reporting and any voice that continues after the visual task is deleted.
    void sound.ended.catch(reason=>{if(reason instanceof UnsupportedNativeCutAudio&&this.run===run)this.cancel(reason);});
   }catch(reason){let failure=reason??Error('Original Cut start failed without an error value');try{controller?.abort(failure);if(typeof sound?.stop==='function')sound.stop(failure);}catch(cleanup){failure=new AggregateError([reason,cleanup],'Original Cut start/voice cleanup failed');}finally{if(instance&&this.run?.instance===instance)this.settle(this.run,failure);else if(instance){disposeCutObject(instance);if(!this.run){this.group.removeFromParent();this.group.clear();}}}reject(failure);}
  });
 }
 update(dt:number){
  const run=this.run;if(!run)return;
  try{if(!Number.isFinite(dt)||dt<0)throw Error('Invalid original Cut frame time');if(run.finishing){this.stepNativeQueue();return;}run.elapsed+=dt;while(run.elapsed+1e-12>=1/30&&this.run===run&&!run.finishing){run.elapsed-=1/30;this.stepNativeQueue();}
  }catch(reason){this.cancel(reason);}
 }
 /** Literal mainqueue order: wrapper priority0 polls before model priority1024.
  * The host may run the first pass in the dispatch tick, matching runNowFALSE.
  * Choose this source-clock API OR update(dt); do not advance both clocks.
  */
 stepNativeQueue(){
  const run=this.run;if(!run)return;
  try{check(run.controller.signal);const field=this.ports.field();if(field.map!==run.context.map)throw Error('Original Cut field changed');if(typeof field.mapRunning!=='boolean')throw Error('Original Cut requires actual field-map running state');this.group.visible=field.mapRunning&&run.frame<45;if(run.finishing)return;
   if(run.wrapperState===1){run.finishing=true;this.settle(run);return;}
   if(run.frame===45)run.wrapperState=1;
   else if(field.mapRunning){run.frame++;if(run.frame===45)this.group.visible=false;else applyNativeCutFrame(run.instance,this.resources.manifest,run.frame);}
  }catch(reason){this.cancel(reason);}
 }
 cancel(reason?:unknown){const run=this.run;if(!run)return;let why=error(reason);try{run.controller.abort(why);run.sound.stop(why);}catch(cleanup){why=new AggregateError([why,cleanup],'Original Cut voice cleanup failed');}finally{this.settle(run,why);}}
 private settle(run:NonNullable<NativeCutFieldEffect['run']>,reason?:unknown){if(this.run!==run)return;run.detach();disposeCutObject(run.instance);this.group.removeFromParent();this.group.clear();this.active=false;this.run=null;if(reason!==undefined)run.reject(reason);else run.resolve();}
}

export type CutAudioOutput={context:AudioContext;destination:AudioNode};
export class UnsupportedNativeCutAudio extends Error{constructor(message:string){super(message);this.name='UnsupportedNativeCutAudio';}}
export type CutAudioStatus={operation:'se'|'cry';asset:string;status:'prepared'|'started'|'ended'|'muted'|'failed-admission'|'failed-playback';error?:unknown};
export type CutAudioPorts={output:()=>CutAudioOutput;enabled:()=>boolean;onStatus:(status:CutAudioStatus)=>void;fetchBytes?:(url:string,signal:AbortSignal)=>Promise<ArrayBuffer>;ioTimeoutMs?:number};
/** Uses the host's unlocked Context/master gain; never creates/resumes a Context.
 * Native PlaySE return is ignored by Cut, and WaitCry polls actual playing count.
 * Technical audio failures are reported, with no pretend voice, and permit the
 * real visual/script to continue. Missing required mechanisms remain unsupported.
 */
export function createNativeCutAudio(resources:NativeCutResources,ports:CutAudioPorts){
 if(resources.manifest.audio.cryPattern!==0||resources.manifest.audio.crySequence.volume!==120||resources.manifest.audio.crySequence.nativeInitialVolume!==100)throw new UnsupportedNativeCutAudio('Invalid original Cut cry gain/pattern metadata');
 if(!ports||typeof ports.output!=='function'||typeof ports.enabled!=='function'||typeof ports.onStatus!=='function'||ports.fetchBytes!==undefined&&typeof ports.fetchBytes!=='function')throw new UnsupportedNativeCutAudio('Original Cut requires output, enabled and audio status ports');
 if(ports.ioTimeoutMs!==undefined&&(!Number.isInteger(ports.ioTimeoutMs)||ports.ioTimeoutMs<1||ports.ioTimeoutMs>120000))throw new UnsupportedNativeCutAudio('Invalid original Cut resource deadline');
 const owner=new AbortController(),buffers=new Map<string,AudioBuffer>(),voices=new Set<CutOwnedSound>();let disposed=false,sePrepared=false,statusFault:UnsupportedNativeCutAudio|undefined,rejectFailure!:(reason:unknown)=>void;
 const failure=new Promise<never>((_,reject)=>{rejectFailure=reject;});void failure.catch(()=>{});
 const audioError=(reason:unknown)=>reason??Error('Original Cut audio failed without an error value');
 const guard=()=>{if(statusFault)throw statusFault;if(disposed||resources.disposed)throw Error('Original Cut audio is disposed');};
 const report=(operation:'se'|'cry',asset:AudioAsset,status:CutAudioStatus['status'],reason?:unknown)=>{const event:CutAudioStatus={operation,asset:asset.file,status};if(reason!==undefined)event.error=reason;try{ports.onStatus(event);}catch(cause){statusFault??=new UnsupportedNativeCutAudio('Original Cut audio status port failed: '+String(cause));rejectFailure(statusFault);throw statusFault;}return event;};
 const fatal=(reason:unknown,signal:AbortSignal)=>{check(signal);check(owner.signal);guard();if(reason instanceof UnsupportedNativeCutAudio)throw reason;};
 const output=()=>{guard();const value=ports.output();if(!value?.context||!value.destination||value.destination.context!==value.context||typeof value.context.createBufferSource!=='function'||typeof value.context.createGain!=='function'||typeof value.context.decodeAudioData!=='function')throw new UnsupportedNativeCutAudio('Original Cut sound requires a valid shared game AudioContext/output');if(value.context.state!=='running')throw Error('Original Cut game AudioContext is not running');return value;};
 const fetchBytes=ports.fetchBytes??(async(url:string,signal:AbortSignal)=>{const response=await fetch(url,{signal});if(!response.ok)throw Error('Original Cut audio could not load');return response.arrayBuffer();});
 const prepare=(asset:AudioAsset,input:AbortSignal)=>io(async signal=>{
  guard();check(owner.signal);const cached=buffers.get(asset.file);if(cached)return cached;const {context}=output();
  if(!/^(cries\/cry-\d+|1610-SEQ_SE_DP_FW015)\.wav$/.test(asset.file)||!Number.isInteger(asset.frames)||asset.frames<=0||!Number.isInteger(asset.sampleRate)||asset.sampleRate<=0||![1,2].includes(asset.channels)||!/^[a-f0-9]{64}$/.test(asset.wavSHA256))throw new UnsupportedNativeCutAudio('Invalid original Cut audio metadata');
  const bytes=await observe(()=>fetchBytes(ROOT+asset.file,signal),signal);await checksum(bytes,asset.wavSHA256,signal);const decoded=await observe(()=>new Promise<AudioBuffer>((resolve,reject)=>{const result=context.decodeAudioData(bytes,resolve,reject);if(result?.then)void result.then(resolve,reject);}),signal);check(signal);guard();if(decoded.numberOfChannels!==asset.channels||Math.abs(decoded.duration-asset.frames/asset.sampleRate)>1/asset.sampleRate+1/context.sampleRate)throw Error('Original Cut audio timing changed');buffers.set(asset.file,decoded);while(buffers.size>5){const removable=[...buffers.keys()].find(key=>key!==resources.manifest.audio.sound.file);if(!removable)break;buffers.delete(removable);}return decoded;
 },input,ports.ioTimeoutMs??4000);
 const linked=async<T>(work:(signal:AbortSignal)=>Promise<T>,signal:AbortSignal)=>{check(signal);check(owner.signal);const controller=new AbortController(),abort=()=>controller.abort(error(signal.reason)),destroy=()=>controller.abort(error(owner.signal.reason));signal.addEventListener('abort',abort,{once:true});owner.signal.addEventListener('abort',destroy,{once:true});try{return await observe(()=>work(controller.signal),controller.signal);}finally{signal.removeEventListener('abort',abort);owner.signal.removeEventListener('abort',destroy);}};
 const play=(buffer:AudioBuffer,signal:AbortSignal,gainValue=1):CutOwnedSound=>{
  check(signal);const {context,destination}=output(),node=context.createBufferSource(),gain=context.createGain();let settled=false,resolve!:()=>void,reject!:(reason:unknown)=>void,timer:ReturnType<typeof setTimeout>|undefined;
  const ended=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});void ended.catch(()=>{});const stop=(reason?:unknown)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);owner.signal.removeEventListener('abort',destroy);node.onended=null;try{node.stop();}catch{}try{node.disconnect();}finally{gain.disconnect();}voices.delete(voice);if(reason!==undefined)reject(reason);else resolve();},abort=()=>stop(error(signal.reason)),destroy=()=>stop(error(owner.signal.reason));
  const voice:CutOwnedSound={admission:'playing',ended,stop};voices.add(voice);signal.addEventListener('abort',abort,{once:true});owner.signal.addEventListener('abort',destroy,{once:true});node.onended=()=>stop();timer=setTimeout(()=>stop(Error('Original Cut audio did not finish')),buffer.duration*1000+2000);try{check(signal);check(owner.signal);gain.gain.value=gainValue;node.buffer=buffer;node.connect(gain);gain.connect(destination);node.start();}catch(reason){stop(audioError(reason));throw reason;}return voice;
 };
 const silent=(admission:'muted'|'failed-admission'):CutOwnedSound=>({admission,ended:Promise.resolve(),stop(){}});
 return{
  /** Observe once per owner; preserves configuration failure even after the
   * visual task has completed and no active action can receive its rejection. */
  failure,
  async prepareSE(signal:AbortSignal){guard();check(signal);sePrepared=true;const asset=resources.manifest.audio.sound;if(!ports.enabled())return report('se',asset,'muted');try{await linked(input=>prepare(asset,input),signal);return report('se',asset,'prepared');}catch(reason){fatal(reason,signal);return report('se',asset,'failed-admission',audioError(reason));}},
  startSE(signal:AbortSignal){
   guard();check(signal);const asset=resources.manifest.audio.sound;if(!ports.enabled()){report('se',asset,'muted');return silent('muted');}if(!sePrepared)throw new UnsupportedNativeCutAudio('Original Cut sound must be prepared before script dispatch');
   let voice:CutOwnedSound;try{const buffer=buffers.get(asset.file);if(!buffer)throw Error('Original Cut audio preparation admitted no voice');voice=play(buffer,signal);}catch(reason){fatal(reason,signal);report('se',asset,'failed-admission',audioError(reason));return silent('failed-admission');}
   try{report('se',asset,'started');}catch(reason){voice.stop(reason);throw reason;}
   // Status delivery failures stay explicit rejections; technical failures are
   // observed/reported and resolve because no native voice is playing anymore.
   const ended=voice.ended.then(()=>{report('se',asset,'ended');},reason=>{fatal(reason,signal);report('se',asset,'failed-playback',audioError(reason));});void ended.catch(()=>{});return{admission:'playing' as const,ended,stop:voice.stop};
  },
  async cry(species:number,pattern:number,signal:AbortSignal){
   guard();check(signal);if(pattern!==0)throw new UnsupportedNativeCutAudio('Unsupported original Cut cry pattern');if(!Number.isInteger(species)||species<1||species>494)throw new UnsupportedNativeCutAudio('Original Cut cry species not exported');const asset=resources.manifest.audio.cries[String(species)];if(!asset)throw new UnsupportedNativeCutAudio('Original Cut cry is missing');if(!ports.enabled())return report('cry',asset,'muted');let started=false;
   try{return await linked(async input=>{const buffer=await prepare(asset,input);check(input);const voice=play(buffer,input,resources.manifest.audio.crySequence.volume/127*resources.manifest.audio.crySequence.nativeInitialVolume/127);started=true;try{report('cry',asset,'started');}catch(reason){voice.stop(reason);throw reason;}await voice.ended;return report('cry',asset,'ended');},signal);}catch(reason){fatal(reason,signal);return report('cry',asset,started?'failed-playback':'failed-admission',audioError(reason));}
  },
  dispose(){if(disposed)return;disposed=true;owner.abort(Error('Original Cut audio disposed'));for(const voice of[...voices])voice.stop(Error('Original Cut audio disposed'));buffers.clear();},
 };
}
