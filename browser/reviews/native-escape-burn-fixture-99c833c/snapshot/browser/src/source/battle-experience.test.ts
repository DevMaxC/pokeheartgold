import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData,newState,createMon} from './data.ts';
import {originalTrainerParty} from './trainers.ts';
import {nativeExperienceReward,type ExperienceContext,type ExperienceRecipient} from './battle-experience.ts';
globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData();
const context=(baseYield=57,defeatedLevel=3):ExperienceContext=>({baseYield,defeatedLevel,trainerBattle:false,experienceEnabled:true,participantCount:1,expShareCount:0});
function recipient():ExperienceRecipient{const state=newState(data,'Ethan','boy'),mon=createMon(data,155,5,state.name,()=>.5);return{...mon,participated:true,heldEffect:'HOLD_EFFECT_NONE',ownership:'player'};}

test('actual early wild and Trainer teams produce native one-participant awards',async()=>{
  assert.ok(data.encounters.find(row=>row.map==='R30')?.land.mons.some(mon=>mon.level===3&&mon.species.nite==='SPECIES_RATTATA'),'actual Route30 night RattataLv3');
  assert.ok(data.encounters.find(row=>row.map==='R29')?.land.mons.some(mon=>mon.level===3&&mon.species.day==='SPECIES_PIDGEY'),'actual Route29 day PidgeyLv3');
  const starter=recipient();assert.deepEqual(nativeExperienceReward(context(data.personal[19].expYield,3),starter),{amount:24,boosted:false});
  for(const[trainer,expected]of[[50,[111]],[20,[105,313]]]as const){const team=await originalTrainerParty(data,trainer);assert.equal(team.length,expected.length);for(let i=0;i<team.length;i++){const mon=team[i],ctx={...context(data.personal[mon.species].expYield,mon.level),trainerBattle:true};assert.equal(nativeExperienceReward(ctx,starter).amount,expected[i]);}}
});
test('LuckyEgg, Trainer and domestic/international trade bonuses truncate in native order',()=>{
  const lucky=data.items.find(item=>item.item==='ITEM_LUCKY_EGG')!;assert.equal(lucky.holdEffect,'HOLD_EFFECT_EXP_UP');const mon={...recipient(),heldEffect:lucky.holdEffect};
  // Actual Rattata Lv3 gives24: Lucky36 -> Trainer54 -> domestic81/foreign91.
  assert.deepEqual(nativeExperienceReward({...context(),trainerBattle:true},{...mon,ownership:'traded-domestic'}),{amount:81,boosted:true});
  assert.deepEqual(nativeExperienceReward({...context(),trainerBattle:true},{...mon,ownership:'traded-international'}),{amount:91,boosted:true});
  // Actual Pidgey Lv3:23 -> Lucky34 -> Trainer51 -> foreign86.
  // Combining bonuses into one float produces87 instead.
  const ctx={...context(data.personal[16].expYield,3),trainerBattle:true};assert.equal(nativeExperienceReward(ctx,{...mon,ownership:'traded-international'}).amount,86);assert.equal(Math.floor(23*1.5*1.5*1.7),87);
});
test('explicit ExpShare split floors both halves before divisors and sums a participating holder before bonuses',()=>{
  const share=data.items.find(item=>item.item==='ITEM_EXP__SHARE')!;assert.equal(share.holdEffect,'HOLD_EFFECT_EXP_SHARE');
  // Actual Pidgey Lv3 gives23. Each pool is floor(23/2)=11: two
  // participants each get5; two holders each get5; both roles get10.
  const ctx={...context(data.personal[16].expYield,3),participantCount:2,expShareCount:2};
  assert.equal(nativeExperienceReward(ctx,recipient()).amount,5);
  assert.equal(nativeExperienceReward(ctx,{...recipient(),participated:false,heldEffect:share.holdEffect}).amount,5);
  assert.equal(nativeExperienceReward(ctx,{...recipient(),heldEffect:share.holdEffect}).amount,10);
  assert.equal(nativeExperienceReward({...ctx,trainerBattle:true},{...recipient(),heldEffect:share.holdEffect}).amount,15,'sum10 before Trainer bonus, rather than floor(5*1.5) twice');
  assert.equal(nativeExperienceReward(ctx,{...recipient(),participated:false}).amount,0);
});
test('fainted, Egg, empty, level100 and disabled EXP contexts receive no reward',()=>{
  const ctx=context(),mon=recipient();for(const patch of[{hp:0},{isEgg:true},{species:0},{level:100},{participated:false}])assert.deepEqual(nativeExperienceReward(ctx,{...mon,...patch}),{amount:0,boosted:false});
  assert.deepEqual(nativeExperienceReward({...ctx,experienceEnabled:false},{...mon,ownership:'traded-international'}),{amount:0,boosted:false});
  // Native divisor counting does not exclude a living level100 participant.
  const split={...ctx,participantCount:2};assert.equal(nativeExperienceReward(split,mon).amount,12);assert.equal(nativeExperienceReward(split,{...mon,level:100}).amount,0);
  assert.equal(nativeExperienceReward({...ctx,expShareCount:1},{...mon,isEgg:true,heldEffect:'HOLD_EFFECT_EXP_SHARE'}).amount,0);
});
test('native minimum-one pool rule and inconsistent or unknown divisor context stay explicit',()=>{
  // Canonical Magikarp base yield20 at legal mon level1 exercises the low
  // integer pool boundary. This is a math fixture, not an encounter claim.
  const mon=recipient(),low=context(data.personal[129].expYield,1);assert.equal(nativeExperienceReward({...low,participantCount:6},mon).amount,1);
  const ctx={...low,participantCount:6,expShareCount:6};assert.equal(nativeExperienceReward(ctx,{...mon,heldEffect:'HOLD_EFFECT_EXP_SHARE'}).amount,2);
  assert.throws(()=>nativeExperienceReward({...context(),participantCount:0},mon),/participant count/);
  assert.throws(()=>nativeExperienceReward(context(),{...mon,heldEffect:'HOLD_EFFECT_EXP_SHARE'}),/explicit holder count/);
  for(const patch of[{baseYield:-1},{defeatedLevel:0},{participantCount:1.5},{expShareCount:7}])assert.throws(()=>nativeExperienceReward({...context(),...patch},mon),RangeError);
});
test('helper is pure and leaves current EXP, level, EVs and held items to the integration host',()=>{
  const mon=recipient(),ctx={...context(data.personal[17].expYield,13),trainerBattle:true},before=structuredClone({ctx,mon});assert.equal(nativeExperienceReward(ctx,mon).amount,313);assert.deepEqual({ctx,mon},before);
});
test('native held-effect contract rejects item keys and no-award validation remains explicit',()=>{
  const mon=recipient();assert.throws(()=>nativeExperienceReward(context(),{...mon,heldEffect:'ITEM_LUCKY_EGG'}),/native held effect/);
  assert.equal(nativeExperienceReward(context(),{...mon,heldEffect:'HOLD_EFFECT_CHOICE_ATK'}).amount,24,'other native effects do not boost EXP');
  assert.deepEqual(nativeExperienceReward({...context(),participantCount:0},{...mon,hp:0}),{amount:0,boosted:false},'no-recipient path does not divide an empty pool');
  assert.equal(nativeExperienceReward(context(),{...mon,hp:-1}).amount,0);assert.throws(()=>nativeExperienceReward(context(),{...mon,level:101}),/recipient level/);
});
