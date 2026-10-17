/** The two original SSEQ/sample-backed hatch cues, exported offline. No MIDI,
 * substitute instruments, synthesized replacement tune or global field player.
 * Source: hatch_egg_app.c629/656–688; sound_playback.c726–775. */
export type HatchMusicCue={id:number;key:string};
export type HatchMusicSession={start:(cue:HatchMusicCue,signal:AbortSignal)=>Promise<void>;fanfare:(cue:HatchMusicCue,signal:AbortSignal)=>Promise<void>;restore:()=>Promise<void>};
export type EffectiveFieldMusic={kind:'none'}|{kind:'playing';cue:HatchMusicCue;positionSeconds:number;source:'map'|'surf'|'radio'|'other';identity:string};
/** A future field player supplies its ACTUAL effective voice/override snapshot.
 * This module never guesses map music. Native FieldBGM_GetEffective first
 * checks Surf/flag99A, then day/night+story music and the saved override;
 * the separate radio player must also be captured by its real owner. */
export type EffectiveFieldMusicPort={capture:()=>EffectiveFieldMusic;suspend:(snapshot:EffectiveFieldMusic)=>Promise<void>;restore:(snapshot:EffectiveFieldMusic)=>Promise<void>};
export type NativeHatchTrack={id:number;key:string;file:string;sampleRate:number;frames:number;completionFrame:number;loopFrames:[number,number]|null;wavSHA256:string};
export type NativeHatchMusicManifest={tracks:Record<string,NativeHatchTrack>};
export type NativeMusicVoice={ended:Promise<void>;pause:()=>void;resume:()=>void;stop:(reason?:unknown)=>void};
export type NativeMusicTransport={play:(asset:NativeHatchTrack,signal:AbortSignal)=>Promise<NativeMusicVoice>;dispose:()=>Promise<void>};
export type HatchMusicOptions={enabled:boolean;field?:EffectiveFieldMusicPort;loadManifest?:(signal:AbortSignal)=>Promise<NativeHatchMusicManifest>;transport?:NativeMusicTransport;wait?:(milliseconds:number,signal:AbortSignal)=>Promise<void>};
const ROOT='/source/hatching/music/';
const abortReason=(signal:AbortSignal)=>signal.reason??new Error('Native hatch audio cancelled');
const check=(signal:AbortSignal)=>{if(signal.aborted)throw abortReason(signal);};
function wait(milliseconds:number,signal:AbortSignal){return new Promise<void>((resolve,reject)=>{
 check(signal);const cancel=()=>{clearTimeout(timer);reject(abortReason(signal));},timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},milliseconds);signal.addEventListener('abort',cancel,{once:true});
});}
async function loadManifest(signal:AbortSignal){const response=await fetch(ROOT+'manifest.json',{signal});if(!response.ok)throw Error('Original hatch music manifest could not load ('+response.status+')');return response.json()as Promise<NativeHatchMusicManifest>;}
async function resumeAudioContext(context:AudioContext,signal:AbortSignal){
 if(context.state!=='suspended')return;
 // Some autoplay policies leave resume pending until another user gesture.
 // Reject explicitly instead of trapping the complete source action forever.
 let cancel!:()=>void,timer:ReturnType<typeof setTimeout>|undefined;
 try{await new Promise<void>((resolve,reject)=>{cancel=()=>reject(abortReason(signal));signal.addEventListener('abort',cancel,{once:true});timer=setTimeout(()=>reject(Error('Native hatch audio could not start; enable sound from a user interaction')),2000);context.resume().then(resolve,reject);});}
 finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);}
}
function track(manifest:NativeHatchMusicManifest,cue:HatchMusicCue,id:number,key:string){
 if(cue.id!==id||cue.key!==key)throw Error('Native hatch audio cue is not exported: '+cue.key+'/'+cue.id);
 const entry=manifest.tracks?.[String(id)];
 if(!entry||entry.id!==id||entry.key!==key||entry.file!==id+'-'+key+'.wav'||entry.sampleRate!==32768||!Number.isInteger(entry.frames)||entry.frames<1||!Number.isInteger(entry.completionFrame)||entry.completionFrame<entry.frames||!/^[a-f0-9]{64}$/.test(entry.wavSHA256))throw Error('Invalid original hatch audio manifest entry: '+key);
 if(id===1011){const loop=entry.loopFrames;if(!loop||!loop.every(Number.isInteger)||loop[0]<0||loop[0]>=loop[1]||loop[1]>entry.frames)throw Error('Original hatch music has no valid native loop');}
 else if(entry.loopFrames!==null)throw Error('Original hatch fanfare must end');return entry;
}

