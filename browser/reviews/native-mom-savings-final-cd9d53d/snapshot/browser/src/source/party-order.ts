import type {Mon} from './types.ts';
import type {UI} from './ui.ts';

function validateParty(party:readonly Mon[]){
 if(!Array.isArray(party)||party.length<1||party.length>6)throw RangeError('Field party switching requires 1–6 occupied slots');
 for(let slot=0;slot<party.length;slot++)if(!Object.hasOwn(party,slot)||!party[slot]||typeof party[slot]!=='object')throw RangeError('Field party switching requires contiguous occupied slots');
}
function validateSlot(party:readonly Mon[],slot:number){
 if(!Number.isInteger(slot)||slot<0||slot>=party.length)throw RangeError('Field party slot is not occupied');
}

/** party.c:Party_SwapSlots exchanges complete Pokémon and their per-mon
 * extra records. Keep every browser Mon field/reference intact, including
 * Egg state, status, PP and provenance. This is not a battle switch. */
export function swapFieldPartySlots(party:Mon[],sourceSlot:number,targetSlot:number|null):Mon[];
export function swapFieldPartySlots(party:readonly Mon[],sourceSlot:number,targetSlot:number|null):readonly Mon[];
export function swapFieldPartySlots(party:readonly Mon[],sourceSlot:number,targetSlot:number|null):readonly Mon[]{
 validateParty(party);validateSlot(party,sourceSlot);
 if(targetSlot===null)return party;
 validateSlot(party,targetSlot);
 // party_menu.c:PartyMenu_HandleSelectSwitchMonInput cancels on the source
 // slot, just as B/Cancel does. Eggs and fainted Pokémon remain selectable.
 if(targetSlot===sourceSlot)return party;
 const next=[...party];[next[sourceSlot],next[targetSlot]]=[next[targetSlot],next[sourceSlot]];return next;
}

function slotLabel(mon:Mon,index:number){
 // As in the native party panels, an Egg exposes neither species nor HP.
 return `${index+1}. ${mon.name}${mon.isEgg?'':` · Lv.${mon.level} · ${mon.hp}/${mon.maxHP} HP${mon.status?` · ${mon.status}`:''}`}`;
}

/** Small field-only chooser using the existing owned/cancellable UI. It
 * returns an occupied slot or null and never mutates the party. The getter
 * catches a replacement/reorder while awaiting input, before the host commits
 * swapFieldPartySlots to state.party. Root owns saving and field refresh. */
export async function chooseFieldPartySwitchTarget(getParty:()=>readonly Mon[],sourceSlot:number,ui:Pick<UI,'choose'>,signal?:AbortSignal):Promise<number|null>{
 if(signal?.aborted)throw signal.reason??new DOMException('Party switching was cancelled','AbortError');
 const party=getParty();validateParty(party);validateSlot(party,sourceSlot);
 const snapshot=[...party],options=[...snapshot.map(slotLabel),'Cancel'];
 // Original msg_0300_00031; options stay in actual party-slot order.
 const selection=await ui.choose('Move to where?',options,'',signal);
 if(signal?.aborted)throw signal.reason??new DOMException('Party switching was cancelled','AbortError');
 if(!Number.isInteger(selection)||selection<0||selection>=options.length)throw RangeError('Field party switch choice was not resolved');
 const current=getParty();
 if(current.length!==snapshot.length||snapshot.some((mon,index)=>current[index]!==mon))throw Error('Field party changed while choosing a switch target');
 return selection===snapshot.length||selection===sourceSlot?null:selection;
}
