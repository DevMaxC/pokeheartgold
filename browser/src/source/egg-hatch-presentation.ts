import {hatchFirstReadyEgg,type EggHatchScene} from './egg-hatching.ts';
import type {GameData,SourceMap,State} from './types.ts';

export type HatchMusicCue=EggHatchScene['audio']['hatchMusic']|EggHatchScene['audio']['fanfare'];
export type HatchMusicSession={start:(cue:HatchMusicCue,signal:AbortSignal)=>Promise<void>;fanfare:(cue:HatchMusicCue,signal:AbortSignal)=>Promise<void>;restore:()=>Promise<void>};
type HatchFieldView={reveal:(scene:EggHatchScene)=>Promise<void>;cry:(scene:EggHatchScene)=>Promise<void>;finish:()=>Promise<void>;cancel:(reason?:unknown)=>void};
export type EggHatchHost={
 view:(signal:AbortSignal)=>HatchFieldView;
 music:HatchMusicSession;
 message:(text:string,signal:AbortSignal)=>Promise<()=>void>;
 choose:(text:string,options:string[],signal:AbortSignal)=>Promise<number>;
 nickname:(scene:EggHatchScene,signal:AbortSignal)=>Promise<string|null>;
 resumeField:()=>Promise<void>;
 now?:()=>Date;
};

/** One owned presentation joins cry and text, cancels both on any failure and
 * restores the effective field music before releasing source-action control.
 * The caller's source transaction also owns the preceding step and std2021.
 */
export async function presentNativeEggHatch(data:GameData,state:State,map:SourceMap,host:EggHatchHost){
 const controller=new AbortController(),signal=controller.signal;
 const view=host.view(signal);let failed=false,cause:unknown,restored=false,closeText:(()=>void)|undefined;
 const stop=(error:unknown)=>{if(!failed){failed=true;cause=error;controller.abort(error);view.cancel(error);}};
 const guarded=<T>(action:()=>Promise<T>)=>async()=>{try{if(signal.aborted)throw signal.reason;const value=await action();if(signal.aborted)throw signal.reason;return value;}catch(error){stop(error);throw error;}};
 const restore=async()=>{if(!restored){await host.music.restore();restored=true;}};
 try{
  return await hatchFirstReadyEgg(data,state,{map,now:host.now},{
   reveal:scene=>guarded(async()=>{await host.music.start(scene.audio.hatchMusic,signal);await view.reveal(scene);})(),
   cry:scene=>guarded(()=>view.cry(scene))(),
   announce:(scene,cryComplete)=>guarded(async()=>{
    // The first text appears alongside the cry. A failed cry aborts a pending
    // message; failed text aborts playback. Both are joined by the lifecycle.
    const printed=guarded(async()=>{closeText=await host.message(scene.messages.hatched,signal);})();
    // Observe text failure immediately while the native cry/fanfare runs.
    // Case8 starts fanfare after cry; case10 waits for the printer afterward.
    void printed.catch(()=>{});
    try{
     await cryComplete;
     await host.music.fanfare(scene.audio.fanfare,signal);
     await printed;closeText?.();closeText=undefined;
     const answer=await host.choose(scene.messages.nickname,[scene.messages.yes,scene.messages.no],signal);
     if(answer!==0&&answer!==1)throw Error('Native hatch nickname choice was not resolved');return answer===0;
    }catch(error){stop(error);await Promise.allSettled([printed]);throw error;}
   })(),
   nickname:scene=>guarded(()=>host.nickname(scene,signal))(),
   resumeField:()=>guarded(async()=>{await view.finish();await restore();await host.resumeField();})(),
  });
 }catch(error){stop(error);throw error;}
 finally{
  // No pending source-owned UI or media may survive into a Retry prompt.
  if(!signal.aborted)controller.abort(new Error('Egg hatch presentation finished'));
  closeText?.();closeText=undefined;
  view.cancel(cause);
  try{await restore();}catch(error){if(failed&&error!==cause)throw new AggregateError([cause,error],'Egg hatch and field music restoration failed');throw error;}
 }
}
