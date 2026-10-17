import {calculateStats,speciesName} from './data.ts';
import {monAbility} from './battle-math.ts';
import {advanceLCRNG} from './native-rng.ts';
import {nativeEggGender,isOriginalTogepiGift} from './eggs.ts';
import {gameStat,gameStatMaximum,addSpecialGameStat} from './game-stats.ts';
import {sourceJSON,type GameData,type Mon,type MonDate,type SourceMap,type State} from './types.ts';

// Literal src/get_egg.c:sEggCycleSpecialDates.112 is January12 despite its
// native comment saying New Year's Day. Preserve the executable table.
export const EGG_CYCLE_SPECIAL_DATES=[112,214,303,401,501,611,707,821,907,928,1031,1121,1214,1224,1225]as const;
export type EggStepClock={month:number;day:number;penalty:boolean};
export type EggStepPlan={counter:number;cycleCompleted:boolean;decrement:1|2;changes:{slot:number;from:number;to:number}[];hatchReady:boolean;partyIndex:number|null};
export class UnsupportedEggHatch extends Error{constructor(reason:string){super('Unported native Egg hatch requirement: '+reason);this.name='UnsupportedEggHatch';}}
const byte=(value:number)=>Number.isInteger(value)&&value>=0&&value<=255;
const uint32=(value:number)=>Number.isInteger(value)&&value>=0&&value<=0xffffffff;
export function eggCycleLength(clock:EggStepClock){
 if(!Number.isInteger(clock.month)||clock.month<1||clock.month>12||!Number.isInteger(clock.day)||clock.day<1||clock.day>31||typeof clock.penalty!=='boolean')throw Error('Native Egg steps require an explicit field RTC date and penalty state');
 return !clock.penalty&&(EGG_CYCLE_SPECIAL_DATES as readonly number[]).includes(clock.month*100+clock.day)?230:255;
}
export function firstReadyEggIndex(party:readonly Mon[]){return party.findIndex(mon=>!mon.checksumFailed&&mon.isEgg&&mon.friendship===0);}
/** Pure HandleDaycareStep Egg portion. Call only after trainer/frame/coord/
 * warp/forced-movement/poison/Safari priorities have allowed a normal step.
 * Breeding/deposited-parent counters are a separate unported daycare system.
 */
export function planPartyEggStep(data:GameData,party:readonly Mon[],counter:number,clock:EggStepClock):EggStepPlan{
 if(!byte(counter))throw Error('Invalid native Egg step counter');const length=eggCycleLength(clock);
 const decrement:1|2=party.some(mon=>!mon.isEgg&&!mon.checksumFailed&&['ABILITY_MAGMA_ARMOR','ABILITY_FLAME_BODY'].includes(monAbility(data,mon)))?2:1;
 const result:EggStepPlan={counter:(counter+1)&255,cycleCompleted:false,decrement,changes:[],hatchReady:false,partyIndex:null};
 // The native counter is a saved u8, but this comparison uses the unwrapped
 // sum. Date changes can miss230; using>= would change the game.
 if(counter+1!==length)return result;result.counter=0;result.cycleCompleted=true;
 const remaining=party.map(mon=>mon.friendship);
 for(let slot=0;slot<party.length;slot++){
  const mon=party[slot];if(!mon.isEgg||mon.checksumFailed)continue;
  if(!byte(mon.friendship))throw Error('Invalid native Egg cycle count');
  if(mon.friendship===0){
   result.hatchReady=true;
   // Party_GetMonToHatch rescans after the prefix was decremented: an earlier
   // Egg that just reached0 may hatch before the already0 Egg that triggered.
   result.partyIndex=party.findIndex((egg,index)=>egg.isEgg&&!egg.checksumFailed&&remaining[index]===0);return result;
  }
  const to=mon.friendship>=decrement?mon.friendship-decrement:mon.friendship-1;remaining[slot]=to;result.changes.push({slot,from:mon.friendship,to});
 }
 return result;
}
export function advancePartyEggStep(data:GameData,state:State,clock:EggStepClock){
 const plan=planPartyEggStep(data,state.party,state.eggCycleSteps??0,clock);state.eggCycleSteps=plan.counter;for(const change of plan.changes)state.party[change.slot].friendship=change.to;return plan;
}
/** field_control.c:FieldSystem_UpdateDaycare, before std_hatch_egg2021's
 * "Oh?" dialogue. Do not call for a direct/debug EggHatchAnim command.
 * The root source transaction must include this award and the awaited script.
 */
