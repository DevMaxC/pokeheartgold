import type {HatchMusicCue,HatchMusicSession,EffectiveFieldMusic,NativeHatchTrack,NativeMusicTransport,NativeMusicVoice} from './hatch-music.ts';
import type {EggHatchVisualScene} from './egg-hatch-view.ts';

export class UnsupportedHatchHostAudio extends Error{constructor(message:string){super(message);this.name='UnsupportedHatchHostAudio';}}
export class HatchHostAudioFailure extends Error{
 constructor(readonly operation:string,cause:unknown){super('Original hatch audio '+operation+' unavailable: '+String(cause??'no error value'),{cause});this.name='HatchHostAudioFailure';}
}
type HatchCueParent={startSilent:(signal:AbortSignal)=>Promise<void>;startSilentAfterRetainedRestore:(signal:AbortSignal)=>Promise<void>;restore:(signal?:AbortSignal)=>Promise<void>};
export type HatchAudioPlayer={field:{capture:()=>EffectiveFieldMusic};createCueSession:(options?:{readonly beforeFieldRestore?:(signal:AbortSignal)=>Promise<void>})=>HatchCueParent;createHatchTransport:()=>NativeMusicTransport};
export type SharedHatchAudioOutput={context:AudioContext;output:AudioNode;signal:AbortSignal};
export type HatchHostAudioPorts={
 /** Read current global preference at each admission/restore boundary. Master
  * output gain owns immediate muting; this port never stops admitted voices. */
 enabled:()=>boolean;player:HatchAudioPlayer;sharedAudioOutput:()=>SharedHatchAudioOutput;
 drainFieldWork:(signal:AbortSignal)=>Promise<void>;report:(failure:HatchHostAudioFailure)=>void;
 retainRestore:(retry:(signal?:AbortSignal)=>Promise<void>)=>void;timeoutMs?:number;preparationTimeoutMs?:number;
 loadManifest?:(signal:AbortSignal)=>Promise<{sourceSHA256:string;tracks:Record<string,NativeHatchTrack>}>;
 fetchBytes?:(url:string,signal:AbortSignal)=>Promise<ArrayBuffer>;
 /** Native source polls its 15-frame fanfare timer at30Hz. Test/host may inject
  * the same clock; this default is a cancellable wall-clock presentation. */
 wait?:(milliseconds:number,signal:AbortSignal)=>Promise<void>;
};
const SDAT='3b63b5b7aa7714a1906320be106beecebae89f8daf3988be699d41d4309454e6';
const NATIVE={
 1011:{id:1011,key:'SEQ_GS_SHINKA',file:'1011-SEQ_GS_SHINKA.wav',sampleRate:32768,frames:1545228,completionFrame:1545228,loopFrames:[1030038,1529353]as[number,number],wavSHA256:'a2ca7fc26226a26c46b234b508c1782fc5d6b5f2149d7bd96be72584a5af493e'},
 1188:{id:1188,key:'SEQ_ME_SHINKAOME',file:'1188-SEQ_ME_SHINKAOME.wav',sampleRate:32768,frames:136052,completionFrame:139462,loopFrames:null,wavSHA256:'b369b375025613d99821685203ee43a1d6b12fa7d3d3c554200d42746b7c83ea'},
};
const CRY={file:'cry-175.wav',frames:5380,sampleRate:10512,wavSHA256:'dac18e8e3d950a7952eb2294210c969ef0dad0155f60b14452026f7d39339ecd'};
const why=(signal:AbortSignal)=>signal.reason??Error('Native hatch audio cancelled');
function check(signal:AbortSignal){if(signal.aborted)throw why(signal);}
/** Attach handlers even when a reentrant caller already cancelled the signal. */
function observe<T>(pending:Promise<T>,signal:AbortSignal):Promise<T>{return new Promise((resolve,reject)=>{let done=false;const finish=(ok:boolean,value:unknown)=>{if(done)return;done=true;signal.removeEventListener('abort',abort);if(ok)resolve(value as T);else reject(value);},abort=()=>finish(false,why(signal));void pending.then(v=>finish(true,v),e=>finish(false,e));if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});});}
function sleep(ms:number,signal:AbortSignal){return new Promise<void>((resolve,reject)=>{check(signal);const abort=()=>{clearTimeout(timer);reject(why(signal));},timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);signal.addEventListener('abort',abort,{once:true});});}
function snapshot(value:EffectiveFieldMusic){if(value.kind!=='none'&&(value.kind!=='playing'||!value.identity||!Number.isFinite(value.positionSeconds)||value.positionSeconds<0||!Number.isInteger(value.cue.id)||!/^SEQ_\w+$/.test(value.cue.key)||!['map','surf','radio','other'].includes(value.source)))throw new UnsupportedHatchHostAudio('Invalid actual field-music snapshot');return structuredClone(value);}
function cue(value:HatchMusicCue,id:1011|1188){if(value.id!==id||value.key!==NATIVE[id].key)throw new UnsupportedHatchHostAudio('Original hatch cue not supported: '+value.key+'/'+value.id);}
async function fetchBytes(url:string,signal:AbortSignal){const response=await fetch(url,{signal});if(!response.ok)throw Error('Original hatch asset could not load ('+response.status+'): '+url);return response.arrayBuffer();}
async function manifest(signal:AbortSignal){const response=await fetch('/source/hatching/music/manifest.json',{signal});if(!response.ok)throw Error('Original hatch music manifest could not load ('+response.status+')');return response.json();}

