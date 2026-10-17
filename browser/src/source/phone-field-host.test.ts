import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {FieldPhoneHost,type ElmHatchCall,type PhoneFieldSnapshot} from './phone-field-host.ts';
import {SourceActionRecovery,runRecoverableSourceAction,type SourceActionResult,type SourceActionPrompts} from './script-recovery.ts';
import {loadData,newState,createMon} from './data.ts';
import {phoneCall} from './phone.ts';
import {sourceJSON,type SourceMap,type State} from './types.ts';
import type {PhoneTriggerRules} from './phone-scheduler.ts';

globalThis.fetch=async input=>{const path=String(input);assert.ok(path.startsWith('/source/'));try{return new Response(await readFile(new URL('../../public'+path,import.meta.url)));}catch{return new Response('',{status:404});}};
const data=await loadData(),rules=await sourceJSON<PhoneTriggerRules>('phone-triggers.json'),newBark=await sourceJSON<SourceMap>('maps/60.json'),lab=await sourceJSON<SourceMap>('maps/61.json'),messages=await sourceJSON<Record<string,string>>('messages/716.json');
const token:ElmHatchCall={trigger:0,contact:1,scripted:3,script:13,forcePickUp:false};
function state(){const value=newState(data,'Ethan','boy',()=>.5);value.map=60;value.phoneTriggers=[0];value.flags.FLAG_SYS_HATCHED_TOGEPI_EGG=true;value.party=[createMon(data,175,1,value.name,()=>.5)];return value;}
function ready(value:State=state(),pending=value.phoneTriggers!){
  value.phoneTriggers=[...pending];const host=new FieldPhoneHost(rules,1000);host.triggerQueued(pending[0]??0,true);host.advanceRTC(1060);return{host,state:value};
}
function recovery(host:FieldPhoneHost,value:State,options:Partial<SourceActionPrompts>={}){
  const writes:State[]=[],owner=new SourceActionRecovery(value,{capture:()=>host.snapshot(),restore:async snapshot=>host.restore(snapshot)});
  const prompts:SourceActionPrompts={failed:async()=> 'return',recoveryFailed:async error=>{throw error;},retry:()=>{},committed:()=>{writes.push(structuredClone(value));},...options};
  return{owner,writes,execute:<T>(action:()=>Promise<T>)=>runRecoverableSourceAction(owner,action,prompts)};
}
const deferred=<T=void>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return{promise,resolve};};