export function recordEggHatchEvent(data:GameData,state:State){
 if(firstReadyEggIndex(state.party)<0)throw Error('No native Egg hatch event is ready');
 const stat=data.constants.GAME_STAT_EGGS_HATCHED;state.gameStats??={};state.gameStats[stat]=Math.min(gameStatMaximum(stat),gameStat(state,stat)+1);addSpecialGameStat(state,data.constants.SCORE_EVENT_HATCHED_EGG);
}

export type EggHatchScene={slot:number;kind:'standard'|'manaphy';before:Readonly<Mon>;hatched:Readonly<Mon>;speciesName:string;field:{map:number;x:number;z:number;facing:number};cry:{species:number;form:number};audio:{hatchMusic:{key:'SEQ_GS_SHINKA';id:number};fanfare:{key:'SEQ_ME_SHINKAOME';id:number};restoreFieldMusic:true};messages:{hatched:string;nickname:string;yes:string;no:string}};
/** The host owns a3D field reveal/camera/particles/audio. No flat-screen or
 * DOM assumptions, defaults or silent fallback are supplied by this helper.
 * announce starts the first text with the cry, awaits cryComplete, plays the
 * native fanfare, then presents the nickname prompt and resolves the decision.
 * reveal owns hatchMusic; resumeField restores the field music.
 */
export type EggHatchPresentation={
 reveal:(scene:EggHatchScene)=>Promise<void>;
 cry:(scene:EggHatchScene)=>Promise<void>;
 announce:(scene:EggHatchScene,cryComplete:Promise<void>)=>Promise<boolean>;
 nickname:(scene:EggHatchScene)=>Promise<string|null>;
 resumeField:(scene:EggHatchScene)=>Promise<void>;
};
/** Fresh native trigger notification, never reconstructed from saved flags.
 * This port is synchronous. The host's outer source-action field checkpoint
 * must capture/restore any ephemeral ring/timer changes made by the callback. */
