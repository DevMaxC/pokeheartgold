import {AZALEA_AUDIO_MANIFEST_SHA256} from './azalea-audio-data.ts';
import type {AzaleaGymAudio,AzaleaSEOutcome} from './gym-azalea-host.ts';

export type NativeSEMetadata={id:number;key:string;player:3;playerPriority:number;channelPriority:number;bank:number;volume:number};
export type NativeAzaleaAudioAsset=NativeSEMetadata&{file:string;frames:number;sampleRate:number;channels:number;wavSHA256:string;loopFrames:[number,number]|null};
export type NativeAzaleaAudioResources={version:1;player:{id:3;maxSequences:1};playerSequences:Record<string,NativeSEMetadata>;sounds:Record<'1561'|'2171',NativeAzaleaAudioAsset>};
export type SharedAzaleaAudioOutput={context:AudioContext;output:AudioNode;signal:AbortSignal};
export type NativeSEVoice={ended:Promise<void>;stop:()=>void};
export class UnsupportedNativeAzaleaAudio extends Error{}
const ROOT='/source/azalea-audio/';
const reason=(signal:AbortSignal)=>signal.reason??new DOMException('Original Azalea sound cancelled','AbortError');
function check(signal:AbortSignal){if(signal.aborted)throw reason(signal);}
function observe<T>(work:()=>Promise<T>,signal:AbortSignal):Promise<T>{return new Promise((resolve,reject)=>{let settled=false;const finish=(yes:boolean,value:unknown)=>{if(settled)return;settled=true;signal.removeEventListener('abort',abort);if(yes)resolve(value as T);else reject(value);},abort=()=>finish(false,reason(signal));if(signal.aborted){abort();return;}signal.addEventListener('abort',abort,{once:true});try{void work().then(value=>finish(true,value),error=>finish(false,error));}catch(error){finish(false,error);}});}
function detail(error:unknown){return error instanceof Error?error.message:String(error);}
async function checksum(bytes:ArrayBuffer,expected:string,signal:AbortSignal){const hash=await observe(()=>crypto.subtle.digest('SHA-256',bytes),signal);check(signal);if(Array.from(new Uint8Array(hash),value=>value.toString(16).padStart(2,'0')).join('')!==expected)throw new UnsupportedNativeAzaleaAudio('Original Azalea sound checksum mismatch');}
export function validateNativeAzaleaAudio(resources:NativeAzaleaAudioResources){
 if(resources?.version!==1||resources.player?.id!==3||resources.player.maxSequences!==1||!resources.playerSequences)throw new UnsupportedNativeAzaleaAudio('Missing original PLAYER3 metadata');
 for(const [key,meta]of Object.entries(resources.playerSequences))if(String(meta.id)!==key||meta.player!==3||!Number.isInteger(meta.playerPriority)||meta.playerPriority<0||meta.playerPriority>127||!Number.isInteger(meta.channelPriority)||meta.channelPriority<0||meta.channelPriority>127)throw new UnsupportedNativeAzaleaAudio('Invalid original SE PLAYER metadata');
 for(const id of[1561,2171]as const){const asset=resources.sounds?.[id],meta=resources.playerSequences[id];if(!asset||!meta||asset.id!==id||asset.key!==(id===1561?'SEQ_SE_DP_KI_GASYAN':'SEQ_SE_GS_ITOMARU_ROBO')||asset.bank!==750||asset.player!==3||asset.playerPriority!==64||asset.channelPriority!==89||asset.key!==meta.key||asset.playerPriority!==meta.playerPriority||!/^\d+-[A-Z_]+\.wav$/.test(asset.file)||!Number.isInteger(asset.frames)||asset.frames<=0||asset.sampleRate!==32768||asset.channels!==2||!/^[a-f0-9]{64}$/.test(asset.wavSHA256))throw new UnsupportedNativeAzaleaAudio('Missing original Azalea SE source');const loop=asset.loopFrames;if(id===1561?loop!==null:!loop||loop.length!==2||!loop.every(Number.isInteger)||loop[0]<=0||loop[0]>=loop[1]||loop[1]>asset.frames)throw new UnsupportedNativeAzaleaAudio('Invalid original Azalea loop');}
}
export type NativeAudioFetch=(url:string,signal:AbortSignal)=>Promise<ArrayBuffer>;
const fetchBytes:NativeAudioFetch=async(url,signal)=>{const result=await fetch(url,{signal});if(!result.ok)throw new UnsupportedNativeAzaleaAudio('Missing original Azalea sound resource '+result.status);return result.arrayBuffer();};
export async function loadNativeAzaleaAudio(signal:AbortSignal,read:NativeAudioFetch=fetchBytes):Promise<NativeAzaleaAudioResources>{check(signal);const bytes=await observe(()=>read(ROOT+'resources.json',signal),signal);await checksum(bytes,AZALEA_AUDIO_MANIFEST_SHA256,signal);const resources=JSON.parse(new TextDecoder().decode(bytes))as NativeAzaleaAudioResources;validateNativeAzaleaAudio(resources);return resources;}

