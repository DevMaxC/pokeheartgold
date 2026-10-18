import {nativeMonGender} from './gender.ts';
import {sourceJSON,type GameData,type Mon} from './types.ts';

/** include/constants/pokemon.h:EvoMethod, in original numeric order. */
export const NATIVE_EVOLUTION_METHODS=Object.freeze([
 'EVO_NONE','EVO_FRIENDSHIP','EVO_FRIENDSHIP_DAY','EVO_FRIENDSHIP_NIGHT','EVO_LEVEL',
 'EVO_TRADE','EVO_TRADE_ITEM','EVO_STONE','EVO_LEVEL_ATK_GT_DEF','EVO_LEVEL_ATK_EQ_DEF',
 'EVO_LEVEL_ATK_LT_DEF','EVO_LEVEL_PID_LO','EVO_LEVEL_PID_HI','EVO_LEVEL_NINJASK',
 'EVO_LEVEL_SHEDINJA','EVO_BEAUTY','EVO_STONE_MALE','EVO_STONE_FEMALE','EVO_ITEM_DAY',
 'EVO_ITEM_NIGHT','EVO_HAS_MOVE','EVO_OTHER_PARTY_MON','EVO_LEVEL_MALE','EVO_LEVEL_FEMALE',
 'EVO_CORONET','EVO_ETERNA','EVO_ROUTE217',
]as const);
export type NativeEvolutionMethodKey=typeof NATIVE_EVOLUTION_METHODS[number];
export const NATIVE_EVOLUTION_METHOD=Object.freeze(Object.fromEntries(NATIVE_EVOLUTION_METHODS.map((key,value)=>[key,value]))as Record<NativeEvolutionMethodKey,number>);
export type NativeEvolutionRule=Readonly<{method:number;methodKey:NativeEvolutionMethodKey;param:number;target:number;rowIndex:number}>;
export type NativeEvolutionData=Readonly<{
 tables:readonly(readonly NativeEvolutionRule[])[];
 items:Readonly<Record<string,Readonly<{id:number;holdEffect:number}>>>;
 genderRatios:readonly number[];
 /** The native JSON repeats Weepinbell:230 declarations/247 rules compile to229/246. */
 sourceRows:readonly Readonly<{species:number;rules:readonly NativeEvolutionRule[]}>[];
 ruleCount:number;speciesWithRules:number;declaredRuleCount:number;
}>;
export type NativeEvolutionMon=Pick<Mon,'species'|'personality'|'level'|'friendship'|'heldItem'|'stats'|'moves'|'form'|'isEgg'|'checksumFailed'>&{beauty?:number};
export type NativeEvolutionPartyMon=Pick<Mon,'species'|'isEgg'|'checksumFailed'>;
export type NativeEvolutionEnvironment={
 /** Actual current native RTC IsNighttime result, not an inferred map palette. */
 night?:boolean;
 /** BattleSetup.evolutionLocation; HGSS MapHeader_GetMapEvolutionMethod is 0. */
 evolutionLocation?:number;
};
export type NativeEvolutionContext=
 |({kind:'levelup'}&NativeEvolutionEnvironment)
 |{kind:'trade'}
 |{kind:'item-check'|'item-use';usedItem:number};
export type NativeEvolutionDecision=
 |{kind:'eligible';target:number;method:number;methodKey:NativeEvolutionMethodKey;param:number;rowIndex:number;methodRet:number}
 |{kind:'ineligible';methodRet:number|null;reason:'no-match'|'everstone'|'spiky-ear-pichu'}
 |{kind:'unsupported';reason:string;requirements:readonly string[]};
export class UnsupportedNativeEvolutionData extends Error{
 constructor(message:string){super(message);this.name='UnsupportedNativeEvolutionData';}
}
const admitted=new WeakSet<object>();
const validInt=(value:unknown,min:number,max:number):value is number=>Number.isInteger(value)&&Number(value)>=min&&Number(value)<=max;
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
type EvolutionSourceData=Pick<GameData,'constants'|'items'|'personal'>;
function invalid(message:string):never{throw new UnsupportedNativeEvolutionData(message);}

/** Resolve the already-exported original evo JSON against actual species/item/
 * move constants. The source C initializer zero-fills missing species/7 slots.
 * This copies/freezes all admitted state, preserving row order and raw items. */