export type EggHatchPhoneTrigger=(id:number,accelerate:true)=>void;
export type EggHatchContext={map:Pick<SourceMap,'id'|'fields'>;now?:()=>Date;phoneTrigger?:EggHatchPhoneTrigger};
function nativeDate(date:Date):MonDate{
 const year=date.getFullYear()-2000;if(!Number.isInteger(year)||year<0||year>99)throw Error('Hatching requires a valid native2000–2099 RTC date');return{year,month:date.getMonth()+1,day:date.getDate()};
}
const shiny=(ot:number,pid:number)=>((ot>>>16)^(ot&65535)^(pid>>>16)^(pid&65535))<8;
function hatchDraft(data:GameData,mon:Mon,seed:number){
 const base=data.personal[mon.species],origin=mon.provenance;if(!base||!origin||!uint32(origin.otId)||!uint32(seed))throw new UnsupportedEggHatch('complete Egg provenance and saved native Egg RNG');
 if((mon.form??0)!==0)throw new UnsupportedEggHatch('alternate-form hatch stats');
 if(mon.species===data.constants.SPECIES_JIRACHI)throw new UnsupportedEggHatch('Jirachi Pokéwalker course reward');
 let personality=mon.personality;if(!uint32(personality))throw Error('Invalid native Egg personality');
 // Native Ranger Manaphy anti-shiny reroll is a PID-local PRandom stream;
 // these iterations do not consume the global LCG IV draws below.
 if(mon.species===data.constants.SPECIES_MANAPHY&&origin.eggLocation===data.constants.METLOC_POKEMON_RANGER)while(shiny(origin.otId,personality))personality=(Math.imul(personality,1812433253)+1)>>>0;
 if(!uint32(personality)||mon.ivs.length!==6||!mon.ivs.every(iv=>Number.isInteger(iv)&&iv>=0&&iv<=31))throw Error('Invalid native Egg personality/IVs');
 const evs=Array(6).fill(0),nature=personality%25,stats=calculateStats(base,1,mon.ivs,evs,nature),name=speciesName(data,mon.species);
 const moves=mon.moves.map(slot=>{const move=data.moves[slot.id];if(!move||!byte(slot.pp))throw Error('Invalid native Egg move');return{id:slot.id,pp:slot.pp,maxPP:move.pp};});
 // CreateMon's fixedPID/fixedIV32 creation consumes two IV draws, then the
 // Egg's original IVs are copied over them (get_egg.c:943–954).
 const nextSeed=advanceLCRNG(advanceLCRNG(seed).seed).seed;
 const hatched:Mon={isEgg:false,checksumFailed:false,hasNickname:false,form:mon.form??0,markings:mon.markings??0,pokerus:mon.pokerus??0,species:mon.species,level:1,name,gender:nativeEggGender(base.genderRatio,personality),...stats,hp:stats.maxHP,exp:data.growth[base.growthRate][1],ivs:[...mon.ivs],evs,nature,personality,status:'',sleepTurns:0,moves,friendship:120,heldItem:null,ot:mon.ot,id:mon.id,provenance:{...structuredClone(origin),pokeball:data.constants.BALL_POKE,metLevel:0}};
 return{hatched,nextSeed};
}
function memoAfterHatch(data:GameData,state:State,mon:Mon,context:EggHatchContext){
 const origin=mon.provenance!;let section=data.constants[context.map.fields.mapsec];if(!Number.isInteger(section))throw new UnsupportedEggHatch('native map section');
 if(section>data.constants.METLOC_DAY_CARE_COUPLE)section=data.constants.MAPSEC_MYSTERY_ZONE;
 if(origin.otId!==state.trainerId||origin.otGender!==state.gender||mon.ot!==state.name){origin.eggLocation=origin.metLocation;origin.eggDate={...origin.metDate};}
 origin.metLocation=section;origin.metDate=nativeDate((context.now??(()=>new Date()))());origin.otId=state.trainerId!;origin.otGender=state.gender;mon.ot=state.name;mon.isEgg=false;mon.name=speciesName(data,mon.species);mon.hasNickname=false;
 if(isOriginalTogepiGift(data,state,mon)){
  state.flags.FLAG_SYS_HATCHED_TOGEPI_EGG=true;state.phoneTriggers??=[];const trigger=data.constants.CALL_TRIGGER_ELM_EGG_HATCHED;if(!state.phoneTriggers.includes(trigger))state.phoneTriggers.push(trigger);
  // hatch_egg_task.c UPDATE_MON_INFO calls TryTriggerElmEggHatchedCall
  // before Dex/naming/field restore. It boosts even if this flag was set.
  context.phoneTrigger?.(trigger,true);
 }
 // UpdatePokedexWithReceivedSpecies adds the unique-registration score only
 // when not already caught; it does not increment GAME_STAT_CAUGHT_MON10.
 if(!state.caught.includes(mon.species))addSpecialGameStat(state,data.constants.SCORE_EVENT_REGISTER_SPECIES_CAUGHT);
 if(!state.seen.includes(mon.species))state.seen.push(mon.species);if(!state.caught.includes(mon.species))state.caught.push(mon.species);
}

/** EggHatchAnim's awaited lifecycle. Native writes70 to the one-bit isEgg
 * field before its hatch app, which clears it. Keep that provisional order;
 * restore these changes if any effect/cry/prompt/name/field resume fails.
 * Root SourceActionRecovery must ALSO span the preceding eligible step,
 * recordEggHatchEvent, std2021 and resume before any durable save is allowed.
 */
