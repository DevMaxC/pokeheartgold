import {sourceJSON,type GameData,type Mon,type State} from './types.ts';

export type NativeTMHM={item:string;itemId:number;index:number;move:string;moveId:number;kind:'tm'|'hm';number:number};
export type NativeFieldMoveData={version:1;sourceSHA256:Record<string,string>;items:NativeTMHM[];alternateForms:Record<number,number[]>;mapSections:Record<number,number>;mapLoadTypes:Record<string,number>;responses:Record<string,number>;learningResponses:Record<string,number>;cut:{moveId:number;badge:number;standard:number;bank:string;interactionEntry:number;menuEntry:number};cutCommandClosure:Record<'interaction'|'menu',{entry:number;instructions:number[];commands:string[]}>};
export type NativeTeachingMon=Mon&{mood?:number};
type TeachingData=Pick<GameData,'constants'|'personal'|'moves'|'items'>;
type MoveQueryMon=Pick<Mon,'isEgg'|'checksumFailed'|'moves'>;

export function loadNativeFieldMoveData(){return sourceJSON<NativeFieldMoveData>('field-moves.json');}
const egg=(mon:Pick<Mon,'isEgg'|'checksumFailed'>)=>!!(mon.isEgg||mon.checksumFailed);
const moveAt=(mon:MoveQueryMon,slot:number)=>mon.moves[slot]?.id??0;

/** scrcmd_party.c: MON_DATA_IS_EGG includes checksum-failed Bad Eggs.
 * HP, status and current PP are deliberately not part of these two queries. */
export function monHasMove(mon:MoveQueryMon,move:number){
 return !egg(mon)&&[0,1,2,3].some(slot=>moveAt(mon,slot)===move);
}
export function getPartySlotWithMove(party:readonly MoveQueryMon[],move:number){
 if(party.length>6)throw Error('Invalid native party size');
 const slot=party.findIndex(mon=>monHasMove(mon,move));return slot<0?6:slot;
}

/** The party-menu check is distinct from standard10000's interaction script.
 * A menu move already has a selected user; this checks its native environment. */
export function cutFieldResponse(context:{mapLoadType:number;hasHiveBadge:boolean;facingSpriteId:string|null}):0|1|2{
 if(!Number.isInteger(context.mapLoadType)||context.mapLoadType<0||context.mapLoadType>5)throw Error('Unknown native map-load context');
 if(context.mapLoadType===2||context.mapLoadType===3)return 1;
 if(!context.hasHiveBadge)return 2;
 return context.facingSpriteId==='SPRITE_TREE'?0:1;
}

export function resolveTeachingPersonalIndex(native:NativeFieldMoveData,species:number,form=0){
 if(!Number.isInteger(species)||species<0||!Number.isInteger(form)||form<0||form>31)throw Error('Invalid native species/form');
 return native.alternateForms[species]?.[form]??species;
}
export function tmhmDefinition(native:NativeFieldMoveData,item:string){return native.items.find(row=>row.item===item);}
export function isHMMove(native:NativeFieldMoveData,move:number){return native.items.some(row=>row.kind==='hm'&&row.moveId===move);}
export function canForgetForTeaching(native:NativeFieldMoveData,move:number){return !isHMMove(native,move);}

function definition(data:TeachingData,native:NativeFieldMoveData,item:string){
 const row=tmhmDefinition(native,item);if(!row)return undefined;
 if(native.version!==1||data.constants[item]!==row.itemId||data.constants[row.move]!==row.moveId||data.moves[row.moveId]?.key!==row.move)throw Error('Original TM/HM data does not match the loaded game');
 return row;
}
export function tmhmCompatible(data:TeachingData,native:NativeFieldMoveData,mon:Pick<Mon,'species'|'form'|'isEgg'|'checksumFailed'>,item:string){
 const row=definition(data,native,item);if(!row||egg(mon)||mon.species===data.constants.SPECIES_EGG)return false;
 const base=data.personal[resolveTeachingPersonalIndex(native,mon.species,mon.form??0)];
 if(!base)throw Error('Missing original TM/HM compatibility record');
 const entries=base[row.kind==='hm'?'hms':'tms'];
 if(!Array.isArray(entries)||entries.some(value=>!Number.isInteger(value)))throw Error('Missing original TM/HM compatibility bits');
 return entries.includes(row.number);
}

