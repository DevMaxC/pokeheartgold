import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData,newState,createMon} from './data.ts';
import {phoneCall} from './phone.ts';
import {ScriptVM,type ScriptHooks} from './script.ts';
import {SourceActionRecovery} from './script-recovery.ts';
import {newPhoneRingState,boostPhoneTimer,advancePhoneMinutes,planTriggeredIncomingCall,launchIncomingCall,type PhoneTriggerRules} from './phone-scheduler.ts';
import {sourceJSON,type SourceMap} from './types.ts';
let failPhone=false,phoneLoads=0;
globalThis.fetch=async input=>{const path=String(input);assert.ok(path.startsWith('/source/'));if(path==='/source/phone.json'){phoneLoads++;if(failPhone){failPhone=false;return new Response('',{status:503});}}try{return new Response(await readFile(new URL('../../public'+path,import.meta.url)));}catch{return new Response('',{status:404});}};
const data=await loadData(),map=await sourceJSON<SourceMap>('maps/61.json'),elm=map.events.objects.find(n=>n.id==='obj_T20R0101_doctor')!,bank=await sourceJSON<Record<string,string>>('messages/716.json'),rules=await sourceJSON<PhoneTriggerRules>('phone-triggers.json');
const hooks=(message:ScriptHooks['message']=async()=>{}):ScriptHooks=>({message,choice:async()=>0,move:async()=>{},position:()=>{},face:()=>{},visible:()=>{},chooseStarter:async()=>{},nickname:async()=>1,refresh:async()=>{},battle:async()=>false,warp:async()=>{}});
function fixture(){const state=newState(data,'Ethan','boy',()=>.5);state.map=60;state.flags.FLAG_SYS_HATCHED_TOGEPI_EGG=true;for(const flag of['FLAG_GOT_ELMS_PANIC_CALL','FLAG_GAVE_RIVAL_NAME_TO_OFFICER','FLAG_GOT_PICK_UP_EGG_CALL_FROM_ELM','FLAG_GOT_EGG_FROM_ELMS_ASSISTANT'])state.flags[flag]=true;return state;}

test('a transient phone-definition503 is retryable and does not poison every later call',async()=>{
  const state=fixture();failPhone=true;await assert.rejects(phoneCall(data,state,1,3,13,async()=>{},async()=>0),/phone.json/);
  const messages:string[]=[];await phoneCall(data,state,1,3,13,async text=>{messages.push(text);},async()=>0);assert.equal(phoneLoads,2);assert.deepEqual(messages,['Professor Elm: '+bank['13']]);
});

test('native incoming Elm3 selects actual script13 regardless of outgoing-local or story-selection conditions',async()=>{
  for(const id of[60,61,73])for(const gender of['boy','girl']as const){const state=fixture(),messages:string[]=[];state.map=id;state.gender=gender;state.flags={};await phoneCall(data,state,1,3,13,async text=>{messages.push(text);},async()=>0);assert.deepEqual(messages,['Professor Elm: '+bank[gender==='boy'?'13':'14']]);}
});

test('outgoing Elm local dialogue applies only inside exact lab61, while scripted2 keeps its native map-script lookup',async()=>{
  const state=fixture(),messages:string[]=[];state.map=61;await phoneCall(data,state,1,0,0,async text=>{messages.push(text);},async()=>0);assert.equal(messages.pop(),'Professor Elm: '+bank['1']);state.map=60;await phoneCall(data,state,1,0,0,async text=>{messages.push(text);},async()=>0);assert.equal(messages.pop(),'Professor Elm: '+bank['13']);await phoneCall(data,state,1,2,1,async text=>{messages.push(text);},async()=>0);assert.equal(messages.pop(),'Professor Elm: '+bank['35']);
});

