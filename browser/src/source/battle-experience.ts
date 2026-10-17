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
  // The current normal single-battle path always has a living flagged
  // participant. A zero denominator is not silently converted to invented EXP.
  integer(context.participantCount,1,6,'participant count');integer(context.expShareCount,0,6,'Exp. Share count');
  if(share&&!context.expShareCount)throw RangeError('Exp. Share recipient missing from explicit holder count');
  const total=Math.floor(context.baseYield*context.defeatedLevel/7);
  const participantPortion=Math.max(1,Math.floor((context.expShareCount?Math.floor(total/2):total)/context.participantCount));
  const sharePortion=context.expShareCount?Math.max(1,Math.floor(Math.floor(total/2)/context.expShareCount)):0;
  let amount=(recipient.participated?participantPortion:0)+(share?sharePortion:0);
  if(recipient.heldEffect==='HOLD_EFFECT_EXP_UP')amount=Math.floor(amount*150/100);
  if(context.trainerBattle)amount=Math.floor(amount*150/100);
  if(recipient.ownership==='traded-domestic')amount=Math.floor(amount*150/100);
  else if(recipient.ownership==='traded-international')amount=Math.floor(amount*170/100);
  return{amount,boosted:recipient.ownership!=='player'};
}
