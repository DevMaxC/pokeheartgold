import {EVOLUTION_AUDIO_MANIFEST_SHA256} from './evolution-audio-data.ts';
import type {BattleEvolutionScene} from './battle-evolution-types.ts';
import type {NativeCueChildLease} from './field-music.ts';

export class UnsupportedEvolutionAudio extends Error{constructor(message:string){super(message);this.name='UnsupportedEvolutionAudio';}}
export type EvolutionAudioOutput={readonly context:AudioContext;readonly output:AudioNode;readonly signal:AbortSignal};
export type EvolutionAudioSession={prepare:(signal:AbortSignal)=>Promise<void>;bgm:(id:1011)=>void;stopBGM:(id:1011)=>void;cry:(species:number,form:number)=>void;cryPlaying:()=>boolean;se:(id:1510|1528|1529|1530|1531)=>void;anySEPlaying:()=>boolean;fanfare:(id:1184|1188)=>void;fanfarePlaying:()=>boolean;cancel:(reason?:unknown)=>void;restore:(signal:AbortSignal)=>Promise<void>};
type SEVoice={ended:Promise<void>;stop:()=>void};
type Metadata={id:number;key:string;player:number;playerPriority:number;channelPriority:number;bank:number;volume:number};
/** ONE Root-owned PLAYER3; soundUpdate belongs solely to Root's global phase. */
export type EvolutionSEPlayer={readonly signal:AbortSignal;readonly resources:{playerSequences:Record<string,Metadata>};play:(id:number,owner:object,start:()=>SEVoice)=>{kind:'voice'}|{kind:'no-voice';detail:string};cancelOwner:(owner:object)=>void;isPlaying:(id:number)=>boolean};
export type EvolutionAudioStatus={id:number;stage:'prepared'|'started'|'no-voice'|'ended';detail?:string};
export type EvolutionAudioPorts={
 lifetime:AbortSignal;borrowParent:()=>NativeCueChildLease;player3:EvolutionSEPlayer;
 /** Literal GF_IsAnySEPlaying: live players3..6, not an own-voice flag. */
 anySEPlaying:()=>boolean;onAfterTasks:(callback:()=>void,signal:AbortSignal)=>()=>void;
 report:(status:EvolutionAudioStatus)=>void;
 fetchBytes?:(url:string,signal:AbortSignal)=>Promise<ArrayBuffer>;ioTimeoutMs?:number;
};
type Asset={id:number;url:string;frames:number;sampleRate:number;channels:number;bitsPerSample:number;loopFrames:[number,number]|null;wavSHA256:string;volume:number};
type Resources={version:1;sourceSHA256:string;pairs:{before:number;after:number;param:number}[];tracks:Record<string,Asset&Metadata>;cries:Record<string,Asset>};
type Voice=SEVoice&{pause:()=>void;resume:()=>void;finished:boolean;id:number};
const SDAT='3b63b5b7aa7714a1906320be106beecebae89f8daf3988be699d41d4309454e6',SE=[1510,1528,1529,1530,1531]as const;
const why=(s:AbortSignal)=>s.reason??new DOMException('Original evolution audio cancelled','AbortError');
const check=(s:AbortSignal)=>{if(s.aborted)throw why(s);};
const detail=(e:unknown)=>e instanceof Error?e.message:String(e);
function observe<T>(work:()=>Promise<T>,signal:AbortSignal):Promise<T>{return new Promise((resolve,reject)=>{let done=false;const finish=(ok:boolean,v:unknown)=>{if(done)return;done=true;signal.removeEventListener('abort',abort);if(ok)resolve(v as T);else reject(v);},abort=()=>finish(false,why(signal));if(signal.aborted){abort();return;}signal.addEventListener('abort',abort,{once:true});try{void work().then(v=>finish(true,v),e=>finish(false,e));}catch(e){finish(false,e);}});}
async function checksum(bytes:ArrayBuffer,hash:string,signal:AbortSignal){const result=await observe(()=>crypto.subtle.digest('SHA-256',bytes),signal);check(signal);if(Array.from(new Uint8Array(result),v=>v.toString(16).padStart(2,'0')).join('')!==hash)throw new UnsupportedEvolutionAudio('Original evolution audio checksum mismatch');}
const read=async(url:string,signal:AbortSignal)=>{const response=await fetch(url,{signal});if(!response.ok)throw Error('Original evolution audio unavailable '+response.status+': '+url);return response.arrayBuffer();};
/** Same native callback for scene text and move learning. Return means WAIT. */
export function evolutionAudioTextControl(audio:Pick<EvolutionAudioSession,'anySEPlaying'|'fanfarePlaying'|'fanfare'|'se'>,glyph:number):boolean{
 switch(glyph){case 1:return audio.anySEPlaying();case 2:return audio.fanfarePlaying();case 3:audio.fanfare(1188);return false;case 4:audio.se(1510);return false;case 5:audio.fanfare(1184);return false;default:return false;}
}
/** Borrowed battle→Evolution child. No new Context/master gain/RAF/PLAYER,
 * unlock or field restore. Only the existing post-task phase acknowledges
 * sound completion. Muted/locked entry admits no voice; native pause,15 POLLS
 * and unpause remain. Ordinary form0 EVO_LEVEL, not a DS hardware mixer. */
