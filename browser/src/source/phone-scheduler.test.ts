import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {newPhoneRingState,setPendingPhoneTrigger,unsetPendingPhoneTrigger,boostPhoneTimer,advancePhoneMinutes,resetPhoneRing,advancePhoneRingSeconds,planTriggeredIncomingCall,launchIncomingCall,type PhoneTriggerRules} from './phone-scheduler.ts';

const rules=JSON.parse(await readFile(new URL('../../public/source/phone-triggers.json',import.meta.url),'utf8'))as PhoneTriggerRules&{sourceSha256:Record<string,string>};
const field=(map=60,draw=0)=>({map,incomingAllowed:true,registeredContacts:[]as string[],drawUint16:()=>draw});
const ready=()=>advancePhoneMinutes(newPhoneRingState(),1);
function eligible(){return advancePhoneMinutes(boostPhoneTimer(newPhoneRingState(),true,rules),1);}

test('the13 actual native trigger rows and timing defaults retain verified C/phonebook source provenance',async()=>{
  assert.equal(rules.triggers.length,13);assert.equal(rules.callIntervalMinutes,10);assert.equal(rules.maxActiveDurationSeconds,30);
  assert.deepEqual(rules.triggers[0],{id:0,key:'CALL_TRIGGER_ELM_EGG_HATCHED',contact:1,contactKey:'PHONE_CONTACT_PROF__ELM',map:61,script:13,forcePickUp:false});
  for(const[path,hash]of Object.entries(rules.sourceSha256))assert.equal(createHash('sha256').update(await readFile(new URL('../../../'+path,import.meta.url))).digest('hex'),hash,path);
});

test('a fresh hatched-Egg trigger accelerates to9 minutes and rings only after the next explicit RTC minute',()=>{
  const state={phoneTriggers:[]as number[]};setPendingPhoneTrigger(state,0);let ring=boostPhoneTimer(newPhoneRingState(),true,rules),draws=0;
  const context={...field(),drawUint16:()=>{draws++;return 0;}};assert.equal(ring.elapsedMinutes,9);assert.equal(planTriggeredIncomingCall(ring,state.phoneTriggers,rules,context).call,null);assert.equal(draws,0);
  ring=advancePhoneMinutes(ring,1);const plan=planTriggeredIncomingCall(ring,state.phoneTriggers,rules,context);
  assert.equal(draws,1);assert.equal(plan.delivery,'ring');assert.deepEqual(plan.call,{trigger:0,contact:1,scripted:3,script:13,forcePickUp:false});assert.deepEqual(state.phoneTriggers,[0]);assert.equal(ring.active,null);
});

test('Elm is excluded only from exact lab61, can ring in New Bark60, and has no invented registration predicate',()=>{
  const ring=eligible();assert.equal(planTriggeredIncomingCall(ring,[0],rules,field(61)).call,null);assert.equal(planTriggeredIncomingCall(ring,[0],rules,field(60)).call?.trigger,0);
  assert.equal(planTriggeredIncomingCall(ring,[0],rules,{...field(60),incomingAllowed:false}).call,null);
});

test('trigger selection scans native bit order, consumes one supplied u16 draw and respects each force-pickup flag',()=>{
  const ring=eligible(),before=structuredClone(ring),plan=planTriggeredIncomingCall(ring,[2,0,2],rules,field(60,1));
  assert.equal(plan.call?.trigger,2);assert.equal(plan.delivery,'forced');assert.equal(plan.call?.contact,15);assert.deepEqual(ring,before);
  const repeated=planTriggeredIncomingCall(plan.ring,[2,0],rules,{...field(),drawUint16:()=>assert.fail('an active call cannot select another caller')});assert.equal(repeated.call,null);assert.equal(repeated.ring.active?.trigger,2);
});

test('the source daycare exception requires its registered number and permits the caller map only for that exception',()=>{
  const daycare=rules.triggers[5],ring=eligible(),context=field(daycare.map);
  assert.equal(planTriggeredIncomingCall(ring,[5],rules,context).call,null);
  assert.equal(planTriggeredIncomingCall(ring,[5],rules,{...context,registeredContacts:['PHONE_CONTACT_DAY_C_MAN']}).call?.trigger,5);
});

test('missed optional calls expire after30 seconds, retain pending flags and become eligible again after the interval',()=>{
  const state={phoneTriggers:[0]},ring=planTriggeredIncomingCall(eligible(),state.phoneTriggers,rules,field()).ring;
  let clock=advancePhoneRingSeconds(ring,100,rules);assert.equal(clock.activeSince,100);assert.notEqual(advancePhoneRingSeconds(clock,130,rules).active,null);
  clock=advancePhoneRingSeconds(clock,131,rules);assert.equal(clock.active,null);assert.equal(clock.elapsedMinutes,0);assert.deepEqual(state.phoneTriggers,[0]);
  clock=advancePhoneMinutes(clock,9);assert.equal(planTriggeredIncomingCall(clock,state.phoneTriggers,rules,field()).call,null);
  clock=advancePhoneMinutes(clock,1);assert.equal(planTriggeredIncomingCall(clock,state.phoneTriggers,rules,field()).call?.trigger,0);
});

