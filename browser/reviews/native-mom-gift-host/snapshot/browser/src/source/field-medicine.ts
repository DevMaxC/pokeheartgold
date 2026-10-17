import type {GameData,Mon,State} from './types.ts';

export type FieldMedicineInventory=Pick<State,'party'|'bag'>;
export type FieldMedicineRequest={item:string;partySlot:number|null;moveSlot?:number|null};
export type FieldMedicineEffect={hp:{before:number;after:number};status:{before:string;after:string};pp:{slot:number;before:number;after:number}[]};
type Unchanged={kind:'cancelled'}|{kind:'no-effect';reason:'unavailable'|'not-party-item'|'egg'|'no-change'}|{kind:'unsupported';requirements:string[]}|{kind:'select-move';moves:{slot:number;id:number;pp:number;maxPP:number;canRestore:boolean}[]};
export type FieldMedicinePlan=Unchanged|{kind:'ready';item:string;partySlot:number;mon:Mon;bag:State['bag'];effect:FieldMedicineEffect};
export type FieldMedicineApplication=Unchanged|{kind:'applied';item:string;partySlot:number;party:Mon[];bag:State['bag'];effect:FieldMedicineEffect};

// Exact ItemPartyParam fields (include/item.h). Confusion/infatuation flags are
// deliberately field-inert: neither CanUseItemOnPokemon nor UseItemOnPokemon
// handles them. This permits Full Restore/Lum without inventing a field status.
const booleanFields=['slp_heal','psn_heal','brn_heal','frz_heal','prz_heal','cfs_heal','inf_heal','guard_spec','revive','revive_all','level_up','evolve','pp_up','pp_max','pp_restore','pp_restore_all','hp_restore','hp_ev_up','atk_ev_up','def_ev_up','speed_ev_up','spatk_ev_up','spdef_ev_up','friendship_mod_lo','friendship_mod_med','friendship_mod_hi']as const;
const stageFields=['atk_stages','def_stages','spatk_stages','spdef_stages','speed_stages','accuracy_stages','critrate_stages']as const;
const unsupportedFields=['guard_spec','revive_all','level_up','evolve',...stageFields,'pp_up','pp_max','hp_ev_up','atk_ev_up','def_ev_up','speed_ev_up','spatk_ev_up','spdef_ev_up','friendship_mod_lo','friendship_mod_med','friendship_mod_hi']as const;
const statusFields:Record<string,string>={SLP:'slp_heal',PSN:'psn_heal',TOX:'psn_heal',BRN:'brn_heal',FRZ:'frz_heal',PAR:'prz_heal'};
function requireInteger(value:number,min:number,max:number,label:string){if(!Number.isInteger(value)||value<min||value>max)throw RangeError(`Invalid native field medicine ${label}`);return value;}
function numeric(row:Record<string,string>,field:string,min=0,max=255){const text=row[field];if(typeof text!=='string'||! /^-?\d+$/.test(text))throw Error(`Missing native item parameter ${field}`);return requireInteger(Number(text),min,max,field);}
function boolean(row:Record<string,string>,field:string){if(row[field]!=='true'&&row[field]!=='false')throw Error(`Missing native item flag ${field}`);return row[field]==='true';}

function effects(row:Record<string,string>){
 const flags:Record<string,boolean|number>={};for(const key of booleanFields)flags[key]=boolean(row,key);for(const key of stageFields)flags[key]=numeric(row,key,0,key==='critrate_stages'?3:15);
 const missing=unsupportedFields.filter(key=>flags[key]);
 // These items also need mood, ball/location/held-item friendship modifiers,
 // stat recalculation, learn/evolution scenes or all-party ownership. Refuse
 // the complete item, never just omit a secondary effect after healing.
 if(missing.length)return{kind:'unsupported' as const,requirements:[...missing]};
 const fieldUse=numeric(row,'fieldUseFunc');if(fieldUse!==1&&fieldUse!==8)return{kind:'unsupported' as const,requirements:[`fieldUseFunc:${fieldUse}`]};
 return{kind:'supported' as const,flags,hp:numeric(row,'hp_restore_param'),pp:numeric(row,'pp_restore_param')};
}

function moveState(data:GameData,mon:Mon){
 if(!Array.isArray(mon.moves)||mon.moves.length>4)throw Error('Invalid native field medicine moves');
 return Array.from(mon.moves,(move,slot)=>{
  if(!move)throw Error('Invalid native field medicine move slot');
  requireInteger(move.id,0,data.moves.length-1,'move id');
  if(move.id===0)return{slot,id:0,pp:move.pp,maxPP:move.maxPP,canRestore:false};
  const base=data.moves[move.id]?.pp;if(!Number.isInteger(base)||base<=0)throw Error('Missing native move PP');
  // Mon stores the resulting capacity, not a separate PP-Up count. Require it
  // to be one of the four exact src/move.c:GetMoveMaxPP capacities; do not
  // silently reset an existing boosted capacity or fabricate a new one.
  if(![0,1,2,3].some(up=>base+Math.floor(base*20*up/100)===move.maxPP))throw Error('Invalid native move PP capacity');
  requireInteger(move.pp,0,move.maxPP,'current PP');
  return{slot,id:move.id,pp:move.pp,maxPP:move.maxPP,canRestore:move.pp<move.maxPP};
 });
}