/** WebAudio preserves the source WAV's measured loop segment. Pausing a cue
 * retains its actual mixed-sample phase; restarting creates a new source node
 * at that offset, rather than restarting the intro. Context is session-owned. */
export function createWebAudioHatchTransport():NativeMusicTransport{
 let context:AudioContext|undefined,closed=false;const voices=new Set<NativeMusicVoice>();
 return{
  async play(asset,signal){
   check(signal);if(closed)throw Error('Native hatch audio transport is closed');
   const AudioContextClass=globalThis.AudioContext;if(!AudioContextClass)throw Error('Native hatch music requires WebAudio');
   context??=new AudioContextClass();const audioContext=context;
   await resumeAudioContext(audioContext,signal);check(signal);
   if(audioContext.state!=='running')throw Error('Native hatch audio playback was not allowed to start');
   const response=await fetch(ROOT+asset.file,{signal});if(!response.ok)throw Error('Original hatch audio could not load: '+asset.file+' ('+response.status+')');
   const bytes=await response.arrayBuffer();check(signal);
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');check(signal);
   if(digest!==asset.wavSHA256)throw Error('Original hatch audio checksum mismatch: '+asset.file);
   const buffer=await audioContext.decodeAudioData(bytes);check(signal);
   if(closed)throw Error('Native hatch audio transport closed during loading');
   if(buffer.numberOfChannels!==2||Math.abs(buffer.duration-asset.frames/asset.sampleRate)>1/asset.sampleRate+1/audioContext.sampleRate)throw Error('Original hatch audio decoded with unexpected duration/channels');
   let source:AudioBufferSourceNode|undefined,offset=0,startedAt=0,done=false,paused=false;
   let resolve!:()=>void,reject!:(reason:unknown)=>void;const ended=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});
   // BGM is not directly awaited. Observe cancellation without hiding it from
   // a fanfare's caller, which awaits this same promise.
   void ended.catch(()=>{});
   const disconnect=()=>{if(source){source.onended=null;try{source.stop();}catch{}source.disconnect();source=undefined;}};
   const position=()=>{let value=offset+audioContext.currentTime-startedAt;const loop=asset.loopFrames;if(loop&&value>=loop[1]/asset.sampleRate)value=loop[0]/asset.sampleRate+(value-loop[0]/asset.sampleRate)%((loop[1]-loop[0])/asset.sampleRate);return value;};
   const complete=(error?:unknown)=>{if(done)return;done=true;disconnect();signal.removeEventListener('abort',cancel);voices.delete(voice);if(error!==undefined)reject(error);else resolve();};
   const cancel=()=>complete(abortReason(signal));
   const begin=()=>{check(signal);source=audioContext.createBufferSource();source.buffer=buffer;source.loop=!!asset.loopFrames;if(asset.loopFrames){source.loopStart=asset.loopFrames[0]/asset.sampleRate;source.loopEnd=asset.loopFrames[1]/asset.sampleRate;}source.connect(audioContext.destination);source.onended=()=>complete();startedAt=audioContext.currentTime;source.start(0,offset);};
   const voice:NativeMusicVoice={ended,pause(){if(done||paused)return;offset=position();paused=true;disconnect();},resume(){if(done||!paused)return;paused=false;begin();},stop:complete};
   voices.add(voice);signal.addEventListener('abort',cancel,{once:true});try{begin();}catch(error){complete(error);throw error;}return voice;
  },
  async dispose(){closed=true;for(const voice of[...voices])voice.stop();if(context&&context.state!=='closed')await context.close();},
 };
}

