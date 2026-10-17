import {NATIVE_AZALEA_GYM as rules} from './azalea-gym-rules.ts';

export type AzaleaGymState={spiders:[number,number,number,number];switches:0|1|2|3};
type Point={x:number;z:number};
export type AzaleaRideSegment={from:Point;to:Point;velocity:Point;ticks:number};
export type AzaleaRidePlan={snapshot:AzaleaGymState;station:number;spiderIndex:number;destination:number;reverse:boolean;playerZOffset:0|1;followerZOffset:0|1;direction:0|1;segments:AzaleaRideSegment[];movementTicks:number;movementSeconds:number;boarding:{from:Point;onto:Point};arrival:{riding:Point;disembarked:Point}};
const fixedTile=rules.fixedOne*rules.nativeUnitsPerTile;
const validIndex=(value:number,length:number)=>Number.isInteger(value)&&value>=0&&value<length;
export function initialAzaleaGymState():AzaleaGymState{return{spiders:[...rules.initial.spiders],switches:rules.initial.switches};}
function validate(state:AzaleaGymState){
  if(!state||!Array.isArray(state.spiders)||state.spiders.length!==4||new Set(state.spiders).size!==4||!Array.from(state.spiders).every(value=>validIndex(value,12))||!validIndex(state.switches,4))throw RangeError('Invalid native Azalea Gym saved state');
  return state;
}
function copy(state:AzaleaGymState):AzaleaGymState{validate(state);return{spiders:[...state.spiders],switches:state.switches};}
/** A real warp clears native gymmick data before InitAzaleaGym. Continue and
 * ordinary connections retain it; this helper does not reset another gym. */
export function azaleaGymEntryState(saved:AzaleaGymState|undefined,kind:'continue'|'connection'|'warp'):AzaleaGymState{return kind==='warp'||saved===undefined?initialAzaleaGymState():copy(saved);}
export function flipAzaleaGymSwitch(state:AzaleaGymState,index:number):AzaleaGymState{validate(state);if(!validIndex(index,2))throw RangeError('Invalid original Azalea switch');return{spiders:[...state.spiders],switches:(state.switches^(1<<index))as 0|1|2|3};}

function squareRoot(value:bigint){if(value<0n)throw RangeError('Negative fixed-point length');if(value<2n)return value;let root=value,next=(root+1n)>>1n;while(next<root){root=next;next=(root+value/root)>>1n;}return root;}
/** Literal SDK VEC_Normalize then VEC_MultAdd(FX32_CONST(2)). BigInt retains
 * the signed rounding of diagonals; native movement does not use float hypot. */
function nativeVelocity(from:Point,to:Point):Point{
  const x=BigInt(to.x-from.x)*BigInt(rules.fixedOne),z=BigInt(to.z-from.z)*BigInt(rules.fixedOne),length=x*x+z*z;
  if(length===0n)throw Error('Native Azalea route has a repeated node');
  const factor=((1n<<56n)/length)*squareRoot(length<<2n),component=(value:bigint)=>Number(((factor*value+(1n<<44n))>>45n)*2n);
  return{x:component(x),z:component(z)};
}
function stepFixed(position:Point,velocity:Point,target:Point,positive:Point){
  const done=(axis:'x'|'z')=>position[axis]+velocity[axis]===target[axis]?1:(positive[axis]?position[axis]+velocity[axis]>target[axis]:position[axis]+velocity[axis]<target[axis])?2:0;
  const x=done('x'),z=done('z');if(x===2)velocity.x=0;if(z===2)velocity.z=0;
  return x&&z?{position:{...target},complete:true}:{position:{x:position.x+velocity.x,z:position.z+velocity.z},complete:false};
}
function segment(from:Point,to:Point):AzaleaRideSegment{
  const velocity=nativeVelocity(from,to),currentVelocity={...velocity},target={x:to.x*fixedTile,z:to.z*fixedTile},positive={x:Number(to.x>=from.x),z:Number(to.z>=from.z)};let position={x:from.x*fixedTile,z:from.z*fixedTile};
  for(let ticks=1;ticks<=10000;ticks++){const frame=stepFixed(position,currentVelocity,target,positive);position=frame.position;if(frame.complete)return{from,to,velocity,ticks};}
  throw Error('Native Azalea segment failed to terminate');
}

