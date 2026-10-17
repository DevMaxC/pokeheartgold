/** Pure Gen IV primitives, deliberately not admitted by Battle's effect list.
 * Hosts must supply native phase/ability/item decisions; see the source contract.
 * Volatiles belong to an active battler, never the saved party Pokémon. */
export const nativeStatus2={confusion:7,focusEnergy:1<<20,rage:1<<23,bind:7<<13,attract:15<<16,meanLook:1<<26,curse:1<<28}as const;
export type NativeBattlerVolatile={status2:number;meanLookSource:number;previousMove:number};
export type NativeDraw16=()=>number;
function integer(value:number,min:number,max:number,label:string){if(!Number.isInteger(value)||value<min||value>max)throw RangeError(`Invalid native ${label}`);return value;}
function status(value:number){return integer(value,0,0xffffffff,'status2');}
function draw(rng:NativeDraw16){return integer(rng(),0,0xffff,'u16 RNG result');}
export function initialNativeVolatile():NativeBattlerVolatile{return{status2:0,meanLookSource:0,previousMove:0};}

/** BEFORE_TURN retains only Rage when a raging battler selected a different
 * move. This literal native mask also removes confusion/FocusEnergy/Curse. */
export function nativeBeforeTurnStatus2(value:number,selectedMove:number,rageMove:number){status(value);return value&nativeStatus2.rage&&selectedMove!==rageMove?nativeStatus2.rage:value;}

// subscript0037: Random3,2 -> raw%(3+1)+2. Admission guards precede this draw.
export function nativeConfusionDuration(rng:NativeDraw16){return draw(rng)%4+2;}
/** CHECK_ATTACKER_STATUS case11, after sleep/freeze/flinch/etc and before PAR,
 * PP, accuracy or attack. The host handles the requested40-power self damage. */
export function nativeConfusionCheck(value:number,rng:NativeDraw16){
  status(value);if(!(value&nativeStatus2.confusion))return{status2:value,outcome:'none' as const};
  const next=value-1;if(!(next&nativeStatus2.confusion))return{status2:next,outcome:'snapped-out' as const};
  return{status2:next,outcome:draw(rng)&1?'act' as const:'self-hit' as const};
}
export function nativeFocusEnergy(value:number){status(value);return{status2:(value|nativeStatus2.focusEnergy)>>>0,applied:!(value&nativeStatus2.focusEnergy)};}
/** TryCriticalHit: extraStages is the already source-resolved move/held-item/
 * SuperLuck sum. Armor/LuckyChant are checked AFTER consuming the crit draw. */
export function nativeCriticalMultiplier(value:number,extraStages:number,rng:NativeDraw16,context:{blocked:boolean;sniper:boolean}){
  status(value);integer(extraStages,0,0xffff,'extra critical stages');const stage=Math.min(4,extraStages+((value&nativeStatus2.focusEnergy)?2:0));
  const critical=draw(rng)%[16,8,4,3,2][stage]===0;return critical&&!context.blocked?(context.sniper?3:2):1;
}

export type NativePP={id:number;pp:number;maxPP:number};
/** TrySpite uses moveNoBattlerPrev, the first matching move, and no RNG.
 * This is the native TryMove flag history, not a hit/effect-success history. */
export function nativeSpite(moves:readonly NativePP[],previousMove:number){
  if(moves.length>4)throw RangeError('Invalid native move slots');integer(previousMove,0,0xffff,'previous move');
  const slot=previousMove?moves.findIndex(move=>move.id===previousMove):-1;if(slot<0)return null;
  const move=moves[slot];integer(move.pp,0,255,'move PP');if(move.pp===0)return null;const lost=Math.min(4,move.pp);
  return{slot,move:previousMove,lost,moves:moves.map((value,index)=>index===slot?{...value,pp:value.pp-lost}:value)};
}
/** UpdateMoveHistory uses the literal MOVE_SUCCEEDED flag: TryMove sets it
 * BEFORE accuracy/effect-script failure. A later miss/failed FocusEnergy is
 * recorded too. NO_MOVE_SET instead preserves the previous history. */
export function nativePreviousMove(previous:number,current:number,flags:{noMoveSet:boolean;moveSucceededFlag:boolean}){integer(previous,0,0xffff,'previous move');integer(current,0,0xffff,'current move');return flags.noMoveSet?previous:flags.moveSucceededFlag?current:0;}

