import type {GameData,Mon,MoveData} from './types.ts';
import {nativeReflectIntermediate} from './battle-volatiles.ts';
import {nativeWeightBasedPower} from './battle-weight.ts';
export type Stages={atk:number;def:number;spatk:number;spdef:number;speed:number;accuracy:number;evasion:number};
export function freshStages():Stages{return {atk:0,def:0,spatk:0,spdef:0,speed:0,accuracy:0,evasion:0};}
export function stageMultiplier(stage:number,accuracy=false){stage=Math.max(-6,Math.min(6,stage));const base=accuracy?3:2;return stage>=0?(base+stage)/base:base/(base-stage);}
// battle_controller_player.c:sHitChanceTable / BattleSystem_CheckMoveHit.
// The native percentages are rounded table entries, not the ordinary stat
// stage formula. Its u16 hitChance truncates before the 1..100 hit roll.
const hitChanceStages=[[33,100],[36,100],[43,100],[50,100],[60,100],[75,100],[1,1],[133,100],[166,100],[2,1],[233,100],[133,50],[3,1]] as const;
export function stageHitChance(accuracy:number,attackerAccuracy:number,targetEvasion:number,identified=false){
  const evasion=identified?Math.min(0,targetEvasion):targetEvasion;
  const stage=Math.max(-6,Math.min(6,attackerAccuracy-evasion));
  const [numerator,denominator]=hitChanceStages[stage+6];
  return Math.floor(accuracy*numerator/denominator);
}
export function typeEffectiveness(data:Pick<GameData,'constants'|'personal'|'typeChart'>,moveType:number,species:number,identified=false,roosting=false,grounded=false){let factor=1;for(const type of new Set(data.personal[species].types)){const id=data.constants[type];if(roosting&&id===data.constants.TYPE_FLYING)continue;if(identified&&id===data.constants.TYPE_GHOST&&[data.constants.TYPE_NORMAL,data.constants.TYPE_FIGHTING].includes(moveType))continue;const row=data.typeChart.find(r=>r[0]===moveType&&r[1]===id);if(row&&!(grounded&&id===data.constants.TYPE_FLYING&&row[2]===0))factor*=row[2];}return factor;}
export function monAbility(data:Pick<GameData,'personal'>,mon:Mon){const abilities=data.personal[mon.species].abilities;return abilities[mon.personality%2]!=='ABILITY_NONE'?abilities[mon.personality%2]:abilities[0];}
export type BattleWeather='clear'|'rain'|'hail'|'sandstorm'|'fog'|'sun';
// battle_util.c:TryAbilityOnEntry. Field weather0 means ordinary weather,
// not battle sunlight; the native sun override is1001, not a daytime sky.
export function fieldBattleWeather(id:number):BattleWeather{return id>=1&&id<=3?'rain':id>=4&&id<=6?'hail':id===7?'sandstorm':id===9||id===10?'fog':id===1001?'sun':'clear';}
// battle_command.c:BtlCmd_WeatherHPRecovery, including DamageDivide's
// minimum-one rule for nonzero numerators in sun/adverse weather.
export function weatherHPRecovery(maxHP:number,weather:BattleWeather,suppressed=false){return suppressed||weather==='clear'?Math.floor(maxHP/2):weather==='sun'?Math.max(1,Math.floor(maxHP*20/30)):Math.max(1,Math.floor(maxHP/4));}
// BtlCmd_SetMultiHit uses a second four-way draw only for the latter half
// of the first draw:2/3/4/5 have probabilities3/8,3/8,1/8,1/8.
export function multiHitCount(rng:()=>number,skillLink=false){if(skillLink)return 5;const first=Math.floor(rng()*4);return first<2?first+2:Math.floor(rng()*4)+2;}
export type DamageContext={roosting?:boolean;flying?:boolean;reflect?:boolean;criticalMultiplier?:1|2|3;mudSport?:boolean;waterSport?:boolean;targetWeight?:number};
// Scoped Gen IV singles intermediate, including Technician and physical Reflect.
// The engine rejects unported modifier callbacks on newly admitted paths.
export function moveBaseDamage(data:GameData,attacker:Mon,defender:Mon,move:MoveData,attackStages:Stages,defenseStages:Stages,critical=false,context:DamageContext={}){
  const physical=move.category===0;const attackStat=physical?'atk':'spatk',defenseStat=physical?'def':'spdef';
  const as=critical?Math.max(0,attackStages[attackStat]):attackStages[attackStat],ds=critical?Math.min(0,defenseStages[defenseStat]):defenseStages[defenseStat];
  const ability=monAbility(data,attacker);let rawAttack=attacker.stats[attackStat];
  // CalcMoveDamage modifies the raw Attack before applying stat stages.
  if(physical&&(ability==='ABILITY_HUSTLE'||ability==='ABILITY_GUTS'&&attacker.status))rawAttack=Math.floor(rawAttack*150/100);
  const attack=Math.max(1,Math.floor(rawAttack*stageMultiplier(as))),defense=Math.max(1,Math.floor(defender.stats[defenseStat]*stageMultiplier(ds)));
  // effect0196 runs CalcWeightBasedPower on the live target before CalcCrit
  // and CalcDamage. A missing live snapshot must not become the data power1.
  let power=move.effect===196?nativeWeightBasedPower(context.targetWeight!):move.power;
  // CalcMoveDamage applies Technician before the typed low-HP boosts.
  if(ability==='ABILITY_TECHNICIAN'&&move.id!==data.constants.MOVE_STRUGGLE&&power<=60)power=Math.floor(power*15/10);
  // effect_script_0149: Gust hits a target in Fly and doubles its power.
  // Fly's own two-turn execution remains a separate, unported move effect.
  if(move.effect===149&&context.flying)power*=2;
  // Gen IV CalcMoveDamage checks any active battler's move-effect flags.
  // These halve power once, after Technician and before Blaze/Overgrow/etc.
  if(move.type===data.constants.TYPE_ELECTRIC&&context.mudSport||move.type===data.constants.TYPE_FIRE&&context.waterSport)power=Math.floor(power/2);
  if(attacker.hp<=Math.floor(attacker.maxHP/3)&&((ability==='ABILITY_BLAZE'&&move.type===10)||(ability==='ABILITY_TORRENT'&&move.type===11)||(ability==='ABILITY_OVERGROW'&&move.type===12)||(ability==='ABILITY_SWARM'&&move.type===data.constants.TYPE_BUG)))power=Math.floor(power*1.5);
  let damage=Math.floor(Math.floor((Math.floor(attacker.level*2/5)+2)*power*attack/defense)/50);
  if(physical&&attacker.status==='BRN'&&ability!=='ABILITY_GUTS')damage=Math.floor(damage/2);
  damage=nativeReflectIntermediate(damage,{active:!!context.reflect,physical,criticalMultiplier:context.criticalMultiplier??(critical?2:1),removesScreens:false,doubleBattleTwoTargets:false});
  return damage+2; // CalcMoveDamage applies burn before its final +2.
}
export function moveDamage(data:GameData,attacker:Mon,defender:Mon,move:MoveData,attackStages:Stages,defenseStages:Stages,roll:number,critical=false,identified=false,context:DamageContext={}){
  let damage=moveBaseDamage(data,attacker,defender,move,attackStages,defenseStages,critical,context);
  if(critical)damage*=context.criticalMultiplier??2;
  damage=Math.floor(damage*Math.max(85,Math.min(100,roll))/100);
  if(move.id===data.constants.MOVE_STRUGGLE)return{damage:Math.max(1,damage),effectiveness:1};
  if(data.personal[attacker.species].types.some(t=>data.constants[t]===move.type))damage=Math.floor(damage*1.5);
  const grounded=monAbility(data,defender)!=='ABILITY_KLUTZ'&&data.items.find(item=>item.item===defender.heldItem)?.holdEffect==='HOLD_EFFECT_SPEED_DOWN_GROUNDED';
  const levitate=monAbility(data,attacker)!=='ABILITY_MOLD_BREAKER'&&monAbility(data,defender)==='ABILITY_LEVITATE'&&move.type===data.constants.TYPE_GROUND&&!grounded;
  const effectiveness=levitate?0:typeEffectiveness(data,move.type,defender.species,identified,context.roosting,grounded);damage=Math.floor(damage*effectiveness);
  return {damage:effectiveness===0?0:Math.max(1,damage),effectiveness};
}
/** Effect0040/0041/0087 set damage directly. IGNORE_TYPE_EFFECTIVENESS
 * suppresses STAB/nonzero type multipliers and their messages, not immunity
 * or WonderGuard's preceding type-flag check. No critical/range draw. */