export type TMHMLearningCheck=
 |{kind:'egg'}|{kind:'notTMHM'}|{kind:'known';nativeResponse:253}
 |{kind:'incompatible';nativeResponse:255}|{kind:'full';nativeResponse:254}
 |{kind:'empty';slot:number;nativeResponse:number};

/** PartyMenu_Subtask_UseTMHM + PartyMenu_CheckCanLearnTMHMMove. The scan stops
 * at the first empty native slot before the compatibility/full checks. */
export function checkTMHMLearning(data:TeachingData,native:NativeFieldMoveData,mon:NativeTeachingMon,item:string):TMHMLearningCheck{
 const row=definition(data,native,item);if(!row)return{kind:'notTMHM'};
 if(egg(mon))return{kind:'egg'};
 if(mon.moves.length>4)throw Error('Invalid native move slots');
 let slot=0;for(;slot<4;slot++){
  const move=moveAt(mon,slot);if(move===row.moveId)return{kind:'known',nativeResponse:253};
  if(move===0)break;
 }
 if(!tmhmCompatible(data,native,mon,item))return{kind:'incompatible',nativeResponse:255};
 return slot===4?{kind:'full',nativeResponse:254}:{kind:'empty',slot,nativeResponse:slot};
}

export type TeachingDenial={status:'noEffect';reason:'notTMHM'|'egg'|'known'|'incompatible'|'missingItem'|'invalidPartySlot'|'invalidReplacement'|'cannotForgetHM'|'cancelled'};
export type TeachingChoice={status:'chooseReplacement';partyIndex:number;item:string;move:number;protectedSlots:readonly number[]};
export type TMHMTeachingPlan={
 status:'ready';partyIndex:number;item:string;move:number;slot:number;replacingMove:number;
 consumesItem:boolean;friendshipDelta:number;moodDelta:number;
 after:Readonly<{moves:readonly Readonly<Mon['moves'][number]>[];friendship:number;mood:number}>;
};
export type TMHMTeachingPreparation=TeachingDenial|TeachingChoice|TMHMTeachingPlan;
type Guard={active:boolean;state:State;party:Mon[];bag:State['bag'];mon:NativeTeachingMon;data:TeachingData;native:NativeFieldMoveData;signature:string;replacement:number|undefined;quantity:number};
const prepared=new WeakMap<TMHMTeachingPlan,Guard>();

function integer(value:number,min:number,max:number,label:string){if(!Number.isInteger(value)||value<min||value>max)throw Error(`Invalid native ${label}`);return value;}
function signature(state:State){return JSON.stringify([state.map,state.x,state.z,state.party]);}

/** MonApplyFriendshipMod uses EGG_LOCATION, not the later MET_LOCATION.
 * Legacy web monsters without provenance/mood retain native zero defaults. */
function teachingAffinity(data:TeachingData,mon:NativeTeachingMon,mapSection:number){
 integer(mapSection,0,65535,'map section');
 const friendship=integer(mon.friendship,0,255,'friendship'),mood=integer(mon.mood??0,-128,127,'mood');
 let modifier=friendship<200?1:0;
 if(modifier>0&&(mon.provenance?.pokeball??data.constants.BALL_POKE)===data.constants.BALL_LUXURY)modifier++;
 if(modifier>0&&(mon.provenance?.eggLocation??0)===mapSection)modifier++;
 if(mon.heldItem){
  const item=data.items.find(row=>row.item===mon.heldItem);if(!item)throw Error('Missing original held-item data');
  if(modifier>0&&item.holdEffect==='HOLD_EFFECT_FRIENDSHIP_UP')modifier=Math.trunc(modifier*150/100);
 }
 return{friendship:Math.min(255,friendship+modifier),mood:Math.min(127,mood+40)};
}