export function createEvolutionAudio(ports:EvolutionAudioPorts){
 if(!ports?.lifetime||!ports.player3?.signal||!ports.player3.resources?.playerSequences||typeof ports.borrowParent!=='function'||typeof ports.player3.play!=='function'||typeof ports.player3.cancelOwner!=='function'||typeof ports.player3.isPlaying!=='function'||typeof ports.anySEPlaying!=='function'||typeof ports.onAfterTasks!=='function'||typeof ports.report!=='function')throw new UnsupportedEvolutionAudio('Evolution needs parent lease, shared PLAYER3/output, global sound phase and reporting');
 const limit=ports.ioTimeoutMs??4000;if(!Number.isInteger(limit)||limit<1||limit>120000)throw new UnsupportedEvolutionAudio('Invalid evolution audio deadline');check(ports.lifetime);check(ports.player3.signal);
 const lifetime=new AbortController(),sessions=new Set<{cancel:(reason?:unknown)=>void;update:()=>void}>();let active:object|null=null,disposed=false;
 const rootEnd=()=>dispose(why(ports.lifetime)),playerEnd=()=>dispose(why(ports.player3.signal));ports.lifetime.addEventListener('abort',rootEnd,{once:true});ports.player3.signal.addEventListener('abort',playerEnd,{once:true});
 const remove=ports.onAfterTasks(()=>{for(const s of sessions)s.update();},lifetime.signal);
 function dispose(reason:unknown=Error('Evolution audio backend disposed')){if(disposed)return;disposed=true;for(const s of[...sessions])s.cancel(reason);lifetime.abort(reason);remove();ports.lifetime.removeEventListener('abort',rootEnd);ports.player3.signal.removeEventListener('abort',playerEnd);}
 function open(scene:BattleEvolutionScene,output:()=>EvolutionAudioOutput|null,signal:AbortSignal):EvolutionAudioSession{
  check(signal);check(lifetime.signal);if(disposed||active)throw new UnsupportedEvolutionAudio('Evolution audio already owns an active child');
  if(scene?.flags!==3||scene.method!==4||scene.methodKey!=='EVO_LEVEL'||(scene.before.form??0)!==0||(scene.after.form??0)!==0||typeof output!=='function')throw new UnsupportedEvolutionAudio('Unsupported original evolution audio scene');
  const lease=ports.borrowParent();if(!lease?.signal||typeof lease.release!=='function')throw new UnsupportedEvolutionAudio('Missing parent child lease');check(lease.signal);
  const token={},owner=new AbortController(),combined=AbortSignal.any([signal,lifetime.signal,lease.signal,owner.signal]);active=token;
  let borrowed:EvolutionAudioOutput|undefined,detach=()=>{},fault:UnsupportedEvolutionAudio|undefined,resources:Resources|undefined,prepared=false,preparing:Promise<void>|undefined,cancelled=false,restored=false,restoring:Promise<void>|undefined;
  let background:Voice|undefined,foreground:Voice|undefined,cry:Voice|undefined,fanfareTimer=0,fanfarePending=false;
  const buffers=new Map<string,AudioBuffer>(),voices=new Set<Voice>(),seOwner={};
  const guard=()=>{if(fault)throw fault;check(combined);if(cancelled||restored)throw new UnsupportedEvolutionAudio('Evolution audio child is closed');};
  const status=(id:number,stage:EvolutionAudioStatus['stage'],message?:string,asynchronous=false)=>{try{ports.report({id,stage,...message===undefined?{}:{detail:message}});}catch(e){fault??=new UnsupportedEvolutionAudio('Evolution audio reporting failed: '+detail(e));cancel(fault);if(!asynchronous)throw fault;}};
  function takeOutput(){guard();const value=output();if(value===null)return null;const next={...value};if(!next.context||!next.output||next.output.context!==next.context||!next.signal||typeof next.context.addEventListener!=='function')throw new UnsupportedEvolutionAudio('Missing unlocked shared evolution output');check(next.signal);
   if(borrowed&&(borrowed.context!==next.context||borrowed.output!==next.output||borrowed.signal!==next.signal))throw new UnsupportedEvolutionAudio('Shared evolution output changed owner');
   if(!borrowed){borrowed=next;const end=()=>cancel(why(next.signal)),state=()=>{if(next.context.state==='running')return;for(const v of[...voices])v.stop();background=undefined;foreground=undefined;cry=undefined;ports.player3.cancelOwner(seOwner);status(1011,'no-voice','Shared Context became '+next.context.state,true);};next.signal.addEventListener('abort',end,{once:true});next.context.addEventListener('statechange',state);detach=()=>{next.signal.removeEventListener('abort',end);next.context.removeEventListener('statechange',state);};}
   if(next.context.state!=='running')throw Error('Shared evolution Context is not running');return next;
  }
  async function bounded<T>(work:(s:AbortSignal)=>Promise<T>,external:AbortSignal){const timeout=new AbortController(),input=AbortSignal.any([external,combined,timeout.signal]),timer=setTimeout(()=>timeout.abort(Error('Original evolution audio preparation timed out')),limit);try{return await observe(()=>work(input),input);}finally{clearTimeout(timer);}}
  function validate(value:Resources){
   if(value?.version!==1||value.sourceSHA256!==SDAT||!value.pairs?.some(p=>p.before===scene.before.species&&p.after===scene.after.species&&p.param===scene.param))throw new UnsupportedEvolutionAudio('Wrong original evolution source/pair');
   for(const id of SE){const a=value.tracks[id],m=ports.player3.resources.playerSequences[id];if(!a||!m||a.player!==3||(['id','key','player','playerPriority','channelPriority','bank','volume']as const).some(k=>a[k]!==m[k]))throw new UnsupportedEvolutionAudio('Evolution must use actual shared PLAYER3 metadata: '+id);}
   for(const asset of[...Object.values(value.tracks),value.cries[scene.before.species],value.cries[scene.after.species]])if(!asset||!/^\/source\/(?:evolution-audio|hatching\/music)\/[\w.-]+\.wav$/.test(asset.url)||!Number.isInteger(asset.frames)||asset.frames<1||!Number.isInteger(asset.sampleRate)||asset.sampleRate<1||!/^\w{64}$/.test(asset.wavSHA256))throw new UnsupportedEvolutionAudio('Missing exact evolution audio asset');
  }
  async function prepare(external:AbortSignal){guard();check(external);if(prepared)return;if(preparing)return observe(()=>preparing!,external);
   const pending=(async()=>{const encoded=await bounded(s=>(ports.fetchBytes??read)('/source/evolution-audio/resources.json',s),external);await checksum(encoded,EVOLUTION_AUDIO_MANIFEST_SHA256,combined);guard();resources=JSON.parse(new TextDecoder().decode(encoded))as Resources;validate(resources);
    let out:EvolutionAudioOutput|null;try{out=takeOutput();}catch(e){if(e instanceof UnsupportedEvolutionAudio)throw e;status(1011,'no-voice',detail(e));prepared=true;return;}if(!out){prepared=true;return;}
    const assets=[...Object.values(resources.tracks),resources.cries[scene.before.species],resources.cries[scene.after.species]];
    await Promise.all(assets.map(async asset=>{try{const buffer=await bounded(async input=>{const bytes=await observe(()=>(ports.fetchBytes??read)(asset.url,input),input);await checksum(bytes,asset.wavSHA256,input);const decoded=await observe(()=>out!.context.decodeAudioData(bytes),input);check(input);guard();check(out!.signal);if(decoded.numberOfChannels!==asset.channels||Math.abs(decoded.duration-asset.frames/asset.sampleRate)>1/asset.sampleRate+1/out!.context.sampleRate)throw new UnsupportedEvolutionAudio('Original evolution decoded timing changed');return decoded;},external);guard();buffers.set(asset.url,buffer);status(asset.id,'prepared');}catch(e){check(external);guard();if(e instanceof UnsupportedEvolutionAudio)throw e;status(asset.id,'no-voice',detail(e));}}));guard();prepared=true;
   })();preparing=pending;try{await pending;}catch(error){cancel(error);throw error;}finally{if(preparing===pending)preparing=undefined;}
  }
  function voice(asset:Asset,volume=1):Voice{
   guard();const out=takeOutput();if(!out)throw Error('Original evolution audio deliberately muted or locked');const buffer=buffers.get(asset.url);if(!buffer)throw Error('No prepared original evolution voice');
   let node:AudioBufferSourceNode|undefined,gain:GainNode|undefined,offset=0,started=0,stopped=false,paused=false,resolve!:()=>void;
   const ended=new Promise<void>(yes=>{resolve=yes;});
   const disconnect=()=>{if(node){node.onended=null;try{node.stop();}catch{}node.disconnect();node=undefined;}gain?.disconnect();gain=undefined;};
   const position=()=>{let result=offset+(paused||stopped?0:Math.max(0,out.context.currentTime-started));if(asset.loopFrames){const[lo,hi]=asset.loopFrames.map(v=>v/asset.sampleRate);if(result>=hi)result=lo+(result-lo)%(hi-lo);}return result;};
   const finish=()=>{if(stopped)return;stopped=true;result.finished=true;disconnect();voices.delete(result);resolve();};
   const begin=()=>{guard();check(out.signal);if(out.context.state!=='running')throw Error('Shared evolution Context is not running');node=out.context.createBufferSource();node.buffer=buffer;node.loop=!!asset.loopFrames;if(asset.loopFrames){node.loopStart=asset.loopFrames[0]/asset.sampleRate;node.loopEnd=asset.loopFrames[1]/asset.sampleRate;}if(volume!==1){gain=out.context.createGain();gain.gain.value=volume;node.connect(gain);gain.connect(out.output);}else node.connect(out.output);node.onended=()=>{result.finished=true;resolve();};started=out.context.currentTime;node.start(0,offset);};
   const result:Voice={id:asset.id,ended,finished:false,stop:finish,pause(){if(stopped||paused)return;offset=position();paused=true;disconnect();},resume(){if(stopped||!paused)return;paused=false;try{begin();}catch(e){finish();throw e;}}};voices.add(result);try{begin();}catch(e){finish();throw e;}return result;
  }
  function ready(){guard();if(!prepared||!resources)throw new UnsupportedEvolutionAudio('Evolution audio must prepare before source commands');}
  function start(asset:Asset,volume=1){try{const v=voice(asset,volume);status(asset.id,'started');return v;}catch(e){guard();if(e instanceof UnsupportedEvolutionAudio)throw e;status(asset.id,'no-voice',detail(e));return undefined;}}
  function cancel(reason:unknown=Error('Evolution child ended')){if(cancelled)return;cancelled=true;owner.abort(reason);for(const v of[...voices])v.stop();background=undefined;foreground=undefined;cry=undefined;ports.player3.cancelOwner(seOwner);detach();buffers.clear();sessions.delete(tracker);}
  const tracker={cancel,update(){if(cancelled)return;for(const v of[background,foreground,cry])if(v?.finished){v.stop();if(v===background)background=undefined;if(v===foreground)foreground=undefined;if(v===cry)cry=undefined;status(v.id,'ended');}}};sessions.add(tracker);
  const abort=()=>cancel(why(combined));combined.addEventListener('abort',abort,{once:true});
  const api:EvolutionAudioSession={prepare,
   bgm(id){ready();if(id!==1011)throw new UnsupportedEvolutionAudio('Wrong evolution BGM');background?.stop();background=start(resources!.tracks[id]);},
   stopBGM(id){ready();if(id!==1011)throw new UnsupportedEvolutionAudio('Wrong evolution BGM stop');background?.stop();background=undefined;},
   cry(species,form){ready();if(form!==0||species!==scene.before.species&&species!==scene.after.species)throw new UnsupportedEvolutionAudio('Unsupported evolution cry');cry?.stop();cry=start(resources!.cries[species],120/127);},cryPlaying(){ready();return!!cry;},
   se(id){ready();if(!SE.includes(id))throw new UnsupportedEvolutionAudio('Wrong evolution SE');let unsupported:UnsupportedEvolutionAudio|undefined;const outcome=ports.player3.play(id,seOwner,()=>{try{return voice(resources!.tracks[id]);}catch(error){if(error instanceof UnsupportedEvolutionAudio)unsupported=error;throw error;}});if(unsupported)throw unsupported;if(outcome.kind==='voice')status(id,'started');else status(id,'no-voice',outcome.detail);},
   anySEPlaying(){ready();const v=ports.anySEPlaying();if(typeof v!=='boolean')throw new UnsupportedEvolutionAudio('Missing live native any-SE query');return v;},
   fanfare(id){ready();if(id!==1184&&id!==1188)throw new UnsupportedEvolutionAudio('Wrong evolution fanfare');fanfareTimer=15;fanfarePending=true;background?.pause();foreground?.stop();foreground=start(resources!.tracks[id]);},
   fanfarePlaying(){ready();if(foreground)return true;if(fanfareTimer){fanfareTimer--;return true;}if(fanfarePending){fanfarePending=false;try{background?.resume();}catch(e){guard();status(1011,'no-voice',detail(e));background=undefined;}}return false;},cancel,
   async restore(external){check(external);if(restored)return;if(restoring)return observe(()=>restoring!,external);cancel();const pending=(async()=>{await lease.release(external);check(external);restored=true;if(active===token)active=null;combined.removeEventListener('abort',abort);})();restoring=pending;try{await pending;}finally{if(restoring===pending)restoring=undefined;}},
  };return api;
 }
 return{open,dispose};
}
