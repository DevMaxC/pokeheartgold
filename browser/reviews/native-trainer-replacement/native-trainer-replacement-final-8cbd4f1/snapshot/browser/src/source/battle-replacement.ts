import type {GameData} from './types.ts';

type ReplacementData=Pick<GameData,'constants'|'moves'|'typeChart'>;
/** Native party data, not the active battler's transformed battle data. Mono-types repeat both slots. */
export type TrainerReplacementMon={species:number;isEgg?:boolean;hp:number;types:readonly[number,number];ability:number;heldEffect:number;naturalGiftType?:number;ivs?:readonly number[];moves:readonly number[]};
export type TrainerReplacementEnvironment={gravity?:boolean;weather?:readonly('rain'|'sandstorm'|'sun'|'hail')[];weatherSuppressed?:boolean;chargeMoveHit?:boolean};
export type TrainerReplacementContext={
  party:readonly TrainerReplacementMon[];activePartyIndex:number;
  /** Native AI preselection plus optional extra partner exclusions. Omit partner fields in singles: native partner aliases this actor; default6 adds no extra exclusion. */
  partnerPartyIndex?:number;aiSwitchedPartyIndex?:number;partnerAISwitchedPartyIndex?:number;
  opponent:{types:readonly[number,number];ability:number;heldEffect:number};environment?:TrainerReplacementEnvironment;
};
export type TrainerReplacementEvaluator={
  /** CalcMoveDamage(...,outgoingBattler,opponent,crit=1), before STAB/type and without random range.
   * MUST use the current/just-fainted actor's stats, stages, ability, held item and field state.
   * Status moves with power=0 are evaluated too; only move=0 and power=1 skip this call. */
  currentActorDamage:(move:number)=>number;
  /** BattleSystem_ApplyTypeEffectiveness using that SAME current actor, not the reserve.
   * The score argument has ALREADY wrapped to u8. Include native STAB/type/item/ability order.
   * moveTypeOverride=0 means use move data, NOT an explicit Normal type. */
  applyCurrentActorType:(move:number,moveTypeOverride:number,scoreU8:number)=>{damage:number;immune:boolean};
};
export const NO_TRAINER_REPLACEMENT=6;
const SE=2,NVE=4,NO_EFFECT=8;
function u8(value:number){if(!Number.isSafeInteger(value)||value<0)throw RangeError('Native replacement score must be a nonnegative integer');return value%256;}
function slot(value:number){if(!Number.isInteger(value)||value<0||value>6)throw RangeError('Native party slot must be 0..6');return value;}
function moveData(data:ReplacementData,move:number){const row=data.moves[move];if(!row)throw Error(`Missing native replacement move ${move}`);return row;}

// battle_util.c:CalculateTypeEffectiveness. The imported table retains source order
// and the Foresight/end sentinels, and stores multipliers divided by ten.
export function nativeReplacementTypeScore(data:ReplacementData,moveType:number,types:readonly[number,number]){
  let damage=40;
  for(const [attack,defense,multiplier] of data.typeChart){
    if(attack===255)break;
    if(attack===moveType){if(defense===types[0])damage=Math.trunc(damage*multiplier);if(types[0]!==types[1]&&defense===types[1])damage=Math.trunc(damage*multiplier);}
  }
  return damage;
}

/** TrainerAI_GetMoveType returns an OVERRIDE, normally zero. It is not moveData.type. */
export function nativeTrainerMoveType(data:ReplacementData,mon:TrainerReplacementMon,move:number,environment:TrainerReplacementEnvironment={}){
  const c=data.constants;
  if(move===c.MOVE_NATURAL_GIFT){const type=mon.naturalGiftType;if(type===undefined||!Number.isInteger(type)||type<0||type>17)throw Error('Native Natural Gift item type is required');return type;}
  if(move===c.MOVE_JUDGMENT){
    const plates=['FIRE','WATER','ELECTRIC','GRASS','ICE','FIGHTING','POISON','GROUND','FLYING','PSYCHIC','BUG','ROCK','GHOST','DRAGON','DARK','STEEL'];
    return c[`TYPE_${plates.find(type=>c[`HOLD_EFFECT_ARCEUS_${type}`]===mon.heldEffect)||'NORMAL'}`];
  }
  if(move===c.MOVE_HIDDEN_POWER){
    if(mon.ivs?.length!==6||mon.ivs.some(iv=>!Number.isInteger(iv)||iv<0||iv>31))throw Error('Native Hidden Power requires six HP/Atk/Def/Speed/SpAtk/SpDef IVs');
    let bits=0;for(let i=0;i<6;i++)bits|=(mon.ivs[i]&1)<<i;
    let type=Math.trunc(bits*15/63)+1;if(type>=c.TYPE_MYSTERY)type++;return type;
  }
  if(move===c.MOVE_WEATHER_BALL){
    // Native local `type` is uninitialized if weather is absent/suppressed (also fog-only).
    // Do not fabricate parity for this undefined branch.
    if(environment.weatherSuppressed||!environment.weather?.length)throw Error('Unsupported native AI Weather Ball without active unsuppressed weather');
    let type=0;for(const [weather,key] of [['rain','WATER'],['sandstorm','ROCK'],['sun','FIRE'],['hail','ICE']]as const)if(environment.weather.includes(weather))type=c[`TYPE_${key}`];
    return type;
  }
  return 0;
}

