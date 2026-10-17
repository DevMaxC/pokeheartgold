import {REPEL_AUDIO_MANIFEST_SHA256} from './repel-audio-data.ts';
import {NativeSEPlayer3,type NativeSEVoice,type SharedAzaleaAudioOutput,type NativeAudioFetch} from './gym-azalea-audio.ts';

export type RepelSE=1500|1535;
export type RepelSEMetadata={id:number;key:string;player:3|4;playerPriority:number;channelPriority:number;bank:number;volume:number};
export type RepelSEAsset=RepelSEMetadata&{file:string;frames:number;sampleRate:32768;channels:2;loopFrames:null;wavSHA256:string};
export type NativeRepelAudioResources={version:1;players:Record<'3'|'4',{id:3|4;maxSequences:1}>;playerSequences:Record<string,RepelSEMetadata>;sounds:Record<RepelSE,RepelSEAsset>};
export type NativeSEOutcome={kind:'voice'}|{kind:'no-voice';detail:string};
export class UnsupportedNativeRepelAudio extends Error{}
const ROOT='/source/repel-audio/';
const abortReason=(signal:AbortSignal)=>signal.reason??new DOMException('Original Repel sound cancelled','AbortError');
const check=(signal:AbortSignal)=>{if(signal.aborted)throw abortReason(signal);};
const detail=(error:unknown)=>error instanceof Error?error.message:String(error);
function observe<T>(work:()=>Promise<T>,signal:AbortSignal):Promise<T>{return new Promise((resolve,reject)=>{let done=false;const finish=(ok:boolean,value:unknown)=>{if(done)return;done=true;signal.removeEventListener('abort',abort);if(ok)resolve(value as T);else reject(value);},abort=()=>finish(false,abortReason(signal));if(signal.aborted){abort();return;}signal.addEventListener('abort',abort,{once:true});try{void work().then(value=>finish(true,value),error=>finish(false,error));}catch(error){finish(false,error);}});}
async function checksum(bytes:ArrayBuffer,expected:string,signal:AbortSignal){const hash=await observe(()=>crypto.subtle.digest('SHA-256',bytes),signal);check(signal);if(Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('')!==expected)throw new UnsupportedNativeRepelAudio('Original Repel resource checksum mismatch');}
export function validateNativeRepelAudio(resources:NativeRepelAudioResources){
 if(resources?.version!==1||resources.players?.['3']?.id!==3||resources.players['3'].maxSequences!==1||resources.players?.['4']?.id!==4||resources.players['4'].maxSequences!==1||!resources.playerSequences)throw new UnsupportedNativeRepelAudio('Native Repel requires distinct source PLAYER3 and PLAYER4 metadata');
 for(const[key,meta]of Object.entries(resources.playerSequences))if(String(meta.id)!==key||![3,4].includes(meta.player)||!Number.isInteger(meta.playerPriority)||meta.playerPriority<0||meta.playerPriority>127||!Number.isInteger(meta.channelPriority)||meta.channelPriority<0||meta.channelPriority>127)throw new UnsupportedNativeRepelAudio('Invalid native SE metadata');
 for(const id of[1500,1535]as const){const a=resources.sounds?.[id],m=resources.playerSequences[id],player=id===1500?4:3,key=id===1500?'SEQ_SE_DP_SELECT':'SEQ_SE_DP_CARD2',volume=id===1500?54:110;if(!a||!m||a.id!==id||a.key!==key||a.player!==player||a.bank!==700||a.volume!==volume||a.channelPriority!==104||a.playerPriority!==64||a.sampleRate!==32768||a.channels!==2||a.loopFrames!==null||!Number.isInteger(a.frames)||a.frames<1||a.frames>327680||a.file!==`${id}-${key}.wav`||!/^[a-f0-9]{64}$/.test(a.wavSHA256)||(['id','key','player','bank','volume','channelPriority','playerPriority']as const).some(k=>a[k]!==m[k]))throw new UnsupportedNativeRepelAudio('Missing literal finite Repel source cue '+id);}
}
const fetchBytes:NativeAudioFetch=async(url,signal)=>{const response=await fetch(url,{signal});if(!response.ok)throw new UnsupportedNativeRepelAudio('Original Repel resource unavailable '+response.status);return response.arrayBuffer();};
export async function loadNativeRepelAudio(signal:AbortSignal,read:NativeAudioFetch=fetchBytes){check(signal);const bytes=await observe(()=>read(ROOT+'resources.json',signal),signal);await checksum(bytes,REPEL_AUDIO_MANIFEST_SHA256,signal);const resources=JSON.parse(new TextDecoder().decode(bytes))as NativeRepelAudioResources;validateNativeRepelAudio(resources);return resources;}

