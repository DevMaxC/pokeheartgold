import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData,newState} from './data.ts';
import {giveTogepiEgg} from './eggs.ts';
import {advancePartyEggStep,recordEggHatchEvent,hatchFirstReadyEgg,type EggHatchPresentation} from './egg-hatching.ts';
import {presentNativeEggHatch,type EggHatchHost} from './egg-hatch-presentation.ts';
import {SourceActionRecovery} from './script-recovery.ts';
import {newPhoneRingState,boostPhoneTimer,type PhoneTriggerRules} from './phone-scheduler.ts';
import {sourceJSON,type SourceMap,type State} from './types.ts';

globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData(),map=await sourceJSON<SourceMap>('maps/73.json'),rules=await sourceJSON<PhoneTriggerRules>('phone-triggers.json'),now=()=>new Date(2026,9,17,12);
function fixture(){
 const state=newState(data,'Ethan','boy',()=>.5);state.map=map.id;state.nativeEggSeed=1;giveTogepiEgg(data,state,{now});state.party[0].friendship=0;
 return state;
}
function presentation(events:string[],wantsName=false):EggHatchPresentation{
 return{reveal:async()=>{events.push('reveal');},cry:async()=>{events.push('cry');},announce:async()=>{events.push('announce');return wantsName;},nickname:async()=>{events.push('name');return'Pip';},resumeField:async()=>{events.push('resume');}};
}
function host(state:State,events:string[]):EggHatchHost{
 return{now,view:()=>({reveal:async()=>{events.push('reveal');},cry:async()=>{events.push('cry');},finish:async()=>{events.push('finish');},cancel:()=>{events.push('cancel');}}),music:{start:async()=>{events.push('music');},fanfare:async()=>{events.push('fanfare');},restore:async()=>{events.push('restore-music');}},message:async()=>()=>{},choose:async()=>{events.push('choose');return 0;},nickname:async()=>{events.push('name');return'Pip';},resumeField:async()=>{assert.equal(state.party[0].name,'Pip');events.push('resume');}};
}

test('an original gift emits its synchronous accelerated trigger after memo/flag/pending and before Dex, optional naming or resume',async()=>{
 for(const wantsName of[false,true]){
  const state=fixture(),events:string[]=[];
  await hatchFirstReadyEgg(data,state,{map,now,phoneTrigger:(id,accelerate)=>{
   events.push('trigger');assert.equal(id,0);assert.equal(accelerate,true);assert.equal(state.flags.FLAG_SYS_HATCHED_TOGEPI_EGG,true);assert.deepEqual(state.phoneTriggers,[0]);
   assert.equal(state.party[0].isEgg,false);assert.equal(state.party[0].provenance!.metLocation,data.constants.MAPSEC_VIOLET_CITY);assert.equal(state.party[0].name,'TOGEPI');assert.deepEqual(state.caught,[]);assert.deepEqual(state.seen,[]);
  }},presentation(events,wantsName));
  assert.ok(events.indexOf('announce')<events.indexOf('trigger'));assert.ok(events.indexOf('trigger')<events.indexOf('resume'));assert.equal(events.filter(event=>event==='trigger').length,1);
  if(wantsName)assert.ok(events.indexOf('trigger')<events.indexOf('name'));else assert.ok(!events.includes('name'));
  assert.deepEqual(state.caught,[175]);
 }
});

test('an already-set original gift flag and pending bit never suppress a new actual hatch trigger',async()=>{
 for(const pending of[[],[0]]){
  const state=fixture();state.flags.FLAG_SYS_HATCHED_TOGEPI_EGG=true;state.phoneTriggers=[...pending];let ring=newPhoneRingState(),calls=0;
  await hatchFirstReadyEgg(data,state,{map,now,phoneTrigger:(id,accelerate)=>{calls++;assert.equal(id,0);ring=boostPhoneTimer(ring,accelerate,rules);}},presentation([]));
  assert.equal(calls,1);assert.equal(ring.elapsedMinutes,9);assert.deepEqual(state.phoneTriggers,[0]);
 }
});

test('a nonoriginal Togepi hatch emits no original-gift phone event',async()=>{
 const state=fixture();delete state.togepiGiftIdentity;let calls=0;
 await hatchFirstReadyEgg(data,state,{map,now,phoneTrigger:()=>{calls++;}},presentation([]));
 assert.equal(calls,0);assert.equal(state.flags.FLAG_SYS_HATCHED_TOGEPI_EGG,undefined);assert.equal(state.phoneTriggers,undefined);assert.deepEqual(state.caught,[175]);
});