export function fixedMoveDamage(data:GameData,attacker:Mon,defender:Mon,move:MoveData,identified=false,context:Pick<DamageContext,'roosting'>={}){
  if(![40,41,87].includes(move.effect))throw Error('Not a native fixed-damage effect');
  const ability=monAbility(data,attacker),targetAbility=monAbility(data,defender),type=ability==='ABILITY_NORMALIZE'?data.constants.TYPE_NORMAL:move.type;
  const grounded=targetAbility!=='ABILITY_KLUTZ'&&data.items.find(item=>item.item===defender.heldItem)?.holdEffect==='HOLD_EFFECT_SPEED_DOWN_GROUNDED';
  const factor=typeEffectiveness(data,type,defender.species,identified||ability==='ABILITY_SCRAPPY',context.roosting,grounded);
  const immunityAbility=ability!=='ABILITY_MOLD_BREAKER'&&targetAbility==='ABILITY_LEVITATE'&&type===data.constants.TYPE_GROUND&&!grounded?'Levitate':ability!=='ABILITY_MOLD_BREAKER'&&targetAbility==='ABILITY_WONDER_GUARD'&&move.power&&factor<=1?'Wonder Guard':null;
  const immune=!!immunityAbility||factor===0,damage=move.effect===40?Math.max(1,Math.floor(defender.hp/2)):move.effect===41?40:attacker.level;
  return{damage:immune?0:damage,effectiveness:immune?0:1,immunityAbility};
}
/** CheckAttackerStatus case11 directly calls CalcMoveDamage(STRUGGLE,0,0,40,
 * 0,self,self,1), then ApplyDamageRange. No STAB/type, screens or weather.
 * Caller preflights unported damage-affecting ability/item branches. */
