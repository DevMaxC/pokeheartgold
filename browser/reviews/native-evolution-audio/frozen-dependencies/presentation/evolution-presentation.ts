import type {BattleEvolutionScene,BattleEvolutionCallbacks,BattleEvolutionScenePort,EvolutionCongratulations} from './battle-evolution-types.ts';
import {WorldEvolutionView,evolutionArtPath} from './evolution-view.ts';

export type EvolutionSharedOutput={readonly context:AudioContext;readonly output:AudioNode;readonly signal:AbortSignal};
export type EvolutionAudioSession={
 /** Prepare under an owned signal before any native playback command. */
 prepare:(signal:AbortSignal)=>Promise<void>;
 /** All voices must borrow the supplied master output, including cries/SE. */
 bgm:(id:1011)=>void;stopBGM:(id:1011)=>void;
 cry:(species:number,form:number)=>void;cryPlaying:()=>boolean;
 se:(id:1510|1528|1529|1530|1531)=>void;anySEPlaying:()=>boolean;
 /** Native poll includes completion cleanup/background unpause, not just a flag. */
 fanfare:(id:1184|1188)=>void;fanfarePlaying:()=>boolean;
 /** Synchronously stop this scene's voices. Never stop a newer owner's audio. */
 cancel:(reason?:unknown)=>void;
 /** Bounded, retryable borrowed-field restoration; retain failed cleanup at host. */
 restore:(signal:AbortSignal)=>Promise<void>;
};
export type EvolutionPrinter={done:Promise<void>;clear:()=>void};
export type EvolutionPresentationPorts={
 view:WorldEvolutionView;
 /** One awaited native scene task frame. No wall-time completion substitute. */
 nextFrame:(signal:AbortSignal)=>Promise<void>;
 /** Edge-triggered B. Poll only in OSCILLATE; held/earlier B is not queued. */
 takeBCancel:()=>boolean;
 enabled:()=>boolean;
 sharedOutput:()=>EvolutionSharedOutput;
 /** Synchronous ownership handle, so even hung preparation can be cancelled. */
 audio:{open:(scene:BattleEvolutionScene,output:()=>EvolutionSharedOutput|null,signal:AbortSignal)=>EvolutionAudioSession};
 /** Preserve failed/aborted field-restoration ownership for an explicit host retry. */
 retainRestore:(retry:(signal:AbortSignal)=>Promise<void>)=>void;
 /** Honor original page waits; add no final acknowledgement. Native WAIT glyph callback. */
 print:(bank:197,id:916|917|918|919,operands:readonly string[],callback:(glyph:number)=>boolean,signal:AbortSignal)=>EvolutionPrinter;
 /** Watchdog for a technical cleanup failure, not a native scene duration. */
 cleanupTimeoutMs?:number;
 preparationTimeoutMs?:number;
};
const error=(reason?:unknown)=>reason instanceof Error?reason:new DOMException('Evolution presentation interrupted','AbortError');
const check=(signal:AbortSignal)=>{if(signal.aborted)throw error(signal.reason);};
const reservedWorlds=new WeakSet<object>();

/**
 * Native semantic checkpoints from evolution_scene.c, flags3. Rendering is an
 * explicit field3D adaptation: the view owns real paper/particle completion.
 * Gameplay, move learning and post-evolution effects stay in callbacks.
 */
