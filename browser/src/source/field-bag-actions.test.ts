import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {UI} from './ui.ts';
import {InterfacePanels} from './interface-panels.ts';
import {loadData,newState,createMon} from './data.ts';
import {loadNativeFieldMoveData,prepareTMHMTeaching} from './field-moves.ts';
import {useFieldBagItem} from './field-bag-actions.ts';
import {defaultInterfacePreferences} from './interface-preferences.ts';
import {installUIDOM,installUIClock} from './ui-test-dom.ts';
import type {State} from './types.ts';

globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData(),native=await loadNativeFieldMoveData();
// Run the exact reviewed Native recovery implementation without adding it as
// a UI production dependency or duplicating its transaction algorithm.
const recoverySource=execFileSync('git',['show','4ca4545b:browser/src/source/script-recovery.ts'],{cwd:new URL('../../../',import.meta.url),encoding:'utf8'});
assert.equal(createHash('sha256').update(recoverySource).digest('hex'),'3e29f48cf7eb1788b385641066d48ce58f76b592fb71a5889788f06908c134bd');
const temporary=await mkdtemp(path.join(tmpdir(),'hg-bag-recovery-'));
let SourceActionRecovery:any;
try{const file=path.join(temporary,'recovery.mts');await writeFile(file,recoverySource);({SourceActionRecovery}=await import(pathToFileURL(file).href));}finally{await rm(temporary,{recursive:true,force:true});}
const tick=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
const move=(id:number,pp=data.moves[id].pp,maxPP=data.moves[id].pp)=>({id,pp,maxPP});
function fixture(item='ITEM_POTION',count=2){
 const dom=installUIDOM(),clock=installUIClock(),ui=new UI(),controller=new AbortController();
 const state=newState(data,'Case','boy');state.map=34;state.x=558.5;state.z=295.5;state.party=[createMon(data,19,10,'Case',()=>.5)];state.party[0].hp=1;state.party[0].moves=[move(33,1)];state.bag={[item]:count};
 let live:State|null=state,saves=0,restores=0,calls=0;
 const recovery=new SourceActionRecovery(state,{capture:()=>({map:state.map}),restore:async()=>{restores++;}});
 const ports={state:()=>live,location:()=> 'Route 30',save:()=>{saves++;return true;},preferences:()=>defaultInterfacePreferences(),updatePreferences:()=>{},touch:{}as any,gesture:()=>{},useItem:undefined as ((item:string,context:{state:State;signal:AbortSignal})=>Promise<void>)|undefined};
 const panels=new InterfacePanels(ui,data,ports);
 const content=()=>dom.ids.get('panel-content')!,html=()=>content().innerHTML;
 const button=(attribute:string,value:string)=>{const node=content().querySelector(`[${attribute}="${value}"]`);assert.ok(node,`Expected ${attribute}=${value} in ${html()}`);return node;};
 const choose=(value:string)=>button('data-bag-choice',value).click(),option=(value:number)=>button('data-option',String(value)).click(),action=(value:string)=>button('data-action',value).click();
 const use=()=>useFieldBagItem(ui,data,native,{state:()=>live,expectedState:state,signal:controller.signal},item);
 const host=()=>{ports.useItem=async(key,context)=>{calls++;const result=await recovery.run(()=>useFieldBagItem(ui,data,native,{state:()=>live,expectedState:context.state,signal:AbortSignal.any([controller.signal,context.signal])},key));if(result.status==='used')saves++;};};
 return{dom,clock,ui,controller,state,ports,panels,recovery,content,html,button,choose,option,action,use,host,get saves(){return saves;},get restores(){return restores;},get calls(){return calls;},set live(value:State|null){live=value;},restore(){controller.abort();ui.close();clock.restore();dom.restore();}};
}