/** One source-action-owned session. Enabled audio never silently falls back
 * to mute. restore is independent of the aborted hatch signal, waits for all
 * owned loads/voices, and can retry a failed effective-field restoration. */
export function createNativeHatchMusicSession(options:HatchMusicOptions):HatchMusicSession{
 if(typeof options.enabled!=='boolean')throw Error('Native hatch audio requires an explicit sound option');
 if(!options.enabled)return{start:async(_cue,signal)=>check(signal),fanfare:async(_cue,signal)=>check(signal),restore:async()=>{}};
 const snapshot=structuredClone(options.field?.capture()??{kind:'none'}as EffectiveFieldMusic);
 if(snapshot.kind!=='none'&&(snapshot.kind!=='playing'||!Number.isFinite(snapshot.positionSeconds)||snapshot.positionSeconds<0||!snapshot.identity))throw Error('Invalid actual effective field music snapshot');
 const controller=new AbortController(),pending=new Set<Promise<unknown>>(),transport=options.transport??createWebAudioHatchTransport();
 let background:NativeMusicVoice|undefined,foreground:NativeMusicVoice|undefined,started=false,fanfareStarted=false,closed=false,restored=false,suspended=false;
 let restorePromise:Promise<void>|undefined,external:AbortSignal|undefined,externalCancel:(()=>void)|undefined;
 const cancel=()=>{const reason=abortReason(controller.signal);background?.stop(reason);foreground?.stop(reason);};controller.signal.addEventListener('abort',cancel,{once:true});
 const own=<T>(action:()=>Promise<T>)=>{const task=action();pending.add(task);void task.then(()=>pending.delete(task),()=>pending.delete(task));return task;};
 const bind=(signal:AbortSignal)=>{check(signal);if(external&&external!==signal)throw Error('Native hatch music session cannot change its owning signal');if(!external){external=signal;externalCancel=()=>controller.abort(abortReason(signal));signal.addEventListener('abort',externalCancel,{once:true});}check(controller.signal);};
 let manifest:Promise<NativeHatchMusicManifest>|undefined;const getManifest=()=>manifest??=(options.loadManifest??loadManifest)(controller.signal);
 const session:HatchMusicSession={
  start(cue,signal){return own(async()=>{
   if(closed||started)throw Error('Native hatch music session already started or restored');bind(signal);started=true;
   const asset=track(await getManifest(),cue,1011,'SEQ_GS_SHINKA');check(controller.signal);
   if(snapshot.kind==='playing'){suspended=true;await options.field!.suspend(structuredClone(snapshot));check(controller.signal);}
   try{background=await transport.play(asset,controller.signal);check(controller.signal);}catch(error){background?.stop(error);throw error;}
  });},
  fanfare(cue,signal){return own(async()=>{
   if(closed||!background||fanfareStarted)throw Error('Native hatch fanfare requires its active hatch session');bind(signal);fanfareStarted=true;
   const asset=track(await getManifest(),cue,1188,'SEQ_ME_SHINKAOME');check(controller.signal);background.pause();
   try{foreground=await transport.play(asset,controller.signal);await foreground.ended;check(controller.signal);
    await(options.wait??wait)((asset.completionFrame-asset.frames)/asset.sampleRate*1000,controller.signal);check(controller.signal);
   }finally{foreground?.stop();foreground=undefined;if(!closed&&!controller.signal.aborted)background.resume();}
  });},
  restore(){
   if(restored)return Promise.resolve();if(restorePromise)return restorePromise;closed=true;
   if(!controller.signal.aborted)controller.abort(new Error('Native hatch music session restored'));
   restorePromise=(async()=>{await Promise.allSettled([...pending]);await transport.dispose();if(suspended)await options.field!.restore(structuredClone(snapshot));restored=true;
   })().finally(()=>{if(external&&externalCancel)external.removeEventListener('abort',externalCancel);restorePromise=undefined;});return restorePromise;
  },
 };return session;
}
