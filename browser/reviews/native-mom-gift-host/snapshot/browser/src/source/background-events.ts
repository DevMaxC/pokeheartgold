import type {SourceMap,Trigger} from './types.ts';

/** src/field_interaction.c:128. These values describe the permitted player
 * direction, not a world-space rotation of the sign's artwork. */
export function backgroundDirectionCompatible(direction:number|undefined,facing:number){
  if(direction===4)return true;
  switch(facing){
    case 0:return direction===0||direction===6;
    case 1:return direction===3||direction===6;
    case 2:return direction===2||direction===5;
    case 3:return direction===1||direction===5;
    default:return false;
  }
}

/** Flag saves may contain the original symbolic name or an explicitly saved
 * numeric alias. A present numeric alias is authoritative, as with variables. */
export function backgroundFlagSet(flags:Readonly<Record<string,boolean>>,constants:Readonly<Record<string,number>>,id:number){
  if(id===0)return false;
  const numeric=flags['#'+id];if(numeric!==undefined)return numeric;
  return Object.entries(flags).some(([key,value])=>value&&constants[key]===id);
}

/** Native GetInteractedBackgroundEventScript: only the facing tile, source
 * order, and no invented height gate. Collected hidden items are skipped;
 * hidden items otherwise ignore the ordinary direction compatibility rule. */
export function findInteractedBackgroundEvent(
  map:Pick<SourceMap,'events'>,x:number,z:number,facing:number,
  scriptNumber:(script:string|number)=>number,readFlag:(id:number)=>boolean,
  constants:Readonly<Record<string,number>>,
):Trigger|undefined{
  const deltas=[[0,-1],[0,1],[-1,0],[1,0]] as const,d=deltas[facing];if(!d)return;
  const tileX=Math.floor(x)+d[0],tileZ=Math.floor(z)+d[1];
  for(const event of map.events.bgs){
    if(event.x!==tileX||event.z!==tileZ)continue;
    if(event.type===2){
      const scriptBase=constants._std_hidden_item,flagBase=constants.HIDDEN_ITEMS_FLAG_BASE;
      if(!Number.isInteger(scriptBase)||!Number.isInteger(flagBase))throw Error('Missing original hidden-item flag constants');
      const flag=(scriptNumber(event.scriptId)-scriptBase+flagBase)&0xffff;
      if(!readFlag(flag))return event;
    }else if(backgroundDirectionCompatible(event.dir,facing))return event;
  }
}
