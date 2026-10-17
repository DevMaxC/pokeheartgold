import {calculateStats} from './data.ts';
import {advanceLCRNG,sampleUint32} from './native-rng.ts';
import type {GameData,Mon,State,MonDate} from './types.ts';
export type EggContext={random?:()=>number;now?:()=>Date};
const LANGUAGE_ENGLISH=2; // include/config.h:17; this source checkout is English.
export const NATIVE_EGG_ICON='/source/eggs/egg-icon.png';
const uint32=(value:number)=>Number.isInteger(value)&&value>=0&&value<=0xffffffff;
function nativeDate(now:Date):MonDate{const year=now.getFullYear()-2000;if(!Number.isInteger(year)||year<0||year>99)throw RangeError('Date outside native RTC range');return{year,month:now.getMonth()+1,day:now.getDate()};}
/** include/constants/pokemon.h GENDER_RATIO(frac), then pokemon.c:2094. */
export function nativeEggGender(ratio:number,personality:number):Mon['gender']{
 const raw=ratio<=1?Math.floor(ratio*254.75):255;return raw===0?'male':raw===254?'female':raw===255?'genderless':raw>(personality&255)?'female':'male';
}
function eggDraft(data:GameData,state:State,trainerId:number,seed:number,now:Date){
 const species=data.constants.SPECIES_TOGEPI,base=data.personal[species];if(!base||!uint32(trainerId)||!uint32(seed))throw Error('Missing native Egg profile or personal data');
 const date=nativeDate(now),draw=()=>{const next=advanceLCRNG(seed);seed=next.seed;return next.value;};
 // CreateBoxMon: low/high PID, then HP/Atk/Def and Speed/SpAtk/SpDef IV words.
 const low=draw(),high=draw(),personality=(low|(high<<16))>>>0,first=draw(),second=draw();
 const ivs=[first&31,(first>>>5)&31,(first>>>10)&31,second&31,(second>>>5)&31,(second>>>10)&31],evs=Array(6).fill(0),nature=personality%25,stats=calculateStats(base,1,ivs,evs,nature);
 const ids:number[]=[];for(const row of data.learnsets[species]??[])if(row.level<=1&&!ids.includes(row.move)){if(ids.length===4)ids.shift();ids.push(row.move);}
 const extra=data.constants.MOVE_EXTRASENSORY;if(ids.length<4)ids.push(extra);else ids[3]=extra;
 const moves=ids.map(id=>{const move=data.moves[id];if(!move)throw Error('Missing native Egg move '+id);return{id,pp:move.pp,maxPP:move.pp};});
 const name=data.names.species[data.constants.SPECIES_EGG],friendship=Number(base.eggCycles);if(!name||!Number.isInteger(friendship)||friendship<0||friendship>255)throw Error('Missing original Egg name/cycles');
 // Existing browser id is an instance token, not the OT identity. Reusing
 // PID avoids inventing a fifth native draw; ownership uses provenance.otId.
 const mon:Mon={isEgg:true,species,level:1,name,gender:nativeEggGender(base.genderRatio,personality),...stats,hp:stats.maxHP,exp:data.growth[base.growthRate][1],ivs,evs,nature,personality,status:'',sleepTurns:0,moves,friendship,heldItem:null,ot:state.name,id:personality,
  provenance:{otId:trainerId,otGender:state.gender,language:LANGUAGE_ENGLISH,gameVersion:data.constants.GAME_VERSION,metLevel:0,pokeball:data.constants.BALL_POKE,metLocation:0,metDate:{year:0,month:0,day:0},eggLocation:data.constants.METLOC_MR_POKEMON,eggDate:date,fatefulEncounter:false}};
 return{mon,seed};
}
/** Exact party-only GiveTogepiEgg acquisition. No Pokédex registration or
 * PC fallback. State/RNG/profile changes are committed only after construction. */
export function giveTogepiEgg(data:GameData,state:State,context:EggContext={}){
 if(state.party.length>=6)return false;
 const random=context.random??Math.random,trainerId=state.trainerId??sampleUint32(random),seed=state.nativeEggSeed??sampleUint32(random);
 const draft=eggDraft(data,state,trainerId,seed,(context.now??(()=>new Date()))());state.party.push(draft.mon);state.trainerId=trainerId;state.nativeEggSeed=draft.seed;state.togepiGiftIdentity={personality:draft.mon.personality,gender:draft.mon.gender};return true;
}
/** field_misc_events.c:278: the identity test intentionally also recognizes
 * its Togetic/Togekiss evolutions and does not itself test isEgg. */
export function isOriginalTogepiGift(data:GameData,state:State,mon:Mon|undefined){
 if(!mon||state.trainerId===undefined||!state.togepiGiftIdentity||!mon.provenance)return false;
 const origin=mon.provenance,identity=state.togepiGiftIdentity;return[data.constants.SPECIES_TOGEPI,data.constants.SPECIES_TOGETIC,data.constants.SPECIES_TOGEKISS].includes(mon.species)&&origin.otId===state.trainerId&&origin.otGender===state.gender&&origin.language===LANGUAGE_ENGLISH&&origin.gameVersion===data.constants.GAME_VERSION&&identity.personality===mon.personality&&identity.gender===mon.gender;
}
export function isUsableBattler(mon:Mon|undefined):mon is Mon{return!!mon&&!mon.isEgg&&mon.hp>0;}
export function firstUsableBattlerIndex(party:readonly Mon[]){return party.findIndex(isUsableBattler);}
/** follow_mon.c:1518: a fainted non-Egg can follow if no live mon remains. */
export function firstFollowerMon(party:readonly Mon[]){return party.find(isUsableBattler)??party.find(mon=>!mon.isEgg);}
export function partyMonSpecies(mon:Mon|undefined){return mon&&!mon.isEgg?mon.species:0;}
