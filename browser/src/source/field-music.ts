import type {SourceMap} from './types.ts';

export type NativeMusicCue={id:number;key:string};
export type MusicSource='map'|'surf'|'radio'|'other';
export type EffectiveMusic={kind:'none'}|{kind:'playing';cue:NativeMusicCue;positionSeconds:number;source:MusicSource;identity:string};
export type NativeFieldTrack=NativeMusicCue&{status:'ready'|'silence'|'unsupported';reason?:string;sampleRate?:number;frames?:number;channels?:number;loopFrames?:[number,number]|null;formats?:{codec:'aac'|'mp3';file:string;bytes:number;sha256:string;decodedSampleRate:number;decodedFrames:number;leadingFrames:number}[]};
export type NativeFieldCatalog={version:1;maps:Record<string,{day:NativeMusicCue;night:NativeMusicCue}>;storyOverrides:{map:number;flag:string;flagId:number;cue:NativeMusicCue}[];surf:NativeMusicCue;surfSuppressionFlag:string;surfSuppressionFlagId:number;nightHours:number[];tracks:Record<string,NativeFieldTrack>};
export type FieldMusicState={hour:number;flags:Record<string,boolean>;surfing?:boolean;override?:NativeMusicCue|null};
export type NativeFieldSelection={cue:NativeMusicCue;source:MusicSource};
export class UnsupportedNativeMusic extends Error{constructor(message:string){super(message);this.name='UnsupportedNativeMusic';}}
export function nativeFieldMusic(catalog:NativeFieldCatalog,map:Pick<SourceMap,'id'>,state:FieldMusicState):NativeFieldSelection{
 if(!Number.isInteger(state.hour)||state.hour<0||state.hour>23)throw RangeError('Native music requires a local RTC hour');
 const row=catalog.maps[String(map.id)];if(!row)throw new UnsupportedNativeMusic('Original map music is not catalogued: '+map.id);
 if(state.surfing&&!state.flags[catalog.surfSuppressionFlag]&&!state.flags['#'+catalog.surfSuppressionFlagId])return{cue:{...catalog.surf},source:'surf'};
 let cue=catalog.nightHours.includes(state.hour)?row.night:row.day;
 const override=catalog.storyOverrides.find(entry=>entry.map===map.id&&(state.flags[entry.flag]||state.flags['#'+entry.flagId]));if(override)cue=override.cue;
 if(state.override&&state.override.id!==0)return{cue:{...state.override},source:'other'};
 return{cue:{...cue},source:'map'};
}

export type SharedHatchTrack=NativeMusicCue&{file:string;sampleRate:number;frames:number;completionFrame:number;loopFrames:[number,number]|null;wavSHA256:string};
export type SharedMusicVoice={ended:Promise<void>;pause:()=>void;resume:()=>void;stop:(reason?:unknown)=>void};
type Voice=SharedMusicVoice&{position:()=>number;isStopped:()=>boolean};
export type SharedHatchTransport={prepare:(track:SharedHatchTrack,signal:AbortSignal)=>Promise<void>;play:(track:SharedHatchTrack,signal:AbortSignal)=>Promise<SharedMusicVoice>;dispose:()=>Promise<void>};
export type FieldMusicOptions={enabled:boolean;volume:number;loadCatalog?:(signal:AbortSignal)=>Promise<NativeFieldCatalog>;fetchBytes?:(url:string,signal:AbortSignal)=>Promise<ArrayBuffer>;createContext?:()=>AudioContext;maxDecodedTracks?:number;unlockTimeoutMs?:number;ioTimeoutMs?:number};
export type FieldPlaybackResult={status:'playing'|'locked'|'muted'|'silence';cue?:NativeMusicCue};
const ROOT='/source/music/';
const reason=(signal:AbortSignal)=>signal.reason??new Error('Native field music cancelled');
function check(signal:AbortSignal){if(signal.aborted)throw reason(signal);}
/** Observe cancellation even when a browser decoder or injected I/O ignores it.
 * The underlying promise stays handled; only its owner may publish its result.
 */