// battle_util.c:CalcTypeEffectivenessFlags / ApplyEffectivenessFlags. This is
// deliberately NOT a combined multiplier: source-order flags can retain SE
// alongside NO_EFFECT (for example Electric against Ground/Flying).
export function nativeReplacementMoveFlags(data:ReplacementData,mon:TrainerReplacementMon,move:number,override:number,opponent:TrainerReplacementContext['opponent'],environment:TrainerReplacementEnvironment={}){
  const c=data.constants;if(move===c.MOVE_STRUGGLE)return 0;
  const type=mon.ability===c.ABILITY_NORMALIZE?c.TYPE_NORMAL:override||moveData(data,move).type;
  let flags=0;
  if(mon.ability!==c.ABILITY_MOLD_BREAKER&&opponent.ability===c.ABILITY_LEVITATE&&type===c.TYPE_GROUND&&!environment.gravity&&opponent.heldEffect!==c.HOLD_EFFECT_SPEED_DOWN_GROUNDED)flags|=NO_EFFECT;
  else for(const [attack,defense,multiplier]of data.typeChart){
    if(attack===255)break;
    if(attack===254){if(mon.ability===c.ABILITY_SCRAPPY)break;continue;}
    if(attack!==type||defense===c.TYPE_FLYING&&multiplier===0&&(environment.gravity||opponent.heldEffect===c.HOLD_EFFECT_SPEED_DOWN_GROUNDED))continue;
    const count=Number(defense===opponent.types[0])+Number(opponent.types[0]!==opponent.types[1]&&defense===opponent.types[1]);
    for(let i=0;i<count;i++){
      if(multiplier===0)flags=(flags|NO_EFFECT)&~(SE|NVE);
      else if(multiplier===.5)flags=flags&SE?flags&~SE:flags|NVE;
      else if(multiplier===2)flags=flags&NVE?flags&~NVE:flags|SE;
    }
  }
  const chargeEffects=['BIDE','CHARGE_TURN_HIGH_CRIT','CHARGE_TURN_HIGH_CRIT_FLINCH','CHARGE_TURN_DEF_UP','151','FLY','DIVE','DIG','BOUNCE','FLINCH_BURN_HIT'];
  const charge=chargeEffects.some(effect=>c[`MOVE_EFFECT_${effect}`]===moveData(data,move).effect);
  if(mon.ability!==c.ABILITY_MOLD_BREAKER&&opponent.ability===c.ABILITY_WONDER_GUARD&&(!charge||environment.chargeMoveHit)&&(!(flags&SE)||(flags&(SE|NVE))===(SE|NVE)))flags|=NO_EFFECT;
  return flags;
}

/** TrainerAI_PostKOSwitchIn, ordinary singles only. No RNG, PP checks or mutations. */
export function nativePostKOTrainerReplacement(data:ReplacementData,context:TrainerReplacementContext,evaluator:TrainerReplacementEvaluator){
  const {party,opponent,environment}=context;
  if(party.length>6)throw RangeError('Native trainer party exceeds six slots');
  const excluded=[context.activePartyIndex,context.partnerPartyIndex??6,context.aiSwitchedPartyIndex??6,context.partnerAISwitchedPartyIndex??6].map(slot);
  const eligible=(i:number)=>party[i].species!==0&&party[i].species!==data.constants.SPECIES_EGG&&!party[i].isEgg&&party[i].hp!==0&&!excluded.includes(i);
  let disregarded=0,score=0,picked=6;
  // `score` persists into stage2, including across skipped power1/empty moves.
  // For a legal eligible party it is assigned by stage1 before stage2 uses it.
  while(disregarded!==0x3f){
    let maximum=0;picked=6;
    for(let i=0;i<party.length;i++){
      if(eligible(i)&&!(disregarded&(1<<i))){
        score=u8(nativeReplacementTypeScore(data,party[i].types[0],opponent.types));
        score=u8(score+nativeReplacementTypeScore(data,party[i].types[1],opponent.types));
        if(maximum<score){maximum=score;picked=i;}
      }else disregarded|=1<<i;
    }
    if(picked===6)break;
    const mon=party[picked];let superEffective=false;
    for(let j=0;j<4;j++){
      const move=mon.moves[j]??0,override=nativeTrainerMoveType(data,mon,move,environment);
      if(move&&nativeReplacementMoveFlags(data,mon,move,override,opponent,environment)&SE){superEffective=true;break;}
    }
    if(superEffective)return picked;
    disregarded|=1<<picked;
  }
  let maximum=0;picked=6;
  for(let i=0;i<party.length;i++)if(eligible(i))for(let j=0;j<4;j++){
    const move=party[i].moves[j]??0,override=nativeTrainerMoveType(data,party[i],move,environment);
    if(move&&moveData(data,move).power!==1){
      score=u8(evaluator.currentActorDamage(move));
      const effect=evaluator.applyCurrentActorType(move,override,score);
      score=u8(effect.damage);if(effect.immune)score=0;
    }
    if(maximum<score){maximum=score;picked=i;}
  }
  return picked;
}

/** Task_AIShowMonList: honor preselection, then AI, then first-HP source fallback.
 * Returns a zero-based slot (native reply is slot+1). When no reserve exists the
 * source fallback returns party.length; caller must check bounds before sendout.
 * Fallback intentionally only checks HP/selected slots. Real trainer parties must
 * contain no Eggs/empty species; do not use this task as a player party chooser. */
export function nativeTrainerReplacement(data:ReplacementData,context:TrainerReplacementContext,evaluator:TrainerReplacementEvaluator){
  const preselected=slot(context.aiSwitchedPartyIndex??6);if(preselected!==6)return preselected;
  const selected=nativePostKOTrainerReplacement(data,context,evaluator);if(selected!==6)return selected;
  const found=context.party.findIndex((mon,i)=>mon.hp!==0&&i!==context.activePartyIndex&&i!==(context.partnerPartyIndex??6));
  return found<0?context.party.length:found;
}