export function confusionDamage(data:GameData,mon:Mon,stages:Stages,rawRange:number){
  return selfHitDamage(data,mon,stages,rawRange,40);
}
/** TryDisobedience calls POUND, not confusion's STRUGGLE. Technician therefore
 * raises this path's power40 to60. Both calls use field0 and critical1;
 * the controller must still admit the live ability/item/Attack-stage context. */
export function disobedienceDamage(data:GameData,mon:Mon,stages:Stages,rawRange:number){
  return selfHitDamage(data,mon,stages,rawRange,monAbility(data,mon)==='ABILITY_TECHNICIAN'?60:40);
}
function selfHitDamage(data:GameData,mon:Mon,stages:Stages,rawRange:number,power:number){
  const ability=monAbility(data,mon),rawAttack=ability==='ABILITY_HUSTLE'||ability==='ABILITY_GUTS'&&mon.status?Math.floor(mon.stats.atk*150/100):mon.stats.atk;
  const attack=Math.max(1,Math.floor(rawAttack*stageMultiplier(stages.atk))),defense=Math.max(1,Math.floor(mon.stats.def*stageMultiplier(stages.def)));
  let damage=Math.floor(Math.floor((Math.floor(mon.level*2/5)+2)*power*attack/defense)/50);if(mon.status==='BRN'&&ability!=='ABILITY_GUTS')damage=Math.floor(damage/2);damage+=2;
  return Math.max(1,Math.floor(damage*(100-(rawRange%16))/100));
}
// BtlCmd_GetMonBallCatchRate: integer divisions and nested square roots match the source path.
export function catchShakes(catchRate:number,hp:number,maxHP:number,ballMultiplier:number,status:string,roll:()=>number){
  let rate=Math.floor(Math.floor(catchRate*ballMultiplier/10)*(maxHP*3-hp*2)/(maxHP*3));
  if(status==='SLP'||status==='FRZ')rate*=2;if(['BRN','PAR','PSN','TOX'].includes(status))rate=Math.floor(rate*15/10);
  if(rate>=255)return 4;if(rate<=0)return 0;
  const threshold=Math.floor(0xffff0/Math.floor(Math.sqrt(Math.floor(Math.sqrt(Math.floor(0xff0000/rate))))));
  let shakes=0;for(;shakes<4;shakes++)if(Math.floor(roll()*65536)>=threshold)break;return shakes;
}
