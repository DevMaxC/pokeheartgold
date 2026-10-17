import {nativeNicknameCodes,UnsupportedNativeNickname} from './mon-nickname.ts';
import type {Mon,State} from './types.ts';

export type NativeMonOwnership={
 ownership:'player'|'traded-domestic'|'traded-international';
 basis:'native-full-ot-profile'|'browser-legacy-unknown-identity'|'browser-unrepresented-trainer-name';
};
const uint32=(value:unknown)=>typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=0xffffffff;
function nameCodes(value:string){const codes=nativeNicknameCodes(value);if(codes.length>8)throw new UnsupportedNativeNickname('Native trainer name exceeds seven units');return codes;}
/** battle_util.c:BattleSystem_IsPlayerOT: FULL u32 OTID, OTgender, original
 * seven-unit name comparison. PartyMonIsMine is a DIFFERENT opcode (u16 ID
 * truncation/inverted bool), and obedience remains a separate controller.
 *
 * Prior browser party data treated every slot as player-owned. Missing old
 * identity/profile retains that explicit compatibility policy; no name-only
 * inference, Mon.id use, current-profile backfill or State mutation. */
export function nativeBattleMonOwnership(state:Pick<State,'trainerId'|'name'|'gender'>,mon:Pick<Mon,'provenance'|'ot'>):NativeMonOwnership{
 const profile=state.trainerId,origin=mon.provenance;
 if(profile!==undefined&&!uint32(profile))throw Error('Malformed present native player trainer ID');
 if(origin!==undefined&&(!origin||!uint32(origin.otId)||!['boy','girl'].includes(origin.otGender)||![1,2,3,4,5,7,8].includes(origin.language)))throw Error('Malformed present native Mon OT identity');
 if(profile===undefined||origin===undefined)return{ownership:'player',basis:'browser-legacy-unknown-identity'};
 if(!['boy','girl'].includes(state.gender))throw Error('Malformed native player gender');
 const foreign=origin.language===2?'traded-domestic' as const:'traded-international' as const;
 // ORIGINAL C short-circuits before touching name units when either numeric
 // field differs. An unrelated browser profile glyph cannot invalidate that
 // proven false predicate, including a newly received NPC trade.
 if(profile!==origin.otId||state.gender!==origin.otGender)return{ownership:foreign,basis:'native-full-ot-profile'};
 if(typeof state.name!=='string'||typeof mon.ot!=='string')throw Error('Malformed present trainer name');
 let a:readonly number[],b:readonly number[];
 try{a=nameCodes(state.name);b=nameCodes(mon.ot);}catch(error){
  if(!(error instanceof UnsupportedNativeNickname))throw error;
  // Existing browser profile UI admitted Unicode/free text. Real native Egg
  // acquisition already copied that SAME text to its OT with real ID/gender.
  // Preserve it without inventing DS character units or breaking an unrelated
  // EXP award/obedience query. This is a visible BROWSER compatibility policy,
  // never a claim that arbitrary text came from the original naming keyboard.
  return{ownership:state.name===mon.ot?'player':foreign,basis:'browser-unrepresented-trainer-name'};
 }
 // Source StringNotEqualN tests EOS too. Both represented names are <=7 units,
 // so its comparison is exact, including the terminator and no case folding.
 const same=a.length===b.length&&a.every((value,index)=>value===b[index]);
 return{ownership:same?'player':foreign,basis:'native-full-ot-profile'};
}