function observe<T>(work:()=>Promise<T>,signals:AbortSignal[]):Promise<T>{
 return new Promise<T>((resolve,reject)=>{
  let settled=false;const handlers=signals.map(signal=>()=>finish(false,reason(signal)));
  const finish=(success:boolean,value:unknown)=>{if(settled)return;settled=true;signals.forEach((signal,index)=>signal.removeEventListener('abort',handlers[index]));if(success)resolve(value as T);else reject(value);};
  for(let index=0;index<signals.length;index++){if(signals[index].aborted){finish(false,reason(signals[index]));return;}signals[index].addEventListener('abort',handlers[index],{once:true});}
  try{void work().then(value=>finish(true,value),error=>finish(false,error));}catch(error){finish(false,error);}
 });
}
function same(a?:NativeFieldSelection|null,b?:NativeFieldSelection|null){return!!a&&!!b&&a.cue.id===b.cue.id&&a.cue.key===b.cue.key;}
async function bytes(url:string,signal:AbortSignal){const response=await fetch(url,{signal});if(!response.ok)throw Error('Original audio could not load: '+url+' ('+response.status+')');return response.arrayBuffer();}
async function catalog(signal:AbortSignal){const response=await fetch(ROOT+'catalog.json',{signal});if(!response.ok)throw Error('Original field music catalog could not load ('+response.status+')');const result=await response.json()as NativeFieldCatalog;if(result.version!==1||!result.maps||!result.tracks)throw Error('Invalid native field music catalog');return result;}
function decodeAudio(ctx:AudioContext,data:ArrayBuffer):Promise<AudioBuffer>{return new Promise((resolve,reject)=>{const result=ctx.decodeAudioData(data,resolve,reject);if(result&&typeof result.then==='function')void result.then(resolve,reject);});}
async function digest(data:ArrayBuffer){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),value=>value.toString(16).padStart(2,'0')).join('');}
function validCue(cue:NativeMusicCue){if(!Number.isInteger(cue.id)||cue.id<0||!/^SEQ_\w+$/.test(cue.key))throw Error('Invalid original music cue');}
function validateBuffer(buffer:AudioBuffer,frames:number,rate:number,context:AudioContext){if(buffer.numberOfChannels!==2||Math.abs(buffer.duration-frames/rate)>1/rate+1/context.sampleRate)throw Error('Original audio decoded with unexpected sample timing or channels');}

/** One actual field voice/context. Constructing a player does not create audio
 * or request a song. unlock() must be invoked directly by a user gesture; its
 * Context construction/resume call occur synchronously before the first await.
 * UI, preferences, map transitions and error display belong to the host.
 */