/** Planning is read-only. Invalid/unowned stations and genuinely NULL source
 * route slots fail before creating a ride, rather than teleporting a rider. */
export function planAzaleaGymRide(state:AzaleaGymState,station:number):AzaleaRidePlan{
  validate(state);if(!validIndex(station,12))throw RangeError('Invalid original Azalea station');
  const spiderIndex=state.spiders.indexOf(station);if(spiderIndex<0)throw Error('No native Spinarak occupies this station');
  const selected=rules.slots[station][state.switches];if(selected===null)throw Error('No native route at this Azalea station/switch state');
  const reverse=(rules.reverseStations as readonly number[]).includes(station),route=rules.routes[selected.route],points=(reverse?[...route].reverse():[...route]).map(([x,z])=>({x,z}));
  const start=points[0],end=points.at(-1)!,expected=rules.stations[station],destination=rules.stations[selected.destination];
  if(start.x!==expected[0]||start.z!==expected[1]||end.x!==destination[0]||end.z!==destination[1])throw Error('Native Azalea route/station mismatch');
  const segments=points.slice(1).map((to,i)=>segment(points[i],to)),movementTicks=segments.reduce((total,value)=>total+value.ticks,0),playerZOffset=reverse?1:0,followerZOffset=reverse?0:1,direction=reverse?1:0;
  const riding={x:end.x+.5,z:end.z+.5+playerZOffset},onto={x:start.x+.5,z:start.z+.5+playerZOffset},disembark=reverse?1:-1;
  return{snapshot:copy(state),station,spiderIndex,destination:selected.destination,reverse,playerZOffset,followerZOffset,direction,segments,movementTicks,movementSeconds:movementTicks/rules.ticksPerSecond,boarding:{from:{x:onto.x,z:onto.z-disembark},onto},arrival:{riding,disembarked:{x:riding.x,z:riding.z+disembark}}};
}

export function azaleaGymRideFrame(plan:AzaleaRidePlan,tick:number){
  if(!Number.isInteger(tick)||tick<0||tick>plan.movementTicks)throw RangeError('Invalid native Azalea movement tick');let remaining=tick,position:Point|undefined;
  for(const value of plan.segments){
    position={x:value.from.x*fixedTile,z:value.from.z*fixedTile};const velocity={...value.velocity},target={x:value.to.x*fixedTile,z:value.to.z*fixedTile},positive={x:Number(value.to.x>=value.from.x),z:Number(value.to.z>=value.from.z)};
    const count=Math.min(remaining,value.ticks);for(let i=0;i<count;i++)position=stepFixed(position,velocity,target,positive).position;
    remaining-=count;if(remaining===0)break;
  }
  if(!position)throw Error('Empty native Azalea ride');const x=position.x/fixedTile+.5,z=position.z/fixedTile;
  return{fixed:{...position},model:{x,y:0,z},player:{x,y:0,z:z+.5+plan.playerZOffset},follower:{x,y:0,z:z+.5+plan.followerZOffset}};
}

/** Native commits the spider station at the last movement endpoint, before
 * docking/shake/disembark. The host calls this at that boundary; its source
 * action checkpoint owns rollback if those later stages fail. */
export function completeAzaleaGymRide(state:AzaleaGymState,plan:AzaleaRidePlan):AzaleaGymState{
  validate(state);if(state.switches!==plan.snapshot.switches||state.spiders.some((value,i)=>value!==plan.snapshot.spiders[i]))throw Error('Stale native Azalea ride');
  const selected=rules.slots[plan.station]?.[state.switches];if(!selected||state.spiders[plan.spiderIndex]!==plan.station||selected.destination!==plan.destination)throw Error('Invalid native Azalea ride result');
  const next=copy(state);next.spiders[plan.spiderIndex]=selected.destination;validate(next);return next;
}

/** Native camera stage applies four alternating1/16-tile deltas over7 ticks;
 * these cumulative offsets finish at0 and never replace a user's orbit. */
export function azaleaGymShakeOffsets(facing:number){if(!validIndex(facing,4))throw RangeError('Invalid original facing');const step=(facing===1?1:-1)/16;return[step,step,0,0,step,step,0];}
