/** Explicit source battle context, not inferred from the currently active mon.
 * Counts come from living party members with source participation flags/item
 * effects, including level100 members. Tracking those flags is the caller's job.
 */
export type ExperienceContext={
  baseYield:number;
  defeatedLevel:number;
  trainerBattle:boolean;
  experienceEnabled:boolean;
  participantCount:number;
  expShareCount:number;
};
export type ExperienceRecipient={
  species:number;
  hp:number;
  level:number;
  isEgg?:boolean;
  participated:boolean;
  /** Native item HOLD_EFFECT_... value, not an item name or two stacked items. */
  heldEffect:string;
  /** BattleSystem_IsPlayerOT compares OT ID, gender AND name. Foreign language
   * boosts only a non-player-OT mon. Legacy name-only data cannot prove a trade.
   */
  ownership:'player'|'traded-domestic'|'traded-international';
};
export type ExperienceReward={amount:number;boosted:boolean};
const noReward=():ExperienceReward=>({amount:0,boosted:false});
function integer(value:number,min:number,max:number,name:string){if(!Number.isInteger(value)||value<min||value>max)throw RangeError('Invalid experience '+name);}

/** battle_command.c:BtlCmd_CalcExpGain and Task_GetExp's single-battle award.
 * Does not mutate EXP/EVs, track participants, infer ownership, animate levelups
 * or cap cumulative EXP at the growth table's level100 limit.
 */
export function nativeExperienceReward(context:ExperienceContext,recipient:ExperienceRecipient):ExperienceReward{
  if(!/^HOLD_EFFECT_[A-Z0-9_]+$/.test(recipient.heldEffect))throw TypeError('Experience requires a native held effect, not an item key');
  const share=recipient.heldEffect==='HOLD_EFFECT_EXP_SHARE';
  // Eggs cannot legally participate or hold an item in the native field game.
  // Keep that invariant explicit when browser saves supply optional isEgg.
  if(!context.experienceEnabled||!recipient.species||recipient.hp<=0||recipient.isEgg||recipient.level===100||(!recipient.participated&&!share))return noReward();
  integer(context.baseYield,0,255,'base yield');integer(context.defeatedLevel,1,100,'defeated level');integer(recipient.level,1,99,'recipient level');
  integer(context.participantCount,0,6,'participant count');integer(context.expShareCount,0,6,'Exp. Share count');
  if(recipient.participated&&!context.participantCount)throw RangeError('Invalid experience participant count');
  if(share&&!context.expShareCount)throw RangeError('Exp. Share recipient missing from explicit holder count');
  const total=Math.floor(context.baseYield*context.defeatedLevel/7);
  // With no living participants only a share holder can consume an award.
  // Skip the unused participant pool rather than inventing a denominator.
  const participantPortion=context.participantCount?Math.max(1,Math.floor((context.expShareCount?Math.floor(total/2):total)/context.participantCount)):0;
  const sharePortion=context.expShareCount?Math.max(1,Math.floor(Math.floor(total/2)/context.expShareCount)):0;
  let amount=(recipient.participated?participantPortion:0)+(share?sharePortion:0);
  if(recipient.heldEffect==='HOLD_EFFECT_EXP_UP')amount=Math.floor(amount*150/100);
  if(context.trainerBattle)amount=Math.floor(amount*150/100);
  if(recipient.ownership==='traded-domestic')amount=Math.floor(amount*150/100);
  else if(recipient.ownership==='traded-international')amount=Math.floor(amount*170/100);
  return{amount,boosted:recipient.ownership!=='player'};
}

export type ExperienceBattleContext=Omit<ExperienceContext,'participantCount'|'expShareCount'>;
export type ExperiencePartySlot=Omit<ExperienceRecipient,'participated'|'heldEffect'>&{heldItem:string|null};
export type ExperiencePartyPlan={participantCount:number;expShareCount:number;rewards:(ExperienceReward&{index:number})[]};

/** Resolve the original item table once per slot. Item keys are not effects. */
function heldEffect(items:readonly Readonly<Record<string,string>>[],item:string|null){
  if(item===null)return'HOLD_EFFECT_NONE';
  const effect=items.find(record=>record.item===item)?.holdEffect;
  if(!effect||!/^HOLD_EFFECT_[A-Z0-9_]+$/.test(effect))throw Error('Missing native experience held effect for '+item);
  return effect;
}

/** Plan one fainted enemy's complete SINGLE-battle party award before mutation.
 * participationMask is the caller's actual per-enemy native party-slot bitset;
 * it is never inferred from the currently active mon or previous awards.
 */
export function planNativeExperience(context:ExperienceBattleContext,party:readonly ExperiencePartySlot[],participationMask:number,items:readonly Readonly<Record<string,string>>[]):ExperiencePartyPlan{
  integer(context.baseYield,0,255,'base yield');integer(context.defeatedLevel,1,100,'defeated level');
  integer(party.length,0,6,'party size');integer(participationMask,0,63,'participation mask');
  if(participationMask>>>party.length)throw RangeError('Experience participation mask refers to an absent party slot');
  // Validate and resolve the entire party before calculating any award. This
  // function never changes party EXP, HP, levels, EVs, items or the mask.
  const recipients=party.map((slot,index)=>{
    integer(slot.species,0,493,'recipient species');integer(slot.hp,0,65535,'recipient HP');
    integer(slot.level,1,100,'recipient level');
    if(!['player','traded-domestic','traded-international'].includes(slot.ownership))throw TypeError('Missing explicit experience ownership');
    return{...slot,participated:!!(participationMask&(1<<index)),heldEffect:heldEffect(items,slot.heldItem)};
  });
  const living=recipients.filter(slot=>slot.species>0&&slot.hp>0&&!slot.isEgg);
  // Native count checks omit level100, while Task_GetExp skips its award.
  const participantCount=living.filter(slot=>slot.participated).length;
  const expShareCount=living.filter(slot=>slot.heldEffect==='HOLD_EFFECT_EXP_SHARE').length;
  const pools={...context,participantCount,expShareCount};
  const rewards=recipients.map((slot,index)=>({index,...nativeExperienceReward(pools,slot)}));
  return{participantCount,expShareCount,rewards};
}
