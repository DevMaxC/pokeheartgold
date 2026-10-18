import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {loadData,newState} from './data.ts';
import {sourceJSON,type State,type SourceMap} from './types.ts';
import {ScriptVM,UnsupportedScript,type ScriptHooks} from './script.ts';
import {FieldObjects} from './objects.ts';
import {FieldPhoneHost,type MotherGiftCall} from './phone-field-host.ts';
import type {PhoneAdmissionRules} from './phone-random.ts';
import {phoneCall} from './phone.ts';
import {hasMomGift,peekMomGift,popMomGift} from './mom-gifts.ts';
import {readMomSavings,type MomSavingsState} from './mom-savings.ts';
import {SourceActionRecovery,runRecoverableSourceAction,type SourceActionPrompts} from './script-recovery.ts';

let failMotherBank=false;
globalThis.fetch=async input=>{const path=String(input);if(path==='/source/messages/664.json'&&failMotherBank){failMotherBank=false;return new Response('',{status:503});}try{return new Response(await readFile(new URL('../../public'+path,import.meta.url)));}catch{return new Response('',{status:404});}};
const data=await loadData(),c=data.constants,common=await sourceJSON<SourceMap>('scripts/0144.json'),newBark=await sourceJSON<SourceMap>('maps/60.json'),rules=await sourceJSON<PhoneAdmissionRules>('phone-triggers.json'),motherText=await sourceJSON<Record<string,string>>('messages/664.json');
const maps=await Promise.all(Object.keys(data.index.maps).map(id=>sourceJSON<SourceMap>(`maps/${id}.json`)));
const placements=maps.flatMap(map=>map.events.objects.filter(object=>object.scriptId==='std_moms_gift_deliveryman').map(object=>({map,object})));
const call:MotherGiftCall={trigger:12,contact:0,scripted:3,script:27,forcePickUp:false};
function state():State&MomSavingsState{const value:State&MomSavingsState=newState(data,'Ethan','boy',()=>.5);value.map=60;value.momSavings={balance:2900,normalGiftsGiven:1,gifts:[{item:c.ITEM_SUPER_POTION,quantity:1},{item:c.ITEM_OCCA_BERRY,quantity:5}]};value.phoneTriggers=[12,0];return value;}
const baseHooks=():ScriptHooks=>({message:async()=>{},choice:async()=>assert.fail('native gift delivery has no choice'),move:async()=>{},position(){},face(){},visible(){},chooseStarter:async()=>{},nickname:async()=>1,refresh:async()=>{},battle:async()=>assert.fail(),warp:async()=>assert.fail('delivery never warps')});
function delivery(row=placements[0]){
  const value=state();value.map=row.map.id;
  // This isolated Mother-host fixture starts after COMMON0144 init; actual
  // Mart entry initialization is covered by mystery-gifts.test.ts.
  value.flags.FLAG_HIDE_MOM_GIFT_DELIVERYMAN=false;
  const objects=new FieldObjects(data,value);objects.load(row.map.events.objects);objects.snapshot();
  const phone=new FieldPhoneHost(rules,1000,9),messages:string[]=[],controls:{message?:(text:string,index:number)=>void|Promise<void>;refresh?:()=>void}={};
  const hooks=baseHooks();hooks.face=name=>{const actor=objects.get(name);if(actor)actor.facingDirection=3;};hooks.message=async text=>{messages.push(text);await controls.message?.(text,messages.length);};hooks.refresh=async()=>{objects.snapshot();controls.refresh?.();};
  const vm=new ScriptVM(data,value,hooks),owner=new SourceActionRecovery(value,{capture:()=>({objects:objects.save(value.map),phone:phone.snapshot()}),restore:async snapshot=>{objects.load(row.map.events.objects);objects.restore(value.map,snapshot.objects);objects.snapshot();phone.restore(snapshot.phone);}});
  const action=async()=>{phone.resetForSourceEvent();await vm.run(row.map,row.object.scriptId,row.object.id);};
  return{row,value,objects,phone,messages,controls,vm,owner,action,run:()=>owner.run(action)};
}
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return{promise,resolve};};

