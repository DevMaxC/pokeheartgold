import {sourceJSON,type GameData,type State,type Mon,type Personal,type MoveData,type Trainer,type SpriteInfo,type SourceIndex} from './types.ts';

export async function loadData():Promise<GameData>{
  const [index,constants,sprites,personal,moves,learnsets,growth,encounters,trainers,items,typeChart,initial,intro]=await Promise.all([
    sourceJSON<SourceIndex>('index.json'),sourceJSON<Record<string,number>>('constants.json'),sourceJSON<Record<string,SpriteInfo>>('sprites.json'),sourceJSON<{baseStats:Personal[]}>('pokemon.json'),sourceJSON<MoveData[]>('moves.json'),sourceJSON<GameData['learnsets']>('learnsets.json'),sourceJSON<GameData['growth']>('growth.json'),sourceJSON<{encounters:GameData['encounters']}>('encounters.json'),sourceJSON<{trainers:Trainer[]}>('trainers.json'),sourceJSON<GameData['items']>('items.json'),sourceJSON<number[][]>('type-chart.json'),sourceJSON<GameData['initial']>('initial-state.json'),sourceJSON<GameData['intro']>('intro-messages.json'),
  ]);
  return {index,constants,sprites,personal:personal.baseStats,moves,learnsets,growth,encounters:encounters.encounters,trainers:trainers.trainers,items,typeChart,initial,intro};
}
export function newState(data:GameData,name:string,gender:'boy'|'girl'):State{
  return {version:2,name,gender,rivalName:'???',map:64,x:6.5,z:6.5,facing:1,money:3000,flags:{...data.initial.flags},vars:{...data.initial.vars},party:[],boxes:[],bag:{},badges:[],seen:[],caught:[],starter:0,story:0,lastHeal:{map:63,x:6.5,z:8.5},playSeconds:0,options:{textSpeed:1,battleStyle:'shift',sound:false}};
}
export function titleCase(key:string){return key.replace(/^(SPECIES|MOVE|ITEM|TYPE|ABILITY)_/,'').toLowerCase().replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());}
export function speciesName(data:GameData,id:number){return titleCase(data.personal[id]?.species||`Pokémon ${id}`);}
// STAT_HP, ATK, DEF, SPEED, SPATK, SPDEF: same ordering as src/pokemon.c.
export function calculateStats(base:Personal,level:number,ivs:number[],evs:number[],nature:number){
  const bases=[base.hp,base.atk,base.def,base.speed,base.spatk,base.spdef];
  const values=bases.map((b,i)=>{
    const raw=Math.floor((b*2+ivs[i]+Math.floor(evs[i]/4))*level/100);
    if(i===0)return base.species==='SHEDINJA'?1:raw+level+10;
    const boost=Math.floor(nature/5),drop=nature%5;let n=raw+5;
    if(boost!==drop)n=Math.floor(n*(i-1===boost?110:i-1===drop?90:100)/100);
    return n;
  });return {maxHP:values[0],stats:{atk:values[1],def:values[2],speed:values[3],spatk:values[4],spdef:values[5]}};
}
export function createMon(data:GameData,species:number,level:number,ot:string,rng:()=>number=Math.random):Mon{
  const base=data.personal[species];if(!base)throw Error(`Unknown original species ${species}`);
  const ivs=Array.from({length:6},()=>Math.floor(rng()*32)),evs=Array(6).fill(0),personality=Math.floor(rng()*0x100000000),nature=personality%25;
  const stats=calculateStats(base,level,ivs,evs,nature),gender=personality%256<base.genderRatio*256?'female':'male';
  const moves:number[]=[];for(const row of data.learnsets[species]||[])if(row.level<=level){const previous=moves.indexOf(row.move);if(previous>=0)moves.splice(previous,1);moves.push(row.move);if(moves.length>4)moves.shift();}
  return {species,level,name:speciesName(data,species),gender,...stats,hp:stats.maxHP,exp:data.growth[base.growthRate]?.[level]||0,ivs,evs,nature,personality,status:'',sleepTurns:0,moves:moves.map(id=>({id,pp:data.moves[id].pp,maxPP:data.moves[id].pp})),friendship:base.friendship,heldItem:null,ot,id:Math.floor(rng()*0xffffffff)};
}
export function healParty(state:State){for(const mon of state.party){mon.hp=mon.maxHP;mon.status='';mon.sleepTurns=0;for(const move of mon.moves)move.pp=move.maxPP;}}
export function giveMon(state:State,mon:Mon){if(state.party.length<6)state.party.push(mon);else if(state.boxes.length<540)state.boxes.push(mon);else return false;for(const list of [state.seen,state.caught])if(!list.includes(mon.species))list.push(mon.species);return true;}
