import type {GameData,State,Mon,MoveData} from './types.ts';
import {calculateStats,createMon,giveMon,speciesName,titleCase,itemName,moveName,trainerName} from './data.ts';
import {catchShakes,confusionDamage,fixedMoveDamage,fieldBattleWeather,freshStages,monAbility,moveBaseDamage,moveDamage,multiHitCount,stageHitChance,stageMultiplier,weatherHPRecovery,type BattleWeather,type Stages} from './battle-math.ts';
import {UI,$,escapeHTML as esc} from './ui.ts';
import {takeBagItem,isCaptureBall} from './bag.ts';
import type {BattleView} from './battle-view.ts';
import type {BattleEvolutionCompletion,NativeBattleOutcome} from './battle-evolution-types.ts';
import {isUsableBattler,firstUsableBattlerIndex} from './battle-party.ts';
import {spriteGender,genderSymbol} from './gender.ts';
import {nativeTrainerReplacement,type TrainerReplacementMon} from './battle-replacement.ts';
import {planNativeExperience} from './battle-experience.ts';
import {nativeBattleWeight,UnsupportedBattleWeight} from './battle-weight.ts';
import {nativeBindingStart,nativeBindingTick,nativeBindingBlocks,nativeYawnStart,nativeYawnTick,nativeYawnSleepGate,nativeSleepDuration,nativeSleepTick} from './battle-binding-yawn.ts';
import {initialNativeVolatile,nativeStatus2,nativeConfusionCheck,nativeConfusionDuration,nativeFocusEnergy,nativeCriticalMultiplier,nativeSpite,nativePreviousMove,nativeGhostCurseCost,nativeCurseResidual,nativeReflectStart,nativeReflectTick,type NativeBattlerVolatile} from './battle-volatiles.ts';