export function parseNativeEvolutionData(raw:unknown,data:EvolutionSourceData):NativeEvolutionData{
 if(!record(raw)||!Array.isArray(raw.evoTable)||!data?.constants||!Array.isArray(data.items)||!Array.isArray(data.personal))invalid('Missing original evolution/species/item data');
 const constants=data.constants;
 for(const[key,value]of Object.entries({SPECIES_NONE:0,SPECIES_KADABRA:64,SPECIES_PICHU:172,HOLD_EFFECT_NO_EVOLVE:64,ITEM_NONE:0}))if(constants[key]!==value)invalid('Incompatible native evolution constant '+key);
 const genderRatios=Array.from({length:494},(_,species)=>{
  const row=data.personal[species],key='SPECIES_'+row?.species;
  if(!row||constants[key]!==species||![0,.125,.25,.5,.75,1,2].includes(row.genderRatio))invalid('Missing original personal entry '+species);
  return row.genderRatio;
 });
 const items:Record<string,Readonly<{id:number;holdEffect:number}>>=Object.create(null);
 for(const row of data.items){
  if(!row||typeof row.item!=='string'||!/^ITEM_\w+$/.test(row.item)||items[row.item]||!validInt(constants[row.item],0,65535)||typeof row.holdEffect!=='string'||!/^HOLD_EFFECT_\w+$/.test(row.holdEffect)||!validInt(constants[row.holdEffect],0,255))invalid('Invalid original held-item effect');
  items[row.item]=Object.freeze({id:constants[row.item],holdEffect:constants[row.holdEffect]});
 }
 if(items.ITEM_NONE?.id!==0||items.ITEM_NONE?.holdEffect!==0)invalid('Missing native ITEM_NONE');
 const blank=()=>Array.from({length:7},(_,rowIndex)=>Object.freeze({method:0,methodKey:'EVO_NONE'as NativeEvolutionMethodKey,param:0,target:0,rowIndex}));
 const tables:NativeEvolutionRule[][]=Array.from({length:494},blank);
 const seen=new Set<number>(),sourceRows:Readonly<{species:number;rules:readonly NativeEvolutionRule[]}>[]=[];let declaredRuleCount=0;
 for(const row of raw.evoTable){
  if(!record(row)||typeof row.baseSpecies!=='string'||!/^SPECIES_\w+$/.test(row.baseSpecies)||!validInt(constants[row.baseSpecies],1,493)||!Array.isArray(row.evos)||row.evos.length>7)invalid('Invalid original evolution species/slots');
  // evo.json.txt emits designated C initializers. A repeated species replaces
  // the entire seven-slot record, including its implicit zero-filled slots.
  const species=constants[row.baseSpecies];seen.add(species);tables[species]=blank();
  row.evos.forEach((entry:unknown,rowIndex:number)=>{
   if(!record(entry)||typeof entry.method!=='string'||typeof entry.target!=='string'||!/^SPECIES_\w+$/.test(entry.target)||!validInt(constants[entry.target],1,493))invalid('Invalid original evolution target');
   const method=NATIVE_EVOLUTION_METHODS.indexOf(entry.method as NativeEvolutionMethodKey);
   if(method<1)invalid('Unknown original evolution method '+entry.method);
   const param=typeof entry.param==='string'&&/^(ITEM|MOVE|SPECIES)_\w+$/.test(entry.param)?constants[entry.param]:entry.param;
   if(!validInt(param,0,65535))invalid('Unresolved original evolution parameter');
   tables[species][rowIndex]=Object.freeze({method,methodKey:NATIVE_EVOLUTION_METHODS[method],param,target:constants[entry.target],rowIndex});declaredRuleCount++;
  });
  sourceRows.push(Object.freeze({species,rules:Object.freeze(tables[species].slice(0,row.evos.length))}));
 }
 const ruleCount=tables.flat().filter(rule=>rule.method!==0).length;
 const result=Object.freeze({tables:Object.freeze(tables.map(table=>Object.freeze(table))),items:Object.freeze(items),genderRatios:Object.freeze(genderRatios),sourceRows:Object.freeze(sourceRows),ruleCount,speciesWithRules:seen.size,declaredRuleCount});admitted.add(result);return result;
}

/** Separate loader: no GameData/Main mutation or silent fallback on I/O/data failure. */
export async function loadNativeEvolutionData(data:EvolutionSourceData,load:(path:string)=>Promise<unknown>=sourceJSON):Promise<NativeEvolutionData>{return parseNativeEvolutionData(await load('evolutions.json'),data);}

/** gf_rtc.c's actual late/night buckets: 00..03 and 20..23. Caller owns RTC. */
export function nativeEvolutionNight(hour:number){if(!validInt(hour,0,23))throw RangeError('Evolution requires a native RTC hour 0..23');return hour<4||hour>=20;}
/** map_header.c:242 returns EVO_NONE unconditionally in HGSS (DPPt leftover). */
export function nativeMapEvolutionMethod(mapId:number){if(!validInt(mapId,0,0xffffffff))throw RangeError('Invalid native evolution map ID');return 0;}

const unsupported=(requirement:string,reason='Missing or invalid native evolution '+requirement):NativeEvolutionDecision=>({kind:'unsupported',reason,requirements:[requirement]});
/** pokemon.c:GetMonEvolution, including its method_ret write distinctions.
 * No HP, battle-outcome, level-up-bit, menu, cancellation, item consumption,
 * Shedinja creation or Mon mutation belongs here. Those are native callers/
 * EvolutionScene effects. Cached Mon.gender and ability suppression are unused.
 * Unavailable inputs are unsupported only when they can affect this decision. */