/** Narrow SINGLE-battle MeanLook/history departure primitive, not the full
 * native leave pipeline or BatonPass. Attract/Bind ownership is unported and
 * must reject here until a host implements those native cleanup branches.
 * Source departure clears its victims' MeanLook flag; its stale owner byte is
 * harmless and retained just as in InitSwitchWork/InitFaintedWork. */
export function nativeMeanLookOnLeave(battlers:readonly NativeBattlerVolatile[],leaving:number){
  if(battlers.length!==2)throw RangeError('Only native single-battle MeanLook departure is implemented');integer(leaving,0,1,'leaving battler');
  for(const value of battlers){status(value.status2);if(value.status2&(nativeStatus2.attract|nativeStatus2.bind))throw Error('Unsupported native Attract/Bind departure ownership');}
  return battlers.map((value,index)=>{status(value.status2);return index===leaving?initialNativeVolatile():{...value,status2:value.meanLookSource===leaving?(value.status2&~nativeStatus2.meanLook)>>>0:value.status2};});
}
/** The ordinary-switch ShedShell bypass differs from Escape's SmokeBall/
 * RunAway/NO_EXP bypass. Gen IV does not give Ghost types trap immunity. */
export function nativePlayerMeanLookBlocks(value:number,action:'switch'|'escape',context:{shedShell:boolean;smokeBall:boolean;runAway:boolean;noExperienceBattle:boolean}){
  status(value);return!!(value&nativeStatus2.meanLook)&&!(action==='switch'?context.shedShell:context.smokeBall||context.runAway||context.noExperienceBattle);
}

/** Enemy RunInput has a distinct hard gate, with no player escape bypass. */
export function nativeEnemyTrapBlocksEscape(value:number){status(value);return!!(value&(nativeStatus2.bind|nativeStatus2.meanLook));}

function maximumHP(value:number){return integer(value,1,65535,'maximum HP');}
export function nativeCurseKind(currentTypes:readonly number[],ghostType:number){return currentTypes.includes(ghostType)?'ghost' as const:'normal' as const;}
// DamageDivide has a minimum absolute1 for nonzero numerators.
export function nativeGhostCurseCost(maxHP:number){return Math.max(1,Math.floor(maximumHP(maxHP)/2));}
export function nativeCurseResidual(maxHP:number,magicGuard:boolean){maximumHP(maxHP);return magicGuard?0:Math.max(1,Math.floor(maxHP/4));}
/** The source subscript always attempts speed, attack, defense in this order;
 * actual stat-stage admission/messages remain the existing native host's job. */
export const nativeNormalCurseChanges=[['speed',-1],['atk',1],['def',1]]as const;

export function nativeReflectStart(turns:number,heldExtension:number){integer(turns,0,8,'logical Reflect turns');if(heldExtension!==0&&heldExtension!==3)throw RangeError('Unsupported native screen extension');return turns?{applied:false,turns}:{applied:true,turns:5+heldExtension};}
/** Field-condition update precedes per-mon poison/burn/Curse. The activation
 * turn counts; the side state survives an ordinary party switch. */
export function nativeReflectTick(turns:number){integer(turns,0,8,'logical Reflect turns');return{turns:Math.max(0,turns-1),expired:turns===1};}
/** CalcMoveDamage applies screens to its physical intermediate AFTER burn,
 * BEFORE +2, critical multiplier, range, STAB and type. Not final damage/2. */
export function nativeReflectIntermediate(damage:number,context:{active:boolean;physical:boolean;criticalMultiplier:number;removesScreens:boolean;doubleBattleTwoTargets:boolean}){
  integer(damage,0,0x7fffffff,'damage intermediate');if(!context.active||!context.physical||context.criticalMultiplier!==1||context.removesScreens)return damage;
  return context.doubleBattleTwoTargets?Math.floor(damage*2/3):Math.floor(damage/2);
}

/** Pure first gates of subscript0175, run only after a successful U-turn hit.
 * No trapping gate is present: CanSwitchMon checks reserve life/Egg slots.
 * This is NOT a pivot implementation and must not admit move effect228. */
export function nativePivotGate(defenderPartyHP:number,hasUserReserve:boolean){integer(defenderPartyHP,0,6*65535,'opposing party HP');return defenderPartyHP===0?'battle-over' as const:!hasUserReserve?'no-reserve' as const:'continue' as const;}
export const nativePivotPhases=['opponent-blackout','user-reserve','ability-on-hit','held-item-on-pivot','destiny-bond','grudge','attacker-alive','recall-message','pursuit','attacker-alive-after-pursuit','status-on-switch','withdraw-animation','party-selection','switch-and-update','hazards']as const;