type Result=NativeBattleOutcome;
type Action={kind:'move';slot:number}|{kind:'switch';index:number}|{kind:'item';item:string}|{kind:'run'};
const implementedEffects=new Set([0,1,2,3,4,5,6,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,29,31,32,33,40,41,42,43,44,47,48,49,50,51,52,53,54,55,56,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,78,81,85,87,100,103,106,109,113,132,149,156,187,196,201,210,214,228]);
// constants/moves.h: SINGLE, RANDOM_OPPONENT, ADJACENT_OPPONENTS, ALL_ADJACENT.
// Self/side/field targets still exist without a living opposing active mon.
const singleBattleLiveOpponentTargets=new Set([0,2,4,8]);
// BattleCtx_IsIdenticalToCurrentMove's complete native effect table. Its
// first-turn TryNoTarget predicate is false: the charge script must run even
// without an opponent. Charge/locked-turn state is unported, so keep all of
// these effects unsupported instead of claiming a completed no-target action.
const unportedChargeEffects=new Set([26,39,75,145,151,155,255,256,263,272]);
export class Battle{
  private levelUpEvolutionMask=0;private evolutionSerial=0;private latestEvolutionCompletion:BattleEvolutionCompletion|null=null;
  /** Field host awaits its evolution controller before source rewards/resume. */
  get evolutionCompletion(){return this.latestEvolutionCompletion;}
  active=false;private enemies:Mon[]=[];private enemyIndex=0;private playerIndex=0;private trainer:number|null=null;
  private playerStages=freshStages();private enemyStages=freshStages();private resolve:((r:Result)=>void)|null=null;private actions:((a:Action)=>void)|null=null;
  private experienceMask=0;private fleeAttempts=0;private turns=0;private flinch=false;private messageText='';
  private identified=new Set<Mon>();private curled=new Set<Mon>();
  private roosting=new Set<Mon>();private raging=new Set<Mon>();private weather:BattleWeather='clear';
  // moveEffectFlags, not status2: Rage's before-turn status2 mask retains them.
  private mudSport=new Set<Mon>();private waterSport=new Set<Mon>();
  private unresolvedAbilityWeather=false;private unresolvedAttackEntry=new Set<Mon>();private unresolvedAttackEntryWithoutTarget=false;
  private yawnTurns=new Map<Mon,number>();
  private bindings=new Map<Mon,{source:0|1;move:number}>();
  private liveWeights=new Map<Mon,number|UnsupportedBattleWeight>();
  private selectedMoveSlots=new Map<Mon,number>();private pendingMoves=new Map<Mon,number>();
  private volatiles=new Map<Mon,NativeBattlerVolatile>();private reflectTurns:[number,number]=[0,0];
  private tutorial=false;private noCritical=false;
  readonly data:GameData;readonly state:State;readonly ui:UI;readonly rng:()=>number;readonly view?:BattleView;
  constructor(data:GameData,state:State,ui:UI,rng:()=>number=Math.random,view?:BattleView){this.data=data;this.state=state;this.ui=ui;this.rng=rng;this.view=view;}
  get player(){return this.state.party[this.playerIndex];}get enemy(){return this.enemies[this.enemyIndex];}
  private volatile(mon:Mon){let value=this.volatiles.get(mon);if(!value){value=initialNativeVolatile();this.volatiles.set(mon,value);}return value;}
  private random16(){return Math.floor(this.rng()*0x10000);}
  private rawHeld(mon:Mon){if(!mon.heldItem)return null;const item=this.data.items.find(item=>item.item===mon.heldItem);if(!item)throw Error('Missing native held item '+mon.heldItem);return item;}
  private held(mon:Mon){return monAbility(this.data,mon)==='ABILITY_KLUTZ'?null:this.rawHeld(mon);}
  private clearBattleVolatiles(){this.volatiles.clear();this.unresolvedAbilityWeather=false;this.unresolvedAttackEntry.clear();this.unresolvedAttackEntryWithoutTarget=false;this.bindings.clear();this.yawnTurns.clear();this.reflectTurns=[0,0];this.identified.clear();this.curled.clear();this.raging.clear();this.roosting.clear();this.mudSport.clear();this.waterSport.clear();this.liveWeights.clear();this.selectedMoveSlots.clear();this.pendingMoves.clear();}
  private sportContext(){return{mudSport:[this.player,this.enemy].some(mon=>this.mudSport.has(mon)),waterSport:[this.player,this.enemy].some(mon=>this.waterSport.has(mon))};}
  private initializeWeight(mon:Mon){
    try{
      // Legacy ordinary party records omit form; their native default is0.
      // Extended/form-specific battle stats and form-changing effects remain
      // unported. Store an explicit failure for LowKick without blocking an
      // unrelated old move simply because it does not consume weight.
      const form=mon.form??0;if(form!==0)throw new UnsupportedBattleWeight('Unsupported native battle weight form lifecycle');
      this.liveWeights.set(mon,nativeBattleWeight(this.data,mon.species,form));
    }catch(error){if(!(error instanceof UnsupportedBattleWeight))throw error;this.liveWeights.set(mon,error);}
  }
  private targetWeight(mon:Mon){const value=this.liveWeights.get(mon);if(value===undefined)throw new UnsupportedBattleWeight('Missing initialized live BattleMon weight');if(value instanceof UnsupportedBattleWeight)throw value;return value;}
  private clearOnLeave(mon:Mon){
    const source=mon===this.player?0:1;for(const other of[this.player,this.enemy]){const value=this.volatile(other);if(value.meanLookSource===source)value.status2&=~nativeStatus2.meanLook;if(this.bindings.get(other)?.source===source){value.status2&=~nativeStatus2.bind;this.bindings.delete(other);}}
    this.volatiles.delete(mon);this.unresolvedAttackEntry.delete(mon);this.bindings.delete(mon);this.yawnTurns.delete(mon);this.identified.delete(mon);this.curled.delete(mon);this.raging.delete(mon);this.roosting.delete(mon);this.mudSport.delete(mon);this.waterSport.delete(mon);this.liveWeights.delete(mon);this.selectedMoveSlots.delete(mon);this.pendingMoves.delete(mon);
  }
  private critMultiplier(attacker:Mon,defender:Mon,move:MoveData):1|2|3{
    if(this.noCritical)return 1;const ability=monAbility(this.data,attacker),targetAbility=monAbility(this.data,defender),effect=this.held(attacker)?.holdEffect;
    const extra=Number(move.effect===43)+Number(effect==='HOLD_EFFECT_CRITRATE_UP')+Number(ability==='ABILITY_SUPER_LUCK')+2*Number(effect==='HOLD_EFFECT_CHANSEY_CRITRATE_UP'&&attacker.species===this.data.constants.SPECIES_CHANSEY)+2*Number(effect==='HOLD_EFFECT_FARFETCHD_CRITRATE_UP'&&attacker.species===this.data.constants.SPECIES_FARFETCHD);
    return nativeCriticalMultiplier(this.volatile(attacker).status2,extra,()=>this.random16(),{blocked:ability!=='ABILITY_MOLD_BREAKER'&&['ABILITY_BATTLE_ARMOR','ABILITY_SHELL_ARMOR'].includes(targetAbility),sniper:ability==='ABILITY_SNIPER'})as 1|2|3;
  }
  private async heldRecovery(mon:Mon){
    if(mon.hp<=0)return;const item=this.held(mon);if(!item)return;if(monAbility(this.data,mon)==='ABILITY_UNBURDEN')throw Error('Unsupported native held-item consumption ability');let used=false;const value=this.volatile(mon),boost=Number(item.holdEffectParam);
    if(['HOLD_EFFECT_HP_RESTORE','HOLD_EFFECT_HP_PCT_RESTORE'].includes(item.holdEffect)&&mon.hp<=Math.floor(mon.maxHP/2)){
      const amount=item.holdEffect==='HOLD_EFFECT_HP_RESTORE'?boost:Math.max(1,Math.floor(mon.maxHP*boost/100));mon.hp=Math.min(mon.maxHP,mon.hp+amount);used=true;
    }else if(({HOLD_EFFECT_PRZ_RESTORE:['PAR'],HOLD_EFFECT_SLP_RESTORE:['SLP'],HOLD_EFFECT_PSN_RESTORE:['PSN','TOX'],HOLD_EFFECT_BRN_RESTORE:['BRN'],HOLD_EFFECT_FRZ_RESTORE:['FRZ']}as Record<string,string[]>)[item.holdEffect]?.includes(mon.status)){mon.status='';mon.sleepTurns=0;used=true;}
    else if(item.holdEffect==='HOLD_EFFECT_CONFUSE_RESTORE'&&(value.status2&nativeStatus2.confusion)){value.status2&=~nativeStatus2.confusion;used=true;}
    else if(item.holdEffect==='HOLD_EFFECT_STATUS_RESTORE'&&(mon.status||(value.status2&nativeStatus2.confusion))){mon.status='';mon.sleepTurns=0;value.status2&=~nativeStatus2.confusion;used=true;}
    if(used){const name=itemName(this.data,mon.heldItem!);mon.heldItem=null;await this.say(`${mon.name} used its ${name}!`);}
  }
  private assertItemScope(attacker:Mon,defender:Mon){
    const safe=new Set(['HOLD_EFFECT_NONE','HOLD_EFFECT_EXTEND_TRAPPING','HOLD_EFFECT_HP_RESTORE','HOLD_EFFECT_HP_PCT_RESTORE','HOLD_EFFECT_PRZ_RESTORE','HOLD_EFFECT_SLP_RESTORE','HOLD_EFFECT_PSN_RESTORE','HOLD_EFFECT_BRN_RESTORE','HOLD_EFFECT_FRZ_RESTORE','HOLD_EFFECT_CONFUSE_RESTORE','HOLD_EFFECT_STATUS_RESTORE','HOLD_EFFECT_CRITRATE_UP','HOLD_EFFECT_CHANSEY_CRITRATE_UP','HOLD_EFFECT_FARFETCHD_CRITRATE_UP','HOLD_EFFECT_EXTEND_SCREENS','HOLD_EFFECT_SWITCH','HOLD_EFFECT_FLEE','HOLD_EFFECT_EXP_UP','HOLD_EFFECT_EXP_SHARE']);
    for(const mon of[attacker,defender]){const item=this.held(mon);if(item&&(!safe.has(item.holdEffect)||monAbility(this.data,mon)==='ABILITY_UNBURDEN'))throw Error('Unsupported native volatile held-item hook '+item.holdEffect);}
  }
  private assertDamageScope(attacker:Mon,defender:Mon){
    // These callbacks need the complete native damage modifier pipeline. Do
    // not silently apply only the new screen/crit/self-hit part to that path.
    const attackAbility=monAbility(this.data,attacker),targetAbility=monAbility(this.data,defender);
    if(['ABILITY_HUGE_POWER','ABILITY_PURE_POWER','ABILITY_SLOW_START','ABILITY_SIMPLE','ABILITY_UNAWARE','ABILITY_RIVALRY','ABILITY_SOLAR_POWER','ABILITY_FLOWER_GIFT','ABILITY_FLASH_FIRE','ABILITY_NORMALIZE','ABILITY_ADAPTABILITY','ABILITY_TINTED_LENS','ABILITY_RECKLESS','ABILITY_IRON_FIST'].includes(attackAbility)||['ABILITY_MARVEL_SCALE','ABILITY_THICK_FAT','ABILITY_HEATPROOF','ABILITY_DRY_SKIN','ABILITY_FILTER','ABILITY_SOLID_ROCK','ABILITY_SIMPLE','ABILITY_UNAWARE','ABILITY_WONDER_GUARD'].includes(targetAbility))throw Error('Unsupported native volatile damage ability');
    this.assertItemScope(attacker,defender);
  }
  private assertActionScope(attacker:Mon,defender:Mon,move:MoveData,playerSide:boolean){
    if(move.effect===187&&defender.hp>0){
      this.assertItemScope(attacker,defender);this.assertYawnSleepScope(defender);
      if(monAbility(this.data,defender)==='ABILITY_PRESSURE')throw Error('Unsupported native Yawn Pressure PP');
      if(monAbility(this.data,attacker)==='ABILITY_TRUANT')throw Error('Unsupported native Yawn Truant action phase');
    }
    if(move.effect===42&&defender.hp>0){
      this.assertBindingSleepEntryScope('binding',attacker);this.assertDamageScope(attacker,defender);
      if(monAbility(this.data,defender)==='ABILITY_INTIMIDATE')throw Error('Unsupported native binding target Intimidate entry');
      if(monAbility(this.data,defender)==='ABILITY_PRESSURE')throw Error('Unsupported native binding Pressure PP');
      const attackAbility=monAbility(this.data,attacker),targetAbility=monAbility(this.data,defender);
      if(attackAbility==='ABILITY_SCRAPPY'||attackAbility!=='ABILITY_MOLD_BREAKER'&&(move.type===this.data.constants.TYPE_FIRE&&targetAbility==='ABILITY_FLASH_FIRE'||move.type===this.data.constants.TYPE_WATER&&targetAbility==='ABILITY_WATER_ABSORB'))throw Error('Unsupported native binding immunity callback');
      if([attacker,defender].some(mon=>monAbility(this.data,mon)==='ABILITY_POISON_HEAL'&&['PSN','TOX'].includes(mon.status)))throw Error('Unsupported native binding PoisonHeal residual');
      if(['ABILITY_POISON_POINT','ABILITY_FLAME_BODY','ABILITY_EFFECT_SPORE','ABILITY_CUTE_CHARM','ABILITY_ROUGH_SKIN','ABILITY_COLOR_CHANGE','ABILITY_ANGER_POINT','ABILITY_AFTERMATH'].includes(monAbility(this.data,defender)))throw Error('Unsupported native binding on-hit ability');
      const suppressed=[this.player,this.enemy].some(mon=>mon.hp>0&&['ABILITY_CLOUD_NINE','ABILITY_AIR_LOCK'].includes(monAbility(this.data,mon)));
      if(this.weather!=='clear'&&!suppressed)throw Error('Unsupported native binding weather phases');
    }
    if(move.effect===196&&defender.hp>0){
      this.targetWeight(defender);this.assertDamageScope(attacker,defender);
      // Accuracy/extra-PP and entry-stat callbacks are not supplied by weight
      // data. Keep these branches explicit instead of admitting a partial hit.
      if([attacker,defender].some(mon=>['ABILITY_INTIMIDATE','ABILITY_DOWNLOAD','ABILITY_TRACE','ABILITY_DRIZZLE','ABILITY_DROUGHT','ABILITY_SAND_STREAM','ABILITY_SNOW_WARNING'].includes(monAbility(this.data,mon)))||monAbility(this.data,defender)==='ABILITY_PRESSURE')throw Error('Unsupported native LowKick ability phase');
      if(['ABILITY_POISON_POINT','ABILITY_FLAME_BODY','ABILITY_EFFECT_SPORE','ABILITY_CUTE_CHARM','ABILITY_ROUGH_SKIN','ABILITY_COLOR_CHANGE','ABILITY_ANGER_POINT','ABILITY_AFTERMATH'].includes(monAbility(this.data,defender)))throw Error('Unsupported native LowKick on-hit ability');
      const suppressed=[this.player,this.enemy].some(mon=>mon.hp>0&&['ABILITY_CLOUD_NINE','ABILITY_AIR_LOCK'].includes(monAbility(this.data,mon)));
      if(!suppressed&&this.weather!=='clear'){
        // Route33 rain changes Fire/Water damage, not this Fighting move.
        // Do not transfer that fact to unported rain speed/healing/form hooks.
        if(this.weather!=='rain'||[attacker,defender].some(mon=>['ABILITY_SWIFT_SWIM','ABILITY_RAIN_DISH','ABILITY_DRY_SKIN','ABILITY_HYDRATION','ABILITY_FORECAST'].includes(monAbility(this.data,mon))))throw Error('Unsupported native LowKick damage weather');
      }
    }
    if([201,210].includes(move.effect)){
      this.assertItemScope(attacker,defender);
      if(defender.hp>0&&monAbility(this.data,defender)==='ABILITY_PRESSURE')throw Error('Unsupported native Sport Pressure PP');
    }
    this.assertSportDamageScope(attacker,defender,move);
    if([40,41,87,47,49,65,100,106,109,228].includes(move.effect))this.assertItemScope(attacker,defender);
    if(defender.hp>0&&move.category!==2&&(move.flags&1)&&monAbility(this.data,defender)==='ABILITY_STATIC'){
      this.assertItemScope(attacker,defender);
      if(!attacker.status&&monAbility(this.data,attacker)==='ABILITY_SYNCHRONIZE')throw Error('Unsupported native Static Synchronize phase');
    }
    if(move.category!==2&&![40,41,87].includes(move.effect)&&(move.effect===228||this.reflectTurns[playerSide?1:0]||(this.volatile(attacker).status2&nativeStatus2.focusEnergy))){
      this.assertDamageScope(attacker,defender);
    }
    if(move.effect===49&&monAbility(this.data,defender)==='ABILITY_SOUNDPROOF'&&move.id===this.data.constants.MOVE_SUPERSONIC)throw Error('Unsupported native Soundproof move admission');
    if(move.effect!==228)return;
    // Validate the complete replacement evaluator before spending PP/HP. It
    // is RNG-free; the final selector is rerun with the post-hit native state.
    if(!playerSide&&this.enemies.some((mon,index)=>index!==this.enemyIndex&&isUsableBattler(mon)))this.chooseEnemyReplacement();
    // 0175 explicitly runs these hooks before withdrawing. None may be
    // deferred until after changing active identity or partially applying HP.
    const abilities=['ABILITY_POISON_POINT','ABILITY_FLAME_BODY','ABILITY_EFFECT_SPORE','ABILITY_CUTE_CHARM','ABILITY_ROUGH_SKIN','ABILITY_COLOR_CHANGE','ABILITY_ANGER_POINT','ABILITY_AFTERMATH'];
    if(abilities.includes(monAbility(this.data,defender)))throw Error('Unsupported native U-turn on-hit ability');
    for(const mon of[attacker,defender])if(['ABILITY_UNBURDEN','ABILITY_PRESSURE'].includes(monAbility(this.data,mon)))throw Error('Unsupported native U-turn ability/item lifecycle');
    const reserves=playerSide?this.state.party:this.enemies;for(const mon of reserves)if(isUsableBattler(mon))this.assertItemScope(mon,mon);for(const mon of reserves)if(isUsableBattler(mon)&&['ABILITY_INTIMIDATE','ABILITY_DOWNLOAD','ABILITY_TRACE','ABILITY_DRIZZLE','ABILITY_DROUGHT','ABILITY_SAND_STREAM','ABILITY_SNOW_WARNING','ABILITY_ANTICIPATION','ABILITY_FOREWARN','ABILITY_FRISK'].includes(monAbility(this.data,mon)))throw Error('Unsupported native U-turn entry ability');
    const foe=playerSide?this.enemy:this.player;
    // TryPursuit reads the still-unresolved selected action, not the party's
    // learned moves. Sleeping/frozen, already-used or no-PP actions cannot
    // intercept. A failed pivot or guaranteed KO of that user cannot intercept.
    if(this.pendingMoves.get(foe)===this.data.constants.MOVE_PURSUIT&&foe.hp>0&&!['SLP','FRZ'].includes(foe.status)&&foe.moves.some(slot=>slot.pp>0&&slot.id===this.data.constants.MOVE_PURSUIT)&&reserves.some(mon=>mon!==attacker&&isUsableBattler(mon))){
      const lowerBound=moveDamage(this.data,attacker,foe,move,playerSide?this.playerStages:this.enemyStages,playerSide?this.enemyStages:this.playerStages,85,false,this.identified.has(foe),{...this.sportContext(),roosting:this.roosting.has(foe),reflect:!!this.reflectTurns[playerSide?1:0]}).damage;
      if(lowerBound<foe.hp)throw Error('Unsupported native U-turn Pursuit phase');
    }
  }
  private assertSportDamageScope(attacker:Mon,defender:Mon,move:MoveData){
    const sport=this.sportContext();
    if(move.category===2||[40,41,87].includes(move.effect)||!(move.type===this.data.constants.TYPE_ELECTRIC&&sport.mudSport||move.type===this.data.constants.TYPE_FIRE&&sport.waterSport))return;
    this.assertDamageScope(attacker,defender);
    const ability=monAbility(this.data,defender);
    if(monAbility(this.data,attacker)!=='ABILITY_MOLD_BREAKER'&&(move.type===this.data.constants.TYPE_FIRE&&ability==='ABILITY_FLASH_FIRE'||move.type===this.data.constants.TYPE_ELECTRIC&&['ABILITY_VOLT_ABSORB','ABILITY_MOTOR_DRIVE'].includes(ability)))throw Error('Unsupported native Sport damage immunity ability');
    const suppressed=[this.player,this.enemy].some(mon=>mon.hp>0&&['ABILITY_CLOUD_NINE','ABILITY_AIR_LOCK'].includes(monAbility(this.data,mon)));
    if(this.weather!=='clear'&&!suppressed)throw Error('Unsupported native Sport damage weather');
  }
  private async checkConfusion(mon:Mon,stages:Stages,playerSide:boolean,selected:MoveData){
    const value=this.volatile(mon);if(!(value.status2&nativeStatus2.confusion))return false;
    const check=nativeConfusionCheck(value.status2,()=>this.random16());
    if(check.outcome==='self-hit')this.assertDamageScope(mon,mon); // self-damage hooks only
    value.status2=check.status2;
    if(check.outcome==='snapped-out'){await this.say(`${mon.name} snapped out of confusion!`);return false;}
    await this.say(`${mon.name} is confused!`);if(check.outcome!=='self-hit')return false;
    const damage=confusionDamage(this.data,mon,stages,this.random16());mon.hp=Math.max(0,mon.hp-damage);await this.view?.hit(playerSide);await this.say('It hurt itself in its confusion!');
    // Self-hit continues34 ->37, clearing Rage for a non-Rage selected move.
    if(selected.effect!==81){this.raging.delete(mon);value.status2&=~nativeStatus2.rage;}
    await this.heldRecovery(mon);await this.healAbility(mon);return true;
  }
  private async healAbility(mon:Mon){
    if(mon.hp<=0)return;const ability=monAbility(this.data,mon),value=this.volatile(mon);
    const cure=ability==='ABILITY_IMMUNITY'&&['PSN','TOX'].includes(mon.status)||ability==='ABILITY_LIMBER'&&mon.status==='PAR'||['ABILITY_INSOMNIA','ABILITY_VITAL_SPIRIT'].includes(ability)&&mon.status==='SLP'||ability==='ABILITY_WATER_VEIL'&&mon.status==='BRN'||ability==='ABILITY_MAGMA_ARMOR'&&mon.status==='FRZ';
    const confusion=ability==='ABILITY_OWN_TEMPO'&&!!(value.status2&nativeStatus2.confusion);
    if(cure){mon.status='';mon.sleepTurns=0;}if(confusion)value.status2&=~nativeStatus2.confusion;
    if(cure||confusion)await this.say(`${mon.name}’s ability cured its status!`);
  }
  private restoreOnSwitch(mon:Mon){
    const ability=monAbility(this.data,mon);
    if(ability==='ABILITY_NATURAL_CURE'||ability==='ABILITY_IMMUNITY'&&['PSN','TOX'].includes(mon.status)||ability==='ABILITY_LIMBER'&&mon.status==='PAR'||['ABILITY_INSOMNIA','ABILITY_VITAL_SPIRIT'].includes(ability)&&mon.status==='SLP'||ability==='ABILITY_WATER_VEIL'&&mon.status==='BRN'||ability==='ABILITY_MAGMA_ARMOR'&&mon.status==='FRZ'){mon.status='';mon.sleepTurns=0;}
  }
  private trapped(action:'switch'|'escape'){
    const effect=this.held(this.player)?.holdEffect;
    return nativeBindingBlocks(this.volatile(this.player).status2,action,{shedShell:effect==='HOLD_EFFECT_SWITCH',smokeBall:effect==='HOLD_EFFECT_FLEE',runAway:monAbility(this.data,this.player)==='ABILITY_RUN_AWAY',noExperienceBattle:this.tutorial});
  }
  private async staticOnHit(attacker:Mon,defender:Mon,move:MoveData){
    // CheckAbilityEffectOnHit: a fainted provider still triggers; the living
    // recipient, status/contact/damage predicates precede the native coin.
    if(attacker.hp<=0||attacker.status||!(move.flags&1)||monAbility(this.data,defender)!=='ABILITY_STATIC'||this.random16()%10>=3)return;
    const ability=monAbility(this.data,attacker),suppressed=[this.player,this.enemy].some(mon=>mon.hp>0&&['ABILITY_CLOUD_NINE','ABILITY_AIR_LOCK'].includes(monAbility(this.data,mon)));
    // Ability side effects bypass Substitute/Safeguard and type immunity in
    // this generation. Limber/active LeafGuard are checked after the coin.
    if(ability==='ABILITY_LIMBER'||ability==='ABILITY_LEAF_GUARD'&&this.weather==='sun'&&!suppressed)return;
    attacker.status='PAR';await this.say(`${defender.name}’s Static paralyzed ${attacker.name}!`);
  }
  private async pivot(playerSide:boolean,attacker:Mon,defender:Mon,move:MoveData){
    const opposing=playerSide?this.enemies:this.state.party,reserves=playerSide?this.state.party:this.enemies,index=playerSide?this.playerIndex:this.enemyIndex;
    if(!opposing.some(isUsableBattler)||!reserves.some((mon,i)=>i!==index&&isUsableBattler(mon))||attacker.hp<=0)return false;
    // 0175 triggers on-hit abilities before status-on-switch and party choice.
    await this.staticOnHit(attacker,defender,move);
    // Unsupported hooks were rejected before PP/damage. The supported native
    // branch now reaches recall -> status-on-switch -> party -> sendout.
    await this.say(`${attacker.name} went back to its Trainer!`);this.restoreOnSwitch(attacker);
    if(playerSide){
      const next=await new Promise<Action>(resolve=>{this.actions=resolve;this.partyMenu(true);});this.actions=null;
      if(next.kind!=='switch'||!isUsableBattler(reserves[next.index])||next.index===index)throw Error('Invalid native U-turn party selection');
      await this.switch(next.index,false);
    }else await this.sendEnemy(this.chooseEnemyReplacement());
    // No entry hazards are currently admissible. Status/ability/item entry
    // callbacks in the supported scope run before the pending opposing move.
    await this.healAbility(playerSide?this.player:this.enemy);return true;
  }
  private chooseEnemyReplacement(){
    const actor=this.enemy,target=this.player;
    const types=(mon:Mon):[number,number]=>{const list=this.data.personal[mon.species].types.map(type=>this.data.constants[type]);return[list[0],list[1]??list[0]];};
    const snapshot=(mon:Mon):TrainerReplacementMon=>({species:mon.species,isEgg:mon.isEgg,hp:mon.hp,types:types(mon),ability:this.data.constants[monAbility(this.data,mon)],heldEffect:this.data.constants[this.rawHeld(mon)?.holdEffect??'HOLD_EFFECT_NONE'],naturalGiftType:this.data.constants[this.rawHeld(mon)?.naturalGiftType??'TYPE_NORMAL'],ivs:mon.ivs,moves:mon.moves.map(slot=>slot.id)});
    return nativeTrainerReplacement(this.data,{party:this.enemies.map(snapshot),activePartyIndex:this.enemyIndex,opponent:{types:types(target),ability:this.data.constants[monAbility(this.data,target)],heldEffect:this.data.constants[this.held(target)?.holdEffect??'HOLD_EFFECT_NONE']},environment:{weather:this.weather==='rain'||this.weather==='hail'||this.weather==='sandstorm'||this.weather==='sun'?[this.weather]:[],weatherSuppressed:[actor,target].some(mon=>mon.hp>0&&['ABILITY_CLOUD_NINE','ABILITY_AIR_LOCK'].includes(monAbility(this.data,mon)))}},{
      currentActorDamage:move=>{
        this.assertDamageScope(actor,target);const row=this.data.moves[move];
        if(this.weather!=='clear'){
          const suppressed=[actor,target].some(mon=>mon.hp>0&&['ABILITY_CLOUD_NINE','ABILITY_AIR_LOCK'].includes(monAbility(this.data,mon)));
          const unaffected=row.type===this.data.constants.TYPE_FIGHTING||row.category===2&&!row.power&&row.type===this.data.constants.TYPE_NORMAL;
          const rainHooks=[actor,target].some(mon=>['ABILITY_SWIFT_SWIM','ABILITY_RAIN_DISH','ABILITY_DRY_SKIN','ABILITY_HYDRATION','ABILITY_FORECAST'].includes(monAbility(this.data,mon)));
          if(!suppressed&&!(this.weather==='rain'&&unaffected&&!rainHooks))throw Error('Unsupported native trainer replacement damage weather');
        }
        if(row.power&&(!implementedEffects.has(row.effect)||[40,41,87].includes(row.effect)))throw Error('Unsupported native trainer replacement dynamic damage');
        this.assertSportDamageScope(actor,target,row);
        return moveBaseDamage(this.data,actor,target,row,this.enemyStages,this.playerStages,false,{...this.sportContext(),reflect:!!this.reflectTurns[0]});
      },
      applyCurrentActorType:(move,override,score)=>this.replacementTypeDamage(actor,target,move,override,score)
    });
  }
  private replacementTypeDamage(actor:Mon,target:Mon,move:number,override:number,score:number){
    const row=this.data.moves[move],ability=monAbility(this.data,actor),targetAbility=monAbility(this.data,target),type=override||row.type;
    if(move===this.data.constants.MOVE_STRUGGLE)return{damage:score,immune:false};
    let damage=score;if(this.data.personal[actor.species].types.map(type=>this.data.constants[type]).includes(type))damage=Math.floor(damage*15/10);
    const grounded=this.held(target)?.holdEffect==='HOLD_EFFECT_SPEED_DOWN_GROUNDED';
    if(ability!=='ABILITY_MOLD_BREAKER'&&targetAbility==='ABILITY_LEVITATE'&&type===this.data.constants.TYPE_GROUND&&!grounded)return{damage,immune:true};
    const targetTypes=this.data.personal[target.species].types.map(type=>this.data.constants[type]);let immune=false;
    for(const[attack,defense,multiplier]of this.data.typeChart){
      if(attack===255)break;if(attack===254){if(this.identified.has(target)||ability==='ABILITY_SCRAPPY')break;continue;}
      if(defense===this.data.constants.TYPE_FLYING&&(this.roosting.has(target)||grounded&&!multiplier))continue;
      if(attack===type&&new Set(targetTypes).has(defense)){if(!multiplier)immune=true;damage=damage?Math.max(multiplier?1:0,Math.floor(damage*multiplier)):0;}
    }
    if(targetAbility==='ABILITY_WONDER_GUARD')throw Error('Unsupported native trainer replacement Wonder Guard damage');
    return{damage,immune};

  }
  private async sendEnemy(index:number){
    if(index<0||index>=this.enemies.length||index===this.enemyIndex||!isUsableBattler(this.enemies[index]))throw Error('Native trainer replacement has no eligible reserve');
    this.restoreOnSwitch(this.enemy);this.clearOnLeave(this.enemy);this.enemyIndex=index;this.enemyStages=freshStages();
    this.initializeWeight(this.enemy);this.noteNativeEntry(this.enemy,this.player);
    // PokemonSendOut clears this battler's EXP flags even when a previously
    // withdrawn party member returns. Player sendout cannot join a KO target.
    this.experienceMask=1<<this.playerIndex;await this.say(`The opposing Trainer sent out ${this.enemy.name}!`);
  }
  async start(enemies:Mon[],trainer:number|null=null,options:{tutorial?:boolean;noCritical?:boolean;weather?:number}={}):Promise<Result>{
    const lead=firstUsableBattlerIndex(this.state.party);if(lead<0)throw Error('No Pokémon is able to battle.');
    this.levelUpEvolutionMask=0;this.latestEvolutionCompletion=null;
    this.tutorial=!!options.tutorial;this.noCritical=this.tutorial||!!options.noCritical;
    // Capture the native field weather once; sky animation and later map
    // changes never decide healing amounts during a battle.
    this.weather=fieldBattleWeather(options.weather??0);this.clearBattleVolatiles();
    this.active=true;this.enemies=enemies;this.trainer=trainer;this.playerIndex=lead;this.experienceMask=1<<lead;this.enemyIndex=0;this.playerStages=freshStages();this.enemyStages=freshStages();this.turns=0;this.fleeAttempts=0;
    this.initializeWeight(this.player);this.initializeWeight(this.enemy);this.noteNativeEntry(this.player,this.enemy);this.noteNativeEntry(this.enemy,this.player);
    this.identified.clear();this.curled.clear();$('battle-screen').hidden=false;$('game-hud').hidden=true;$('touch-pad').hidden=true;
    const before=structuredClone({party:this.state.party,boxes:this.state.boxes,bag:this.state.bag,seen:this.state.seen,caught:this.state.caught});
    let fail:(error:unknown)=>void;const complete=new Promise<Result>((resolve,reject)=>{this.resolve=resolve;fail=reject;});
    void(async()=>{
    await this.view?.begin(this.player,this.enemy,trainer!==null);document.body?.classList.add('in-battle');
    this.draw();for(const enemy of enemies)if(!this.state.seen.includes(enemy.species))this.state.seen.push(enemy.species);
    if(trainer!==null)await this.say(`${trainerName(this.data,this.state,trainer)} wants to battle!`);await this.say(trainer===null?`A wild ${this.enemy.name} appeared!`:`${trainerName(this.data,this.state,trainer)} sent out ${this.enemy.name}!`);
    await this.say(`Go! ${this.player.name}!`);
    await this.loop();
    })().catch(error=>{Object.assign(this.state,before);this.finishError();fail(error);});
    return complete;
  }
  private finishError(){this.levelUpEvolutionMask=0;this.latestEvolutionCompletion=null;this.experienceMask=0;this.clearBattleVolatiles();this.view?.end();document.body?.classList.remove('in-battle');this.active=false;this.actions=null;this.resolve=null;$('battle-screen').hidden=true;$('game-hud').hidden=false;$('touch-pad').hidden=false;}
  private finish(result:Result){this.latestEvolutionCompletion=Object.freeze({serial:++this.evolutionSerial,result,levelUpMask:this.levelUpEvolutionMask,party:Object.freeze([...this.state.party])});this.experienceMask=0;this.clearBattleVolatiles();this.view?.end();document.body?.classList.remove('in-battle');this.active=false;this.actions=null;$('battle-screen').hidden=true;$('game-hud').hidden=false;$('touch-pad').hidden=false;this.resolve?.(result);this.resolve=null;}
  private image(mon:Mon,facing:'front'|'back'){return `/source/pokemon/${mon.species}-${spriteGender(mon.gender)}-${facing}.png`;}
  private status(mon:Mon){return `<div class="mon-line"><span>${esc(mon.name)} <small>${mon.isEgg||([29,32].includes(mon.species)&&!mon.hasNickname)?'':genderSymbol(mon.gender)}</small></span><small>Lv.${mon.level}</small></div><span class="hp-bar"><i style="width:${Math.max(0,mon.hp/mon.maxHP*100)}%;background:${mon.hp/mon.maxHP<.2?'#cd745c':mon.hp/mon.maxHP<.5?'#ccb262':'#73a775'}"></i></span><span class="hp-value">${mon.status?mon.status+' · ':''}${mon.hp} / ${mon.maxHP}</span>`;}
  private draw(){
    this.view?.sync(this.player,this.enemy);
    const screen=$('battle-screen');screen.innerHTML=`<header class="battle-heading"><div><span class="eyebrow">${this.tutorial?'CATCHING DEMONSTRATION':this.trainer!==null?'TRAINER BATTLE':'WILD ENCOUNTER'}</span><h2>${esc(this.view?.location||this.data.index.maps[this.state.map]?.name||'Johto')}</h2></div><div class="battle-camera"><span>Look around</span><button id="battle-camera-left" aria-label="Rotate battle camera left">↶</button><button id="battle-camera-right" aria-label="Rotate battle camera right">↷</button><small>Q / E · drag · scroll</small></div></header><div class="battle-status enemy">${this.status(this.enemy)}</div><div class="battle-status player">${this.status(this.player)}<span class="exp-bar"><i style="width:${this.expPercent(this.player)}%"></i></span></div><div class="battle-bottom"><div class="battle-message" id="battle-message" role="status">${esc(this.messageText)}</div><div class="battle-actions" id="battle-actions"></div></div>`;
    $('battle-camera-left').onclick=()=>this.view?.orbit(-.35);$('battle-camera-right').onclick=()=>this.view?.orbit(.35);
  }
  private expPercent(mon:Mon){const growth=this.data.growth[this.data.personal[mon.species].growthRate],start=growth[mon.level],next=growth[Math.min(100,mon.level+1)];return next>start?(mon.exp-start)/(next-start)*100:100;}
  private async say(text:string){this.messageText=text;this.draw();await new Promise(resolve=>setTimeout(resolve,650));}
  private menu(){this.messageText=`What will ${this.player.name} do?`;this.draw();$('battle-actions').innerHTML=['Fight','Bag','Pokémon','Run'].map((label,i)=>`<button data-action="${['fight','bag','party','run'][i]}">${label}</button>`).join('');
    document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(b=>b.onclick=()=>{const a=b.dataset.action;if(a==='fight')this.moveMenu();if(a==='bag')this.bagMenu();if(a==='party')this.partyMenu(false);if(a==='run')this.actions?.({kind:'run'});});
  }
  private moveMenu(){const available=this.player.moves.some(m=>m.pp>0);if(!available){this.actions?.({kind:'move',slot:-1});return;}
    $('battle-actions').innerHTML=this.player.moves.map((slot,i)=>{const move=this.data.moves[slot.id];return `<button data-move="${i}" ${slot.pp<=0?'disabled':''}>${esc(moveName(this.data,move.id))}<small>PP ${slot.pp}/${slot.maxPP} · ${titleCase(Object.keys(this.data.constants).find(k=>k.startsWith('TYPE_')&&this.data.constants[k]===move.type)||'TYPE_NORMAL')}</small></button>`;}).join('')+'<button id="battle-back">Back</button>';
    document.querySelectorAll<HTMLButtonElement>('[data-move]').forEach(b=>b.onclick=()=>this.actions?.({kind:'move',slot:Number(b.dataset.move)}));$('battle-back').onclick=()=>this.menu();
  }
  private bagMenu(){
    const usable=Object.entries(this.state.bag).filter(([key,count])=>count>0&&(isCaptureBall(this.data,key)||['ITEM_POTION','ITEM_SUPER_POTION','ITEM_HYPER_POTION','ITEM_FULL_RESTORE','ITEM_ANTIDOTE','ITEM_PARLYZ_HEAL','ITEM_AWAKENING'].includes(key)));
    $('battle-actions').innerHTML=usable.map(([key,count])=>`<button data-item="${key}">${esc(itemName(this.data,key))}<small>× ${count}</small></button>`).join('')+'<button id="battle-back">Back</button>';
    document.querySelectorAll<HTMLButtonElement>('[data-item]').forEach(b=>b.onclick=()=>this.actions?.({kind:'item',item:b.dataset.item!}));$('battle-back').onclick=()=>this.menu();
  }
  private partyMenu(forced:boolean){
    $('battle-actions').innerHTML=this.state.party.map((mon,i)=>{const details=mon.isEgg?'':`<small>Lv.${mon.level} · ${mon.hp}/${mon.maxHP}</small>`;return `<button data-party="${i}" ${!isUsableBattler(mon)||i===this.playerIndex?'disabled':''}>${esc(mon.name)}${details}</button>`;}).join('')+(!forced?'<button id="battle-back">Back</button>':'');
    document.querySelectorAll<HTMLButtonElement>('[data-party]').forEach(b=>b.onclick=()=>{const index=Number(b.dataset.party);if(isUsableBattler(this.state.party[index])&&index!==this.playerIndex)this.actions?.({kind:'switch',index});});if(!forced)$('battle-back').onclick=()=>this.menu();
  }
  private async nextAction():Promise<Action>{
    if(!this.tutorial)return new Promise<Action>(resolve=>{this.actions=resolve;this.menu();});
    const pause=()=>new Promise(resolve=>setTimeout(resolve,800)),highlight=(selector:string)=>{document.querySelectorAll<HTMLButtonElement>('#battle-actions button').forEach(button=>button.disabled=true);document.querySelector(selector)?.classList.add('tutorial-selection');};
    this.menu();highlight(this.turns===0?'[data-action="fight"]':'[data-action="bag"]');await pause();
    if(this.turns===0){this.moveMenu();highlight('[data-move="0"]');await pause();return{kind:'move',slot:0};}
    this.bagMenu();highlight('[data-item="ITEM_POKE_BALL"]');await pause();return{kind:'item',item:'ITEM_POKE_BALL'};
  }
  private async loop(){while(this.active){
    this.roosting.clear();this.pendingMoves.clear(); // Native turnData lasts only this turn.
    const action=await this.nextAction();this.actions=null;
    if(action.kind==='switch'&&(!isUsableBattler(this.state.party[action.index])||action.index===this.playerIndex))continue;
    if(action.kind==='switch'&&this.trapped('switch')){await this.say(`${this.player.name} can’t be switched out!`);continue;}
    if(action.kind==='run'&&(this.trainer!==null||this.trapped('escape'))){await this.say(this.trainer!==null?'No! There’s no running from a Trainer battle!':'Can’t escape!');continue;}
    this.turns++;this.flinch=false;let enemyFainted=false,playerFainted=false;
    const settleFaints=async()=>{
      if(!enemyFainted&&this.enemy.hp<=0){enemyFainted=true;await this.say(`${this.enemy.name} fainted!`);this.clearOnLeave(this.enemy);this.enemyStages=freshStages();await this.gainExperience();if(!this.enemies.some(isUsableBattler)){await this.say(this.trainer!==null?'You defeated the opposing Trainer!':'You won the battle!');this.finish('won');return;}}
      if(!playerFainted&&this.player.hp<=0){playerFainted=true;await this.say(`${this.player.name} fainted!`);this.clearOnLeave(this.player);this.playerStages=freshStages();if(!this.state.party.some(isUsableBattler)){await this.say(`${this.state.name} has no Pokémon left to fight!`);this.finish('lost');}}
    };
    const moveAction=async(playerSide:boolean,actor:Mon,slot:number,selectedMoveId:number)=>{
      // A pivot replacement never inherits the outgoing actor's selected turn.
      // The other actor still targets the current opposing battler on execution.
      this.pendingMoves.delete(actor);
      if(!this.active||(playerSide?this.player:this.enemy)!==actor||actor.hp<=0)return;
      await this.attack(playerSide,slot,selectedMoveId);await settleFaints();
    };
    if(action.kind==='run'){
      this.prepareRageTurn(this.player);
      if(this.tryRun()){await this.say('Got away safely!');this.finish('ran');break;}await this.say('Can’t escape!');await this.enemyTurn();
    }else if(action.kind==='switch'){this.prepareRageTurn(this.player);await this.switch(action.index);await this.enemyTurn();}
    else if(action.kind==='item'){const used=await this.item(action.item);if(!this.active)break;if(used)await this.enemyTurn();else continue;}
    else{
      const player=this.player,enemy=this.enemy,playerMove=this.selectMove(player,action.slot),enemySlot=this.chooseEnemyMove(),enemyMove=this.selectMove(enemy,enemySlot);
      this.pendingMoves.set(player,playerMove.id);this.pendingMoves.set(enemy,enemyMove.id);
      this.prepareRageTurn(player,action.slot);this.prepareRageTurn(enemy,enemySlot);
      const ps=this.effectiveSpeed(true),es=this.effectiveSpeed(false);
      const first=playerMove.priority>enemyMove.priority||(playerMove.priority===enemyMove.priority&&(ps>es||(ps===es&&this.rng()<.5)));
      if(first){await moveAction(true,player,action.slot,playerMove.id);await moveAction(false,enemy,enemySlot,enemyMove.id);}else{await moveAction(false,enemy,enemySlot,enemyMove.id);await moveAction(true,player,action.slot,playerMove.id);}
    }
    if(!this.active)break;await settleFaints();if(!this.active)break;
    // Native field-condition countdown precedes per-mon residual conditions.
    for(const side of[0,1]as const){const result=nativeReflectTick(this.reflectTurns[side]);this.reflectTurns[side]=result.turns;if(result.expired)await this.say(`${side===0?'Your':'The opposing'} team’s Reflect wore off!`);}
    const ps=this.effectiveSpeed(true),es=this.effectiveSpeed(false),playerFirst=ps>es||(ps===es&&(this.random16()&1)===0);
    for(const playerSide of playerFirst?[true,false]:[false,true]){
      const mon=playerSide?this.player:this.enemy;
      // Native UMC_STATE_ABILITY and held item precede poison/burn/Curse.
      if(mon.hp>0&&mon.status&&monAbility(this.data,mon)==='ABILITY_SHED_SKIN'&&this.random16()%10<3){mon.status='';mon.sleepTurns=0;await this.say(`${mon.name} shed its status!`);}
      await this.heldRecovery(mon);
      if(mon.hp>0&&['PSN','TOX','BRN'].includes(mon.status)&&monAbility(this.data,mon)!=='ABILITY_MAGIC_GUARD'){
        mon.hp=Math.max(0,mon.hp-Math.max(1,Math.floor(mon.maxHP/8)));await this.say(`${mon.name} is hurt by ${mon.status==='BRN'?'its burn':'poison'}!`);await settleFaints();if(!this.active)break;
      }
      if(mon.hp>0&&(this.volatile(mon).status2&nativeStatus2.curse)){
        const damage=nativeCurseResidual(mon.maxHP,monAbility(this.data,mon)==='ABILITY_MAGIC_GUARD');if(damage){mon.hp=Math.max(0,mon.hp-damage);await this.say(`${mon.name} is afflicted by the curse!`);await settleFaints();if(!this.active)break;}
      }
      await this.bindingResidual(mon,playerSide);await settleFaints();if(!this.active)break;
      await this.yawnResidual(mon);
      await this.heldRecovery(mon);
    }
    if(!this.active)break;
    if(enemyFainted)await this.sendEnemy(this.chooseEnemyReplacement());
    if(playerFainted){const next=await new Promise<Action>(resolve=>{this.actions=resolve;this.partyMenu(true);});this.actions=null;if(next.kind==='switch')await this.switch(next.index);}
  }}
  private async bindingResidual(mon:Mon,playerSide:boolean){
    const value=this.volatile(mon),binding=this.bindings.get(mon);
    const next=nativeBindingTick(value.status2,mon.hp,mon.maxHP,monAbility(this.data,mon)==='ABILITY_MAGIC_GUARD');value.status2=next.status2;
    if(next.outcome==='none')return;
    if(!binding)throw Error('Missing native binding owner/move');
    if(next.outcome==='ended'){this.bindings.delete(mon);await this.say(`${mon.name} was freed from ${moveName(this.data,binding.move)}!`);return;}
    if(next.damage){mon.hp=Math.max(0,mon.hp-next.damage);await this.view?.hit(playerSide);await this.say(`${mon.name} is hurt by ${moveName(this.data,binding.move)}!`);}
  }
  private noteNativeEntry(mon:Mon,other:Mon){
    if(mon.hp<=0)return;const ability=monAbility(this.data,mon);
    // Record unresolved entry provenance, never an invented weather/stage.
    // Native ability weather persists after its provider leaves. An affected
    // actor's Attack context persists until that actor itself leaves.
    if(['ABILITY_DRIZZLE','ABILITY_DROUGHT','ABILITY_SAND_STREAM','ABILITY_SNOW_WARNING'].includes(ability))this.unresolvedAbilityWeather=true;
    if(other.hp>0){const otherAbility=monAbility(this.data,other);
      if(ability==='ABILITY_INTIMIDATE'||ability==='ABILITY_TRACE'&&otherAbility==='ABILITY_INTIMIDATE')this.unresolvedAttackEntry.add(other);
      // A still-active, unrepresented Trace may copy the incoming Intimidate.
      if(ability==='ABILITY_INTIMIDATE'&&otherAbility==='ABILITY_TRACE')this.unresolvedAttackEntry.add(mon);
    }else if(['ABILITY_INTIMIDATE','ABILITY_TRACE'].includes(ability))this.unresolvedAttackEntryWithoutTarget=true;
  }
  private assertBindingSleepEntryScope(scope:'binding'|'Yawn',attacker?:Mon){
    if(this.unresolvedAbilityWeather)throw Error(`Unsupported native ${scope} prior ability weather`);
    if(scope==='binding'&&(this.unresolvedAttackEntryWithoutTarget||attacker&&this.unresolvedAttackEntry.has(attacker)))throw Error('Unsupported native binding prior Intimidate entry');
    // Native Trace may replace a relevant ability; weather entry changes the
    // underlying field even while CloudNine/AirLock temporarily suppress it.
    if([this.player,this.enemy].some(mon=>mon.hp>0&&['ABILITY_TRACE','ABILITY_DRIZZLE','ABILITY_DROUGHT','ABILITY_SAND_STREAM','ABILITY_SNOW_WARNING'].includes(monAbility(this.data,mon))))throw Error(`Unsupported native ${scope} entry ability`);
  }
  private assertYawnSleepScope(mon:Mon){
    this.assertBindingSleepEntryScope('Yawn');
    if(['ABILITY_QUICK_FEET','ABILITY_MARVEL_SCALE'].includes(monAbility(this.data,mon)))throw Error('Unsupported native Yawn status ability');
    if([this.player,this.enemy].some(other=>other.hp>0&&monAbility(this.data,other)==='ABILITY_BAD_DREAMS'))throw Error('Unsupported native Yawn BadDreams residual');
    const suppressed=[this.player,this.enemy].some(other=>other.hp>0&&['ABILITY_CLOUD_NINE','ABILITY_AIR_LOCK'].includes(monAbility(this.data,other)));
    if(this.weather!=='clear'&&!suppressed)throw Error('Unsupported native Yawn weather phases');
  }
  private sleepContext(mon:Mon){
    const suppressed=[this.player,this.enemy].some(other=>other.hp>0&&['ABILITY_CLOUD_NINE','ABILITY_AIR_LOCK'].includes(monAbility(this.data,other)));
    // Uproar remains unadmitted. Do not synthesize it from a learned move.
    return{ability:monAbility(this.data,mon),status:mon.status,sun:this.weather==='sun'&&!suppressed,uproar:false};
  }
  private async yawnResidual(mon:Mon){
    const tick=nativeYawnTick(this.yawnTurns.get(mon)??0),gate=tick.sleep?nativeYawnSleepGate(this.sleepContext(mon)):null;
    // The current provider/recipient can differ from the initial cast. Reject
    // unhosted callbacks before mutating the countdown, status or RNG.
    if(gate==='sleep')this.assertYawnSleepScope(mon);
    if(tick.turns)this.yawnTurns.set(mon,tick.turns);else this.yawnTurns.delete(mon);if(!tick.sleep)return;
    if(gate==='ability'){await this.say(`${mon.name} stayed awake because of its ability!`);return;}
    if(gate==='already-asleep'){await this.say(`${mon.name} is already asleep!`);return;}
    if(gate!=='sleep')return;
    mon.status='SLP';mon.sleepTurns=nativeSleepDuration(()=>this.random16());await this.say(`${mon.name} fell asleep!`);
  }
  private effectiveSpeed(playerSide:boolean){const mon=playerSide?this.player:this.enemy,stages=playerSide?this.playerStages:this.enemyStages;const speed=Math.floor(mon.stats.speed*stageMultiplier(stages.speed));return mon.status==='PAR'?Math.floor(speed/4):speed;}
  private tryRun(){
    if(this.held(this.player)?.holdEffect==='HOLD_EFFECT_FLEE'||this.tutorial||monAbility(this.data,this.player)==='ABILITY_RUN_AWAY')return true;
    // BattleTryRun's ordinary wild path uses raw speed, not Fight speed.
    // Both its local odds and BattleContext.runAttempts are unsigned bytes.
    let escaped=true;
    if(this.player.stats.speed<this.enemy.stats.speed){const odds=(Math.floor(this.player.stats.speed*128/this.enemy.stats.speed)+30*this.fleeAttempts)&255;escaped=Math.floor(this.rng()*256)<odds;}
    this.fleeAttempts=(this.fleeAttempts+1)&255;return escaped;
  }
  private selectMove(mon:Mon,slot:number){return slot<0?this.data.moves[165]:this.data.moves[mon.moves[slot].id];}
  private prepareRageTurn(mon:Mon,slot?:number){
    // Native BEFORE_TURN uses status2 &= STATUS2_RAGE, retaining Rage while
    // clearing the other implemented status2 flags even if this move cannot act.
    // GetBattlerSelectedMove returns NONE for non-Fight actions. The no-PP
    // selection path retains its prior move slot; Struggle is chosen later.
    if(slot!==undefined&&slot>=0)this.selectedMoveSlots.set(mon,slot);
    const selected=slot===undefined?0:mon.moves[this.selectedMoveSlots.get(mon)??-1]?.id??0;
    if(this.raging.has(mon)&&selected!==this.data.constants.MOVE_RAGE){this.identified.delete(mon);this.curled.delete(mon);this.volatile(mon).status2=nativeStatus2.rage;}
  }
  private chooseEnemyMove(){const slots=this.enemy.moves.map((m,i)=>m.pp>0?i:-1).filter(i=>i>=0);return slots.length?slots[Math.floor(this.rng()*slots.length)]:-1;}
  private async enemyTurn(){if(this.enemy.hp>0&&this.player.hp>0){const slot=this.chooseEnemyMove();this.prepareRageTurn(this.enemy,slot);await this.attack(false,slot);}}
  private async switch(index:number,recall=true){
    if(!isUsableBattler(this.state.party[index])||index===this.playerIndex)return;
    if(recall)await this.say(`${this.player.name}, that’s enough! Come back!`);this.restoreOnSwitch(this.player);this.clearOnLeave(this.player);
    this.playerIndex=index;this.initializeWeight(this.player);this.noteNativeEntry(this.player,this.enemy);if(this.enemy.hp>0)this.experienceMask|=1<<index;this.playerStages=freshStages();await this.say(`Go! ${this.player.name}!`);
  }
  private async attack(playerSide:boolean,slot:number,selectedMoveId?:number){
    const attacker=playerSide?this.player:this.enemy,defender=playerSide?this.enemy:this.player,as=playerSide?this.playerStages:this.enemyStages,ds=playerSide?this.enemyStages:this.playerStages;
    if(attacker.hp<=0)return;
    const move=this.selectMove(attacker,slot);
    this.volatile(attacker).previousMove=nativePreviousMove(this.volatile(attacker).previousMove,0,{noMoveSet:false,moveSucceededFlag:false});
    // Native sleep state1 permits Snore/SleepTalk instead of blocking them.
    // Their effects remain unported: never silently consume a sleeping turn.
    if(attacker.status==='SLP'&&[this.data.constants.MOVE_SNORE,this.data.constants.MOVE_SLEEP_TALK].includes(move.id))throw Error('Unsupported native sleeping action '+move.key);
    if(attacker.status==='SLP'){attacker.sleepTurns=nativeSleepTick(attacker.sleepTurns,monAbility(this.data,attacker)==='ABILITY_EARLY_BIRD');if(attacker.sleepTurns>0){await this.say(`${attacker.name} is fast asleep.`);return;}attacker.status='';await this.say(`${attacker.name} woke up!`);}
    if(attacker.status==='FRZ'){if(this.rng()>=.2){await this.say(`${attacker.name} is frozen solid!`);return;}attacker.status='';await this.say(`${attacker.name} thawed out!`);}
    if(this.flinch){this.flinch=false;await this.say(`${attacker.name} flinched!`);return;}
    if(await this.checkConfusion(attacker,as,playerSide,move))return;
    if(attacker.status==='PAR'&&this.rng()<.25){await this.say(`${attacker.name} is paralyzed! It can’t move!`);return;}
    // GetMoveTarget filters live opponents for these ranges. FRONT(1024) does
    // too unless FightInput has reselected a changed slot; OPPONENT_SIDE(128)
    // retains a side target even if its active mon fainted. Their unported
    // effects must not be silently accepted as a no-target action.
    const noTarget=!unportedChargeEffects.has(move.effect)&&defender.hp<=0&&(singleBattleLiveOpponentTargets.has(move.target)||(move.target===1024&&(selectedMoveId===undefined||selectedMoveId===move.id)));
    if(slot>=0&&!implementedEffects.has(move.effect)&&!noTarget)throw Error(`Unported original move effect ${move.effect}: ${move.key}`);
    if(slot>=0&&attacker.moves[slot].pp<=0){await this.say('But there was no PP left for the move!');return;}
    this.assertActionScope(attacker,defender,move,playerSide);
    if(slot>=0)attacker.moves[slot].pp--;
    await this.say(`${playerSide?'':'The opposing '}${attacker.name} used ${moveName(this.data,move.id)}!`);
    try{
    // TryMove checks status and deducts PP before its no-target script. A
    // recoil-fainted opponent does not prevent user/side/field moves running.
    if(noTarget){await this.say('But there was no target...');return;} // msg_0197_01234
    this.volatile(attacker).previousMove=nativePreviousMove(0,move.id,{noMoveSet:false,moveSucceededFlag:true});
    let hitChance=stageHitChance(move.accuracy,as.accuracy,ds.evasion,this.identified.has(defender));
    // Native u16 assignments truncate each accuracy modifier independently.
    if(monAbility(this.data,attacker)==='ABILITY_HUSTLE'&&move.category===0)hitChance=Math.floor(hitChance*80/100);
    if(monAbility(this.data,defender)==='ABILITY_TANGLED_FEET'&&(this.volatile(defender).status2&nativeStatus2.confusion)&&monAbility(this.data,attacker)!=='ABILITY_MOLD_BREAKER')hitChance=Math.floor(hitChance*50/100);
    // CheckMoveHit still consumes its ordinary accuracy draw. The subsequent
    // CheckMoveEffect clears MISSED for either NoGuard battler, even against
    // MoldBreaker. This does not implement unported OHKO/airborne effects.
    if(!this.tutorial&&move.accuracy&&move.effect!==17&&move.effect!==78){const missed=Math.floor(this.rng()*100)>=hitChance;if(missed&&monAbility(this.data,attacker)!=='ABILITY_NO_GUARD'&&monAbility(this.data,defender)!=='ABILITY_NO_GUARD'){await this.say(`${attacker.name}’s attack missed!`);return;}}
    if([32,132,214].includes(move.effect)&&attacker.hp===attacker.maxHP){await this.say(`${attacker.name}’s HP is full!`);return;}
    if(move.effect===201||move.effect===210){
      const flags=move.effect===201?this.mudSport:this.waterSport;
      if(flags.has(attacker)){await this.say('But it failed!');return;}
      flags.add(attacker);await this.view?.attack(playerSide,move);
      await this.say(move.effect===201?'Electricity’s power was weakened!':'Fire’s power was weakened!');return;
    }
    if(move.effect===187){
      // Substitute/Safeguard producers remain unadmitted. Initial0141 gates
      // differ deliberately from delayed0018's nonignorable ability checks.
      const started=nativeYawnStart(this.yawnTurns.get(defender)??0,{...this.sleepContext(defender),moldBreaker:monAbility(this.data,attacker)==='ABILITY_MOLD_BREAKER',substitute:false,safeguard:false});
      if(started.outcome!=='applied'){await this.say(started.outcome==='ability'?`${defender.name}’s ability made Yawn ineffective!`:started.outcome==='safeguard'?`${defender.name} is protected by Safeguard!`:'But it failed!');return;}
      this.yawnTurns.set(defender,started.turns);await this.view?.attack(playerSide,move);await this.say(`${attacker.name} made ${defender.name} drowsy!`);return;
    }
    await this.view?.attack(playerSide,move);
    if(move.effect===47){const applied=nativeFocusEnergy(this.volatile(attacker).status2);this.volatile(attacker).status2=applied.status2;await this.say(applied.applied?`${attacker.name} is getting pumped!`:'But it failed!');return;}
    if(move.effect===49){if((this.volatile(defender).status2&nativeStatus2.confusion)||(monAbility(this.data,defender)==='ABILITY_OWN_TEMPO'&&monAbility(this.data,attacker)!=='ABILITY_MOLD_BREAKER')){await this.say('But it failed!');return;}this.volatile(defender).status2|=nativeConfusionDuration(()=>this.random16());await this.say(`${defender.name} became confused!`);return;}
    if(move.effect===65){const side=playerSide?0:1,started=nativeReflectStart(this.reflectTurns[side],this.held(attacker)?.holdEffect==='HOLD_EFFECT_EXTEND_SCREENS'?Number(this.held(attacker)!.holdEffectParam):0);this.reflectTurns[side]=started.turns;await this.say(started.applied?'Reflect raised the team’s Defense!':'But it failed!');return;}
    if(move.effect===100){const reduction=nativeSpite(defender.moves,this.volatile(defender).previousMove);if(!reduction){await this.say('But it failed!');return;}defender.moves[reduction.slot].pp-=reduction.lost;await this.say(`${defender.name}’s ${moveName(this.data,reduction.move)} lost ${reduction.lost} PP!`);return;}
    if(move.effect===106){const value=this.volatile(defender);if(value.status2&nativeStatus2.meanLook){await this.say('But it failed!');return;}value.status2|=nativeStatus2.meanLook;value.meanLookSource=playerSide?0:1;await this.say(`${defender.name} can no longer escape!`);return;}
    if(move.effect===109){if(this.data.personal[attacker.species].types.includes('TYPE_GHOST')){const value=this.volatile(defender);if(defender.hp<=0||(value.status2&nativeStatus2.curse)){await this.say('But it failed!');return;}value.status2|=nativeStatus2.curse;attacker.hp=Math.max(0,attacker.hp-nativeGhostCurseCost(attacker.maxHP));await this.say(`${attacker.name} cut its own HP and laid a curse on ${defender.name}!`);}else{await this.changeStage(attacker,as,2,-1);await this.changeStage(attacker,as,0,1);await this.changeStage(attacker,as,1,1);}return;}
    if(move.effect===113){this.identified.add(defender);await this.say(`${attacker.name} identified ${defender.name}!`);return;}
    if(move.effect===156){this.curled.add(attacker);await this.changeStage(attacker,as,1,1);return;}
    if(move.effect>=10&&move.effect<=16){await this.changeStage(attacker,as,move.effect-10,1);return;}
    if(move.effect>=18&&move.effect<=24){await this.changeStage(defender,ds,move.effect-18,-1);return;}
    if(move.effect>=50&&move.effect<=56){await this.changeStage(attacker,as,move.effect-50,2);return;}
    if(move.effect>=58&&move.effect<=61){await this.changeStage(defender,ds,move.effect-58,-2);return;}
    if([62,63,64].includes(move.effect)){await this.changeStage(defender,ds,move.effect===62?5:move.effect===63?6:4,-2);return;}
    if(move.effect===25){this.playerStages=freshStages();this.enemyStages=freshStages();for(const mon of[this.player,this.enemy])this.volatile(mon).status2&=~nativeStatus2.focusEnergy;await this.say('All stat changes were eliminated!');return;}
    if(move.effect===85)return;
    if([32,132,214].includes(move.effect)){
      const suppressed=[this.player,this.enemy].some(mon=>mon.hp>0&&['ABILITY_CLOUD_NINE','ABILITY_AIR_LOCK'].includes(monAbility(this.data,mon))),amount=move.effect===132?weatherHPRecovery(attacker.maxHP,this.weather,suppressed):Math.floor(attacker.maxHP/2);
      attacker.hp=Math.min(attacker.maxHP,attacker.hp+amount);if(move.effect===214)this.roosting.add(attacker);this.draw();await this.say(`${attacker.name} regained health!`);return;
    }
    if([1,33,66,67].includes(move.effect)){await this.inflict(defender,move.effect===1?'SLP':move.effect===33?'TOX':move.effect===66?'PSN':'PAR');return;}
    const planned=move.effect===44?2:move.effect===29?multiHitCount(this.rng,monAbility(this.data,attacker)==='ABILITY_SKILL_LINK'):1;let landed=0;
    for(let hit=0;hit<planned;hit++){
    if(hit)await this.view?.attack(playerSide,move);
    // The native multi-hit controller reruns critical/damage calculation for
    // every hit, skips additional accuracy/PP checks and stops on fainting.
    const fixed=[40,41,87].includes(move.effect),multiplier=fixed?1:this.critMultiplier(attacker,defender,move),critical=multiplier>1;
    const result=fixed?fixedMoveDamage(this.data,attacker,defender,move,this.identified.has(defender),{roosting:this.roosting.has(defender)}):moveDamage(this.data,attacker,defender,move,as,ds,85+Math.floor(this.rng()*16),critical,this.identified.has(defender),{...this.sportContext(),targetWeight:move.effect===196?this.targetWeight(defender):undefined,roosting:this.roosting.has(defender),reflect:!!this.reflectTurns[playerSide?1:0],criticalMultiplier:multiplier});
    const {damage,effectiveness}=result;let total=damage;
    if(effectiveness===0)total=0;total=Math.min(defender.hp,total);defender.hp=Math.max(0,defender.hp-total);this.draw();
    if(total>0)await this.view?.hit(!playerSide);await new Promise(resolve=>setTimeout(resolve,150));
    if(effectiveness===0)await this.say('immunityAbility'in result&&result.immunityAbility==='Wonder Guard'?`${defender.name} avoided damage by using Wonder Guard!`:monAbility(this.data,attacker)!=='ABILITY_MOLD_BREAKER'&&monAbility(this.data,defender)==='ABILITY_LEVITATE'&&move.type===this.data.constants.TYPE_GROUND?`${defender.name} makes Ground moves miss by using Levitate!`:'It doesn’t affect the opposing Pokémon…');else{if(critical)await this.say('A critical hit!');if(effectiveness>1)await this.say('It’s super effective!');if(effectiveness<1)await this.say('It’s not very effective…');}
    if(effectiveness===0)break;
    // AfterDamage runs the indirect binding subscript before Rage and the
    // contact-ability callback. No duration draw for immunity/KO/rebinding.
    if(move.effect===42&&defender.hp>0){const value=this.volatile(defender),started=nativeBindingStart(value.status2,()=>this.random16(),this.held(attacker)?.holdEffect==='HOLD_EFFECT_EXTEND_TRAPPING');value.status2=started.status2;if(started.applied){this.bindings.set(defender,{source:playerSide?0:1,move:move.id});await this.say(`${defender.name} was trapped by ${moveName(this.data,move.id)}!`);}}
    let pivoted=false;
    if(total>0){landed++;if(move.effect===228)pivoted=await this.pivot(playerSide,attacker,defender,move);if(move.effect===81){this.raging.add(attacker);this.volatile(attacker).status2|=nativeStatus2.rage;}if(defender.hp>0&&this.raging.has(defender)&&ds.atk<6){ds.atk++;await this.say(`${defender.name}’s rage is building!`);}}
    if(move.effect===48||slot<0){attacker.hp=Math.max(0,attacker.hp-Math.max(1,Math.floor((slot<0?attacker.maxHP:total)/4)));await this.say(`${attacker.name} is hit with recoil!`);}
    if(move.effect===3){attacker.hp=Math.min(attacker.maxHP,attacker.hp+Math.max(1,Math.floor(total/2)));await this.say(`${defender.name} had its energy drained!`);}
    if(defender.hp>0&&move.effect>=68&&move.effect<=74&&this.rng()*100<move.effectChance)await this.changeStage(defender,ds,move.effect-68,-1);
    if(defender.hp>0&&[2,4,5,6].includes(move.effect)&&this.rng()*100<move.effectChance)await this.inflict(defender,move.effect===2?'PSN':move.effect===4?'BRN':move.effect===5?'FRZ':'PAR');
    if(move.effect===31&&this.rng()*100<move.effectChance)this.flinch=true;
    if(total>0&&!pivoted)await this.staticOnHit(attacker,defender,move);
    // AfterMoveEffects (controller31) runs before CheckMultiHit (32),
    // so a surviving Sitrus holder can heal between the individual hits.
    await this.heldRecovery(playerSide?this.player:this.enemy);await this.heldRecovery(defender);
    await this.thawAfterHit(attacker,defender,move,total);
    if(defender.hp<=0||attacker.hp<=0||effectiveness===0)break;
    }
    if((move.effect===29||move.effect===44)&&landed)await this.say(`Hit ${landed} time${landed===1?'':'s'}!`);
    }finally{
      // Native TryAfterMoveItems clears Rage after another move executes,
      // including a miss/failure. Selection, items and inability to act keep it.
      if(!noTarget&&move.effect!==81){this.raging.delete(attacker);if(this.volatiles.has(attacker))this.volatile(attacker).status2&=~nativeStatus2.rage;}
      // UpdateMoveHistory addresses the battler slot after SwitchAndUpdateMon,
      // so a successful pivot records U-turn on the newly active slot too.
      const current=playerSide?this.player:this.enemy;if(current!==attacker)this.volatile(current).previousMove=move.id;
      // AfterMoveEffects checks the current attacker then target, before
      // ActionEnd status-heal abilities and EXP. A pivot changes that attacker.
      await this.heldRecovery(playerSide?this.player:this.enemy);await this.heldRecovery(defender);
      await this.healAbility(playerSide?this.player:this.enemy);await this.healAbility(defender);
    }
  }
  private async thawAfterHit(attacker:Mon,defender:Mon,move:MoveData,damage:number){
    // Native AfterMoveEffects state6 follows held-item recovery. A landed
    // damaging Fire hit thaws a living target without another random draw.
    const effectiveType=monAbility(this.data,attacker)==='ABILITY_NORMALIZE'?this.data.constants.TYPE_NORMAL:move.type;
    if(attacker!==defender&&damage>0&&defender.hp>0&&defender.status==='FRZ'&&effectiveType===this.data.constants.TYPE_FIRE){defender.status='';await this.say(`${defender.name} thawed out!`);}
  }
  private async changeStage(mon:Mon,stages:Stages,index:number,amount:number){const key=(['atk','def','speed','spatk','spdef','accuracy','evasion'] as const)[index];const next=Math.max(-6,Math.min(6,stages[key]+amount));if(next===stages[key]){await this.say(`${mon.name}’s ${key} won’t go any ${amount>0?'higher':'lower'}!`);return;}stages[key]=next;await this.say(`${mon.name}’s ${({atk:'Attack',def:'Defense',speed:'Speed',spatk:'Sp. Atk',spdef:'Sp. Def',accuracy:'accuracy',evasion:'evasion'})[key]} ${amount>0?'rose':'fell'}!`);}
  private async inflict(mon:Mon,status:string){if(mon.status){await this.say('But it failed!');return;}const types=this.data.personal[mon.species].types;if((['PSN','TOX'].includes(status)&&types.some(t=>['TYPE_POISON','TYPE_STEEL'].includes(t)))||(status==='BRN'&&types.includes('TYPE_FIRE'))||(status==='FRZ'&&types.includes('TYPE_ICE'))){await this.say('It doesn’t affect the Pokémon…');return;}mon.status=status;if(status==='SLP')mon.sleepTurns=2+Math.floor(this.rng()*4);await this.say(`${mon.name} ${({PSN:'was poisoned!',TOX:'was badly poisoned!',PAR:'is paralyzed! It may be unable to move!',BRN:'was burned!',FRZ:'was frozen solid!',SLP:'fell asleep!'})[status as 'PSN']} `);}
  private async item(item:string){
    if(!this.state.bag[item])return false;
    if(isCaptureBall(this.data,item)){
      if(this.trainer!==null){await this.say('The Trainer blocked the Ball! Don’t be a thief!');return false;}
      if(this.state.party.length>=6&&this.state.boxes.length>=540){await this.say('There is no room in the party or PC.');return false;}
      this.prepareRageTurn(this.player);this.selectedMoveSlots.delete(this.player);
      takeBagItem(this.state.bag,item,1);await this.say(`${this.state.name} used a ${itemName(this.data,item)}!`);
      const multiplier=item==='ITEM_ULTRA_BALL'?20:item==='ITEM_GREAT_BALL'?15:10;const shakes=this.tutorial||item==='ITEM_MASTER_BALL'?4:catchShakes(this.data.personal[this.enemy.species].catchRate,this.enemy.hp,this.enemy.maxHP,multiplier,this.enemy.status,this.rng);
      await this.view?.capture(shakes);
      for(let i=0;i<Math.min(3,shakes);i++)await this.say('…');
      if(shakes===4){this.enemy.ot=this.state.name;if(!giveMon(this.state,this.enemy))throw Error('Capture destination unexpectedly became full');await this.say(`Gotcha! ${this.enemy.name} was caught!`);this.finish('caught');return true;}
      await this.say(['Oh, no! The Pokémon broke free!','Aww! It appeared to be caught!','Aargh! Almost had it!','Gah! It was so close, too!'][shakes]);return true;
    }
    const record=this.data.items.find(i=>i.item===item);if(!record)return false;
    const target=this.player;const before=target.hp,status=target.status;let amount=Number(record.hp_restore_param)||0;if(amount===255)amount=target.maxHP;
    const hp=record.hp_restore==='true'?Math.min(target.maxHP,target.hp+amount):target.hp;
    const cure:Record<string,string>={PSN:'psn_heal',TOX:'psn_heal',PAR:'prz_heal',BRN:'brn_heal',FRZ:'frz_heal',SLP:'slp_heal'},nextStatus=record[cure[status]]==='true'?'':status;
    if(before===hp&&status===nextStatus){await this.say('It won’t have any effect.');return false;}
    this.prepareRageTurn(target);this.selectedMoveSlots.delete(target);target.hp=hp;target.status=nextStatus;
    takeBagItem(this.state.bag,item,1);await this.say(`${this.state.name} used ${itemName(this.data,item)}!`);return true;
  }
  private async gainExperience(){
    const base=this.data.personal[this.enemy.species];
    // Native trades are not yet implemented. Current starter/gift/capture
    // acquisitions are player-owned; legacy OT names do not prove a trade.
    const plan=planNativeExperience({baseYield:base.expYield,defeatedLevel:this.enemy.level,trainerBattle:this.trainer!==null,experienceEnabled:!this.tutorial},this.state.party.map(mon=>({...mon,ownership:'player' as const})),this.experienceMask,this.data.items);
    // Freeze every payout before any level-up UI or party mutation.
    for(const reward of plan.rewards){
    if(!reward.amount)continue;
    const mon=this.state.party[reward.index],growth=this.data.growth[this.data.personal[mon.species].growthRate];
    mon.exp=Math.min(growth[100],mon.exp+reward.amount);await this.say(`${mon.name} gained ${reward.boosted?'a boosted ':''}${reward.amount} Exp. Points!`);
    const yields=['hp_yield','atk_yield','def_yield','speed_yield','spatk_yield','spdef_yield'];for(let i=0;i<6;i++){const total=mon.evs.reduce((a,b)=>a+b,0);mon.evs[i]+=Math.max(0,Math.min(Number(base[yields[i]])||0,255-mon.evs[i],510-total));}
    while(mon.level<100&&mon.exp>=growth[mon.level+1]){
      this.levelUpEvolutionMask|=1<<reward.index;
      mon.level++;const previous=mon.maxHP;const next=calculateStats(this.data.personal[mon.species],mon.level,mon.ivs,mon.evs,mon.nature);mon.maxHP=next.maxHP;mon.stats=next.stats;mon.hp+=mon.maxHP-previous;await this.say(`${mon.name} grew to Lv. ${mon.level}!`);
      for(const learned of this.data.learnsets[mon.species].filter(m=>m.level===mon.level))if(!mon.moves.some(m=>m.id===learned.move)){
        const move=this.data.moves[learned.move];if(mon.moves.length<4){mon.moves.push({id:move.id,pp:move.pp,maxPP:move.pp});await this.say(`${mon.name} learned ${moveName(this.data,move.id)}!`);}else{
          const replace=await this.ui.choose(`${mon.name} wants to learn ${moveName(this.data,move.id)}.`,[...mon.moves.map(m=>`Forget ${moveName(this.data,m.id)}`),'Keep current moves']);if(replace<4)mon.moves[replace]={id:move.id,pp:move.pp,maxPP:move.pp};
        }
      }
    }
    }
  }
}