test('RTC bridge retains the native whole-minute anchor and discards remainder only after a whole batch',()=>{
  const host=new FieldPhoneHost(rules,1000);host.advanceRTC(1000);host.advanceRTC(1059);assert.equal(host.snapshot().ring.minuteAdvanceSeen,false);assert.equal(host.snapshot().rtcAnchor,1000);
  host.advanceRTC(1075);assert.equal(host.snapshot().ring.elapsedMinutes,1);assert.equal(host.snapshot().rtcAnchor,1075);
  host.advanceRTC(1120);assert.equal(host.snapshot().ring.elapsedMinutes,1);assert.equal(host.snapshot().rtcAnchor,1075);
  host.advanceRTC(1135);assert.equal(host.snapshot().ring.elapsedMinutes,2);assert.equal(host.snapshot().rtcAnchor,1135);
  for(const seconds of[NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>host.advanceRTC(seconds),/whole RTC seconds/);
});

test('Continue does not boost saved pending flags, and native first long catchup is ignored exactly once',()=>{
  const value=state(),host=new FieldPhoneHost(rules,1000);assert.equal(host.poll(value,newBark,()=>assert.fail('premature draw')).kind,'none');
  host.advanceRTC(1000);host.advanceRTC(2200);assert.equal(host.snapshot().ring.elapsedMinutes,0);assert.equal(host.snapshot().ring.minuteAdvanceSeen,true);
  host.advanceRTC(2740);assert.equal(host.poll(value,newBark,()=>assert.fail('only9 minutes')).kind,'none');host.advanceRTC(2800);assert.deepEqual(host.poll(value,newBark,()=>0),{kind:'elm',call:token});assert.deepEqual(value.phoneTriggers,[0]);
});

test('only explicit fresh events accelerate, exact Elm lab61 is excluded while New Bark60 rings',()=>{
  const value=state(),host=new FieldPhoneHost(rules,1000);host.triggerQueued(0,false);assert.equal(host.snapshot().ring.elapsedMinutes,0);host.triggerQueued(0,true);assert.equal(host.snapshot().ring.elapsedMinutes,9);
  assert.equal(host.poll(value,newBark,()=>assert.fail('no immediate call')).kind,'none');host.advanceRTC(1060);value.map=61;
  assert.equal(host.poll(value,lab,()=>assert.fail('caller lab excluded')).kind,'random-fallback-required');value.map=60;assert.deepEqual(host.poll(value,newBark,()=>0),{kind:'elm',call:token});
  assert.throws(()=>host.triggerQueued(99,true),/Unknown native/);assert.throws(()=>host.poll(value,lab,()=>0),/metadata/);
});

test('render reads and repeated polls retain one optional Elm token without new random draws',()=>{
  const {host,state:value}=ready();let draws=0;assert.equal(host.current().kind,'none');const first=host.poll(value,newBark,()=>{draws++;return 0;});
  for(let i=0;i<20;i++){assert.deepEqual(host.current(),first);assert.deepEqual(host.poll(value,newBark,()=>assert.fail('active token cannot reroll')),first);}
  assert.equal(draws,1);if(first.kind==='elm')assert.throws(()=>{(first.call as {script:number}).script=7;},TypeError);assert.deepEqual(host.current(),{kind:'elm',call:token});
});

test('a missed ring uses its first positive RTC tick and expires strictly after30 seconds without consuming flags',()=>{
  const {host,state:value}=ready();host.poll(value,newBark,()=>0);assert.equal(host.snapshot().ring.activeSince,null);host.advanceRTC(1060);assert.equal(host.snapshot().ring.activeSince,null);
  host.advanceRTC(1061);host.advanceRTC(1091);assert.equal(host.current().kind,'elm');host.advanceRTC(1092);assert.equal(host.current().kind,'none');assert.equal(host.snapshot().ring.elapsedMinutes,0);assert.deepEqual(value.phoneTriggers,[0]);
  host.advanceRTC(1660);assert.equal(host.poll(value,newBark,()=>0).kind,'elm');
});

test('a backward RTC anchor update skips duration handling until the next positive tick',()=>{
  const {host,state:value}=ready();host.poll(value,newBark,()=>0);host.advanceRTC(1061);host.advanceRTC(1050);assert.equal(host.snapshot().rtcAnchor,1050);assert.equal(host.current().kind,'elm');assert.equal(host.snapshot().ring.activeSince,1061);
  host.advanceRTC(1051);assert.equal(host.current().kind,'none');assert.equal(host.snapshot().ring.minuteAdvanceSeen,true);assert.deepEqual(value.phoneTriggers,[0]);
});

test('source-event reset keeps the RTC anchor/first-minute guard and snapshot/restore copies both directions',()=>{
  const {host,state:value}=ready();host.poll(value,newBark,()=>0);host.advanceRTC(1061);const checkpoint=host.snapshot();host.resetForSourceEvent();assert.equal(host.current().kind,'none');assert.equal(host.snapshot().rtcAnchor,1060);assert.equal(host.snapshot().ring.minuteAdvanceSeen,true);assert.deepEqual(value.phoneTriggers,[0]);
  host.restore(checkpoint);(checkpoint.ring as {elapsedMinutes:number}).elapsedMinutes=999;assert.equal(host.snapshot().ring.elapsedMinutes,10);
  const copy=host.snapshot();(copy.ring.active as {script:number}).script=99;assert.equal((host.current()as{call:ElmHatchCall}).call.script,13);
});

test('native ResetIfActive preserves a fresh inactive boost through unrelated source events',()=>{
  const host=new FieldPhoneHost(rules,1000),value=state();host.triggerQueued(0,true);const before=host.snapshot();host.resetForSourceEvent();assert.deepEqual(host.snapshot(),before);assert.equal(before.ring.elapsedMinutes,9);assert.equal(before.ring.minuteAdvanceSeen,false);
  host.advanceRTC(1060);host.resetForSourceEvent();assert.equal(host.snapshot().ring.elapsedMinutes,10);assert.deepEqual(host.poll(value,newBark,()=>0),{kind:'elm',call:token});host.resetForSourceEvent();assert.equal(host.snapshot().ring.elapsedMinutes,0);assert.equal(host.snapshot().ring.minuteAdvanceSeen,true);assert.deepEqual(value.phoneTriggers,[0]);
});

test('incoming-disabled maps and no-trigger random fallback are distinct, with no silent generic engine',()=>{
  const {host,state:value}=ready();value.phoneTriggers=[];assert.equal(host.poll(value,{...newBark,fields:{...newBark.fields,incomingCalls:'FALSE'}},()=>assert.fail()).kind,'none');
  assert.equal(host.poll(value,newBark,()=>assert.fail('no candidate requires no trigger draw')).kind,'random-fallback-required');assert.equal(host.snapshot().ring.elapsedMinutes,10);assert.deepEqual(value.phoneTriggers,[]);
});

test('generic, forced and other Elm calls stay explicit and cannot enter Elm13 delivery or consume pending bits',async()=>{
  for(const id of[1,2,3,4,5,6,7,8,9,10,11,12]){
    const {host,state:value}=ready(state(),[id]);value.pokegear={cards:[],contacts:['PHONE_CONTACT_DAY_C_MAN']};const delivery=host.poll(value,newBark,()=>0);assert.equal(delivery.kind,'unsupported',String(id));
    await assert.rejects(host.answerElm(value,async()=>assert.fail('unsupported cannot start a source answer'),async()=>assert.fail()),/Only the native optional Elm/);assert.deepEqual(value.phoneTriggers,[id]);assert.equal(host.current().kind,'unsupported');
  }
});

test('the exact actual Elm13 incoming text completes atomically and keeps other calls and hatch progress',async()=>{
  const {host,state:value}=ready(state(),[0,2]);host.poll(value,newBark,()=>0);const tx=recovery(host,value),seen:string[]=[];
  const outcome=await host.answerElm(value,tx.execute,async call=>{assert.deepEqual(call,token);assert.equal(tx.owner.busy,true);assert.equal(tx.writes.length,0);assert.deepEqual(value.phoneTriggers,[2]);await phoneCall(data,value,call.contact,call.scripted,call.script,async text=>{seen.push(text);},async()=>0);return'answered';});
  assert.deepEqual(outcome,{ok:true,value:'answered'});assert.deepEqual(seen,['Professor Elm: '+messages['13']]);assert.deepEqual(value.phoneTriggers,[2]);assert.equal(value.flags.FLAG_SYS_HATCHED_TOGEPI_EGG,true);assert.equal(host.current().kind,'none');assert.equal(tx.writes.length,1);
});

test('failed UI Return restores state/party/inventory and the active call before committing the recovered field',async()=>{
  const {host,state:value}=ready();host.poll(value,newBark,()=>0);const before=structuredClone(value),snapshot=host.snapshot();let shown=0;
  const tx=recovery(host,value,{failed:async error=>{assert.match(String(error),/message failed/);assert.deepEqual(value,before);assert.deepEqual(host.snapshot(),snapshot);assert.equal(host.current().kind,'busy');shown++;return'return';}});
  const outcome=await host.answerElm(value,tx.execute,async()=>{value.bag.ITEM_POTION=99;value.party[0].hp=0;value.money=0;value.flags.LATE_PHONE_MUTATION=true;throw Error('message failed');});
  assert.deepEqual(outcome,{ok:false});assert.equal(shown,1);assert.deepEqual(value,before);assert.deepEqual(tx.writes,[before]);assert.deepEqual(host.current(),{kind:'elm',call:token});
});

test('explicit Retry pins the same call across recovery without draws and holds admission through the prompt',async()=>{
  const {host,state:value}=ready();let draws=0,deliveries=0;host.poll(value,newBark,()=>{draws++;return 0;});const failed=deferred(),release=deferred();
  const tx=recovery(host,value,{failed:async()=>{failed.resolve();await release.promise;return'retry';}});
  const result=host.answerElm(value,tx.execute,async call=>{deliveries++;assert.deepEqual(call,token);if(deliveries===1)throw Error('transient phone UI');return 13;});
  await failed.promise;assert.deepEqual(value.phoneTriggers,[0]);assert.equal(host.current().kind,'busy');const before=host.snapshot();host.advanceRTC(5000);assert.deepEqual(host.snapshot(),before);assert.equal(host.poll(value,newBark,()=>assert.fail()).kind,'busy');
  await assert.rejects(host.answerElm(value,tx.execute,async()=>assert.fail()),/already pending/);release.resolve();assert.deepEqual(await result,{ok:true,value:13});assert.equal(deliveries,2);assert.equal(draws,1);assert.deepEqual(value.phoneTriggers,[]);assert.equal(host.current().kind,'none');assert.equal(tx.writes.length,1);
});

test('the answer lock survives hydration retries, then always releases after executor failure',async()=>{
  const {host,state:value}=ready();host.poll(value,newBark,()=>0);const snapshot=host.snapshot(),before=structuredClone(value);let restores=0,errors=0;
  const owner=new SourceActionRecovery(value,{capture:()=>host.snapshot(),restore:async checkpoint=>{host.restore(checkpoint);if(++restores===1)throw Error('hydrate failed');}});
  const execute=<T>(action:()=>Promise<T>)=>runRecoverableSourceAction(owner,action,{failed:async()=> 'return',recoveryFailed:async()=>{errors++;assert.equal(host.current().kind,'busy');},retry:()=>{},committed:()=>{}});
  assert.deepEqual(await host.answerElm(value,execute,async()=>{throw Error('phone failed');}),{ok:false});assert.equal(restores,2);assert.equal(errors,1);assert.deepEqual(value,before);assert.deepEqual(host.snapshot(),snapshot);assert.equal(host.current().kind,'elm');
  await assert.rejects(host.answerElm(value,async()=>{throw Error('executor failed');},async()=>assert.fail()),/executor failed/);assert.equal(host.current().kind,'elm');
});

test('a stale or tampered token cannot silently launch another call or recreate a cleared bit',async()=>{
  const {host,state:value}=ready();host.poll(value,newBark,()=>0);value.phoneTriggers=[];const tx=recovery(host,value);
  assert.deepEqual(await host.answerElm(value,tx.execute,async()=>assert.fail('stale call must not deliver')),{ok:false});assert.deepEqual(value.phoneTriggers,[]);
  const altered:PhoneFieldSnapshot=host.snapshot();(altered.ring.active as {script:number}).script=7;host.restore(altered);assert.equal(host.current().kind,'unsupported');await assert.rejects(host.answerElm(value,tx.execute,async()=>assert.fail()),/Only the native optional Elm/);
});

test('caller-owned rules cannot change a constructed field host',()=>{
  const mutable=structuredClone(rules),host=new FieldPhoneHost(mutable,1000),value=state();mutable.triggers[0].script=7;mutable.callIntervalMinutes=1;host.triggerQueued(0,true);host.advanceRTC(1060);assert.deepEqual(host.poll(value,newBark,()=>0),{kind:'elm',call:token});
});
