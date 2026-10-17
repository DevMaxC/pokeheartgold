import {nativeNicknameCodes} from './mon-nickname.ts';
import type {Mon,State} from './types.ts';

export type NativeMonOwnership={
 ownership:'player'|'traded-domestic'|'traded-international';
 basis:'native-full-ot-profile'|'browser-legacy-unknown-identity';
};
const uint32=(value:unknown)=>typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=0xffffffff;
function nameCodes(value:string){const codes=nativeNicknameCodes(value);if(codes.length>8)throw Error('Native trainer name exceeds seven units');return codes;}
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
 const a=nameCodes(state.name),b=nameCodes(mon.ot);
 // Source StringNotEqualN tests EOS too. Both represented names are <=7 units,
 // so its comparison is exact, including the terminator and no case folding.
 const same=profile===origin.otId&&state.gender===origin.otGender&&a.length===b.length&&a.every((value,index)=>value===b[index]);
 return{ownership:same?'player':origin.language===2?'traded-domestic':'traded-international',basis:'native-full-ot-profile'};
}