/** One native hatch action, using the existing music player's actual field
 * interruption and shared transport. Never constructs/resumes/closes a Context.
 * Native hatch_egg_app.c629/656/665 ignores BGM/cry/fanfare admission results:
 * technical failure reports/no voice, while real visual/text/naming continues.
 * Missing/wrong source/configuration and cancellation remain explicit failures.
 */
export function createHatchHostAudio(ports:HatchHostAudioPorts):{music:HatchMusicSession;cry:(scene:EggHatchVisualScene,signal:AbortSignal)=>Promise<void>}{
 if(!ports||typeof ports.enabled!=='function'||typeof ports.player?.field?.capture!=='function'||typeof ports.player.createCueSession!=='function'||typeof ports.player.createHatchTransport!=='function'||typeof ports.sharedAudioOutput!=='function'||typeof ports.drainFieldWork!=='function'||typeof ports.report!=='function'||typeof ports.retainRestore!=='function')throw new UnsupportedHatchHostAudio('Native hatch requires shared player/output, owned cue parent, field drain, failure report and retained restore ports');
 const timeout=ports.timeoutMs??1500;if(!Number.isInteger(timeout)||timeout<1||timeout>120000)throw new UnsupportedHatchHostAudio('Invalid hatch audio operation deadline');
 const preparationTimeout=ports.preparationTimeoutMs??4000;if(!Number.isInteger(preparationTimeout)||preparationTimeout<1||preparationTimeout>120000)throw new UnsupportedHatchHostAudio('Invalid hatch audio preparation deadline');
 const owner=new AbortController(),lifetimes=new Map<AbortSignal,()=>void>(),links=new Set<{controller:AbortController;release:()=>void}>(),voices=new Set<NativeMusicVoice>();
 let fault:UnsupportedHatchHostAudio|undefined,started=false,closed=false,restored=false,retained=false,fanfareStarted=false;
 let parent:HatchCueParent|undefined,transport:NativeMusicTransport|undefined,background:NativeMusicVoice|undefined,external:AbortSignal|undefined,detach=()=>{};
 let cleanup:Promise<void>|undefined,restoration:Promise<void>|undefined,tracks:Record<string,NativeHatchTrack>|undefined,cryBuffer:AudioBuffer|undefined,manifestAttempted=false;
 const prepared=new Set<number>(),preparationAttempted=new Set<number>(),wait=ports.wait??sleep;
 const guard=()=>{if(fault)throw fault;};
 const enabled=()=>{const value=ports.enabled();if(typeof value!=='boolean')throw new UnsupportedHatchHostAudio('Native hatch requires a live boolean sound preference');return value;};
 const report=(operation:string,error:unknown)=>{try{ports.report(new HatchHostAudioFailure(operation,error));}catch(cause){fault=new UnsupportedHatchHostAudio('Native hatch audio failure-report port failed: '+String(cause));owner.abort(fault);throw fault;}};
 const fatal=(error:unknown,signal?:AbortSignal)=>{if(signal)check(signal);guard();if(error instanceof UnsupportedHatchHostAudio)throw error;if(owner.signal.aborted)throw why(owner.signal);};
 function link(signals:AbortSignal[]){const controller=new AbortController(),handlers=signals.map(signal=>()=>controller.abort(why(signal)));const result={controller,release:()=>{signals.forEach((signal,i)=>signal.removeEventListener('abort',handlers[i]));links.delete(result);}};links.add(result);signals.forEach((signal,i)=>{if(signal.aborted)handlers[i]();else signal.addEventListener('abort',handlers[i],{once:true});});return result;}
 async function bounded<T>(work:(signal:AbortSignal)=>Promise<T>,signals:AbortSignal[],operation:string,limit=timeout,late?:(value:T)=>void){
  const owned=link(signals),signal=owned.controller.signal,timer=setTimeout(()=>owned.controller.abort(Error('Native hatch '+operation+' timed out')),limit);let pending:Promise<T>|undefined;
  try{check(signal);pending=Promise.resolve(work(signal));void pending.then(value=>{if(signal.aborted)late?.(value);},()=>{});return await observe(pending,signal);}catch(error){owned.controller.abort(error??Error('Native hatch '+operation+' failed'));throw error;}finally{clearTimeout(timer);owned.release();}
 }
 const attempt=async<T>(operation:string,signal:AbortSignal,work:(input:AbortSignal)=>Promise<T>,limit=timeout)=>{try{return await bounded(work,[signal,owner.signal],operation,limit);}catch(error){fatal(error,signal);report(operation,error);return undefined;}};
 function sharedOutput(){
  const value=ports.sharedAudioOutput();if(!value?.context||!value.output||value.output.context!==value.context||!value.signal||typeof value.signal.addEventListener!=='function')throw new UnsupportedHatchHostAudio('Missing shared hatch output mechanism');
  if(!lifetimes.has(value.signal)){const destroy=()=>owner.abort(why(value.signal));lifetimes.set(value.signal,destroy);if(value.signal.aborted)destroy();else value.signal.addEventListener('abort',destroy,{once:true});}check(value.signal);return value;
 }
 async function startVoice(asset:NativeHatchTrack,signal:AbortSignal){
  const owned=link([signal,owner.signal]),input=owned.controller.signal,timer=setTimeout(()=>owned.controller.abort(Error('Native hatch start timed out')),timeout);let value:NativeMusicVoice|undefined;
  try{check(input);sharedOutput();const pending=Promise.resolve(transport!.play(asset,input));void pending.then(late=>{if(input.aborted&&typeof late?.stop==='function')late.stop(why(input));},()=>{}).catch(error=>{report('late voice cleanup',error);}).catch(()=>{});value=await observe(pending,input);check(input);if(!value||typeof value.stop!=='function'||typeof value.pause!=='function'||typeof value.resume!=='function'||!value.ended||typeof value.ended.then!=='function')throw new UnsupportedHatchHostAudio('Shared hatch transport returned no owned voice');voices.add(value);const voice=value;void voice.ended.finally(()=>{voices.delete(voice);owned.release();}).catch(()=>{});return voice;
  }catch(error){owned.controller.abort(error??Error('Native hatch voice start failed'));value?.stop(error);owned.release();throw error;}finally{clearTimeout(timer);}
 }
 function getTransport(){transport=ports.player.createHatchTransport();if(!transport||typeof transport.prepare!=='function'||typeof transport.play!=='function'||typeof transport.dispose!=='function')throw new UnsupportedHatchHostAudio('Missing shared hatch transport mechanism');}
 function validateManifest(value:{sourceSHA256:string;tracks:Record<string,NativeHatchTrack>}){
  if(value?.sourceSHA256!==SDAT||!value.tracks)throw new UnsupportedHatchHostAudio('Wrong or missing native hatch music source');
  for(const id of[1011,1188]as const){const actual=value.tracks[String(id)],expected=NATIVE[id];if(!actual||Object.entries(expected).some(([key,v])=>JSON.stringify(actual[key as keyof NativeHatchTrack])!==JSON.stringify(v)))throw new UnsupportedHatchHostAudio('Wrong or missing original hatch track: '+id);}
  return value.tracks;
 }
 async function prepareMusic(ids:readonly number[],signal:AbortSignal){
  if(!enabled())return;if(!transport)getTransport();
  if(!manifestAttempted){manifestAttempted=true;const loaded=await attempt('music manifest',signal,ports.loadManifest??manifest);if(loaded!==undefined)tracks=validateManifest(loaded);}
  if(!tracks||!enabled())return;
  await Promise.all(ids.filter(id=>!preparationAttempted.has(id)).map(async id=>{preparationAttempted.add(id);const result=await attempt('prepare '+id,signal,async input=>{await transport!.prepare(tracks![String(id)],input);return true;},preparationTimeout);if(result)prepared.add(id);}));
 }
 function bind(signal:AbortSignal){check(signal);if(external&&external!==signal)throw new UnsupportedHatchHostAudio('Hatch audio cannot change its owning source-action signal');if(!external){external=signal;const abort=()=>owner.abort(why(signal));signal.addEventListener('abort',abort,{once:true});detach=()=>signal.removeEventListener('abort',abort);}check(owner.signal);}
 async function retryRestore(signal?:AbortSignal){
  if(restored)return;if(signal)check(signal);if(restoration)return signal?observe(restoration,signal):restoration;
  const pending=(async()=>{if(parent)await bounded(input=>parent!.restore(input),signal?[signal]:[],'field restore');restored=true;})();restoration=pending;try{await pending;}finally{if(restoration===pending)restoration=undefined;}
 }
 const music:HatchMusicSession={
  async start(value,signal){
   guard();cue(value,1011);bind(signal);if(started||closed)throw new UnsupportedHatchHostAudio('Hatch audio session already started or closed');started=true;
   // Main sets hatching before this call. Drain is bounded; regardless of drain
   // failure, suspend is invoked synchronously even for kind:none. Its native
   // player latch cancels generations before any late unlock/map continuation.
   await attempt('field drain',signal,async input=>{await ports.drainFieldWork(input);});check(signal);check(owner.signal);
   const captured=snapshot(ports.player.field.capture());
   parent=ports.player.createCueSession({beforeFieldRestore:async input=>{
    // This SAME fixed pre-hatch work must drain before ANY successor unlatches
    // the field. It is independent of the finished source-action/voice owner.
    await ports.drainFieldWork(input);check(input);
    if(enabled()&&captured.kind==='playing'){const output=ports.sharedAudioOutput();if(!output?.context||!output.output||output.output.context!==output.context||!output.signal)throw new UnsupportedHatchHostAudio('Missing shared hatch restoration output');check(output.signal);if(output.context.state!=='running')throw Error('Shared hatch AudioContext is not running for field restoration');}
   }});
   if(!parent||typeof parent.startSilent!=='function'||typeof parent.startSilentAfterRetainedRestore!=='function'||typeof parent.restore!=='function')throw new UnsupportedHatchHostAudio('Missing real hatch cue parent');
   try{await bounded(async input=>{try{await parent!.startSilent(input);}catch(error){check(input);check(owner.signal);await parent!.startSilentAfterRetainedRestore(input);}},[signal,owner.signal],'field suspend');}catch(error){fatal(error,signal);throw new UnsupportedHatchHostAudio('Shared field suspension could not establish hatch ownership: '+String(error));}
   await prepareMusic([1011,1188],signal);
   if(!prepared.has(1011)||!enabled())return;
   try{background=await startVoice(tracks!['1011'],signal);const current=background;void current.ended.then(()=>{if(!closed&&!owner.signal.aborted)report('hatch background ended',Error('Looping native hatch music ended unexpectedly'));},error=>{if(!closed&&!owner.signal.aborted)report('hatch background playback',error);}).catch(()=>{});}catch(error){fatal(error,signal);report('hatch music start',error);}
  },
  async fanfare(value,signal){
   guard();cue(value,1188);bind(signal);if(!started||closed||fanfareStarted)throw new UnsupportedHatchHostAudio('Hatch fanfare requires its single active source session');fanfareStarted=true;
   // A mute at hatch entry skipped I/O. An explicit later unmute may admit
   // this future native cue, without replaying the earlier background phase.
   // Previously failed admission is not silently retried.
   await prepareMusic([1188],signal);
   let foreground:NativeMusicVoice|undefined,played=false;const begin=performance.now();try{
    try{background?.pause();}catch(error){fatal(error,signal);report('hatch music pause',error);}if(enabled()){if(tracks&&prepared.has(1188)){try{foreground=await startVoice(tracks['1188'],signal);await bounded(()=>foreground!.ended,[signal,owner.signal],'fanfare playback',NATIVE[1188].frames/32768*1000+timeout);played=true;}catch(error){fatal(error,signal);report(foreground?'fanfare playback':'fanfare start',error);}}else report('fanfare admission',Error('No prepared original fanfare voice'));}
    // Native PlayFanfare starts15-count timer even if Sound_StartSeq fails.
    // Mute suppresses audio admission, not this phase or its BGM pause/resume.
    // On success the verified asset already includes release after sequenceEnd;
    // completionFrame adds only the remaining native15/30-second timer tail.
    const milliseconds=played?(NATIVE[1188].completionFrame-NATIVE[1188].frames)/32768*1000:Math.max(0,15/30*1000-(performance.now()-begin));
    await bounded(input=>wait(milliseconds,input),[signal,owner.signal],'native fanfare timer',milliseconds+timeout);
   }finally{foreground?.stop();if(!closed&&!owner.signal.aborted)try{background?.resume();}catch(error){fatal(error,signal);report('hatch music resume',error);}}
  },
  async restore(){
   if(restored)return;if(cleanup)return cleanup;
   const pending=(async()=>{
    closed=true;detach();for(const[signal,handler]of lifetimes)signal.removeEventListener('abort',handler);lifetimes.clear();owner.abort(Error('Native hatch audio restored'));let diagnostic:unknown;
    const note=(operation:string,error:unknown)=>{try{report(operation,error);}catch(failure){diagnostic??=failure;}};
    for(const voice of[...voices])try{voice.stop();}catch(error){note('voice cleanup',error);}for(const item of[...links])item.controller.abort(Error('Native hatch audio restored'));
    if(transport)try{await bounded(()=>transport!.dispose(),[],'transport disposal');}catch(error){note('transport disposal',error);}
    // A broken diagnostic callback is a configuration failure, but must not
    // prevent physical release of an already-established field interruption.
    try{await retryRestore();}catch(error){note('field restore',error);if(!retained){retained=true;try{ports.retainRestore(retryRestore);}catch(cause){diagnostic??=new UnsupportedHatchHostAudio('Required retained-restore port failed: '+String(cause));}}}
    if(diagnostic!==undefined)throw diagnostic;if(fault)throw fault;

   })();cleanup=pending;try{await pending;}finally{if(cleanup===pending)cleanup=undefined;}

  },
 };
 async function cry(scene:EggHatchVisualScene,signal:AbortSignal){
  guard();check(signal);if(scene.kind!=='standard'||scene.cry.species!==175||scene.cry.form!==0||scene.hatched.species!==175)throw new UnsupportedHatchHostAudio('Original hatch cry supports standard Togepi175 form0 only');if(!started||closed)throw new UnsupportedHatchHostAudio('Cry requires its active hatch session');if(!enabled())return;
  let output:SharedHatchAudioOutput;try{output=sharedOutput();}catch(error){fatal(error,signal);report('cry output',error);return;}
  if(!output?.context||!output.output||output.output.context!==output.context||!output.signal||typeof output.context.createBufferSource!=='function'||typeof output.context.createGain!=='function'||typeof output.context.decodeAudioData!=='function')throw new UnsupportedHatchHostAudio('Missing shared hatch cry output mechanism');check(output.signal);
  let original:AudioBuffer|undefined;try{original=await bounded(async input=>{
   check(output.signal);if(output.context.state!=='running')throw Error('Shared hatch AudioContext is not running');if(cryBuffer)return cryBuffer;
   const data=await(ports.fetchBytes??fetchBytes)('/source/hatching/cry-175.wav',input);check(input);check(output.signal);const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),v=>v.toString(16).padStart(2,'0')).join('');check(input);if(hash!==CRY.wavSHA256)throw Error('Original Togepi hatch cry checksum mismatch');
   const buffer=await new Promise<AudioBuffer>((resolve,reject)=>{const pending=output.context.decodeAudioData(data,resolve,reject);if(pending?.then)void pending.then(resolve,reject);});check(input);check(output.signal);if(buffer.numberOfChannels!==1||Math.abs(buffer.duration-CRY.frames/CRY.sampleRate)>1/CRY.sampleRate+1/output.context.sampleRate)throw Error('Original Togepi cry decoded with different source timing');cryBuffer=buffer;return buffer;
  },[signal,owner.signal,output.signal],'cry preparation');}catch(error){fatal(error,signal);check(output.signal);report('cry preparation',error);return;}if(!original||!enabled())return;
  const owned=link([signal,owner.signal,output.signal]),input=owned.controller.signal;let node:AudioBufferSourceNode|undefined,gain:GainNode|undefined,stop:((reason?:unknown)=>void)|undefined,played=false;
  try{
   check(input);if(output.context.state!=='running')throw Error('Shared hatch AudioContext is not running');node=output.context.createBufferSource();gain=output.context.createGain();node.buffer=original;gain.gain.value=120/127;node.connect(gain);gain.connect(output.output);
   let done=false,resolve!:()=>void,reject!:(reason:unknown)=>void;const ended=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});void ended.catch(()=>{});const abort=()=>stop!(why(input));
   stop=(reason?:unknown)=>{if(done)return;done=true;input.removeEventListener('abort',abort);node!.onended=null;try{node!.stop();}catch{}node!.disconnect();gain!.disconnect();if(reason!==undefined)reject(reason);else resolve();};input.addEventListener('abort',abort,{once:true});node.onended=()=>stop!();check(input);node.start();played=true;
   await bounded(()=>ended,[input],'cry playback',CRY.frames/CRY.sampleRate*1000+timeout);
  }catch(error){fatal(error,signal);check(output.signal);report(played?'cry playback':'cry start',error);}finally{stop?.();if(!stop){try{node?.stop();}catch{}node?.disconnect();gain?.disconnect();}owned.release();}
 }
 return{music,cry};
}