export async function hatchFirstReadyEgg(data:GameData,state:State,context:EggHatchContext,view:EggHatchPresentation){
 for(const name of['reveal','cry','announce','nickname','resumeField']as const)if(typeof view?.[name]!=='function')throw new UnsupportedEggHatch('awaited3D hatch presentation.'+name);
 // Prepare assets before taking the atomic native mon/RNG snapshot. A late
 // fetch must never overwrite newer party/seed data with an older draft.
 const messages=await sourceJSON<Record<string,string>>('messages/187.json');
 const slot=firstReadyEggIndex(state.party);if(slot<0)throw Error('No native Egg is ready to hatch');const mon=state.party[slot];
 if(state.map!==context.map.id||!uint32(state.trainerId!)||!uint32(state.nativeEggSeed!))throw new UnsupportedEggHatch('current field and saved native trainer/RNG profile');
 const draft=hatchDraft(data,mon,state.nativeEggSeed!),before=structuredClone(mon);
 const stateKeys=['nativeEggSeed','flags','phoneTriggers','seen','caught','gameStats']as const,snapshot=stateKeys.map(key=>({key,present:Object.hasOwn(state,key),value:structuredClone(state[key])}));
 const current=()=>{if(state.party[slot]!==mon||state.map!==context.map.id)throw Error('Native Egg hatch was cancelled by a party/field change');};
 const scene=():EggHatchScene=>({slot,kind:mon.species===data.constants.SPECIES_MANAPHY?'manaphy':'standard',before:Object.freeze(structuredClone(before)),hatched:Object.freeze(structuredClone(mon)),speciesName:speciesName(data,mon.species),field:{map:state.map,x:state.x,z:state.z,facing:state.facing},cry:{species:mon.species,form:mon.form??0},audio:{hatchMusic:{key:'SEQ_GS_SHINKA',id:data.constants.SEQ_GS_SHINKA},fanfare:{key:'SEQ_ME_SHINKAOME',id:data.constants.SEQ_ME_SHINKAOME},restoreFieldMusic:true},messages:{hatched:messages[0].replace(/\{[^}]+\}/g,speciesName(data,mon.species)),nickname:messages[1].replace(/\{STRVAR_1[^}]+\}/g,speciesName(data,mon.species)).replace(/\{YESNO[^}]+\}/g,'').replace(/\\n/g,'\n').trim(),yes:messages[2].replace(/\{ALN_CENTER\}/g,''),no:messages[3].replace(/\{ALN_CENTER\}/g,'')}});
 try{
  current();for(const key of Object.keys(mon))delete(mon as unknown as Record<string,unknown>)[key];Object.assign(mon,draft.hatched);state.nativeEggSeed=draft.nextSeed;
  await view.reveal(scene());current();
  // Native starts cry and hatch text in one frame. The host prints the text
  // immediately, awaits this exact cry, then fanfare before its Yes/No prompt.
  const hatchScene=scene(),cryComplete=Promise.resolve().then(()=>{current();return view.cry(hatchScene);});
  const announceComplete=Promise.resolve().then(()=>{current();return view.announce(hatchScene,cryComplete);});
  // Do not roll back/permit retry while the other owned host task is live.
  const[cryResult,announceResult]=await Promise.allSettled([cryComplete,announceComplete]);
  if(cryResult.status==='rejected')throw cryResult.reason;if(announceResult.status==='rejected')throw announceResult.reason;
  const wantsName=announceResult.value;current();if(typeof wantsName!=='boolean')throw Error('Native hatch nickname decision was not resolved');
  memoAfterHatch(data,state,mon,context);
  if(wantsName){const name=await view.nickname(scene());current();if(name!==null&&typeof name!=='string')throw Error('Native hatch nickname input was not resolved');if(name&&!/^ *$/.test(name)){if(name.length>10)throw Error('Native Pokémon nickname exceeds10 UTF16 characters');mon.name=name;mon.hasNickname=name!==speciesName(data,mon.species);}}
  await view.resumeField(scene());current();return{slot,mon};
 }catch(error){
  for(const key of Object.keys(mon))delete(mon as unknown as Record<string,unknown>)[key];Object.assign(mon,structuredClone(before));
  for(const saved of snapshot){if(saved.present)(state as unknown as Record<string,unknown>)[saved.key]=structuredClone(saved.value);else delete(state as unknown as Record<string,unknown>)[saved.key];}throw error;
 }
}
