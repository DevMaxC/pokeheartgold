import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData,newState,createMon} from './data.ts';
import {giveTogepiEgg,isOriginalTogepiGift,firstFollowerMon,firstUsableBattlerIndex,partyMonSpecies} from './eggs.ts';
import {hatchFirstReadyEgg,firstReadyEggIndex} from './egg-hatching.ts';
import {ScriptVM,type ScriptHooks} from './script.ts';
import {sourceJSON,type Mon,type SourceMap} from './types.ts';
import {swapFieldPartySlots,chooseFieldPartySwitchTarget} from './party-order.ts';

globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData(),now=()=>new Date(2026,9,17,12);
function fixture(){
 const state=newState(data,'Case','girl',()=>.5);state.nativeEggSeed=1;
 state.party.push(createMon(data,155,5,state.name,()=>.5));giveTogepiEgg(data,state,{now});
 for(const species of[19,16,74,92])state.party.push(createMon(data,species,6,state.name,()=>.5));
 state.party[0].status='paralysis';state.party[0].moves[0].pp=1;state.party[0].heldItem='ITEM_BERRY';
 state.party[2].hp=0;state.party[2].sleepTurns=3;state.party[2].friendship=42;
 return{state,egg:state.party[1]};
}

test('all36 six-slot selections exchange only the two entire Mon records and preserve every nested/extra field',()=>{
 const{state}=fixture(),party=state.party;
 Object.assign(party[3],{futurePerMonExtra:{aprijuiceModifiers:[1,2,3],ribbons:['native']}});
 const before=structuredClone(party);Object.freeze(party);
 for(let from=0;from<6;from++)for(let to=0;to<6;to++){
  const next=swapFieldPartySlots(party,from,to);assert.equal(next.length,6);
  assert.equal(next===party,from===to);
  for(let index=0;index<6;index++)assert.equal(next[index],party[index===from?to:index===to?from:index]);
  assert.deepEqual(party,before);assert.equal(next[to].moves,party[from].moves);assert.equal(next[to].provenance,party[from].provenance);
 }
});

test('Egg-first and fainted-first are legal field orders while native battler/follower consumers still skip them',()=>{
 const{state,egg}=fixture(),starter=state.party[0],fainted=state.party[2],before=structuredClone(state);
 state.party=swapFieldPartySlots(state.party,1,0);assert.equal(state.party[0],egg);
 assert.equal(partyMonSpecies(state.party[0]),0);assert.equal(firstUsableBattlerIndex(state.party),1);assert.equal(firstFollowerMon(state.party),starter);
 state.party=swapFieldPartySlots(state.party,2,0);assert.equal(state.party[0],fainted);
 assert.equal(firstUsableBattlerIndex(state.party),1);assert.equal(firstFollowerMon(state.party),starter);
 state.party.forEach(mon=>{if(!mon.isEgg)mon.hp=0;});assert.equal(firstFollowerMon(state.party),fainted);
 assert.equal(firstUsableBattlerIndex(state.party),-1);assert.ok(egg.hp>0);assert.equal(isOriginalTogepiGift(data,state,egg),true);
 assert.deepEqual(egg,before.party[1]);assert.equal(starter.status,'paralysis');assert.equal(starter.moves[0].pp,1);
});

test('cancel and selecting the source slot retain the original party array, including a one-mon or Egg-only party',()=>{
 const{state,egg}=fixture();
 for(const party of[state.party,[state.party[0]],[egg]]){
  const before=structuredClone(party);assert.equal(swapFieldPartySlots(party,0,null),party);assert.equal(swapFieldPartySlots(party,0,0),party);assert.deepEqual(party,before);
 }
});

test('out-of-range/fractional slots and noncontiguous/overfull parties are rejected without a partial swap',()=>{
 const{state}=fixture(),party=state.party,before=structuredClone(party);
 for(const bad of[-1,6,1.5,NaN,Infinity,undefined as never]){
  assert.throws(()=>swapFieldPartySlots(party,bad,0),RangeError);assert.throws(()=>swapFieldPartySlots(party,0,bad),RangeError);
 }
 const sparse=[...party];delete sparse[1];
 for(const invalid of[[],[...party,party[0]],sparse,[party[0],null as never]])assert.throws(()=>swapFieldPartySlots(invalid,0,0),RangeError);
 assert.deepEqual(party,before);
});