test('literal delivery ABI and all exported deliverymen run real COMMON0144→std2033 once per package',async()=>{
  assert.equal(placements.length,16);assert.equal(c.std_moms_gift_deliveryman,10202);
  const entry=common.scripts.labels[common.scripts.entries[2]],commands=common.scripts.instructions.slice(entry).map(row=>row[0]);
  assert.ok(commands.indexOf('HasSpaceForItem')<commands.indexOf('CallStd'));assert.ok(commands.indexOf('CallStd')<commands.indexOf('PopMomGift'));assert.ok(commands.indexOf('PopMomGift')<commands.indexOf('UnsetPhoneCallTrigger'));assert.ok(!commands.includes('Warp'));
  for(const row of placements){const f=delivery(row),store=readMomSavings(f.value);await f.run();assert.equal(f.value.bag.ITEM_SUPER_POTION,1);assert.deepEqual(readMomSavings(f.value),{...store,gifts:store.gifts.slice(1)});assert.deepEqual(f.value.phoneTriggers,[0]);assert.ok(f.messages[0].includes('package for you from your'));assert.ok(f.messages.some(text=>text.includes('Super Potion')));assert.equal(f.messages.at(-1),'We look forward to your next visit.');assert.equal(f.vm.lastUnsupported,null);
    // Continue/re-entry preserves exact queue/bank/mask; reading never grants.
    const saved=JSON.parse(JSON.stringify(f.value));assert.deepEqual(readMomSavings(saved),readMomSavings(f.value));assert.equal(saved.bag.ITEM_SUPER_POTION,1);
    await f.run();assert.equal(f.value.bag.ITEM_OCCA_BERRY,5);assert.equal(hasMomGift(f.value),false);assert.equal(readMomSavings(f.value).balance,store.balance);assert.equal(readMomSavings(f.value).normalGiftsGiven,store.normalGiftsGiven);
    const bag={...f.value.bag};await f.run();assert.deepEqual(f.value.bag,bag);assert.ok(f.messages.at(-1)?.includes('no further packages'));
  }
});
test('real full-stack and five-berry overflow branches keep the complete queue and pending call',async()=>{
  for(const key of['ITEM_SUPER_POTION','ITEM_OCCA_BERRY']){const f=delivery();if(key==='ITEM_OCCA_BERRY')f.value.momSavings!.gifts=f.value.momSavings!.gifts!.slice(1);f.value.bag[key]=key==='ITEM_OCCA_BERRY'?995:999;const before=structuredClone(f.value),store=readMomSavings(f.value);await f.run();assert.deepEqual(f.value.bag,before.bag);assert.deepEqual(readMomSavings(f.value),store);assert.deepEqual(f.value.phoneTriggers,[12,0]);assert.equal(f.messages.length,2);assert.ok(f.messages.at(-1)?.includes('too many'));}
});
test('every awaited delivery message and final refresh failure restore State and live object/phone snapshots',async()=>{
  const baseline=delivery();let refreshes=0;baseline.controls.refresh=()=>{refreshes++;};await baseline.run();assert.ok(baseline.messages.length>=4);assert.equal(refreshes,2,'std2033 child refresh then final delivery refresh');
  for(let phase=1;phase<=baseline.messages.length+refreshes;phase++){
    const f=delivery(),before=structuredClone(f.value),actors=f.objects.save(f.value.map),phone=f.phone.snapshot();
    f.controls.message=(_text,index)=>{if(index===phase){f.objects.position(f.row.object.id,99,99);f.phone.triggerQueued(12,true);throw Error('late delivery phase '+phase);}};
    let seenRefreshes=0;f.controls.refresh=()=>{if(++seenRefreshes===phase-baseline.messages.length)throw Error('final refresh failed');};
    await assert.rejects(f.run(),/late delivery phase|final refresh/);assert.deepEqual(f.value,before);assert.deepEqual(f.objects.save(f.value.map),actors);assert.deepEqual(f.phone.snapshot(),phone);assert.equal(f.vm.busy,false);assert.equal(f.owner.busy,false);
    f.controls.message=undefined;f.controls.refresh=undefined;await f.run();assert.equal(f.value.bag.ITEM_SUPER_POTION,1);assert.equal(readMomSavings(f.value).gifts.length,1);
  }
});
test('failed source delivery Return grants nothing; explicit Retry grants/pop exactly once after acknowledgement',async()=>{
  for(const answer of['return','retry']as const){const f=delivery(),before=structuredClone(f.value);let failed=false,attempts=0,commits=0;
    f.controls.message=()=>{if(f.value.bag.ITEM_SUPER_POTION&&!failed){failed=true;throw Error('source item acknowledgement failed');}};
    const prompts:SourceActionPrompts={failed:async()=>{assert.deepEqual(f.value,before);return answer;},recoveryFailed:async error=>{throw error;},retry(){},committed(){commits++;}};
    const result=await runRecoverableSourceAction(f.owner,async()=>{attempts++;await f.action();},prompts);
    assert.equal(result.ok,answer==='retry');assert.equal(attempts,answer==='retry'?2:1);assert.equal(commits,1);if(answer==='return')assert.deepEqual(f.value,before);else{assert.equal(f.value.bag.ITEM_SUPER_POTION,1);assert.equal(readMomSavings(f.value).gifts.length,1);}
  }
});
test('cancellation and controlled bag/head changes between source phases never discard or duplicate a package',async()=>{
  for(const kind of['cancel','capacity','head']as const){const f=delivery(),before=structuredClone(f.value);let changed=false;
    f.controls.message=()=>{
      if(kind==='capacity'&&!changed){
        changed=true;
        // A controlled storage port changes after HasSpace's initial reads but
        // before std2033 GiveItem. This is an invariant-negative fixture, not
        // an assertion that ordinary source input mutates the locked Bag.
        let checks=0;const bag=f.value.bag;Object.defineProperty(bag,'ITEM_SUPER_POTION',{configurable:true,enumerable:true,get(){return++checks>=3?999:0;},set(value){Object.defineProperty(bag,'ITEM_SUPER_POTION',{value,writable:true,configurable:true,enumerable:true});}});return;
      }
      if(!changed&&f.value.bag.ITEM_SUPER_POTION===1){changed=true;if(kind==='cancel')f.vm.cancel();if(kind==='head')f.value.momSavings!.gifts![0]={item:c.ITEM_REPEL,quantity:1};}
    };
    await assert.rejects(f.run(),kind==='head'?/matching source item grant/:kind==='capacity'?/grant failed/:/cancelled/);assert.deepEqual(f.value,before);
  }
});
test('transient delivery-bank fetch retries and shared init reads the represented empty store',async()=>{
  // Standard banks may already be cached in this process; use an independent
  // bank key with identical exact source bytes to exercise cache eviction.
  const f=delivery(),copy={...data,index:{...data.index,stdScripts:data.index.stdScripts.map(row=>row.min===10200?{...row,bank:'0144-retry-fixture'}:row)}};
  const original=globalThis.fetch;let loads=0;globalThis.fetch=async input=>{if(String(input)==='/source/scripts/0144-retry-fixture.json'){loads++;if(loads===1)return new Response('',{status:503});return new Response(await readFile(new URL('../../public/source/scripts/0144.json',import.meta.url)));}return original(input);};
  try{const vm=new ScriptVM(copy,f.value,f.vm.hooks);await assert.rejects(f.owner.run(()=>vm.run(f.row.map,10202,f.row.object.id)),/503/);await f.owner.run(()=>vm.run(f.row.map,10202,f.row.object.id));assert.equal(loads,2);assert.equal(f.value.bag.ITEM_SUPER_POTION,1);}finally{globalThis.fetch=original;}
  const init=delivery();await init.owner.run(()=>init.vm.run(init.row.map,c.std_hide_show_deliverymen,init.row.object.id));assert.equal(init.value.flags.FLAG_HIDE_MOM_GIFT_DELIVERYMAN,false);assert.equal(init.value.flags.FLAG_HIDE_MYSTERY_GIFT_DELIVERYMAN,true);assert.equal(init.vm.lastUnsupported,null);
});
test('Mother trigger12 rings as exact script27, is not inferred on Continue, and answering never awards a gift',async()=>{
  const value=state(),host=new FieldPhoneHost(rules,1000,9),queue=readMomSavings(value);value.phoneTriggers=[12];
  assert.equal(host.current().kind,'none');assert.equal(host.poll(value,newBark,()=>assert.fail(),()=>assert.fail()).kind,'none');assert.equal(value.bag.ITEM_SUPER_POTION,undefined);
  host.triggerQueued(12,true);host.advanceRTC(1060,9);assert.deepEqual(host.poll(value,newBark,()=>0,()=>assert.fail()),{kind:'mother',call});assert.deepEqual(value.phoneTriggers,[12]);
  const owner=new SourceActionRecovery(value,{capture:()=>host.snapshot(),restore:async snap=>host.restore(snap)}),seen:string[]=[];
  const outcome=await host.answerMother(value,action=>runRecoverableSourceAction(owner,action,{failed:async()=> 'return',recoveryFailed:async error=>{throw error;},retry(){},committed(){}}),async token=>{assert.deepEqual(token,call);assert.deepEqual(value.phoneTriggers,[]);await phoneCall(data,value,token.contact,token.scripted,token.script,async text=>{seen.push(new ScriptVM(data,value,baseHooks()).text(text,newBark));},async()=>assert.fail());});
  assert.equal(outcome.ok,true);assert.deepEqual(seen,['Mother: '+motherText[29].replace(/\{STRVAR_1 3, 0, 0\}/g,value.name).replace(/\\+n/g,'\n')]);assert.deepEqual(readMomSavings(value),queue);assert.deepEqual(value.bag,{});assert.equal(host.current().kind,'none');
});
test('Mother incoming local priority, exact genders and unsupported callers stay source bounded',async()=>{
  for(const gender of['boy','girl']as const)for(const map of[60,63]){const value=state(),seen:string[]=[];value.gender=gender;value.map=map;await phoneCall(data,value,0,3,27,async text=>{seen.push(text);},async()=>assert.fail());assert.deepEqual(seen,['Mother: '+motherText[map===63?(gender==='boy'?1:2):29]]);}
  const value=state(),host=new FieldPhoneHost(rules,1000,9);value.map=63;value.phoneTriggers=[12];host.triggerQueued(12,true);host.advanceRTC(1060,9);const home=maps.find(map=>map.id===63)!;assert.equal(host.poll(value,home,()=>assert.fail(),()=>99).kind,'none');assert.deepEqual(value.phoneTriggers,[12]);
  await assert.rejects(phoneCall(data,value,0,3,28,async()=>assert.fail(),async()=>0),/Unported original phone caller/);
  value.map=60;value.phoneTriggers=[1];host.triggerQueued(1,true);host.advanceRTC(1120,9);assert.equal(host.poll(value,newBark,()=>0,()=>99).kind,'unsupported');await assert.rejects(host.answerMother(value,async()=>assert.fail(),async()=>assert.fail()),/Only the native optional Mother/);assert.deepEqual(value.phoneTriggers,[1]);
});
test('Mother failed fetch/dialogue Return and explicit Retry restore same pinned call and queue without reselection',async()=>{
  for(const kind of['fetch','late']as const)for(const answer of['return','retry']as const){const value=state(),host=new FieldPhoneHost(rules,1000,9);value.phoneTriggers=[12];host.triggerQueued(12,true);host.advanceRTC(1060,9);let draws=0;host.poll(value,newBark,()=>{draws++;return 0;},()=>assert.fail());const before=structuredClone(value),snapshot=host.snapshot(),owner=new SourceActionRecovery(value,{capture:()=>host.snapshot(),restore:async snap=>host.restore(snap)});let attempts=0;
    const result=await host.answerMother(value,action=>runRecoverableSourceAction(owner,action,{failed:async()=>{assert.deepEqual(value,before);assert.deepEqual(host.snapshot(),snapshot);assert.equal(host.current().kind,'busy');return answer;},recoveryFailed:async error=>{throw error;},retry(){},committed(){}}),async token=>{attempts++;if(kind==='fetch'&&attempts===1)failMotherBank=true;await phoneCall(data,value,token.contact,token.scripted,token.script,async()=>{if(kind==='late'&&attempts===1){value.money=0;value.momSavings!.gifts!.shift();throw Error('late phone failure');}},async()=>assert.fail());});
    assert.equal(result.ok,answer==='retry');assert.equal(draws,1);assert.equal(attempts,answer==='retry'?2:1);assert.deepEqual(readMomSavings(value),readMomSavings(before));if(answer==='return'){assert.deepEqual(value,before);assert.deepEqual(host.current(),{kind:'mother',call});}else{assert.deepEqual(value.phoneTriggers,[]);assert.equal(host.current().kind,'none');}
  }
});
test('Mother answer owns admission through pending UI and cancellation; tampered calls never launch',async()=>{
  const value=state(),host=new FieldPhoneHost(rules,1000,9);value.phoneTriggers=[12];host.triggerQueued(12,true);host.advanceRTC(1060,9);host.poll(value,newBark,()=>0,()=>assert.fail());const entered=deferred(),release=deferred(),owner=new SourceActionRecovery(value,{capture:()=>host.snapshot(),restore:async snap=>host.restore(snap)});
  const pending=host.answerMother(value,action=>runRecoverableSourceAction(owner,action,{failed:async()=> 'return',recoveryFailed:async error=>{throw error;},retry(){},committed(){}}),async()=>{entered.resolve();await release.promise;throw new DOMException('phone cancelled','AbortError');});
  await entered.promise;assert.equal(host.current().kind,'busy');const snap=host.snapshot();host.advanceRTC(5000,9);assert.deepEqual(host.snapshot(),snap);assert.equal(host.poll(value,newBark,()=>assert.fail(),()=>assert.fail()).kind,'busy');await assert.rejects(host.answerMother(value,async()=>assert.fail(),async()=>assert.fail()),/already pending/);release.resolve();assert.deepEqual(await pending,{ok:false});assert.deepEqual(host.current(),{kind:'mother',call});
  const altered=host.snapshot();(altered.ring.active as {contact:number}).contact=1;host.restore(altered);assert.equal(host.current().kind,'unsupported');await assert.rejects(host.answerMother(value,async()=>assert.fail(),async()=>assert.fail()),/Only the native optional Mother/);assert.deepEqual(value.phoneTriggers,[12]);
});

