import type {SourceMap,Trigger} from './types.ts';

type CoordinateMap=Pick<SourceMap,'constants'|'events'>;

function literal(value:number|string|undefined,map:CoordinateMap,globalConstants:Readonly<Record<string,number>>){
  if(value===undefined)return 0;
  const resolved=typeof value==='number'?value:/^(?:0x[\da-f]+|\d+)$/i.test(value)?Number(value):map.constants[value]??globalConstants[value];
  if(!Number.isInteger(resolved)||resolved<0||resolved>0xffff)throw RangeError(`Invalid original coordinate-event value ${String(value)}`);
  return resolved;
}

/** field_interaction.c:GetTriggeredCoordEventScript compares VarGet(var) to
 * the event's literal u16 val. Exported source retains a few named literals
 * (Ilex STICKS_ACTIVE); resolving those must not dereference a VAR-valued val.
 * Native event order, half-open rectangles and height-independent admission
 * are retained. The host owns repeat suppression, event priority and recovery.
 */
export function findCoordinateTrigger(map:CoordinateMap,x:number,z:number,readVariable:(token:string)=>number,globalConstants:Readonly<Record<string,number>>={}):Trigger|undefined{
  const tileX=Math.floor(x),tileZ=Math.floor(z);
  return map.events.coords.find(event=>tileX>=event.x&&tileX<event.x+(event.w??1)&&tileZ>=event.z&&tileZ<event.z+(event.h??1)&&readVariable(event.var??'0')===literal(event.val,map,globalConstants));
}