type Playing={id:number;owner:object;priority:number;voice:NativeSEVoice;finished:boolean;fade:0|1};
/** Source PLAYER4 is distinct from the existing shared PLAYER3. Root owns one
 * instance and calls soundUpdate at the SAME native after-task phase. No timer,
 * Context, or action-local registry. Capacity1/default native priority only;
 * the DS global16-channel pool and PlaySEEx overrides are outside this leaf. */
export class NativeSEPlayer4{
 private playing:Playing|null=null;private closed=false;private admitting=false;private waiters=new Set<()=>void>();private failures:string[]=[];
 constructor(readonly resources:NativeRepelAudioResources,readonly signal:AbortSignal){validateNativeRepelAudio(resources);check(signal);signal.addEventListener('abort',this.destroy,{once:true});}
 private destroy=()=>this.dispose();
 private guard(){check(this.signal);if(this.closed)throw new UnsupportedNativeRepelAudio('Native PLAYER4 disposed');}
 private meta(id:number){const meta=this.resources.playerSequences[id];if(!meta||meta.player!==4)throw new UnsupportedNativeRepelAudio('Sequence has no original PLAYER4 metadata: '+id);return meta;}
 get diagnostics(){return[...this.failures];}
 private report(error:unknown){this.failures.push(detail(error));if(this.failures.length>32)this.failures.shift();}
 private clear(){const old=this.playing;this.playing=null;if(old)try{old.voice.stop();}catch(error){this.report(error);}}
 private notify(){if(!this.playing)for(const wake of[...this.waiters])wake();}
 isPlaying(id:number){this.guard();this.meta(id);return this.playing!==null;}
 play(id:number,owner:object,start:()=>NativeSEVoice):NativeSEOutcome{
  this.guard();if(this.admitting)throw new UnsupportedNativeRepelAudio('Reentrant native PLAYER4 admission');const meta=this.meta(id);if(!owner||typeof owner!=='object')throw new UnsupportedNativeRepelAudio('Native SE requires an owner');if(this.playing&&meta.playerPriority<this.playing.priority)return{kind:'no-voice',detail:'Native PLAYER4 rejected lower player priority'};
  this.admitting=true;try{this.clear();this.guard();let voice:NativeSEVoice;try{voice=start();if(!voice||typeof voice.stop!=='function'||typeof voice.ended?.then!=='function')throw Error('Native SE transport admitted no owned voice');}catch(error){this.report(error);this.notify();return{kind:'no-voice',detail:detail(error)};}
   if(this.closed||this.signal.aborted){void Promise.resolve(voice.ended).catch(error=>this.report(error));try{voice.stop();}finally{this.guard();}}
   const entry:Playing={id,owner,priority:meta.playerPriority,voice,finished:false,fade:0};this.playing=entry;void voice.ended.then(()=>{entry.finished=true;},error=>{entry.finished=true;this.report(error);});return{kind:'voice'};
  }finally{this.admitting=false;}
 }
 stopOwned(id:number,owner:object,fade:0|1){this.guard();this.meta(id);if(fade!==0&&fade!==1)throw new UnsupportedNativeRepelAudio('Unsupported native stop fade');const entry=this.playing;if(!entry||entry.id!==id||entry.owner!==owner)return false;if(fade===1){entry.priority=0;entry.fade=1;}else{this.clear();this.notify();}return true;}
 cancelOwner(owner:object){if(this.closed)return;if(this.playing?.owner===owner){this.clear();this.notify();}}
 soundUpdate(){this.guard();if(this.playing&&(this.playing.finished||this.playing.fade===1))this.clear();this.notify();}
 waitIdle(signal:AbortSignal){this.guard();check(signal);return new Promise<void>((resolve,reject)=>{let done=false;const finish=(error?:unknown)=>{if(done)return;done=true;this.waiters.delete(wake);signal.removeEventListener('abort',abort);this.signal.removeEventListener('abort',destroy);if(error!==undefined)reject(error);else resolve();},wake=()=>{if(this.closed)finish(new UnsupportedNativeRepelAudio('Native PLAYER4 disposed'));else if(!this.playing)finish();},abort=()=>finish(abortReason(signal)),destroy=()=>finish(abortReason(this.signal));this.waiters.add(wake);signal.addEventListener('abort',abort,{once:true});this.signal.addEventListener('abort',destroy,{once:true});wake();});}
 dispose(){if(this.closed)return;this.closed=true;this.signal.removeEventListener('abort',this.destroy);this.clear();for(const wake of[...this.waiters])wake();}
}