export function createNativeFieldMusicPlayer(options:FieldMusicOptions){
 if(typeof options.enabled!=='boolean'||!Number.isFinite(options.volume)||options.volume<0||options.volume>1)throw Error('Explicit native music sound/volume preferences required');
 const limit=options.maxDecodedTracks??2;if(!Number.isInteger(limit)||limit<1||limit>4)throw Error('Native audio decoded cache must contain one to four tracks');
 const ioTimeout=options.ioTimeoutMs??4000;if(!Number.isInteger(ioTimeout)||ioTimeout<1||ioTimeout>120000)throw Error('Native audio I/O deadline must be one to 120000 milliseconds');
 const lifetime=new AbortController(),cache=new Map<number,{buffer:AudioBuffer;leadingSeconds:number}>(),allVoices=new Set<Voice>();
 let enabled=options.enabled,volume=options.volume,context:AudioContext|undefined,gain:GainNode|undefined,unlocked=false,disposed=false;
 let manifest:Promise<NativeFieldCatalog>|undefined,desired:NativeFieldSelection|null=null,current:{selection:NativeFieldSelection;identity:string;voice:Voice}|null=null;
 let serial=0,generation=0,intent=0,loading:AbortController|undefined,interrupted=false;
 let pendingPlayback:Promise<FieldPlaybackResult>|undefined;let cueSession:{preferences?:()=>Promise<void>}|undefined;
 const fetchBytes=options.fetchBytes??bytes;
 const assertOpen=()=>{if(disposed)throw Error('Native field music player is disposed');};
 const io=async<T>(work:(signal:AbortSignal)=>Promise<T>,signals:AbortSignal[],label:string):Promise<T>=>{
  const controller=new AbortController(),inputs=[...signals,lifetime.signal],handlers=inputs.map(signal=>()=>controller.abort(reason(signal)));
  for(let index=0;index<inputs.length;index++){if(inputs[index].aborted)handlers[index]();else inputs[index].addEventListener('abort',handlers[index],{once:true});}
  const timer=setTimeout(()=>controller.abort(Error('Native audio '+label+' timed out after '+ioTimeout+'ms')),ioTimeout);
  try{return await observe(()=>work(controller.signal),[controller.signal]);}finally{clearTimeout(timer);inputs.forEach((signal,index)=>signal.removeEventListener('abort',handlers[index]));}
 };
 // A caller may abandon its wait without cancelling other catalog consumers.
 // The shared request still has its own bounded lifetime and retryable failure.
 const getCatalog=async(signal?:AbortSignal)=>{assertOpen();if(signal)check(signal);if(!manifest){const pending=io(input=>(options.loadCatalog??catalog)(input),[],'catalog');manifest=pending;void pending.catch(()=>{if(manifest===pending)manifest=undefined;});}return observe(()=>manifest!,signal?[signal,lifetime.signal]:[lifetime.signal]);};
 const actualContext=()=>{assertOpen();if(!unlocked||!context||context.state!=='running'||!gain)throw Error('Tap or press a key to unlock native game sound');return context;};
 const snapshot=():EffectiveMusic=>current&&!current.voice.isStopped()?{kind:'playing',cue:{...current.selection.cue},positionSeconds:current.voice.position(),source:current.selection.source,identity:current.identity}:{kind:'none'};

 function voice(buffer:AudioBuffer,loop:[number,number]|null,rate:number,signal:AbortSignal,initial=0,leadingSeconds=0):Voice{
  const ctx=actualContext();let node:AudioBufferSourceNode|undefined,offset=initial,started=0,stopped=false,paused=false;
  let resolve!:()=>void,reject!:(error:unknown)=>void;const ended=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});void ended.catch(()=>{});
  const phase=(value:number)=>loop&&value>=loop[1]/rate?loop[0]/rate+(value-loop[0]/rate)%((loop[1]-loop[0])/rate):value;
  const position=()=>phase(offset+(!paused&&!stopped?ctx.currentTime-started:0));
  const disconnect=()=>{if(node){node.onended=null;try{node.stop();}catch{}node.disconnect();node=undefined;}};
  const stop=(error?:unknown)=>{if(stopped)return;offset=position();stopped=true;disconnect();signal.removeEventListener('abort',cancel);lifetime.signal.removeEventListener('abort',destroy);allVoices.delete(result);if(error!==undefined)reject(error);else resolve();};
  const cancel=()=>stop(reason(signal));
  const destroy=()=>stop(reason(lifetime.signal));
  const begin=()=>{check(signal);check(lifetime.signal);assertOpen();node=ctx.createBufferSource();node.buffer=buffer;node.loop=!!loop;if(loop){node.loopStart=loop[0]/rate+leadingSeconds;node.loopEnd=loop[1]/rate+leadingSeconds;}node.connect(gain!);node.onended=()=>stop();started=ctx.currentTime;node.start(0,offset+leadingSeconds);};
  const result:Voice={ended,position,isStopped:()=>stopped,pause(){if(stopped||paused)return;offset=position();paused=true;disconnect();},resume(){if(stopped||!paused)return;paused=false;begin();},stop};
  allVoices.add(result);signal.addEventListener('abort',cancel,{once:true});lifetime.signal.addEventListener('abort',destroy,{once:true});try{begin();}catch(error){stop(error);throw error;}return result;
 }

 function decodeTrack(track:NativeFieldTrack,input:AbortSignal){return io(async signal=>{
  const ctx=actualContext(),cached=cache.get(track.id);if(cached){cache.delete(track.id);cache.set(track.id,cached);return cached;}
  if(track.sampleRate!==32768||track.channels!==2||!Number.isInteger(track.frames)||track.frames!<1)throw Error('Invalid original field audio dimensions');
  const errors:unknown[]=[];
  for(const format of track.formats??[]){
   try{
    if(!/^[\w.-]+$/.test(format.file)||!/^[a-f0-9]{64}$/.test(format.sha256))throw Error('Invalid native audio resource');
    const data=await observe(()=>fetchBytes(ROOT+format.file,signal),[signal]);if(await observe(()=>digest(data),[signal])!==format.sha256)throw Error('Original field audio checksum mismatch');check(signal);
    if(format.codec!=='aac'&&format.codec!=='mp3')throw Error('Unsupported native audio compression');
    if(!Number.isInteger(format.decodedFrames)||format.decodedFrames<1||format.decodedSampleRate!==48000||!Number.isInteger(format.leadingFrames)||format.leadingFrames<0||format.leadingFrames>2048)throw Error('Invalid native encoded frame receipt');
    const decoded=await observe(()=>decodeAudio(ctx,data),[signal]);check(signal);assertOpen();
    // AAC edit-list implementations can trim final padding at the native
    // content boundary or retain the last decoded frame. Both bounded lengths
    // have explicit container/FFmpeg receipts; large priming drift rejects and
    // tries the independent MP3 gapless fallback. Browser audition is separate.
    const duration=track.frames!/track.sampleRate!,observed=format.decodedFrames/format.decodedSampleRate;
    const tolerance=1/ctx.sampleRate+1/track.sampleRate!;
    if(decoded.numberOfChannels!==2||decoded.duration<Math.min(duration,observed)-tolerance||decoded.duration>Math.max(duration,observed)+tolerance)throw Error('Native compressed audio decoder changed measured sample timing');
    const result={buffer:decoded,leadingSeconds:format.leadingFrames/format.decodedSampleRate};
    cache.set(track.id,result);while(cache.size>limit)cache.delete(cache.keys().next().value!);return result;
   }catch(error){check(signal);errors.push(error);}
  }
  throw new AggregateError(errors,'None of the original audio formats could be decoded: '+track.key);
 },[input],'preparation');}

 async function performReconcile(signal?:AbortSignal):Promise<FieldPlaybackResult>{
  assertOpen();const token=++generation;loading?.abort(new Error('Original music request replaced'));const controller=new AbortController();loading=controller;
  const cancel=()=>controller.abort(signal?reason(signal):new Error('Native music cancelled'));if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
  try{
   check(controller.signal);if(!desired){current?.voice.stop();current=null;return{status:'silence'};}
   const selection={cue:{...desired.cue},source:desired.source};validCue(selection.cue);if(current&&same(current.selection,selection))current.selection.source=selection.source;
   if(!enabled){current?.voice.pause();return{status:'muted',cue:selection.cue};}
   if(!unlocked)return{status:'locked',cue:selection.cue};
   if(interrupted)return{status:'muted',cue:selection.cue};
   if(current&&same(current.selection,selection)&&!current.voice.isStopped()){current.selection.source=selection.source;current.voice.resume();return{status:'playing',cue:selection.cue};}
   const native=await getCatalog(controller.signal);check(controller.signal);if(token!==generation)throw Error('Native music request replaced');
   const track=native.tracks[String(selection.cue.id)];if(!track||track.key!==selection.cue.key)throw new UnsupportedNativeMusic('Original audio cue not catalogued: '+selection.cue.key);
   if(track.status==='unsupported')throw new UnsupportedNativeMusic(track.key+': '+track.reason);
   if(track.status==='silence'){current?.voice.stop();current=null;return{status:'silence',cue:selection.cue};}
   const loop=track.loopFrames??null;if(loop&&(!loop.every(Number.isInteger)||loop[0]<0||loop[1]<=loop[0]||loop[1]>track.frames!))throw Error('Invalid measured native loop');
   const decoded=await decodeTrack(track,controller.signal);check(controller.signal);if(token!==generation||!same(desired,selection)||!enabled||interrupted)throw Error('Native music request replaced');
   const next=voice(decoded.buffer,loop,track.sampleRate!,lifetime.signal,0,decoded.leadingSeconds);current?.voice.stop();current={selection,identity:'native-field-'+(++serial),voice:next};return{status:'playing',cue:selection.cue};
  }catch(error){if(!controller.signal.aborted&&token===generation){current?.voice.stop();current=null;}throw error;}
  finally{signal?.removeEventListener('abort',cancel);if(loading===controller)loading=undefined;}
 }

 function reconcile(signal?:AbortSignal){const pending=performReconcile(signal);pendingPlayback=pending;void pending.finally(()=>{if(pendingPlayback===pending)pendingPlayback=undefined;}).catch(()=>{});return pending;}
 const field={
  capture:snapshot,
  async suspend(_expected:EffectiveMusic){assertOpen();loading?.abort(new Error('Field music interrupted'));generation++;current?.voice.pause();interrupted=true;return snapshot();},
  async restore(saved:EffectiveMusic,signal?:AbortSignal){
   assertOpen();if(signal)check(signal);if(!interrupted)return;interrupted=false;
   // Map/recovery ownership may deliberately request a different actual cue
   // while suspended. Never resurrect an old voice over that newer intent.
   if(saved.kind==='playing'&&current?.identity===saved.identity&&same(current.selection,desired)){if(enabled)current.voice.resume();return;}
   const pending=reconcile(signal),ownedGeneration=generation;try{await pending;}catch(error){if(generation===ownedGeneration){interrupted=true;throw error;}/* Newer playback intent now owns its own result. */}
  },
 };

 const player={
  field,
  /** Small source catalog only; no Context or song download. */
  catalog:getCatalog,
  /** Context permission is separate from successful song loading. */
  isUnlocked:()=>!disposed&&unlocked&&context?.state==='running',
  async unlock():Promise<void>{
   assertOpen();
   // This entire construction/resume invocation runs in the gesture stack.
   if(!context){context=(options.createContext??(()=>{const Constructor=globalThis.AudioContext??(globalThis as unknown as{webkitAudioContext:typeof AudioContext}).webkitAudioContext;if(!Constructor)throw Error('Native music requires WebAudio');return new Constructor();}))();gain=context.createGain();gain.gain.value=enabled?volume:0;gain.connect(context.destination);}
   const ctx=context;const resumed=ctx.resume();
   let timer:ReturnType<typeof setTimeout>|undefined,cancel!:()=>void;
   try{await Promise.race([resumed,new Promise<never>((_yes,no)=>{cancel=()=>no(reason(lifetime.signal));lifetime.signal.addEventListener('abort',cancel,{once:true});timer=setTimeout(()=>no(Error('Tap again to allow original game music')),options.unlockTimeoutMs??2000);})]);assertOpen();if(ctx.state!=='running')throw Error('Native music was not allowed to start');unlocked=true;if(cueSession?.preferences)await cueSession.preferences();await(pendingPlayback??reconcile());}
   finally{clearTimeout(timer);lifetime.signal.removeEventListener('abort',cancel);}
  },
  async playMap(map:Pick<SourceMap,'id'>,state:FieldMusicState,signal?:AbortSignal){assertOpen();if(signal)check(signal);const request=++intent,id=map.id,inputs=structuredClone(state),native=await getCatalog(signal);if(signal)check(signal);if(request!==intent)throw Error('Native music map intent replaced');try{desired=nativeFieldMusic(native,{id},inputs);}catch(error){desired=null;await reconcile(signal);throw error;}return reconcile(signal);},
  async playCue(cue:NativeMusicCue,source:MusicSource='other',signal?:AbortSignal){assertOpen();if(signal)check(signal);validCue(cue);intent++;desired={cue:{...cue},source};return reconcile(signal);},
  async setPreferences(preferences:{enabled:boolean;volume:number}){assertOpen();if(typeof preferences.enabled!=='boolean'||!Number.isFinite(preferences.volume)||preferences.volume<0||preferences.volume>1)throw Error('Invalid native music preferences');const changed=enabled!==preferences.enabled;enabled=preferences.enabled;volume=preferences.volume;if(gain)gain.gain.value=enabled?volume:0;if(cueSession?.preferences)await cueSession.preferences();if(!changed&&pendingPlayback)return pendingPlayback;return reconcile();},
  capture:snapshot,
  /** A non-field native cue (e.g. battle) with an owned interruption. */
  createCueSession(){
   assertOpen();const owner:{preferences?:()=>Promise<void>}={},abort=new AbortController();
   let saved:EffectiveMusic|undefined,owned:Voice|undefined,track:NativeFieldTrack|undefined;
   let started=false,closed=false,restored=false,restoring:Promise<void>|undefined,preparing:Promise<void>|undefined;
   let detach=()=>{};
   const update=async()=>{
    if(closed||abort.signal.aborted||!saved||!track||!unlocked||context?.state!=='running')return;
    if(!enabled){owned?.pause();return;}
    if(owned&&!owned.isStopped()){owned.resume();return;}
    if(track.status==='silence')return;
    if(preparing)return preparing;
    const pending=(async()=>{
     const decoded=await decodeTrack(track!,abort.signal);check(abort.signal);check(lifetime.signal);assertOpen();
     if(closed)return;owned=voice(decoded.buffer,track!.loopFrames??null,track!.sampleRate!,abort.signal,0,decoded.leadingSeconds);if(!enabled)owned.pause();
    })();preparing=pending;try{await pending;}finally{if(preparing===pending)preparing=undefined;}
   };
   owner.preferences=update;
   return{
    async start(cue:NativeMusicCue,signal:AbortSignal){
     assertOpen();check(signal);if(started||closed)throw Error('Native cue session already started or closed');if(interrupted||cueSession)throw Error('Another native music interruption is active');started=true;cueSession=owner;
     const cancel=()=>abort.abort(reason(signal)),destroy=()=>abort.abort(reason(lifetime.signal));
     signal.addEventListener('abort',cancel,{once:true});lifetime.signal.addEventListener('abort',destroy,{once:true});detach=()=>{signal.removeEventListener('abort',cancel);lifetime.signal.removeEventListener('abort',destroy);};
     try{
      validCue(cue);const native=await getCatalog(abort.signal);check(signal);check(abort.signal);track=native.tracks[String(cue.id)];if(!track||track.key!==cue.key||track.status==='unsupported')throw new UnsupportedNativeMusic('Original session cue is not exported: '+cue.key);
      const loop=track.loopFrames;if(loop&&(!loop.every(Number.isInteger)||loop[0]<0||loop[1]<=loop[0]||loop[1]>track.frames!))throw Error('Invalid measured native session loop');
      // Prepare while field music still plays; interruption snapshots actual
      // phase after this latency. Muted encounters request no song bytes.
      if(enabled&&unlocked&&track.status==='ready')await decodeTrack(track,abort.signal);
      check(signal);check(abort.signal);assertOpen();if(closed)throw Error('Native cue session closed');const paused=field.suspend(snapshot());saved=snapshot();await paused;check(abort.signal);if(closed)throw Error('Native cue session restored');await update();
     }catch(error){detach();if(cueSession===owner)cueSession=undefined;throw error;}
    },
    restore(signal?:AbortSignal){
     if(restored)return Promise.resolve();if(restoring)return observe(()=>restoring!,signal?[signal]:[]);closed=true;detach();abort.abort(Error('Native cue session restored'));owned?.stop();
     const pending=(async()=>{if(signal)check(signal);if(saved)await field.restore(saved,signal);restored=true;if(cueSession===owner)cueSession=undefined;})();restoring=pending;void pending.catch(()=>{if(restoring===pending)restoring=undefined;});return pending;
    },
   };
  },
  createHatchTransport():SharedHatchTransport{
   assertOpen();const buffers=new Map<number,AudioBuffer>(),voices=new Set<Voice>(),owner=new AbortController();let closed=false;
   const prepare=(track:SharedHatchTrack,input:AbortSignal)=>io(async signal=>{check(signal);actualContext();if(closed)throw Error('Shared native hatch transport disposed');const previous=buffers.get(track.id);if(previous)return previous;
    if(!/^[\w.-]+\.wav$/.test(track.file))throw Error('Invalid original hatch resource');
    const data=await observe(()=>fetchBytes('/source/hatching/music/'+track.file,signal),[signal]);if(await observe(()=>digest(data),[signal])!==track.wavSHA256)throw Error('Original hatch audio checksum mismatch');const result=await observe(()=>decodeAudio(actualContext(),data),[signal]);check(signal);validateBuffer(result,track.frames,track.sampleRate,actualContext());buffers.set(track.id,result);return result;},[input,owner.signal],'hatch preparation');
   return{async prepare(track,signal){await prepare(track,signal);},async play(track,signal){const buffer=await prepare(track,signal);check(signal);check(owner.signal);const result=voice(buffer,track.loopFrames,track.sampleRate,signal);voices.add(result);void result.ended.finally(()=>voices.delete(result)).catch(()=>{});return result;},async dispose(){if(closed)return;closed=true;owner.abort(Error('Shared hatch audio disposed'));for(const item of voices)item.stop();voices.clear();buffers.clear();}};
  },
  async dispose(){if(disposed)return;disposed=true;generation++;intent++;loading?.abort(Error('Native field music disposed'));lifetime.abort(Error('Native field music disposed'));for(const item of[...allVoices])item.stop(Error('Native field music disposed'));current=null;cache.clear();gain?.disconnect();if(context&&context.state!=='closed')await context.close();},
 };
 return player;
}
export type NativeFieldMusicPlayer=ReturnType<typeof createNativeFieldMusicPlayer>;