export function selectNativeEvolution(data:NativeEvolutionData,party:readonly NativeEvolutionPartyMon[]|null,mon:NativeEvolutionMon,context:NativeEvolutionContext):NativeEvolutionDecision{
 if(!data||!admitted.has(data))return unsupported('evolution-data','Evolution requires parsed original data');
 if(!mon||!validInt(mon.species,1,493)||mon.checksumFailed)return unsupported('species','Evolution requires a valid non-corrupt national species');
 if(!context||!['levelup','trade','item-check','item-use'].includes(context.kind))return unsupported('context');
 const held=data.items[mon.heldItem===null?'ITEM_NONE':mon.heldItem];if(!held)return unsupported('held-item','Missing raw native held item/effect');
 if(mon.species!==64&&held.holdEffect===64&&context.kind!=='item-use')return{kind:'ineligible',methodRet:null,reason:'everstone'};
 if(mon.species===172){if(!validInt(mon.form,0,31))return unsupported('form','Pichu evolution requires actual form (spiky-ear form1 cannot evolve)');if(mon.form===1)return{kind:'ineligible',methodRet:null,reason:'spiky-ear-pichu'};}
 if(context.kind==='levelup'&&(!validInt(mon.level,1,100)||!validInt(mon.friendship,0,255)))return unsupported('level/friendship');
 if((context.kind==='item-check'||context.kind==='item-use')&&!validInt(context.usedItem,0,65535))return unsupported('used-item');
 let methodRet:number|null=null;
 const gender=()=>validInt(mon.personality,0,0xffffffff)?nativeMonGender(data.genderRatios[mon.species],mon.personality):undefined;
 for(const rule of data.tables[mon.species]){
  const {method,param}=rule;let matches=false;
  if(context.kind==='levelup')switch(method){
   case 1:matches=mon.friendship>=220;break;
   case 2:case 3:if(mon.friendship>=220){if(typeof context.night!=='boolean')return unsupported('night');matches=context.night===(method===3);}break;
   case 4:case 13:matches=param<=mon.level;break;
   case 8:case 9:case 10:if(param<=mon.level){if(!validInt(mon.stats?.atk,0,65535)||!validInt(mon.stats?.def,0,65535))return unsupported('attack/defense');matches=method===8?mon.stats.atk>mon.stats.def:method===9?mon.stats.atk===mon.stats.def:mon.stats.atk<mon.stats.def;}break;
   case 11:case 12:if(param<=mon.level){if(!validInt(mon.personality,0,0xffffffff))return unsupported('personality');matches=((mon.personality>>>16)%10<5)===(method===11);}break;
   case 14:methodRet=14;break; // Literal source: this row never selects Shedinja.
   case 15:if(!validInt(mon.beauty,0,255))return unsupported('beauty','Feebas needs saved native beauty; current Mon does not store it');matches=param<=mon.beauty;break;
   case 18:case 19:if(param===held.id){if(typeof context.night!=='boolean')return unsupported('night');matches=context.night===(method===19);}break;
   case 20:if(!Array.isArray(mon.moves)||mon.moves.length>4||mon.moves.some(move=>!validInt(move?.id,0,65535)))return unsupported('moves');matches=mon.moves.some(move=>move.id===param);break;
   case 21:if(party!==null){if(!Array.isArray(party)||party.length>6||party.some(slot=>!slot||!validInt(slot.species,0,493)))return unsupported('party');matches=party.some(slot=>slot.species===param&&!slot.isEgg&&!slot.checksumFailed);}break;
   case 22:case 23:if(param<=mon.level){const value=gender();if(value===undefined)return unsupported('personality');matches=value===(method===22?'male':'female');}break;
   case 24:case 25:case 26:if(!validInt(context.evolutionLocation,0,65535))return unsupported('evolution-location');matches=context.evolutionLocation===method;break;
  }
  else if(context.kind==='trade'){matches=method===5||method===6&&held.id===param;}
  else if((method===7||method===16||method===17)&&context.usedItem===param){if(method===7)matches=true;else{const value=gender();if(value===undefined)return unsupported('personality');matches=value===(method===16?'male':'female');}}
  if(matches)return{kind:'eligible',target:rule.target,method,methodKey:rule.methodKey,param,rowIndex:rule.rowIndex,methodRet:context.kind==='item-check'||context.kind==='item-use'?0:method};
 }
 return{kind:'ineligible',methodRet,reason:'no-match'};
}

export function selectNativeLevelEvolution(data:NativeEvolutionData,party:readonly NativeEvolutionPartyMon[]|null,mon:NativeEvolutionMon,environment:NativeEvolutionEnvironment):NativeEvolutionDecision{return selectNativeEvolution(data,party,mon,{...environment,kind:'levelup'});}