test('actual VM SetPhoneCallTrigger always sets the bit and reports arg2 only as timer acceleration',async()=>{
  const state=fixture(),observed:{id:number;accelerate:boolean}[]=[],ports=hooks();ports.phoneTrigger=(id,accelerate)=>{observed.push({id,accelerate});};
  const source={...map,scripts:{entries:['start'],labels:{start:0},instructions:[['SetPhoneCallTrigger',['CALL_TRIGGER_ELM_EGG_HATCHED','0']],['SetPhoneCallTrigger',['CALL_TRIGGER_ELM_POKERUS','1']],['UnsetPhoneCallTrigger',['CALL_TRIGGER_ELM_POKERUS']],['End',[]]]}}as SourceMap;
  await new ScriptVM(data,state,ports).run(source,1);assert.deepEqual(state.phoneTriggers,[0]);assert.deepEqual(observed,[{id:0,accelerate:false},{id:1,accelerate:true}]);
});

test('a failed VM timing hook rolls back both its newly pending flag and ephemeral interval boost',async()=>{
  const state=fixture(),before=structuredClone(state);let ring=newPhoneRingState();const ports=hooks();ports.phoneTrigger=(_id,accelerate)=>{ring=boostPhoneTimer(ring,accelerate,rules);throw Error('Field timer host failed');};
  const recovery=new SourceActionRecovery(state,{capture:()=>ring,restore:async snapshot=>{ring=snapshot;}}),source={...map,scripts:{entries:['start'],labels:{start:0},instructions:[['SetPhoneCallTrigger',['CALL_TRIGGER_ELM_EGG_HATCHED','1']],['End',[]]]}}as SourceMap;
  await assert.rejects(recovery.run(()=>new ScriptVM(data,state,ports).run(source,1)),/Field timer host failed/);assert.deepEqual(state,before);assert.deepEqual(ring,newPhoneRingState());
});

test('failed incoming dialogue restores its consumed pending bit and ring snapshot before same-call explicit replay',async()=>{
  const state=fixture();state.phoneTriggers=[0];let ring=planTriggeredIncomingCall(advancePhoneMinutes(boostPhoneTimer(newPhoneRingState(),true,rules),1),state.phoneTriggers,rules,{map:60,incomingAllowed:true,registeredContacts:[],drawUint16:()=>0}).ring;
  const before=structuredClone(state),ringBefore=structuredClone(ring),recovery=new SourceActionRecovery(state,{capture:()=>ring,restore:async snapshot=>{ring=snapshot;}});let fail=true,calls=0;
  const answer=()=>recovery.run(async()=>{const launch=launchIncomingCall(state,ring);ring=launch.ring;assert.deepEqual(state.phoneTriggers,[]);await phoneCall(data,state,launch.call.contact,launch.call.scripted,launch.call.script,async()=>{calls++;if(fail)throw Error('Phone UI failed');},async()=>0);});
  await assert.rejects(answer(),/Phone UI failed/);assert.deepEqual(state,before);assert.deepEqual(ring,ringBefore);fail=false;await answer();assert.equal(calls,2);assert.deepEqual(state.phoneTriggers,[]);assert.equal(ring.active,null);assert.equal(state.flags.FLAG_SYS_HATCHED_TOGEPI_EGG,true);
});

test('the real Elm lab script asks for the hatched Pokémon as lead and grants its native Everstone once',async()=>{
  for(const lead of[155,175]){const state=fixture(),messages:string[]=[];state.map=61;state.phoneTriggers=[0];state.party=[createMon(data,lead,5,state.name,()=>.5)];const vm=new ScriptVM(data,state,hooks(async text=>{messages.push(text);}));await vm.run(map,elm.scriptId,elm.id);assert.deepEqual(state.phoneTriggers,[]);
    if(lead===155){assert.equal(state.bag.ITEM_EVERSTONE,undefined);assert.ok(messages.some(text=>text.includes('Where is the Pokémon?')));}
    else{assert.equal(state.bag.ITEM_EVERSTONE,1);assert.equal(state.flags.FLAG_GOT_EVERSTONE_FROM_ELM,true);assert.equal(state.flags.FLAG_UNK_072,true);await vm.run(map,elm.scriptId,elm.id);assert.equal(state.bag.ITEM_EVERSTONE,1);}
  }
});