test('backward ring time resets only the ephemeral manager and preserves its initialized minute guard',()=>{
  const ring=advancePhoneRingSeconds(planTriggeredIncomingCall(eligible(),[0],rules,field()).ring,100,rules);
  const reset=advancePhoneRingSeconds(ring,99,rules);assert.equal(reset.active,null);assert.equal(reset.elapsedMinutes,0);assert.equal(reset.minuteAdvanceSeen,true);assert.deepEqual(resetPhoneRing(ring),reset);
});

test('Continue keeps persistent pending bits but does not invent a fresh enqueue or persist an old ring manager',()=>{
  const saved=JSON.parse(JSON.stringify({phoneTriggers:[0]}));let ring=newPhoneRingState();assert.equal(planTriggeredIncomingCall(ring,saved.phoneTriggers,rules,field()).call,null);
  ring=advancePhoneMinutes(ring,20);assert.equal(ring.minuteAdvanceSeen,true);assert.equal(ring.elapsedMinutes,0,'the first >=10-minute RTC batch is ignored natively');
  ring=advancePhoneMinutes(ring,9);assert.equal(planTriggeredIncomingCall(ring,saved.phoneTriggers,rules,field()).call,null);
  ring=advancePhoneMinutes(ring,1);assert.equal(planTriggeredIncomingCall(ring,saved.phoneTriggers,rules,field()).call?.trigger,0);assert.deepEqual(saved.phoneTriggers,[0]);
});

test('zero-minute host polls cannot consume the native first whole-minute catch-up guard',()=>{
  const fresh=newPhoneRingState(),idle=advancePhoneMinutes(fresh,0);assert.equal(idle,fresh);assert.equal(idle.minuteAdvanceSeen,false);assert.equal(advancePhoneMinutes(idle,20).elapsedMinutes,0);
});

test('an eligible interval with no trigger is distinguished from blocked polling for the future random-call branch',()=>{
  const ring=eligible(),noDraw={...field(61),drawUint16:()=>assert.fail('no eligible triggered candidate consumes no trigger RNG draw')};
  assert.equal(planTriggeredIncomingCall(ring,[0],rules,noDraw).delivery,'no-trigger');assert.equal(planTriggeredIncomingCall(ring,[],rules,noDraw).delivery,'no-trigger');
  assert.equal(planTriggeredIncomingCall(ring,[0],rules,{...noDraw,incomingAllowed:false}).delivery,'none');assert.equal(planTriggeredIncomingCall(newPhoneRingState(),[0],rules,noDraw).delivery,'none');
});

test('timing acceleration never reduces an existing interval and the first large minute batch preserves its prior boost',()=>{
  let ring=boostPhoneTimer(newPhoneRingState(),false,rules);assert.equal(ring.elapsedMinutes,0);ring=boostPhoneTimer(ring,true,rules);ring=advancePhoneMinutes(ring,20);assert.equal(ring.elapsedMinutes,9);ring=advancePhoneMinutes(ring,2);assert.equal(boostPhoneTimer(ring,true,rules).elapsedMinutes,11);
});

test('answering clears exactly the selected bit at launch, resets ringing and leaves other pending calls intact',()=>{
  const state={phoneTriggers:[0,1]},ring=planTriggeredIncomingCall(eligible(),state.phoneTriggers,rules,field(60,0)).ring,launched=launchIncomingCall(state,ring);
  assert.equal(launched.call.script,13);assert.deepEqual(state.phoneTriggers,[1]);assert.equal(launched.ring.active,null);assert.equal(launched.ring.elapsedMinutes,0);assert.equal(ring.active?.trigger,0);assert.throws(()=>launchIncomingCall(state,launched.ring),/No native incoming/);
  setPendingPhoneTrigger(state,0);setPendingPhoneTrigger(state,0);assert.equal(state.phoneTriggers.filter(id=>id===0).length,1);unsetPendingPhoneTrigger(state,0);assert.deepEqual(state.phoneTriggers,[1]);
});

test('RTC deltas, pending bits and injected RNG draws fail explicitly without silently picking a caller',()=>{
  const state={phoneTriggers:[0]};assert.throws(()=>setPendingPhoneTrigger(state,13),/Invalid native/);assert.deepEqual(state.phoneTriggers,[0]);assert.throws(()=>advancePhoneMinutes(ready(),-1),/RTC delta/);assert.throws(()=>advancePhoneRingSeconds(ready(),NaN,rules),/RTC seconds/);assert.throws(()=>planTriggeredIncomingCall(eligible(),[99],rules,field()),/Invalid native/);assert.throws(()=>planTriggeredIncomingCall(eligible(),[0],rules,field(60,65536)),/unsigned16/);
});
