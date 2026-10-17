import {calculateStats,createMon} from './data.ts';
import {nativeGenderRatio,nativeMonGender} from './gender.ts';
import {sourceJSON,type GameData,type Mon} from './types.ts';
type TrainerRules={genders:Record<string,string>;prizes:Record<string,number>};
let rules:Promise<TrainerRules>|null=null;
export async function originalTrainerParty(data:GameData,id:number):Promise<Mon[]>{
  rules??=sourceJSON('trainer-rules.json');const {genders}=await rules,trainer=data.trainers[id];if(!trainer)throw Error(`Missing original trainer ${id}`);
  let genderPID=genders[trainer.class]==='TRAINER_FEMALE'?0x78:0x88;
  return trainer.party.map(row=>{
    const species=data.constants[row.species],base=data.personal[species],gender=data.constants[String(row.genderOverride)]||0,ability=data.constants[String(row.abilityOverride)]||0;
    if(gender)genderPID=nativeGenderRatio(base.genderRatio)+(gender===1?2:-2);if(ability===1)genderPID&=~1;else if(ability===2)genderPID|=1;
    let seed=(row.difficulty+row.level+species+id)>>>0,pid=seed;for(let i=0;i<data.constants[trainer.class];i++){seed=(Math.imul(seed,1103515245)+24691)>>>0;pid=seed>>>16;}
    pid=((pid<<8)+genderPID)>>>0;
    const mon=createMon(data,species,row.level,trainer.name.replace('{TRNAME}',''));mon.personality=pid;mon.nature=pid%25;mon.ivs=Array(6).fill(Math.floor(row.difficulty*31/255));mon.gender=nativeMonGender(base.genderRatio,pid);const stats=calculateStats(base,row.level,mon.ivs,mon.evs,mon.nature);mon.maxHP=stats.maxHP;mon.hp=stats.maxHP;mon.stats=stats.stats;
    if(row.moves)mon.moves=row.moves.map(key=>{const id=data.constants[key];return{id,pp:data.moves[id].pp,maxPP:data.moves[id].pp};});mon.heldItem=row.item&&row.item!=='ITEM_NONE'?row.item:null;mon.friendship=mon.moves.some(slot=>slot.id===data.constants.MOVE_FRUSTRATION)?0:255;return mon;
  });
}
export async function trainerPrize(data:GameData,id:number,multiplier=1){rules??=sourceJSON('trainer-rules.json');const trainer=data.trainers[id],last=trainer.party.at(-1);return (last?.level||0)*4*multiplier*((await rules).prizes[trainer.class]??4);}
export function battleMoneyLoss(party:Mon[],badges:number,money:number){const penalties=[2,4,6,9,12,16,20,25,30];return Math.min(money,Math.max(1,...party.map(mon=>mon.level))*4*penalties[Math.min(8,badges)]);}