test('actual Bag Use commits Potion only after acknowledgement, refreshes inventory and never saves itself',async()=>{
 const f=fixture();try{
  f.host();const bag=f.panels.bag();void bag.catch(()=>{});f.action('use:ITEM_POTION');await tick();assert.match(f.html(),/Choose a Pokémon/);assert.equal(f.calls,1);assert.equal(f.recovery.busy,true);
  f.choose('party:0');await tick();assert.match(f.html(),/Use Potion/);assert.equal(f.state.party[0].hp,1);assert.equal(f.state.bag.ITEM_POTION,2);assert.equal(f.saves,0);
  f.option(0);await tick();assert.equal(f.state.party[0].hp,21);assert.equal(f.state.bag.ITEM_POTION,1);assert.equal(f.saves,0);assert.equal(f.recovery.busy,true);
  f.option(0);await tick();assert.match(f.html(),/Your Bag/);assert.match(f.html(),/× 1/);assert.equal(f.saves,1);assert.equal(f.recovery.busy,false);f.action('back');await bag;assert.equal(f.ui.busy,false);
 }finally{f.restore();}
});

test('Bag keeps read-only fallback, cancellation makes no changes and stale inventory cannot dispatch a Use callback',async()=>{
 const f=fixture();try{
  const readOnly=f.panels.bag();assert.doesNotMatch(f.html(),/data-action="use:/);f.action('back');await readOnly;
  f.host();const before=structuredClone(f.state),bag=f.panels.bag();void bag.catch(()=>{});
  f.action('use:ITEM_POTION');await tick();f.dom.key('Escape');await tick();assert.match(f.html(),/Your Bag/);assert.deepEqual(f.state,before);assert.equal(f.saves,0);
  f.action('use:ITEM_POTION');await tick();f.choose('party:0');await tick();f.dom.key('KeyB');await tick();assert.match(f.html(),/Your Bag/);assert.deepEqual(f.state,before);
  const stale=f.button('data-action','use:ITEM_POTION').onclick!,rejected=assert.rejects(bag,{name:'AbortError'});f.state.bag={ITEM_POTION:3};f.action('use:ITEM_POTION');await rejected;assert.equal(f.calls,2);stale();await tick();assert.equal(f.calls,2);assert.equal(f.state.bag.ITEM_POTION,3);assert.equal(f.saves,0);
 }finally{f.restore();}
});

test('late acknowledgement replacement or abort rolls medicine and teaching back through actual SourceActionRecovery',async()=>{
 for(const item of['ITEM_POTION','ITEM_TM10']){const f=fixture(item);try{
  const before=structuredClone(f.state),pending=f.recovery.run(f.use),rejected=assert.rejects(pending,{name:'AbortError'});f.choose('party:0');await tick();f.option(0);await tick();assert.notDeepEqual(f.state,before);assert.equal(f.recovery.busy,true);
  if(item==='ITEM_POTION'){const replacement=f.ui.choose('Recovery',['Keep']);await rejected;assert.match(f.html(),/Recovery/);f.option(0);await replacement;}else{f.controller.abort(new DOMException('Field left','AbortError'));await rejected;}
  assert.deepEqual(f.state,before);assert.equal(f.restores,1);assert.equal(f.recovery.busy,false);assert.equal(f.saves,0);
 }finally{f.restore();}}
});

test('healthy medicine and unsupported native dependencies remain distinct without consumption or claimed success',async()=>{
 for(const[item,status]of[['ITEM_POTION','no-effect'],['ITEM_RARE_CANDY','unsupported'],['ITEM_ENERGY_ROOT','unsupported'],['ITEM_BICYCLE','unsupported']]as const){const f=fixture(item);try{
  if(item==='ITEM_POTION')f.state.party[0].hp=f.state.party[0].maxHP;const before=structuredClone(f.state),pending=f.use();if(item!=='ITEM_BICYCLE'){f.choose('party:0');await tick();}
  assert.match(f.html(),status==='unsupported'?/Field use unavailable/:/No effect/);assert.doesNotMatch(f.html(),/learned|was used/);f.option(0);const result=await pending;assert.equal(result.status,status);if(result.status==='unsupported')assert.ok(result.requirements.length);assert.deepEqual(f.state,before);
 }finally{f.restore();}}
});

test('Egg and Bad Egg rows hide species, nickname, level, HP and moves and cannot be selected',async()=>{
 const f=fixture('ITEM_HM01');try{
  f.state.party=[{...f.state.party[0],isEgg:true,name:'Hidden Togepi',species:175,hp:0},{...f.state.party[0],checksumFailed:true,name:'Hidden Bad Egg',species:493}as any];
  const before=structuredClone(f.state),pending=f.use();assert.doesNotMatch(f.html(),/Hidden|175|493|HP|Lv\.|Tackle/);assert.match(f.html(),/>Egg</);const button=f.button('data-bag-choice','party:0');assert.equal(button.disabled,true);button.onclick!();await tick();assert.match(f.html(),/Choose a Pokémon/);f.dom.key('Escape');assert.deepEqual(await pending,{status:'cancelled'});assert.deepEqual(f.state,before);
 }finally{f.restore();}
});

test('full TM sets protect HMs, cancel inertly and confirm replacement with native base PP and exact affinity',async()=>{
 const f=fixture('ITEM_TM10');try{
  const mon=f.state.party[0];mon.moves=[move(15,0),move(33,4,56),move(39),move(98)];const before=structuredClone(f.state),expected=prepareTMHMTeaching(data,native,f.state,0,'ITEM_TM10',1);assert.equal(expected.status,'ready');
  const cancel=f.use();f.choose('party:0');await tick();f.option(0);await tick();const hm=f.button('data-bag-choice','move:0');assert.equal(hm.disabled,true);assert.match(f.html(),/HM — cannot forget/);hm.onclick!();await tick();assert.match(f.html(),/Forget which move/);f.choose('cancel');assert.deepEqual(await cancel,{status:'cancelled'});assert.deepEqual(f.state,before);
  const pending=f.use();f.choose('party:0');await tick();f.option(0);await tick();f.choose('move:1');await tick();assert.match(f.html(),/Forget Tackle/);f.option(0);await tick();assert.equal(f.state.bag.ITEM_TM10,1);assert.equal(mon.moves[0].id,15);assert.equal(mon.moves[0].pp,0);assert.deepEqual(mon.moves[1],move(237));if(expected.status==='ready'){assert.equal(mon.friendship,expected.after.friendship);assert.equal((mon as any).mood,expected.after.mood);assert.deepEqual(mon.moves,expected.after.moves);}f.option(0);assert.deepEqual(await pending,{status:'used',kind:'teaching',partyIndex:0});
 }finally{f.restore();}
});

test('HM teaching is reusable on fainted zero-PP Pokémon while known and incompatible attempts stay unchanged',async()=>{
 const f=fixture('ITEM_HM01',1);try{
  const mon=f.state.party[0];mon.hp=0;mon.moves=[move(33,0)];let pending=f.use();f.choose('party:0');await tick();assert.match(f.html(),/HM will stay/);f.option(0);await tick();f.option(0);assert.equal((await pending).status,'used');assert.equal(f.state.bag.ITEM_HM01,1);assert.equal(mon.hp,0);assert.deepEqual(mon.moves,[move(33,0),move(15)]);
  let before=structuredClone(f.state);pending=f.use();f.choose('party:0');await tick();assert.match(f.html(),/already knows Cut/);f.option(0);assert.equal((await pending).status,'no-effect');assert.deepEqual(f.state,before);
  f.state.party=[createMon(data,175,10,'Case',()=>.5)];before=structuredClone(f.state);pending=f.use();f.choose('party:0');await tick();assert.match(f.html(),/cannot learn Cut/);f.option(0);assert.equal((await pending).status,'no-effect');assert.deepEqual(f.state,before);
 }finally{f.restore();}
});

test('PP move selection cancels without consumption and restores only the chosen move with boosted capacity intact',async()=>{
 const f=fixture('ITEM_MAX_ETHER',1);try{
  f.state.party[0].moves=[move(33,2,56),move(39),move(98,0)];const before=structuredClone(f.state),noEffect=f.use();f.choose('party:0');await tick();assert.equal(f.button('data-bag-choice','move:1').disabled,false);assert.match(f.html(),/PP full/);f.choose('move:1');await tick();assert.match(f.html(),/No effect/);f.option(0);assert.deepEqual(await noEffect,{status:'no-effect'});assert.deepEqual(f.state,before);
  const cancel=f.use();f.choose('party:0');await tick();f.dom.key('Escape');assert.deepEqual(await cancel,{status:'cancelled'});assert.deepEqual(f.state,before);
  const pending=f.use();f.choose('party:0');await tick();f.choose('move:0');await tick();assert.match(f.html(),/2 → 56/);f.option(0);await tick();assert.deepEqual(f.state.party[0].moves,[move(33,56,56),move(39),move(98,0)]);assert.deepEqual(f.state.bag,{});f.option(0);assert.equal((await pending).status,'used');
 }finally{f.restore();}
});

test('changed State, party, bag or map and abort invalidate awaited confirmation; adventure clock ticks do not',async()=>{
 for(const change of['state','party','bag','map','abort','clock']as const){const f=fixture('ITEM_TM10');try{
  const pending=f.use();void pending.catch(()=>{});f.choose('party:0');await tick();if(change==='state')f.live=structuredClone(f.state);if(change==='party')f.state.party=[...f.state.party];if(change==='bag')f.state.bag.ITEM_POTION=1;if(change==='map')f.state.x++;if(change==='clock')f.state.playSeconds++;if(change==='abort')f.controller.abort(new DOMException('Stopped','AbortError'));
  const before=structuredClone(f.state);if(change!=='abort')f.option(0);if(change==='clock'){await tick();f.option(0);assert.equal((await pending).status,'used');assert.equal(f.state.playSeconds,1);}else{await assert.rejects(pending,{name:'AbortError'});assert.deepEqual(f.state,before);assert.equal(f.state.bag.ITEM_TM10,2);assert.equal(f.state.party[0].moves.length,1);}
 }finally{f.restore();}}
});

test('a resolved prompt replaced before its continuation cannot dispatch Bag use, steal the next panel or commit an acknowledgement',async()=>{
 for(const{phase,delay}of [{phase:'bag',delay:0},...Array.from({length:6},(_,delay)=>({phase:'target',delay})),{phase:'ack',delay:0}]){const f=fixture();try{
  f.host();const before=structuredClone(f.state),pending=phase==='bag'?f.panels.bag():f.recovery.run(f.use);void pending.catch(()=>{});
  if(phase==='bag')f.action('use:ITEM_POTION');
  else{f.choose('party:0');if(phase==='ack'){await tick();f.option(0);await tick();assert.equal(f.state.bag.ITEM_POTION,1);f.option(0);}}
  // The old operation has synchronously resolved, but its await continuation
  // has not run. This replacement must remain the live owner afterwards.
  let replacement:Promise<number>|undefined;const replace=()=>{replacement=f.ui.choose('Keep this replacement',['Keep']);void replacement.catch(()=>{});};
  if(delay===0)replace();else{let queue=Promise.resolve();for(let i=0;i<delay;i++)queue=queue.then(()=>{});void queue.then(replace);}
  await tick();assert.match(f.html(),/Keep this replacement/,`${phase} delay ${delay}`);
  await assert.rejects(pending,{name:'AbortError'});assert.deepEqual(f.state,before);assert.equal(f.saves,0);if(phase==='bag')assert.equal(f.calls,0);else assert.equal(f.restores,1);f.option(0);await replacement;
 }finally{f.restore();}}
});
