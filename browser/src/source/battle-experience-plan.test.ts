import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createMon,loadData,newState} from './data.ts';
import {planNativeExperience,type ExperiencePartySlot,type ExperienceBattleContext} from './battle-experience.ts';
globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData();
const pidgey:ExperienceBattleContext={baseYield:data.personal[16].expYield,defeatedLevel:3,trainerBattle:false,experienceEnabled:true};
function slot(species=155):ExperiencePartySlot{const state=newState(data,'Ethan','boy');return{...createMon(data,species,5,state.name,()=>.5),ownership:'player'};}
const amounts=(plan:ReturnType<typeof planNativeExperience>)=>plan.rewards.map(reward=>reward.amount);

test('actual Route29 PidgeyLv3 splits11+11 between two living explicitly flagged participants',()=>{
  assert.ok(data.encounters.find(row=>row.map==='R29')?.land.mons.some(mon=>mon.level===3&&mon.species.day==='SPECIES_PIDGEY'));
  const party=[slot(),slot(19),slot(161)],plan=planNativeExperience(pidgey,party,0b011,data.items);assert.equal(plan.participantCount,2);assert.equal(plan.expShareCount,0);assert.deepEqual(amounts(plan),[11,11,0]);assert.deepEqual(plan.rewards.map(reward=>reward.index),[0,1,2]);
});
test('native ExpShare item effects split pools and participating holders receive both before bonuses',()=>{
  const party=[slot(),{...slot(19),heldItem:'ITEM_EXP__SHARE'},{...slot(161),heldItem:'ITEM_EXP__SHARE'}];
  assert.equal(data.items.find(item=>item.item==='ITEM_EXP__SHARE')?.holdEffect,'HOLD_EFFECT_EXP_SHARE');
  const plan=planNativeExperience(pidgey,party,0b011,data.items);assert.equal(plan.participantCount,2);assert.equal(plan.expShareCount,2);assert.deepEqual(amounts(plan),[5,10,5]);
  assert.deepEqual(amounts(planNativeExperience({...pidgey,trainerBattle:true},party,0b011,data.items)),[7,15,7]);
});
test('Eggs and fainted members do not dilute either pool; living level100 members do',()=>{
  const active=slot(),fainted={...slot(19),hp:0,heldItem:'ITEM_EXP__SHARE'},egg={...slot(175),isEgg:true,heldItem:'ITEM_EXP__SHARE'};
  const plan=planNativeExperience(pidgey,[active,fainted,egg],0b111,data.items);assert.equal(plan.participantCount,1);assert.equal(plan.expShareCount,0);assert.deepEqual(amounts(plan),[23,0,0]);
  const maximum={...slot(19),level:100,heldItem:'ITEM_EXP__SHARE'};
  const shared=planNativeExperience(pidgey,[active,maximum],0b11,data.items);assert.equal(shared.participantCount,2);assert.equal(shared.expShareCount,1);assert.deepEqual(amounts(shared),[5,0]);
  assert.deepEqual(amounts(planNativeExperience(pidgey,[active,maximum],0b01,data.items)),[11,0],'level100 inactive holder still diverts sharedhalf');
});
test('a living nonparticipant ExpShare holder receives its half even after all flagged participants faint',()=>{
  const party=[{...slot(),hp:0},{...slot(19),heldItem:'ITEM_EXP__SHARE'}],plan=planNativeExperience(pidgey,party,0b01,data.items);assert.equal(plan.participantCount,0);assert.equal(plan.expShareCount,1);assert.deepEqual(amounts(plan),[0,11]);
  assert.deepEqual(amounts(planNativeExperience(pidgey,[party[0],slot(19)],0b01,data.items)),[0,0]);
});
test('new-enemy mask reset removes previous participants and planner never guesses an active slot',()=>{
  const party=[slot(),slot(19)];assert.deepEqual(amounts(planNativeExperience(pidgey,party,0b11,data.items)),[11,11]);assert.deepEqual(amounts(planNativeExperience(pidgey,party,0b10,data.items)),[0,23]);assert.deepEqual(amounts(planNativeExperience(pidgey,party,0,data.items)),[0,0]);
});
test('actual LuckyEgg effect and explicit traded ownership apply separately to each planned recipient',()=>{
  const party=[{...slot(),heldItem:'ITEM_LUCKY_EGG',ownership:'traded-international' as const},{...slot(19),ownership:'traded-domestic' as const}],plan=planNativeExperience({...pidgey,trainerBattle:true},party,0b11,data.items);
  // Base11 each: Lucky16 -> Trainer24 -> foreign40. Other: Trainer16 -> domestic24.
  assert.deepEqual(amounts(plan),[40,24]);assert.ok(plan.rewards.every(reward=>reward.boosted));
});
test('whole-party planning is pure and rejects a late bad item/ownership/mask before any mutation',()=>{
  const party=[slot(),slot(19)],before=structuredClone(party);planNativeExperience(pidgey,party,0b11,data.items);assert.deepEqual(party,before);
  for(const bad of[{...party[1],heldItem:'ITEM_NOT_IN_SOURCE'},{...party[1],ownership:'unknown' as never}]){const input=[party[0],bad],saved=structuredClone(input);assert.throws(()=>planNativeExperience(pidgey,input,0b11,data.items));assert.deepEqual(input,saved);}
  for(const mask of[-1,1.5,64,0b100])assert.throws(()=>planNativeExperience(pidgey,party,mask,data.items),/mask/);
  assert.deepEqual(amounts(planNativeExperience({...pidgey,experienceEnabled:false},party,0b11,data.items)),[0,0]);
});