// Actual native Peek/Get and command-pointer ABI, compiled rather than a second
// TS queue algorithm. The state store validation is covered separately above.
const saveSource=await readFile(new URL('../../../src/save_pokegear.c',import.meta.url),'utf8'),checkSource=await readFile(new URL('../../../src/scrcmd_12.c',import.meta.url),'utf8'),commandSource=await readFile(new URL('../../../src/field/scrcmd_pokemon_misc.c',import.meta.url),'utf8');
function extract(source:string,signature:string){const match=new RegExp(signature.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'[^;{]*\\{').exec(source);assert.ok(match,signature);const start=match.index,brace=source.indexOf('{',start);let depth=0;for(let i=brace;i<source.length;i++){if(source[i]==='{')depth++;if(source[i]==='}'&&!--depth)return source.slice(start,i+1);}throw Error('Incomplete native definition');}
const directory=await mkdtemp(join(tmpdir(),'heartgold-mom-gift-')),binary=join(directory,'native');
const native=`#include <stdint.h>
#include <stdio.h>
#include <string.h>
typedef uint16_t u16;typedef uint8_t u8;typedef int BOOL;
#define TRUE 1
#define FALSE 0
typedef struct{u16 momGiftQueue[5][2];}PhoneCallPersistentState;
typedef struct{PhoneCallPersistentState*saveData;}FieldSystem;
typedef struct{FieldSystem*fieldSystem;u16*outputs[2];int next;}ScriptContext;
PhoneCallPersistentState*SaveData_GetPhoneCallPersistentState(PhoneCallPersistentState*s){return s;}u16*ScriptGetVarPointer(ScriptContext*c){return c->outputs[c->next++];}
${extract(saveSource,'u16 PhoneCallPersistentState_MomGiftQueue_Peek(')}
${extract(saveSource,'void PhoneCallPersistentState_MomGiftQueue_Get(')}
${extract(checkSource,'BOOL ScrCmd_MomGiftCheck(')}
${extract(commandSource,'BOOL ScrCmd_PeekMomGift(')}
${extract(commandSource,'BOOL ScrCmd_PopMomGift(')}
int main(void){int n;while(scanf("%d",&n)==1){PhoneCallPersistentState s={0};for(int i=0;i<n;i++)scanf("%hu%hu",&s.momGiftQueue[i][0],&s.momGiftQueue[i][1]);FieldSystem f={&s};u16 check,item,quantity;ScriptContext c={&f,{&check,0},0};for(int i=0;i<6;i++){c.next=0;c.outputs[0]=&check;ScrCmd_MomGiftCheck(&c);c.next=0;c.outputs[0]=&item;c.outputs[1]=&quantity;ScrCmd_PeekMomGift(&c);printf("%hu %hu %hu ",check,item,quantity);ScrCmd_PopMomGift(&c);}printf("\\n");}return 0;}`;
await writeFile(join(directory,'native.c'),native);execFileSync(process.env.CC||'cc',['-std=c99','-O0',join(directory,'native.c'),'-o',binary],{stdio:'pipe'});after(()=>rm(directory,{recursive:true,force:true}));
test('Mom queue check/peek outputs and pop order match literal C for every compact queue size; reads do not mutate saves',()=>{
  const all=[{item:c.ITEM_SUPER_POTION,quantity:1},{item:c.ITEM_REPEL,quantity:1},{item:c.ITEM_SUPER_POTION,quantity:1},{item:c.ITEM_SILK_SCARF,quantity:1},{item:c.ITEM_MOON_STONE,quantity:1}];
  for(let n=0;n<=5;n++){const value=state();value.momSavings={balance:123456,normalGiftsGiven:31,gifts:all.slice(0,n)};const before=structuredClone(value);peekMomGift(value);hasMomGift(value);assert.deepEqual(value,before);const expected=execFileSync(binary,[],{input:[n,...all.slice(0,n).flatMap(g=>[g.item,g.quantity])].join(' ')+'\n',encoding:'utf8'}).trim().split(/\s+/).map(Number),actual:number[]=[];
    for(let i=0;i<6;i++){const gift=peekMomGift(value);actual.push(Number(hasMomGift(value)),gift.item,gift.quantity);popMomGift(value);}assert.deepEqual(actual,expected);assert.equal(readMomSavings(value).balance,123456);assert.equal(readMomSavings(value).normalGiftsGiven,31);
  }
  const value=state();delete value.momSavings;const before=structuredClone(value);assert.deepEqual(peekMomGift(value),{item:0,quantity:0});popMomGift(value);assert.deepEqual(value,before);
});