function prepare(data:TeachingData,native:NativeFieldMoveData,state:State,partyIndex:number,item:string,replacement?:number|null):TMHMTeachingPreparation{
 if(replacement===null)return{status:'noEffect',reason:'cancelled'};
 if(replacement!==undefined&&(!Number.isInteger(replacement)||replacement<0||replacement>=4))return{status:'noEffect',reason:'invalidReplacement'};
 const row=definition(data,native,item);if(!row)return{status:'noEffect',reason:'notTMHM'};
 if(!Number.isInteger(partyIndex)||partyIndex<0||partyIndex>=state.party.length||partyIndex>=6)return{status:'noEffect',reason:'invalidPartySlot'};
 const quantity=state.bag[item]??0;integer(quantity,0,65535,'TM/HM quantity');
 if(quantity===0)return{status:'noEffect',reason:'missingItem'};
 const mon=state.party[partyIndex] as NativeTeachingMon,check=checkTMHMLearning(data,native,mon,item);
 if(check.kind==='egg'||check.kind==='known'||check.kind==='incompatible'||check.kind==='notTMHM')return{status:'noEffect',reason:check.kind};
 let slot:number;
 if(check.kind==='full'){
  if(replacement===undefined)return{status:'chooseReplacement',partyIndex,item,move:row.moveId,protectedSlots:Object.freeze(mon.moves.map((move,slot)=>isHMMove(native,move.id)?slot:-1).filter(slot=>slot>=0))};
  if(!canForgetForTeaching(native,moveAt(mon,replacement)))return{status:'noEffect',reason:'cannotForgetHM'};
  slot=replacement;
 }else slot=check.slot;
 const pp=integer(data.moves[row.moveId].pp,1,255,'move base PP'),affinity=teachingAffinity(data,mon,native.mapSections[state.map]);
 const moves=mon.moves.map(move=>({...move}));moves[slot]={id:row.moveId,pp,maxPP:pp};
 const after=Object.freeze({moves:Object.freeze(moves.map(move=>Object.freeze(move))),...affinity});
 return Object.freeze({status:'ready',partyIndex,item,move:row.moveId,slot,replacingMove:moveAt(mon,slot),consumesItem:!isHMMove(native,row.moveId),friendshipDelta:affinity.friendship-mon.friendship,moodDelta:affinity.mood-(mon.mood??0),after});
}

/** The host owns all prompts. No mutation occurs until its final synchronous
 * commit, so cancelling a party/forget prompt cannot consume a TM or teach. */
export function prepareTMHMTeaching(data:TeachingData,native:NativeFieldMoveData,state:State,partyIndex:number,item:string,replacement?:number|null):TMHMTeachingPreparation{
 const result=prepare(data,native,state,partyIndex,item,replacement);
 if(result.status==='ready')prepared.set(result,{active:true,state,party:state.party,bag:state.bag,mon:state.party[partyIndex],data,native,signature:signature(state),replacement:result.slot,quantity:state.bag[item]});
 return result;
}
export function cancelTMHMTeaching(plan:TMHMTeachingPlan){const guard=prepared.get(plan);if(!guard?.active)return false;guard.active=false;return true;}
export function commitTMHMTeaching(state:State,plan:TMHMTeachingPlan):{status:'learned';partyIndex:number;slot:number;move:number}|{status:'cancelled';reason:'inactive'|'stale'}{
 const guard=prepared.get(plan);if(!guard)throw Error('Unknown native teaching plan');
 if(!guard.active)return{status:'cancelled',reason:'inactive'};
 if(state!==guard.state||state.party!==guard.party||state.bag!==guard.bag||state.party[plan.partyIndex]!==guard.mon||state.bag[plan.item]!==guard.quantity||signature(state)!==guard.signature){guard.active=false;return{status:'cancelled',reason:'stale'};}
 const current=prepare(guard.data,guard.native,state,plan.partyIndex,plan.item,guard.replacement);
 if(current.status!=='ready'||JSON.stringify(current)!==JSON.stringify(plan)){guard.active=false;return{status:'cancelled',reason:'stale'};}
 // All validation precedes these synchronous writes. There is no UI callback,
 // asset await, save or event/flag mutation inside this transaction.
 guard.mon.moves=plan.after.moves.map(move=>({...move}));guard.mon.friendship=plan.after.friendship;guard.mon.mood=plan.after.mood;
 if(plan.consumesItem){if(guard.quantity===1)delete state.bag[plan.item];else state.bag[plan.item]=guard.quantity-1;}
 guard.active=false;return{status:'learned',partyIndex:plan.partyIndex,slot:plan.slot,move:plan.move};
}