/** Field-only counterpart of party_menu.c admission + use_item_on_mon.c.
 * Pure: neither a preview, cancellation, unsupported item nor failure mutates
 * any party/bag record. Request moveSlot undefined means show the move picker;
 * null means explicit cancellation. No battle volatile-state API is implied.
 */
export function planFieldMedicine(data:GameData,inventory:FieldMedicineInventory,request:FieldMedicineRequest):FieldMedicinePlan{
 if(request.partySlot===null||request.moveSlot===null)return{kind:'cancelled'};
 if(!Array.isArray(inventory.party)||inventory.party.length<1||inventory.party.length>6)throw Error('Invalid native field medicine party');
 const slot=requireInteger(request.partySlot,0,inventory.party.length-1,'party slot'),mon=inventory.party[slot];if(!mon)throw Error('Missing native field medicine target');
 const row=data.items.find(item=>item.item===request.item);if(!row)throw Error('Missing native field medicine item');
 const count=inventory.bag[request.item]??0;requireInteger(count,0,data.constants.BAG_SLOT_QUANTITY_MAX,'bag quantity');
 if(count===0)return{kind:'no-effect',reason:'unavailable'};
 if(numeric(row,'partyUse')!==1)return{kind:'no-effect',reason:'not-party-item'};
 if(mon.isEgg||mon.checksumFailed)return{kind:'no-effect',reason:'egg'};
 const effect=effects(row);if(effect.kind==='unsupported')return effect;
 requireInteger(mon.maxHP,1,65535,'maximum HP');requireInteger(mon.hp,0,mon.maxHP,'current HP');requireInteger(mon.level,1,100,'level');
 if(mon.status!==''&&!Object.hasOwn(statusFields,mon.status))throw Error('Unsupported native field medicine persistent status');
 const flags=effect.flags,cure=!!mon.status&&!!flags[statusFields[mon.status]];
 const singlePP=!!flags.pp_restore,allPP=!singlePP&&!!flags.pp_restore_all;
 const moves=singlePP||allPP?moveState(data,mon):[];
 if(singlePP&&request.moveSlot===undefined)return{kind:'select-move',moves:moves.filter(move=>move.id!==0)};
 const selected=singlePP?requireInteger(request.moveSlot!,0,3,'move slot'):-1;
 const ppTargets=singlePP?moves.filter(move=>move.slot===selected&&move.canRestore):moves.filter(move=>move.canRestore);
 // CanUse's major-status test precedes HP. Do not apply a blanket fainted or
 // level100 exclusion: status and PP effects have neither in native source.
 const hpEligible=flags.revive?mon.hp===0:flags.hp_restore&&mon.hp>0&&mon.hp<mon.maxHP;
 const ppEligible=(singlePP||allPP)&&ppTargets.length>0;
 if(!cure&&!hpEligible&&!ppEligible)return{kind:'no-effect',reason:'no-change'};
 const next=structuredClone(mon),ppChanges:FieldMedicineEffect['pp']=[];
 if(cure){next.status='';if(mon.status==='SLP')next.sleepTurns=0;}
 // UseItem applies HP after the status eligibility test, including a fainted
 // target admitted by a curable status. Ordinary fainted Potion is ineligible.
 if(flags.hp_restore&&next.hp<next.maxHP){
  const amount=next.maxHP===1?1:effect.hp===255?next.maxHP:effect.hp===254?Math.floor(next.maxHP/2):effect.hp===253?Math.floor(next.maxHP/4):effect.hp;
  next.hp=Math.min(next.maxHP,next.hp+amount);
 }
 for(const move of ppTargets){const value=effect.pp===127?move.maxPP:Math.min(move.maxPP,(move.pp+effect.pp)&255);if(value!==move.pp){next.moves[move.slot].pp=value;ppChanges.push({slot:move.slot,before:move.pp,after:value});}}
 if(next.hp===mon.hp&&next.status===mon.status&&ppChanges.length===0)return{kind:'no-effect',reason:'no-change'};
 const bag=structuredClone(inventory.bag);if(count===1)delete bag[request.item];else bag[request.item]=count-1;
 return{kind:'ready',item:request.item,partySlot:slot,mon:next,bag,effect:{hp:{before:mon.hp,after:next.hp},status:{before:mon.status,after:next.status},pp:ppChanges}};
}

/** Replans against current inputs; never commits a stale preview. Returns BOTH
 * updated records without writing State. Caller commits party+bag together
 * inside its source-action recovery, then awaits owned field presentation.
 */
export function applyFieldMedicine(data:GameData,inventory:FieldMedicineInventory,request:FieldMedicineRequest):FieldMedicineApplication{
 const plan=planFieldMedicine(data,inventory,request);if(plan.kind!=='ready')return plan;
 const party=inventory.party.slice();party[plan.partySlot]=plan.mon;
 return{kind:'applied',item:plan.item,partySlot:plan.partySlot,party,bag:plan.bag,effect:plan.effect};
}
