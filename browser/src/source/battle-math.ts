import type {GameData,Mon,MoveData} from './types.ts';
export type Stages={atk:number;def:number;spatk:number;spdef:number;speed:number;accuracy:number;evasion:number};
export function freshStages():Stages{return {atk:0,def:0,spatk:0,spdef:0,speed:0,accuracy:0,evasion:0};}
export function stageMultiplier(stage:number,accuracy=false){stage=Math.max(-6,Math.min(6,stage));const base=accuracy?3:2;return stage>=0?(base+stage)/base:base/(base-stage);}
export function typeEffectiveness(data:Pick<GameData,'constants'|'personal'|'typeChart'>,moveType:number,species:number,identified=false){let factor=1;for(const type of new Set(data.personal[species].types)){const id=data.constants[type];if(identified&&id===data.constants.TYPE_GHOST&&[data.constants.TYPE_NORMAL,data.constants.TYPE_FIGHTING].includes(moveType))continue;const row=data.typeChart.find(r=>r[0]===moveType&&r[1]===id);if(row)factor*=row[2];}return factor;}
// Base Gen IV single-target calculation. Weather/screens/held modifiers are separate parity tasks.
export function moveDamage(data:GameData,attacker:Mon,defender:Mon,move:MoveData,attackStages:Stages,defenseStages:Stages,roll:number,critical=false,identified=false){
  const physical=move.category===0;const attackStat=physical?'atk':'spatk',defenseStat=physical?'def':'spdef';
  const as=critical?Math.max(0,attackStages[attackStat]):attackStages[attackStat],ds=critical?Math.min(0,defenseStages[defenseStat]):defenseStages[defenseStat];
  const attack=Math.max(1,Math.floor(attacker.stats[attackStat]*stageMultiplier(as))),defense=Math.max(1,Math.floor(defender.stats[defenseStat]*stageMultiplier(ds)));
  let power=move.power;const abilities=data.personal[attacker.species].abilities;const ability=abilities[attacker.personality%2]!=='ABILITY_NONE'?abilities[attacker.personality%2]:abilities[0];
  if(attacker.hp<=Math.floor(attacker.maxHP/3)&&((ability==='ABILITY_BLAZE'&&move.type===10)||(ability==='ABILITY_TORRENT'&&move.type===11)||(ability==='ABILITY_OVERGROW'&&move.type===12)))power=Math.floor(power*1.5);
  let damage=Math.floor(Math.floor((Math.floor(attacker.level*2/5)+2)*power*attack/defense)/50)+2;
  if(physical&&attacker.status==='BRN')damage=Math.floor(damage/2);
  if(critical)damage*=2;
  damage=Math.floor(damage*Math.max(85,Math.min(100,roll))/100);
  if(data.personal[attacker.species].types.some(t=>data.constants[t]===move.type))damage=Math.floor(damage*1.5);
  const effectiveness=typeEffectiveness(data,move.type,defender.species,identified);damage=Math.floor(damage*effectiveness);
  return {damage:effectiveness===0?0:Math.max(1,damage),effectiveness};
}
// BtlCmd_GetMonBallCatchRate: integer divisions and nested square roots match the source path.
export function catchShakes(catchRate:number,hp:number,maxHP:number,ballMultiplier:number,status:string,roll:()=>number){
  let rate=Math.floor(Math.floor(catchRate*ballMultiplier/10)*(maxHP*3-hp*2)/(maxHP*3));
  if(status==='SLP'||status==='FRZ')rate*=2;if(['BRN','PAR','PSN','TOX'].includes(status))rate=Math.floor(rate*15/10);
  if(rate>=255)return 4;if(rate<=0)return 0;
  const threshold=Math.floor(0xffff0/Math.floor(Math.sqrt(Math.floor(Math.sqrt(Math.floor(0xff0000/rate))))));
  let shakes=0;for(;shakes<4;shakes++)if(Math.floor(roll()*65536)>=threshold)break;return shakes;
}