test('gift Egg can move to the lead, hatch there with its original identity, then enable the actual Elm reward script',async()=>{
 const{state,egg}=fixture();state.party=swapFieldPartySlots(state.party,1,0);egg.friendship=0;
 const hatchMap=await sourceJSON<SourceMap>('maps/73.json');state.map=hatchMap.id;
 assert.equal(firstReadyEggIndex(state.party),0);
 await hatchFirstReadyEgg(data,state,{map:hatchMap,now},{reveal:async scene=>{assert.equal(scene.slot,0);},cry:async()=>{},announce:async(_scene,cry)=>{await cry;return false;},nickname:async()=>null,resumeField:async()=>{}});
 assert.equal(state.party[0],egg);assert.equal(egg.isEgg,false);assert.equal(isOriginalTogepiGift(data,state,egg),true);
 const lab=await sourceJSON<SourceMap>('maps/61.json'),messages:string[]=[];
 state.map=lab.id;state.vars.VAR_SCENE_ELMS_LAB=7;
 const hooks:ScriptHooks={message:async text=>{messages.push(text);},choice:async()=>0,move:async()=>{},position:()=>{},face:()=>{},visible:()=>{},chooseStarter:async()=>{},nickname:async()=>1,refresh:async()=>{},battle:async()=>{throw Error('Elm visit cannot battle');},warp:async()=>{}};
 const run=async()=>{const vm=new ScriptVM(data,state,hooks);await vm.run(lab,1);assert.equal(vm.lastUnsupported,null);};
 // A healthy starter leading hides the hatched Togepi from the native
 // GetPartyLeadAlive query. No special gift/quest bypass is introduced.
 state.party=swapFieldPartySlots(state.party,0,1);await run();assert.equal(state.flags.FLAG_UNK_072,undefined);assert.equal(state.bag.ITEM_EVERSTONE,undefined);
 state.party=swapFieldPartySlots(state.party,1,0);await run();
 assert.equal(state.flags.FLAG_UNK_072,true);assert.equal(state.flags.FLAG_GOT_EVERSTONE_FROM_ELM,true);assert.equal(state.bag.ITEM_EVERSTONE,1);
 assert.ok(messages.some(text=>text.includes('Everstone')));assert.equal(state.party[0],egg);
 const resumed=JSON.parse(JSON.stringify(state));assert.equal(resumed.party[0].species,175);assert.equal(isOriginalTogepiGift(data,resumed,resumed.party[0]),true);
});

test('field chooser keeps all occupied slots selectable and conceals Egg species/HP like native party panels',async()=>{
 const{state,egg}=fixture(),before=structuredClone(state);
 const choice=await chooseFieldPartySwitchTarget(()=>state.party,5,{choose:async(title,options,_detail,signal)=>{
  assert.equal(title,'Move to where?');assert.equal(signal,undefined);assert.equal(options.length,7);assert.equal(options[1],'2. Egg');
  assert.ok(!options[1].includes(String(egg.species)));assert.match(options[2],/0\/.*HP/);assert.match(options[0],/paralysis/);assert.equal(options[6],'Cancel');return 1;
 }});
 assert.equal(choice,1);assert.deepEqual(state,before);
});

test('invalid chooser inputs reject before opening any UI',async()=>{
 const{state}=fixture(),sparse=[...state.party];delete sparse[1];let opened=0;
 const ui={choose:async()=>{opened++;return 0;}};
 for(const source of[-1,6,.5,NaN])await assert.rejects(chooseFieldPartySwitchTarget(()=>state.party,source,ui),RangeError);
 for(const party of[[],sparse,[...state.party,state.party[0]]])await assert.rejects(chooseFieldPartySwitchTarget(()=>party,0,ui),RangeError);
 assert.equal(opened,0);
});

test('chooser Cancel/source selections and rejected/replaced UI leave order and records untouched',async()=>{
 const{state}=fixture(),party=state.party,before=structuredClone(state);
 for(const selection of[0,6])assert.equal(await chooseFieldPartySwitchTarget(()=>state.party,0,{choose:async()=>selection}),null);
 const reason=new DOMException('UI operation was replaced','AbortError');
 await assert.rejects(chooseFieldPartySwitchTarget(()=>state.party,0,{choose:async()=>{throw reason;}}),error=>error===reason);
 assert.equal(state.party,party);assert.deepEqual(state,before);
});

test('chooser rejects stale indices when the party is changed or replaced during the awaited UI',async()=>{
 for(const change of['reorder','replace','remove','in-place-reorder']as const){
  const{state}=fixture();
  await assert.rejects(chooseFieldPartySwitchTarget(()=>state.party,0,{choose:async()=>{
   if(change==='reorder')state.party=swapFieldPartySlots(state.party,0,1);
   if(change==='replace')state.party=structuredClone(state.party);
   if(change==='remove')state.party.pop();
   if(change==='in-place-reorder')state.party.reverse();
   return 2;
  }}),/party changed/);
 }
});

test('unresolved choices or aborts never become a valid target or mutate the party',async()=>{
 const{state}=fixture(),before=structuredClone(state);
 for(const bad of[-1,7,.5,NaN,undefined as never])await assert.rejects(chooseFieldPartySwitchTarget(()=>state.party,0,{choose:async()=>bad}),RangeError);
 const stopped=new AbortController(),reason=Error('field transaction cancelled');stopped.abort(reason);
 await assert.rejects(chooseFieldPartySwitchTarget(()=>state.party,0,{choose:async()=>{throw Error('must not open');}},stopped.signal),error=>error===reason);
 const pending=new AbortController();
 await assert.rejects(chooseFieldPartySwitchTarget(()=>state.party,0,{choose:async(_title,_options,_detail,signal)=>{assert.equal(signal,pending.signal);pending.abort(reason);return 1;}},pending.signal),error=>error===reason);
 assert.deepEqual(state,before);
});