export type RepelAudioStatus={id:RepelSE;stage:'prepared'|'started'|'ended'|'no-voice';detail?:string};
export type NativeRepelAudioPorts={player3:NativeSEPlayer3;player4:NativeSEPlayer4;output:()=>SharedAzaleaAudioOutput;report:(status:RepelAudioStatus)=>void;fetchBytes?:NativeAudioFetch;ioTimeoutMs?:number};
/** Two finite source SEs through injected ROOT players and the existing gain.
 * Native SELECT mute is an explicit field sound flag, not master gain mute.
 * This adapter never creates/resumes a Context, changes gain, owns a clock or
 * disposes either player. waitIdle is a cancellation/convenience Promise; VM
 * WaitSE must sample isPlayerIdle at EVERY actual scripts-phase poll, since
 * another cue can start after an idle interval. Host PlaySE ignores voice/no-voice; missing source,
 * preparation or metadata is explicit unsupported, never an invented tone. */
export function createNativeRepelAudio(resources:NativeRepelAudioResources,ports:NativeRepelAudioPorts){
 validateNativeRepelAudio(resources);if(!(ports?.player3 instanceof NativeSEPlayer3)||!(ports.player4 instanceof NativeSEPlayer4)||ports.player4.resources!==resources||ports.player3.signal!==ports.player4.signal||typeof ports.output!=='function'||typeof ports.report!=='function')throw new UnsupportedNativeRepelAudio('Repel requires shared original PLAYER3/4/output/status ports');
 const expected=resources.playerSequences[1535],actual=ports.player3.resources.playerSequences[1535];if(!actual||(['id','key','player','bank','volume','channelPriority','playerPriority']as const).some(k=>actual[k]!==expected[k]))throw new UnsupportedNativeRepelAudio('Shared PLAYER3 has different CARD2 metadata');
 const deadline=ports.ioTimeoutMs??4000;if(!Number.isInteger(deadline)||deadline<1||deadline>120000)throw new UnsupportedNativeRepelAudio('Invalid Repel preparation deadline');
 const lifetime=new AbortController(),buffers=new Map<RepelSE,AudioBuffer>(),prepared=new Map<RepelSE,string|null>(),owners=new Set<{owner:object;id:RepelSE;token:object}>();let closed=false,borrowed:SharedAzaleaAudioOutput|undefined,detach=()=>{},failureError:UnsupportedNativeRepelAudio|undefined,rejectFailure!:(error:unknown)=>void;
 const failure=new Promise<never>((_yes,no)=>{rejectFailure=no;});void failure.catch(()=>{});
 const guard=()=>{if(failureError)throw failureError;check(lifetime.signal);check(ports.player3.signal);if(closed)throw new UnsupportedNativeRepelAudio('Repel audio disposed');};
 const player=(id:RepelSE)=>{if(id!==1500&&id!==1535)throw new UnsupportedNativeRepelAudio('Unknown Repel source cue');return id===1500?ports.player4:ports.player3;};
 const status=(id:RepelSE,stage:RepelAudioStatus['stage'],message?:string,async=false)=>{try{ports.report({id,stage,...message===undefined?{}:{detail:message}});}catch(error){failureError??=new UnsupportedNativeRepelAudio('Repel sound status port failed: '+detail(error));rejectFailure(failureError);if(!async)throw failureError;}};
 const output=()=>{guard();const value={...ports.output()};if(!value.context||!value.output||!value.signal||value.output.context!==value.context||value.signal!==ports.player3.signal)throw new UnsupportedNativeRepelAudio('Missing shared Repel audio output owner');check(value.signal);if(borrowed&&(value.context!==borrowed.context||value.output!==borrowed.output||value.signal!==borrowed.signal))throw new UnsupportedNativeRepelAudio('Shared Repel output changed owner');if(!borrowed){if(typeof value.context.addEventListener!=='function')throw new UnsupportedNativeRepelAudio('Missing shared AudioContext lifecycle');borrowed=value;const end=()=>dispose(),state=()=>{if(value.context.state==='running')return;for(const entry of[...owners]){player(entry.id).cancelOwner(entry.token);owners.delete(entry);status(entry.id,'no-voice','Shared native audio Context became '+value.context.state,true);}};value.signal.addEventListener('abort',end,{once:true});value.context.addEventListener('statechange',state);detach=()=>{value.signal.removeEventListener('abort',end);value.context.removeEventListener('statechange',state);};}return value;};
 async function prepareOne(id:RepelSE,signal:AbortSignal){
  check(signal);guard();if(prepared.has(id)&&prepared.get(id)===null)return;const controller=new AbortController(),combined=AbortSignal.any([signal,lifetime.signal,ports.player3.signal,controller.signal]);let timer:ReturnType<typeof setTimeout>|undefined;
  try{timer=setTimeout(()=>controller.abort(Error('Original Repel sound preparation timed out')),deadline);const {context}=output(),asset=resources.sounds[id],bytes=await observe(()=>(ports.fetchBytes??fetchBytes)(ROOT+asset.file,combined),combined);await checksum(bytes,asset.wavSHA256,combined);const buffer=await observe(()=>context.decodeAudioData(bytes),combined);check(combined);guard();if(buffer.numberOfChannels!==2||Math.abs(buffer.duration-asset.frames/asset.sampleRate)>1/asset.sampleRate+1/context.sampleRate)throw new UnsupportedNativeRepelAudio('Original Repel decoded timing changed');buffers.set(id,buffer);prepared.set(id,null);status(id,'prepared');}
  catch(error){if(signal.aborted)throw abortReason(signal);if(lifetime.signal.aborted)throw abortReason(lifetime.signal);if(ports.player3.signal.aborted)throw abortReason(ports.player3.signal);if(error instanceof UnsupportedNativeRepelAudio){prepared.delete(id);buffers.delete(id);throw error;}prepared.set(id,detail(error));status(id,'no-voice',detail(error));}finally{clearTimeout(timer);}
 }
 function play(id:RepelSE,owner:object,signal:AbortSignal,options:{selectMuted:boolean}):NativeSEOutcome{
  guard();check(signal);if(!owner||typeof owner!=='object')throw new UnsupportedNativeRepelAudio('Native Repel SE requires an owner');if(id!==1500&&id!==1535)throw new UnsupportedNativeRepelAudio('Unknown Repel source cue');if(typeof options?.selectMuted!=='boolean')throw new UnsupportedNativeRepelAudio('Explicit native SELECT mute state required');if(id===1500&&options.selectMuted)return{kind:'no-voice',detail:'Native SELECT sound flag suppresses allocation'};if(!prepared.has(id))throw new UnsupportedNativeRepelAudio('Original Repel SE must be prepared before dispatch');
  // Configuration identity is checked before dispatch; technical decoded/node
  // failure remains INSIDE source allocation, preempting equal priority first.
  let technicalOutputFailure:{error:unknown}|undefined;if(buffers.has(id))try{output();}catch(error){check(signal);check(lifetime.signal);check(ports.player3.signal);if(error instanceof UnsupportedNativeRepelAudio||(error instanceof Error&&error.name==='AbortError'))throw error;technicalOutputFailure={error};}const entry={owner,id,token:{}};owners.add(entry);const registry=player(id);
  let result:NativeSEOutcome;try{result=registry.play(id,entry.token,()=>{
   if(technicalOutputFailure)throw technicalOutputFailure.error;const buffer=buffers.get(id);if(!buffer)throw Error(prepared.get(id)??'Original Repel audio admitted no decoded voice');const {context,output:destination,signal:shared}=borrowed!;if(context.state!=='running')throw Error('Shared native audio Context is not running');
   const node=context.createBufferSource();let done=false,started=false,resolve!:()=>void;const ended=new Promise<void>(yes=>{resolve=yes;});const finish=()=>{if(done)return;done=true;node.onended=null;signal.removeEventListener('abort',abort);shared.removeEventListener('abort',abort);lifetime.signal.removeEventListener('abort',abort);try{node.stop();}catch{}try{node.disconnect();}finally{resolve();owners.delete(entry);}if(started)status(id,'ended',undefined,true);},abort=()=>{registry.cancelOwner(entry.token);finish();};
   signal.addEventListener('abort',abort,{once:true});shared.addEventListener('abort',abort,{once:true});lifetime.signal.addEventListener('abort',abort,{once:true});try{check(signal);check(shared);guard();node.buffer=buffer;node.loop=false;node.onended=finish;node.connect(destination);node.start();started=true;}catch(error){finish();throw error;}return{ended,stop:finish};
  });}catch(error){owners.delete(entry);throw error;}
  try{if(result.kind==='voice')status(id,'started');else{owners.delete(entry);status(id,'no-voice',result.detail);}}catch(error){registry.cancelOwner(entry.token);owners.delete(entry);throw error;}return result;
 }
 function cancelOwner(owner:object){for(const entry of[...owners])if(entry.owner===owner){player(entry.id).cancelOwner(entry.token);owners.delete(entry);}}
 function dispose(){if(closed)return;closed=true;lifetime.abort(new DOMException('Original Repel audio disposed','AbortError'));for(const entry of[...owners]){player(entry.id).cancelOwner(entry.token);owners.delete(entry);}buffers.clear();prepared.clear();detach();}
 return{async prepare(signal:AbortSignal){await prepareOne(1500,signal);await prepareOne(1535,signal);},play,cancelOwner,isPlayerIdle(id:RepelSE){guard();return!player(id).isPlaying(id);},waitIdle(id:RepelSE,signal:AbortSignal){guard();return player(id).waitIdle(AbortSignal.any([signal,lifetime.signal]));},failure,dispose};
}
