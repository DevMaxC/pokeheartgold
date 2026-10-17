import type {State} from './types.ts';

// Native MysteryGiftSave: 0x100 receipt bits, 8*0x104 gifts, 3*0x358
// cards, and one 0x358 special card (include/mystery_gift.h). Preserve the
// complete block rather than deriving delivery presence from menu/field flags.
export const MYSTERY_GIFT_SAVE_SIZE=0x1680;
export type MysteryGiftSave={format:'hgss-mystery-gift-v1';bytes:number[]};
export function newMysteryGiftSave():MysteryGiftSave{return{format:'hgss-mystery-gift-v1',bytes:Array<number>(MYSTERY_GIFT_SAVE_SIZE).fill(0)};}
export function validateMysteryGiftSave(value:unknown):MysteryGiftSave{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Unsupported Mystery Gift save format');
  const store=value as MysteryGiftSave;
  if(store.format!=='hgss-mystery-gift-v1'||!Array.isArray(store.bytes)||store.bytes.length!==MYSTERY_GIFT_SAVE_SIZE||Object.keys(store).some(key=>key!=='format'&&key!=='bytes'))throw Error('Unsupported Mystery Gift save format');
  for(let i=0;i<MYSTERY_GIFT_SAVE_SIZE;i++)if(!Object.hasOwn(store.bytes,i)||!Number.isInteger(store.bytes[i])||store.bytes[i]<0||store.bytes[i]>255)throw Error('Malformed Mystery Gift save bytes');
  return store;
}
/** Only our historical browser-v2 State had an absent block: its VM never
 * implemented gift reception/import. This is not a native .sav import or a
 * repair of a present invalid block. The host reads these saves from its own
 * heartgold-3d-v2 / heartgold-3d-v2-qa keys; foreign/unknown-version state requires an explicit importer. */
export function ensureMysteryGiftSave(state:State):MysteryGiftSave{
  if(Object.hasOwn(state,'mysteryGifts'))return validateMysteryGiftSave(state.mysteryGifts);
  const record=(v:unknown)=>!!v&&typeof v==='object'&&!Array.isArray(v);
  if(state.version!==2||typeof state.name!=='string'||!['boy','girl'].includes(state.gender)||!Number.isInteger(state.map)||!Number.isFinite(state.x)||!Number.isFinite(state.z)||!record(state.flags)||!record(state.vars)||!record(state.bag)||!Array.isArray(state.party)||!Array.isArray(state.boxes)||!record(state.options))throw Error('Unknown legacy browser Mystery Gift save provenance');
  return state.mysteryGifts=newMysteryGiftSave();
}
/** SaveMGDataPtr_GetFirstGiftIndex / MysteryGiftTagIsValid: native tags outside
 * 1..15 are unoccupied. Card history alone never means a queued delivery. */
export function nextMysteryGift(store:MysteryGiftSave):{index:number;tag:number}|null{
  const bytes=validateMysteryGiftSave(store).bytes;
  for(let index=0;index<8;index++){const offset=0x100+index*0x104,tag=bytes[offset]|bytes[offset+1]<<8;if(tag>0&&tag<16)return{index,tag};}
  return null;
}
