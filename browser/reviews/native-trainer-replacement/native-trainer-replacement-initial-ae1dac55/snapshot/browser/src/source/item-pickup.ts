import type {FieldObjects} from './objects.ts';
import type {SourceMap,State} from './types.ts';

export const isItemBallStandard=(id:number)=>Number.isInteger(id)&&id>=7000&&id<=7255;
/** Four source pickups have local scripts (Lake of Rage/Mt. Moon Square).
 * Admit the live item event, not only its7000+ standard range. Oak's three
 * script0 starter display balls are not collectible item events. */
export function isItemBallObject(map:Pick<SourceMap,'events'>,object:string){const event=map.events.objects.find(row=>row.id===object);return !!event&&event.spriteId==='SPRITE_MONSTARBALL'&&event.scriptId!==0&&event.scriptId!=='0';}
/** Root owns admission/input/save locking around the complete item-ball
 * source action.0141, its fanfare and the four local pickup branches do not
 * warp or create/move other objects (their reachable source closure is tested).
 * Capture live actors, including explicit shown overrides and facing, instead
 * of assuming a State flag rollback alone reverses HidePerson/FacePlayer.
 * This is item-only recovery, not a world/UI/camera transaction. */
export async function runItemBallPickup<T>(state:State,objects:Pick<FieldObjects,'save'|'restore'>,action:()=>Promise<T>,refresh:()=>Promise<void>){
 const saved=structuredClone(state),actors=structuredClone(objects.save(state.map));
 try{return await action();}
 catch(error){
  const restored=structuredClone(saved);restored.playSeconds=Math.max(restored.playSeconds,state.playSeconds);
  for(const key of Object.keys(state))if(!Object.hasOwn(restored,key))delete(state as unknown as Record<string,unknown>)[key];Object.assign(state,restored);
  objects.restore(state.map,actors);
  try{await refresh();}catch(recoveryError){throw new AggregateError([error,recoveryError],'Item pickup failed and its actors could not be refreshed',{cause:error});}
  throw error;
 }
}
