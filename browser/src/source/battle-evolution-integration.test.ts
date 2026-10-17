import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Battle} from './battle.ts';
import {loadData,newState,createMon,healParty} from './data.ts';
import {originalTrainerParty} from './trainers.ts';
import {freshStages,moveDamage} from './battle-math.ts';
import {BattleEvolutionQueue,type BattleEvolutionPorts} from './battle-evolution.ts';
import type {Mon} from './types.ts';
import {loadNativeEvolutionData,selectNativeLevelEvolution} from './evolution-native.ts';
import {SourceActionRecovery} from './script-recovery.ts';

globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData(),native=await loadNativeEvolutionData(data);
function fixture(party:Mon[]=[{...createMon(data,155,5,'Ethan',()=>.5),hasNickname:false}]){
 const elements=new Map();globalThis.document={getElementById(id:string){if(!elements.has(id))elements.set(id,{innerHTML:'',hidden:false});return elements.get(id);},querySelector(){return null;},body:{classList:{add(){},remove(){}}}}as unknown as Document;
 const state=newState(data,'Ethan','boy',()=>.5);state.party=party;state.bag={ITEM_POTION:5};
 let seed=0x12345678;const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/0x100000000;};
 const messages:string[]=[],battle=new Battle(data,state,{choose:async()=>0}as any,rng);let selections=0;
 Object.assign(battle,{say:async(text:string)=>messages.push(text),nextAction:async()=>{
  assert.ok(++selections<500,'bounded legitimate player actions');const player=battle.player,enemy=battle.enemy;
  if(player.hp<=Math.floor(player.maxHP/3)&&state.bag.ITEM_POTION)return{kind:'item',item:'ITEM_POTION'};
  const candidates=player.moves.map((move,slot)=>({move,slot})).filter(row=>row.move.pp>0);if(!candidates.length)return{kind:'move',slot:-1};
  const score=(row:typeof candidates[number])=>{const move=data.moves[row.move.id];return move.category===2?-1:moveDamage(data,player,enemy,move,freshStages(),freshStages(),100,false).damage;};candidates.sort((a,b)=>score(b)-score(a));return{kind:'move',slot:candidates[0].slot};
 }});
 const queue=new BattleEvolutionQueue(),scenes:{old:number;target:number;level:number}[]=[];
 const ports:BattleEvolutionPorts={select:(party,mon)=>selectNativeLevelEvolution(native,party,mon,{night:false,evolutionLocation:0}),metadata:mon=>({form:0,hasNickname:mon.hasNickname===true}),present:async(scene,cb)=>{assert.equal(battle.active,false,'native evolution starts after combat exits');scenes.push({old:scene.before.species,target:scene.after.species,level:scene.before.level});cb.evolve();cb.register();await cb.learnMoves();cb.finish();return'evolved';},moveLearning:{isHM:()=>false,choose:async()=>({kind:'decline'}),show:async()=>{}}};
 return{state,battle,messages,queue,ports,scenes};
}

test('fresh Cyndaquil5 earns its actual Li evolution through original early teams and retains native completion until drained',async()=>{
 const f=fixture();let starter=f.state.party[0],previousLevel=5,sawLi=false;
 const recovery=new SourceActionRecovery(f.state,{capture:()=>({}),restore:async()=>{}});
 // Legal original teams; healing is the explicit optional Center-return port.
 // This tests real battle/XP/action sequencing, not field walking or native AI.
 for(const trainer of[497,8,47,249,4,43,51,52,53,55,54,290,50,29,20]){
  healParty(f.state);
  if(trainer===290){
   const previous=structuredClone(f.state),present=f.ports.present;
   f.ports.present=async(_scene,cb)=>{cb.evolve();cb.register();throw Error('technical field-scene failure');};
   await assert.rejects(recovery.run(async()=>{assert.equal(await f.battle.start(await originalTrainerParty(data,trainer),trainer),'won');await f.queue.run(data,f.state,f.battle.evolutionCompletion!,f.ports);}),/technical field-scene failure/);
   assert.deepEqual(f.state,previous,'the whole source action restores the earned pre-Li checkpoint');assert.equal(f.state.party[0].level,13);assert.equal(f.queue.pending(f.battle.evolutionCompletion!),1,'a failed scene cannot lose its pending bit');
   // SourceActionRecovery deliberately hydrates fresh Mon records. Retry must
   // replay the owned fight and create a new completion, not use stale actors.
   const stale=f.battle.evolutionCompletion!;await assert.rejects(f.queue.run(data,f.state,stale,{...f.ports,present}),/identity changed/);starter=f.state.party[0];f.ports.present=present;
  }
  assert.equal(await f.battle.start(await originalTrainerParty(data,trainer),trainer),'won');
  const record=f.battle.evolutionCompletion;assert.ok(record);assert.equal(record.result,'won');assert.equal(record.levelUpMask,f.state.party[0].level>previousLevel?1:0);assert.equal(record.party[0],starter);assert.equal(f.battle.evolutionCompletion,record,'reading cannot consume a pending native bit');previousLevel=starter.level;
  if(trainer===290){assert.equal(starter.species,155);assert.equal(starter.level,14);assert.equal(record.levelUpMask,1);sawLi=true;}
  await f.queue.run(data,f.state,record,f.ports);assert.equal(f.queue.pending(record),0);
  if(trainer===290)assert.equal(starter.species,156);
 }
 assert.equal(sawLi,true);assert.deepEqual(f.scenes,[{old:155,target:156,level:14}]);assert.equal(starter.level,15);assert.equal(starter.species,156);assert.equal(f.state.party[0],starter);assert.ok(f.messages.some(text=>text.includes('grew to Lv. 14')));
});

test('real ExpShare rewards mark both exact party bits even when the second mon never acts',async()=>{
 const reserve={...createMon(data,158,5,'Ethan',()=>.5),hasNickname:false};reserve.heldItem=data.items.find(item=>item.holdEffect==='HOLD_EFFECT_EXP_SHARE')!.item;const f=fixture([{...createMon(data,155,5,'Ethan',()=>.5),hasNickname:false},reserve]);
 assert.equal(await f.battle.start(await originalTrainerParty(data,43),43),'won');assert.ok(f.state.party[0].level>5);assert.ok(reserve.level>5);assert.equal(f.battle.evolutionCompletion!.levelUpMask,3);assert.equal(f.battle.evolutionCompletion!.party[1],reserve);
});

test('no-level battles produce no candidate, and technical combat failure cannot expose a successful completion',async()=>{
 const f=fixture([{...createMon(data,155,18,'Ethan',()=>.5),hasNickname:false}]);assert.equal(await f.battle.start(await originalTrainerParty(data,8),8),'won');assert.equal(f.battle.evolutionCompletion!.levelUpMask,0);await f.queue.run(data,f.state,f.battle.evolutionCompletion!,f.ports);assert.equal(f.scenes.length,0);
 const stale=f.battle.evolutionCompletion!;assert.equal(stale.isCurrent(),true);assert.equal(await f.battle.start(await originalTrainerParty(data,8),8),'won');assert.equal(stale.isCurrent(),false);const before=structuredClone(f.state);await assert.rejects(f.queue.run(data,f.state,stale,f.ports),/Stale native battle/);assert.deepEqual(f.state,before);
 Object.assign(f.battle,{nextAction:async()=>{throw Error('input failed');}});await assert.rejects(f.battle.start(await originalTrainerParty(data,8),8),/input failed/);assert.equal(f.battle.evolutionCompletion,null);
});
