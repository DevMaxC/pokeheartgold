import type {GameData} from './types.ts';
import {NATIVE_SPECIES_WEIGHTS} from './species-weights-data.ts';

/** Original Pokédex banks, indexed by the NATIONAL species number, not extended personal/form indices. */
export type NativeWeightData={
  readonly version:1;readonly unit:'hectogram';readonly maxSpecies:number;
  readonly species:readonly string[];readonly regular:readonly number[];readonly gira:readonly number[];
  readonly giraSelectedForm:number;readonly lowKickTable:readonly(readonly[number,number])[];
  readonly lowKickFallback:number;readonly sources:readonly{readonly path:string;readonly sha256:string}[];
};
type WeightData=Pick<GameData,'constants'|'personal'|'nativeWeights'>;
export class UnsupportedBattleWeight extends Error{
  constructor(message:string){super(message);this.name='UnsupportedBattleWeight';}
}
function bank(data:WeightData,species:number){
  const weights=data.nativeWeights;
  if(!weights||weights.version!==1||weights.unit!=='hectogram'||weights.maxSpecies!==493||!Array.isArray(weights.species)||!Array.isArray(weights.regular)||!Array.isArray(weights.gira)||weights.species.length!==494||weights.regular.length!==494||weights.gira.length!==494||weights.giraSelectedForm!==0)
    throw new UnsupportedBattleWeight('Missing or incompatible original HGSS weight banks');
  if(!Number.isInteger(species)||species<1||species>weights.maxSpecies)
    throw new UnsupportedBattleWeight(`Weight requires a national species 1..493, received ${species}`);
  const key=weights.species[species];
  if(key!==`SPECIES_${data.personal[species]?.species}`||data.constants[key]!==species)
    throw new UnsupportedBattleWeight(`Original species/weight data index mismatch at ${species}`);
  return weights;
}
function checkedWeight(weight:number){
  if(!Number.isInteger(weight)||weight<=0||weight>0x7fffffff)
    throw new UnsupportedBattleWeight('Weight requires an initialized positive native s32 hectogram value');
  return weight;
}

/** battle_command.c:GetMonWeight: the regular NARC bank (also used by Heavy Ball).
 * Do not use this accessor as a substitute for the live target's BattleMon.weight. */
export function nativeSpeciesWeight(data:WeightData,species:number){
  return checkedWeight(bank(data,species).regular[species]);
}

/** battle_util.c initial BattleMon weight, before live transformations.
 * This deliberately preserves SetDexBanksByGiratinaForm's literal bank selection:
 * native form 0 selects the *_gira bank; other form values select the regular bank.
 * `form` is the original five-bit BattleMon field, NOT a personal-table index.
 * This does not validate species-specific form legality. The battle host must do so.
 * Transform copies live weight with the first 40 BattleMon bytes. A future host
 * supporting Transform must retain that copied value instead of recalculating it.
 * Native mid-battle Giratina form changes also retain existing weight. Do not
 * reload weight on form changes. Safari/Pal Park can force the player's initial
 * BattleMon form to0: pass that actual field, not an unadjusted party form. */
export function nativeBattleWeight(data:WeightData,species:number,form:number){
  if(!Number.isInteger(form)||form<0||form>31)
    throw new UnsupportedBattleWeight('Battle weight requires an explicit native five-bit form (0..31)');
  const weights=bank(data,species);
  return checkedWeight((form===weights.giraSelectedForm?weights.gira:weights.regular)[species]);
}

/** BtlCmd_CalcWeightBasedPower. Call with the CURRENT target's initialized live
 * weight. Inclusive thresholds are intentional; all values are in hectograms.
 * No move resolution, target state, form lifecycle or battle-engine support is
 * implied by this pure helper. Missing/invalid host state stays explicit. */
export function nativeWeightBasedPower(weight:number){
  checkedWeight(weight);
  for(const[limit,power]of NATIVE_SPECIES_WEIGHTS.lowKickTable){
    if(limit===0xffff)break;
    if(weight<=limit)return power;
  }
  return NATIVE_SPECIES_WEIGHTS.lowKickFallback;
}