export function createEvolutionPresentation(ports:EvolutionPresentationPorts):BattleEvolutionScenePort{
 let owned=false;
 return async(scene:BattleEvolutionScene,callbacks:BattleEvolutionCallbacks,outer?:AbortSignal)=>{
  const world=ports.view.world;
  if(owned||reservedWorlds.has(world)||ports.view.active||world.fieldEffect?.active||world.battleStage?.active)throw Error('An evolution or field presentation is already owned');
  if(scene.flags!==3)throw Error('This native battle evolution presentation requires flags3');
  evolutionArtPath(scene.before);evolutionArtPath(scene.after);
  if(scene.before.species===scene.after.species||scene.before.isEgg||scene.after.isEgg)throw Error('Evolution requires different non-Egg species');
  const timeout=ports.cleanupTimeoutMs??1500,prepareTimeout=ports.preparationTimeoutMs??4000;if(!Number.isFinite(timeout)||timeout<=0||!Number.isFinite(prepareTimeout)||prepareTimeout<=0)throw Error('Invalid evolution resource watchdog');
  const controller=new AbortController(),signal=controller.signal,abort=()=>controller.abort(outer?.reason);if(outer?.aborted)abort();check(signal);outer?.addEventListener('abort',abort,{once:true});owned=true;reservedWorlds.add(world);
  let audio:EvolutionAudioSession|undefined,primary:unknown,result:'evolved'|'cancelled'|undefined,printer:EvolutionPrinter|undefined,viewOwner:symbol|undefined;
  const clear=()=>{const previous=printer;printer=undefined;previous?.clear();};
  const prepare=(promise:Promise<void>)=>new Promise<void>((resolve,reject)=>{const finish=()=>{clearTimeout(timer);signal.removeEventListener('abort',stopped);},stopped=()=>{finish();reject(error(signal.reason));},timer=setTimeout(()=>{const failure=Error('Evolution borrowed audio preparation timed out');controller.abort(failure);},prepareTimeout);signal.addEventListener('abort',stopped,{once:true});promise.then(()=>{finish();if(signal.aborted)reject(error(signal.reason));else resolve();},cause=>{finish();reject(cause);});if(signal.aborted)stopped();});
  const guard=()=>{check(signal);if(!viewOwner)throw Error('Evolution lost its live field presentation');ports.view.assertOwned(viewOwner);};
  const admittedFrame=(promise:Promise<void>)=>new Promise<void>((resolve,reject)=>{const finish=()=>signal.removeEventListener('abort',stopped),stopped=()=>{finish();reject(error(signal.reason));};signal.addEventListener('abort',stopped,{once:true});promise.then(()=>{finish();if(signal.aborted)reject(error(signal.reason));else resolve();},cause=>{finish();reject(cause);});if(signal.aborted)stopped();});
  const frame=async()=>{guard();await admittedFrame(ports.nextFrame(signal));guard();ports.view.tick();};
  const frames=async(count:number)=>{for(let i=0;i<count;i++)await frame();};
  const until=async(done:()=>boolean)=>{while(!done())await frame();guard();};
  const glyph=(id:number)=>{guard();switch(id){case 1:return audio!.anySEPlaying();case 2:return audio!.fanfarePlaying();case 3:audio!.fanfare(1188);return false;case 4:audio!.se(1510);return false;case 5:audio!.fanfare(1184);return false;default:throw Error(`Unsupported native evolution text callback ${id}`);}};
  const print=async(id:916|917|918|919,operands:readonly string[])=>{guard();clear();printer=ports.print(197,id,operands,glyph,signal);let done=false,failed=false,failure:unknown;void printer.done.then(()=>{done=true;},cause=>{failure=cause;failed=true;done=true;});await until(()=>done);if(failed)throw failure instanceof Error?failure:new Error('Native evolution printer failed',{cause:failure});};
  const cry=async(which:'old'|'new')=>{guard();const mon=which==='old'?scene.before:scene.after;ports.view.startPose(which);audio!.cry(mon.species,scene.before.form??0);await until(()=>!audio!.cryPlaying()&&!ports.view.poseActive);};
  const white=async(from:number,to:number)=>{ports.view.fade(0xffffff,from,to);await until(()=>!ports.view.paletteActive);};
  const close=async()=>{ports.view.setPhase('closing');ports.view.fade(0,0,16);await until(()=>!ports.view.paletteActive);ports.view.beginReturn();await until(()=>ports.view.cameraReturned);ports.view.complete();};
  try{
   // open owns source audio admission; its callback is live and never unlocks.
   audio=ports.audio.open(scene,()=>ports.enabled()?ports.sharedOutput():null,signal);await prepare(audio.prepare(signal));check(signal);
   await ports.view.begin(scene,signal);viewOwner=ports.view.owner!;await frames(2);
   await print(916,[]);
   ports.view.setPhase('old-cry');ports.view.startPose('old');audio.cry(scene.before.species,scene.before.form??0);
   await print(917,[scene.before.name]);await until(()=>!audio!.cryPlaying()&&!ports.view.poseActive);
   audio.bgm(1011);ports.view.setPhase('gather');await frames(20);
   ports.view.setPhase('narrow');ports.view.fade(0xffffff,0,16);audio.se(1528);await frames(40);
   ports.view.setPhase('oscillate');audio.se(1529);
   let cancelled=false;
   // B is checked before particle completion, exactly as the native task does.
   do{await frame();if(ports.takeBCancel()){cancelled=true;break;}}while(ports.view.particlesActive);
   if(cancelled){
    ports.view.setPhase('cancel');await white(16,16);audio.stopBGM(1011);await white(16,0);
    ports.view.setPhase('cancel-cry');await cry('old');await print(919,[scene.before.name]);await frames(20);await close();result='cancelled';
   }else{
    ports.view.setPhase('widen');ports.view.fade(0xffffff,16,16);audio.se(1530);await until(()=>!ports.view.paletteActive);await frames(8);
    ports.view.setPhase('reveal');ports.view.fade(0xffffff,16,0);audio.se(1531);await until(()=>!ports.view.paletteActive&&!ports.view.particlesActive);
    ports.view.setPhase('new-cry');await cry('new');guard();const congratulations:EvolutionCongratulations=callbacks.evolve();guard();
    ports.view.setPhase('congratulations');await print(918,[congratulations.nickname,congratulations.speciesName]);await frames(40);guard();callbacks.register();guard();
    ports.view.setPhase('learning');clear();
    // The logical controller links its native menu tasks to this same signal
    // and drains them before rollback. Never race/detach a mutating callback.
    await callbacks.learnMoves();guard();await close();check(signal);callbacks.finish();result='evolved';
   }
  }catch(cause){primary=cause;}
  finally{
   try{
   outer?.removeEventListener('abort',abort);controller.abort(primary??new DOMException('Evolution scene completed','AbortError'));
   try{clear();}catch(cause){primary??=cause;}
   if(viewOwner&&ports.view.owner===viewOwner)try{ports.view.cancel(primary??Error('Evolution scene cleanup'));}catch(cause){primary??=cause;}
   if(audio){try{audio.cancel(primary);}catch(cause){primary??=cause;}
    const cleanup=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
    try{await Promise.race([audio.restore(cleanup.signal),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{const failure=Error('Evolution borrowed audio restoration timed out');cleanup.abort(failure);reject(failure);},timeout);})]);}catch(cause){primary??=cause;try{ports.retainRestore(retrySignal=>audio!.restore(retrySignal));}catch(retainFailure){primary=new AggregateError([primary,retainFailure],'Evolution failed to retain borrowed audio ownership');}}finally{if(timer)clearTimeout(timer);cleanup.abort(new DOMException('Evolution cleanup completed','AbortError'));}
   }
   }finally{owned=false;reservedWorlds.delete(world);}
  }
  if(primary!==undefined)throw primary;if(outer?.aborted)throw error(outer.reason);if(!result)throw Error('Evolution scene ended without a native outcome');return result;
 };
}
