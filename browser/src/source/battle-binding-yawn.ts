import {nativeStatus2,type NativeDraw16} from './battle-volatiles.ts';
function integer(value:number,min:number,max:number,label:string){if(!Number.isInteger(value)||value<min||value>max)throw RangeError(`Invalid native ${label}`);return value;}
function status(value:number){return integer(value,0,0xffffffff,'status2');}
/** BindStart0058: admission (hit, live target, no Substitute) belongs to the
 * host. A duplicate does not refresh or draw. GripClaw overrides AFTER Random. */
export function nativeBindingStart(value:number,rng:NativeDraw16,gripClaw:boolean){
  status(value);if(value&nativeStatus2.bind)return{status2:value,applied:false};
  const raw=integer(rng(),0,65535,'u16 RNG result'),turns=gripClaw?6:raw%4+3;
  return{status2:(value|(turns<<13))>>>0,applied:true};
}
/** UMC_BINDING decrements before calling0059/0060. The activation turn counts;
 * count1 expires without damage. MagicGuard suppresses0059, not the counter. */
export function nativeBindingTick(value:number,hp:number,maxHP:number,magicGuard:boolean){
  status(value);integer(maxHP,1,65535,'maximum HP');integer(hp,0,maxHP,'HP');
  if(!(value&nativeStatus2.bind)||!hp)return{status2:value,outcome:'none' as const,damage:0};
  const next=value-(1<<13);return{status2:next,outcome:next&nativeStatus2.bind?'bound' as const:'ended' as const,damage:!(next&nativeStatus2.bind)||magicGuard?0:Math.max(1,Math.floor(maxHP/16))};
}
/** CantEscape and BattlerCanSwitch share Bind/MeanLook but not their bypasses.
 * GenIV Ghost types have no special exemption. This is not ability trapping. */
export function nativeBindingBlocks(value:number,action:'switch'|'escape',context:{shedShell:boolean;smokeBall:boolean;runAway:boolean;noExperienceBattle:boolean}){
  status(value);return!!(value&(nativeStatus2.bind|nativeStatus2.meanLook))&&!(action==='switch'?context.shedShell:context.smokeBall||context.runAway||context.noExperienceBattle);
}

export type NativeSleepContext={ability:string;status:string;sun:boolean;uproar:boolean};
function sleepAbility(context:NativeSleepContext){return['ABILITY_INSOMNIA','ABILITY_VITAL_SPIRIT'].includes(context.ability)||context.sun&&context.ability==='ABILITY_LEAF_GUARD';}
/** Subscript0141: these are source-resolved field/ability decisions, not a
 * claim that Substitute, Uproar, Safeguard or sunny-weather hooks are hosted.
 * Soundproof bypasses Uproar's sleep prevention; Yawn itself is not sound. */
export function nativeYawnStart(turns:number,context:NativeSleepContext&{moldBreaker:boolean;substitute:boolean;safeguard:boolean}){
  integer(turns,0,2,'Yawn turns');
  if(!context.moldBreaker&&sleepAbility(context))return{turns,outcome:'ability' as const};
  if(context.substitute||context.uproar&&context.ability!=='ABILITY_SOUNDPROOF'||context.status)return{turns,outcome:'failed' as const};
  if(context.safeguard)return{turns,outcome:'safeguard' as const};
  if(turns)return{turns,outcome:'failed' as const};
  return{turns:2,outcome:'applied' as const};
}
/** UMC_YAWN counts its activation turn, then invokes0018 with statChangeType4.
 * Its ownerless moveEffectFlags survive the caster leaving and Rage's mask. */
export function nativeYawnTick(turns:number){integer(turns,0,2,'Yawn turns');return{turns:Math.max(0,turns-1),sleep:turns===1};}
/** FallAsleep0018's MOVE_EFFECT branch does NOT ignore sleep-blocking abilities
 * for MoldBreaker and does NOT recheck Safeguard/Substitute. It does recheck
 * current status and Uproar. No duration draw occurs on these failures. */
export function nativeYawnSleepGate(context:NativeSleepContext){
  if(sleepAbility(context))return'ability' as const;
  if(context.status==='SLP')return'already-asleep' as const;
  if(context.uproar&&context.ability!=='ABILITY_SOUNDPROOF')return'uproar' as const;
  return context.status?'status' as const:'sleep' as const;
}
// FallAsleep0018 Random3,2: native2..5, not a normalized float bucket.
export function nativeSleepDuration(rng:NativeDraw16){return integer(rng(),0,65535,'u16 RNG result')%4+2;}
/** CHECK_ATTACKER_STATUS subtracts2 for EarlyBird, otherwise1. Wake-up can
 * continue the selected action that turn, without another duration draw. */
export function nativeSleepTick(turns:number,earlyBird:boolean){integer(turns,0,7,'sleep turns');return Math.max(0,turns-(earlyBird?2:1));}