type Playing={id:number;owner:object;priority:number;voice:NativeSEVoice;finished:boolean;fade:0|1};
/** ONE shared source PLAYER3, including callers outside Azalea. All PLAYER3
 * voices (e.g. Cut1610) MUST enter play(), not be observed after starting.
 * Equal native player priority replaces; lower priority rejects. Channel
 * priority89 belongs to the source sampler and is not player priority64.
 * soundUpdate() is an injected DoSoundUpdateFrame boundary, NOT a new clock.
 * Fade1 retains a counted voice at priority0 until that next update, then
 * stops it, exactly as NNSi_SndFaderUpdate/IsFinished. No invented gain ramp.
 * This bounded registry does not emulate the DS global16-channel pool. */
export class NativeSEPlayer3{
 private playing:Playing|null=null;private closed=false;private admitting=false;private waiters=new Set<()=>void>();private failures:string[]=[];
 constructor(readonly resources:NativeAzaleaAudioResources,readonly signal:AbortSignal){validateNativeAzaleaAudio(resources);check(signal);signal.addEventListener('abort',this.destroy,{once:true});}
 private destroy=()=>this.dispose();
 private guard(){check(this.signal);if(this.closed)throw new UnsupportedNativeAzaleaAudio('Native PLAYER3 disposed');}
 private meta(id:number){const meta=this.resources.playerSequences[id];if(!meta)throw new UnsupportedNativeAzaleaAudio('Sequence has no exported native PLAYER3 metadata: '+id);return meta;}
 get diagnostics(){return[...this.failures];}
 private report(error:unknown){this.failures.push(detail(error));if(this.failures.length>32)this.failures.shift();}
 private clear(){const old=this.playing;this.playing=null;if(old)try{old.voice.stop();}catch(error){this.report(error);}}
 private notify(){if(!this.playing)for(const wake of[...this.waiters])wake();}
 isPlaying(id:number){this.guard();this.meta(id);return this.playing!==null;}
 play(id:number,owner:object,start:()=>NativeSEVoice):AzaleaSEOutcome{
  this.guard();if(this.admitting)throw new UnsupportedNativeAzaleaAudio('Reentrant native PLAYER3 admission');
  const meta=this.meta(id);if(!owner||typeof owner!=='object')throw new UnsupportedNativeAzaleaAudio('Native SE requires an owner');
  if(this.playing&&meta.playerPriority<this.playing.priority)return{kind:'no-voice',detail:'Native PLAYER3 rejected lower player priority'};
  this.admitting=true;
  try{
   // Native allocation/preemption precedes the bank/sequence load attempt.
   this.clear();this.guard();let voice:NativeSEVoice;
   try{voice=start();if(!voice||typeof voice.stop!=='function'||typeof voice.ended?.then!=='function')throw Error('Native SE transport admitted no owned voice');}
   catch(error){this.report(error);this.notify();return{kind:'no-voice',detail:detail(error)};}
   if(this.closed||this.signal.aborted){void Promise.resolve(voice.ended).catch(error=>this.report(error));try{voice.stop();}finally{this.guard();}}
   const entry:Playing={id,owner,priority:meta.playerPriority,voice,finished:false,fade:0};this.playing=entry;
   void voice.ended.then(()=>{entry.finished=true;},error=>{entry.finished=true;this.report(error);});return{kind:'voice'};
  }finally{this.admitting=false;}
 }
 stopOwned(id:number,owner:object,fade:0|1){this.guard();this.meta(id);if(fade!==0&&fade!==1)throw new UnsupportedNativeAzaleaAudio('Unsupported native stop fade');const entry=this.playing;if(!entry||entry.id!==id||entry.owner!==owner)return false;if(fade===1){entry.priority=0;entry.fade=1;}else{this.clear();this.notify();}return true;}
 cancelOwner(owner:object){if(this.closed)return;if(this.playing?.owner===owner){this.clear();this.notify();}}
 soundUpdate(){this.guard();if(this.playing&&(this.playing.finished||this.playing.fade===1))this.clear();this.notify();}
 waitIdle(signal:AbortSignal){this.guard();check(signal);return new Promise<void>((resolve,reject)=>{let settled=false;const finish=(error?:unknown)=>{if(settled)return;settled=true;this.waiters.delete(wake);signal.removeEventListener('abort',abort);this.signal.removeEventListener('abort',destroy);if(error!==undefined)reject(error);else resolve();},wake=()=>{if(this.closed)finish(new UnsupportedNativeAzaleaAudio('Native PLAYER3 disposed'));else if(!this.playing)finish();},abort=()=>finish(reason(signal)),destroy=()=>finish(reason(this.signal));this.waiters.add(wake);signal.addEventListener('abort',abort,{once:true});this.signal.addEventListener('abort',destroy,{once:true});wake();});}
 dispose(){if(this.closed)return;this.closed=true;this.signal.removeEventListener('abort',this.destroy);this.clear();for(const wake of[...this.waiters])wake();}
}