test('a throwing trigger callback rolls back the inner mon, RNG, flag, pending bit and Dex writes',async()=>{
 const state=fixture(),egg=state.party[0],before=structuredClone(state),events:string[]=[],failure=Error('phone event failed');
 await assert.rejects(hatchFirstReadyEgg(data,state,{map,now,phoneTrigger:()=>{events.push('trigger');assert.deepEqual(state.phoneTriggers,[0]);throw failure;}},presentation(events,true)),error=>error===failure);
 assert.deepEqual(state,before);assert.equal(state.party[0],egg);assert.deepEqual(events,['reveal','cry','announce','trigger']);
});

test('the presentation host forwards exactly one fresh event before nickname and coherent field resume',async()=>{
 const state=fixture(),events:string[]=[],ports=host(state,events);
 ports.phoneTrigger=(id,accelerate)=>{assert.equal(id,0);assert.equal(accelerate,true);assert.equal(state.flags.FLAG_SYS_HATCHED_TOGEPI_EGG,true);assert.deepEqual(state.phoneTriggers,[0]);assert.deepEqual(state.caught,[]);events.push('trigger');};
 await presentNativeEggHatch(data,state,map,ports);
 assert.deepEqual(events,['music','reveal','cry','fanfare','choose','trigger','name','finish','restore-music','resume','cancel']);assert.equal(state.party[0].name,'Pip');
});

test('a presentation failure after the forwarded event remains State-atomic without relying on outer rollback',async()=>{
 for(const stage of['name','resume']as const){
  const state=fixture(),egg=state.party[0],before=structuredClone(state),events:string[]=[],ports=host(state,events),failure=Error(stage);let calls=0;
  ports.phoneTrigger=()=>{calls++;assert.deepEqual(state.phoneTriggers,[0]);};
  if(stage==='name')ports.nickname=async()=>{throw failure;};else ports.resumeField=async()=>{throw failure;};
  await assert.rejects(presentNativeEggHatch(data,state,map,ports),error=>error===failure);
  assert.equal(calls,1);assert.deepEqual(state,before);assert.equal(state.party[0],egg);assert.ok(events.includes('cancel'));
 }
});

test('callback and later presentation failures restore State while the outer field checkpoint restores the fresh timer boost and preceding step',async()=>{
 for(const stage of['trigger','name','resume']as const){
  const state=fixture();state.eggCycleSteps=254;const before=structuredClone(state),events:string[]=[],ports=host(state,events),failure=Error(stage);let ring=newPhoneRingState(),calls=0;
  const ringBefore=structuredClone(ring),recovery=new SourceActionRecovery(state,{capture:()=>ring,restore:async snapshot=>{ring=snapshot;}});
  ports.phoneTrigger=(id,accelerate)=>{calls++;assert.equal(id,0);ring=boostPhoneTimer(ring,accelerate,rules);assert.equal(ring.elapsedMinutes,9);if(stage==='trigger')throw failure;};
  if(stage==='name')ports.nickname=async()=>{throw failure;};if(stage==='resume')ports.resumeField=async()=>{throw failure;};
  await assert.rejects(recovery.run(async()=>{assert.equal(advancePartyEggStep(data,state,{month:10,day:17,penalty:false}).hatchReady,true);recordEggHatchEvent(data,state);await presentNativeEggHatch(data,state,map,ports);}),error=>error===failure);
  assert.equal(calls,1);assert.deepEqual(state,before,stage);assert.deepEqual(ring,ringBefore,stage);assert.equal(recovery.busy,false);assert.ok(events.includes('cancel'));assert.equal(events.filter(event=>event==='restore-music').length,1);
 }
});

test('Continue of a saved completed hatch does not replay its pending trigger or accelerate a fresh ring manager',async()=>{
 const state=fixture();await hatchFirstReadyEgg(data,state,{map,now},presentation([]));
 const restored=JSON.parse(JSON.stringify(state))as State,before=structuredClone(restored);let ring=newPhoneRingState(),calls=0;
 assert.equal(restored.flags.FLAG_SYS_HATCHED_TOGEPI_EGG,true);assert.deepEqual(restored.phoneTriggers,[0]);
 await assert.rejects(hatchFirstReadyEgg(data,restored,{map,now,phoneTrigger:(_id,accelerate)=>{calls++;ring=boostPhoneTimer(ring,accelerate,rules);}},presentation([])),/No native Egg is ready/);
 assert.equal(calls,0);assert.equal(ring.elapsedMinutes,0);assert.deepEqual(restored,before);
});
