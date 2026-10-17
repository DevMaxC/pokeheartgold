import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Battle} from './battle.ts';
import {loadData,newState,createMon} from './data.ts';
import {originalTrainerParty} from './trainers.ts';
import type {UI} from './ui.ts';
globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData();
function mon(species:number,level=5){const result=createMon(data,species,level,'Ethan',()=>.5);result.moves=[{id:data.constants.MOVE_TACKLE,pp:35,maxPP:35}];return result;}
function fixture(party:ReturnType<typeof mon>[]){
  const elements=new Map<string,{innerHTML:string;hidden:boolean}>();
  globalThis.document={getElementById(id:string){if(!elements.has(id))elements.set(id,{innerHTML:'',hidden:true});return elements.get(id);},querySelector(){return null;}} as unknown as Document;
  const state=newState(data,'Ethan','boy',()=>.5);state.party=party;
  const messages:string[]=[],battle=new Battle(data,state,{choose:async()=>4} as unknown as UI,()=>0);
  Reflect.set(battle,'say',async(text:string)=>messages.push(text));let turn=0;
  Reflect.set(battle,'nextAction',async()=>++turn===1&&party.length>1?{kind:'switch',index:1}:{kind:'move',slot:0});
  return{battle,state,messages};
}
function pidgey(){const foe=createMon(data,16,3,'',()=>.5);foe.hp=1;return foe;}

test('actual battle switches retain living participants and split Route29 Pidgey experience11+11',async()=>{
  const party=[mon(155),mon(16)],before=party.map(p=>p.exp),{battle}=fixture(party);
  assert.equal(await battle.start([pidgey()]),'won');assert.deepEqual(party.map((p,i)=>p.exp-before[i]),[11,11]);
  assert.equal(Reflect.get(battle,'experienceMask'),0);assert.ok(party.every(p=>p.evs[3]===1));
});

test('actual held Exp. Share receives its native pool while both participants receive theirs',async()=>{
  const party=[mon(155),mon(16),mon(163)];party[2].heldItem='ITEM_EXP__SHARE';
  const before=party.map(p=>p.exp),{battle}=fixture(party);
  assert.equal(await battle.start([pidgey()]),'won');assert.deepEqual(party.map((p,i)=>p.exp-before[i]),[5,5,11]);
  assert.ok(party.every(p=>p.evs[3]===1));
});

test('each new Falkner opponent resets the source participation mask instead of rewarding an old switch-out again',async()=>{
  const party=[mon(155,20),mon(16,20)],before=party.map(p=>p.exp),{battle}=fixture(party),team=await originalTrainerParty(data,20);
  for(const foe of team)foe.hp=1;
  assert.equal(await battle.start(team,20),'won');assert.deepEqual(party.map((p,i)=>p.exp-before[i]),[52,52+313]);
});

test('level100 participants count in the split but get no experience or effort award',async()=>{
  const party=[mon(155,100),mon(16)],before=party.map(p=>p.exp),oldEVs=[...party[0].evs],{battle}=fixture(party);
  assert.equal(await battle.start([pidgey()]),'won');assert.deepEqual(party.map((p,i)=>p.exp-before[i]),[0,11]);assert.deepEqual(party[0].evs,oldEVs);
});

test('a recipient near level100 caps cumulative EXP at its own native growth limit',async()=>{
  const fighter=mon(155,99),limit=data.growth[data.personal[155].growthRate][100];fighter.exp=limit-1;
  const{battle}=fixture([fighter]);assert.equal(await battle.start([pidgey()]),'won');assert.equal(fighter.exp,limit);assert.equal(fighter.level,100);
});