export type AzaleaAudioStatus={id:1561|2171;stage:'prepared'|'no-voice'|'started'|'ended';detail?:string};
export type AzaleaAudioPorts={player:NativeSEPlayer3;output:()=>SharedAzaleaAudioOutput;report:(status:AzaleaAudioStatus)=>void;fetchBytes?:NativeAudioFetch;ioTimeoutMs?:number};
/** Borrow the gesture-unlocked music output; never creates/resumes a Context,
 * writes its gain, connects to context.destination, or disposes shared nodes. */
export function createNativeAzaleaAudio(resources:NativeAzaleaAudioResources,ports:AzaleaAudioPorts):AzaleaGymAudio&{dispose:()=>void;isPlayerIdle:(id:1561)=>boolean;failure:Promise<never>}{
 validateNativeAzaleaAudio(resources);if(!(ports?.player instanceof NativeSEPlayer3)||ports.player.resources!==resources||typeof ports.output!=='function'||typeof ports.report!=='function')throw new UnsupportedNativeAzaleaAudio('Azalea requires shared native PLAYER3/output/status ports');
 const lifetime=new AbortController(),buffers=new Map<number,AudioBuffer>(),prepared=new Map<number,string|null>(),owners=new Map<object,{id:1561|2171;token:object;stopping:boolean}>(),transportFailures=new WeakMap<object,string>();let disposed=false,borrowed:SharedAzaleaAudioOutput|undefined,detach=()=>{};
 let failureError:UnsupportedNativeAzaleaAudio|undefined,rejectFailure!:(error:unknown)=>void;const failure=new Promise<never>((_yes,no)=>{rejectFailure=no;});void failure.catch(()=>{});
 const guard=()=>{if(failureError)throw failureError;check(lifetime.signal);if(disposed)throw new UnsupportedNativeAzaleaAudio('Azalea audio disposed');};
 const output=()=>{guard();const value={...ports.output()};if(!value?.context||!value.output||!value.signal)throw new UnsupportedNativeAzaleaAudio('Missing unlocked shared audio output');check(value.signal);if(borrowed&&(borrowed.context!==value.context||borrowed.output!==value.output||borrowed.signal!==value.signal))throw new UnsupportedNativeAzaleaAudio('Shared audio output changed owner');if(!borrowed){if(typeof value.context.addEventListener!=='function')throw new UnsupportedNativeAzaleaAudio('Missing shared AudioContext lifecycle port');borrowed=value;const end=()=>dispose(),state=()=>{if(value.context.state==='running')return;for(const[owner,entry]of[...owners]){const id=entry.id,message='Shared native audio Context became '+value.context.state;if(!entry.stopping)transportFailures.set(owner,message);ports.player.cancelOwner(owner);owners.delete(owner);if(!entry.stopping)status(id,'no-voice',message,true);}};value.signal.addEventListener('abort',end,{once:true});value.context.addEventListener('statechange',state);detach=()=>{value.signal.removeEventListener('abort',end);value.context.removeEventListener('statechange',state);};}return value;};
 const status=(id:1561|2171,stage:AzaleaAudioStatus['stage'],message?:string,asynchronous=false)=>{try{ports.report({id,stage,...message===undefined?{}:{detail:message}});}catch(error){failureError??=new UnsupportedNativeAzaleaAudio('Azalea audio status port failed: '+detail(error));rejectFailure(failureError);if(!asynchronous)throw failureError;}};
 const read=ports.fetchBytes??fetchBytes;
 async function prepareOne(id:1561|2171,signal:AbortSignal){
  check(signal);guard();if(prepared.has(id)&&prepared.get(id)===null)return;const {context}=output(),asset=resources.sounds[id],controller=new AbortController(),combined=AbortSignal.any([signal,lifetime.signal,ports.player.signal,controller.signal]);let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   timer=setTimeout(()=>controller.abort(Error('Original Azalea sound preparation timed out')),ports.ioTimeoutMs??4000);
   const bytes=await observe(()=>read(ROOT+asset.file,combined),combined);await checksum(bytes,asset.wavSHA256,combined);
   const buffer=await observe(()=>context.decodeAudioData(bytes),combined);check(combined);guard();
   if(buffer.numberOfChannels!==2||Math.abs(buffer.duration-asset.frames/asset.sampleRate)>1/asset.sampleRate+1/context.sampleRate)throw new UnsupportedNativeAzaleaAudio('Original Azalea decoded sound timing changed');
   buffers.set(id,buffer);prepared.set(id,null);status(id,'prepared');
  }catch(error){
   if(signal.aborted)throw reason(signal);if(lifetime.signal.aborted)throw reason(lifetime.signal);if(ports.player.signal.aborted)throw reason(ports.player.signal);if(error instanceof UnsupportedNativeAzaleaAudio)throw error;
   prepared.set(id,detail(error));status(id,'no-voice',detail(error));
  }finally{clearTimeout(timer);}
 }
 function start(id:1561|2171,owner:object,signal:AbortSignal):AzaleaSEOutcome{
  guard();check(signal);if(!prepared.has(id))throw new UnsupportedNativeAzaleaAudio('Original Azalea SE must be prepared before dispatch');
  const {context,output:destination,signal:shared}=output(),token={};owners.set(owner,{id,token,stopping:false});
  const outcome=ports.player.play(id,owner,()=>{
   const buffer=buffers.get(id);if(!buffer)throw Error(prepared.get(id)??'Original Azalea audio admitted no decoded voice');if(context.state!=='running')throw Error('Shared native audio Context is not running');
   const node=context.createBufferSource();let done=false,resolve!:()=>void;const ended=new Promise<void>(yes=>{resolve=yes;});
   const finish=()=>{if(done)return;done=true;node.onended=null;signal.removeEventListener('abort',abort);shared.removeEventListener('abort',abort);lifetime.signal.removeEventListener('abort',abort);try{node.stop();}catch{}try{node.disconnect();}finally{resolve();if(owners.get(owner)?.token===token)owners.delete(owner);}status(id,'ended',undefined,true);};
   const abort=()=>{ports.player.cancelOwner(owner);finish();};signal.addEventListener('abort',abort,{once:true});shared.addEventListener('abort',abort,{once:true});lifetime.signal.addEventListener('abort',abort,{once:true});
   try{check(signal);check(shared);guard();node.buffer=buffer;const loop=resources.sounds[id].loopFrames;if(loop){node.loop=true;node.loopStart=loop[0]/resources.sounds[id].sampleRate;node.loopEnd=loop[1]/resources.sounds[id].sampleRate;}node.onended=finish;node.connect(destination);node.start();}catch(error){finish();throw error;}
   return{ended,stop:finish};
  });
  try{if(outcome.kind==='voice')status(id,'started');else{owners.delete(owner);status(id,'no-voice',outcome.detail);}}catch(error){ports.player.cancelOwner(owner);owners.delete(owner);throw error;}return outcome;
 }
 function dispose(){if(disposed)return;disposed=true;lifetime.abort(Error('Original Azalea audio disposed'));for(const owner of[...owners.keys()])ports.player.cancelOwner(owner);owners.clear();buffers.clear();prepared.clear();detach();}
 return{
  async prepare(ids,signal){if(ids.length!==2||ids[0]!==1561||ids[1]!==2171)throw new UnsupportedNativeAzaleaAudio('Unexpected native Azalea cue set');await prepareOne(1561,signal);await prepareOne(2171,signal);},
  async switch1561(signal){const owner={};const outcome=start(1561,owner,signal);try{await ports.player.waitIdle(AbortSignal.any([signal,lifetime.signal]));check(signal);guard();const failed=transportFailures.get(owner);return failed?{kind:'no-voice',detail:failed}:outcome;}finally{ports.player.cancelOwner(owner);owners.delete(owner);}},
  robot2171(owner){return start(2171,owner,lifetime.signal);},
  stop2171(owner,fade){guard();if(fade!==1)throw new UnsupportedNativeAzaleaAudio('Native robot stop requires fade1');const stopped=ports.player.stopOwned(2171,owner,1),entry=owners.get(owner);if(stopped&&entry)entry.stopping=true;},
  isPlayerIdle(id){guard();return!ports.player.isPlaying(id);},failure,dispose,
 };
}
