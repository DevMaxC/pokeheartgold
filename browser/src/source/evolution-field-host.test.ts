import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData,newState,createMon} from './data.ts';
import {loadNativeEvolutionData} from './evolution-native.ts';
import {loadNativeFieldMoveData} from './field-moves.ts';
import {EvolutionFieldHost} from './evolution-field-host.ts';
import {NativeFieldClock} from './native-field-clock.ts';
import {UI} from './ui.ts';
import {installUIDOM} from './ui-test-dom.ts';
import {viewFixture} from './evolution-test-fixtures.ts';
import type {EvolutionAudioSession} from './evolution-presentation.ts';
import type {BattleEvolutionCompletion} from './battle-evolution-types.ts';

globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData(),native=await loadNativeEvolutionData(data),fieldMoves=await loadNativeFieldMoveData(),messages=JSON.parse(await readFile(new URL('../../public/source/messages/197.json',import.meta.url),'utf8'));
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
function fixture(){
 const d=installUIDOM(),f=viewFixture(),life=new AbortController(),ui=new UI(),state=newState(data,'Gold','boy',()=>.5);state.map=f.field.map;state.party=[{...createMon(data,155,14,'Gold',()=>.5),form:0,hasNickname:false}];
 const errors:unknown[]=[],events:unknown[]=[],keys=new EventTarget();let enabled=false,prepare:Promise<void>|undefined,cry=0,fanfare=0;
 const clock=new NativeFieldClock({field:()=>({map:state.map,mapRunning:false}),onError:error=>errors.push(error)});
 const audio:EvolutionAudioSession={async prepare(){events.push('prepare');await prepare;},bgm(id){events.push(['bgm',id]);},stopBGM(id){events.push(['stop',id]);},cry(species,form){events.push(['cry',species,form]);cry=clock.tick+2;},cryPlaying:()=>clock.tick<cry,se(id){events.push(['se',id]);},anySEPlaying:()=>false,fanfare(id){events.push(['fanfare',id]);fanfare=clock.tick+3;},fanfarePlaying:()=>clock.tick<fanfare,cancel(){events.push('cancel');},async restore(){events.push('release');}};
 let output:(()=>unknown)|undefined;
 const host=new EvolutionFieldHost({data,native,fieldMoves,messages,state:()=>state,field:()=>f.field,world:f.world,clock,lifetime:life.signal,ui,enabled:()=>enabled,sharedOutput:()=>{throw Error('No Context is unlocked in this CPU-only fixture');},textDelay:()=>0,hour:()=>12,audio:{open(_scene,borrowed){output=borrowed;events.push('borrow');return audio;}},retainRestore:()=>{throw Error('Unexpected retained cleanup');},prepareMenu:async()=>{throw Error('PLAYER4 is not admitted in this starter fixture');},menuSE:()=>{throw Error('PLAYER4 is not admitted in this starter fixture');},cancelMenuOwner:()=>{},keyboard:keys,controls:d.ids.get('game')as unknown as HTMLElement,view:f.view});
 const completion:BattleEvolutionCompletion={serial:1,result:'won',levelUpMask:1,party:[...state.party],isCurrent:()=>true};
 async function tick(){clock.frame(1/30);await clock.settled();f.view.update(1/30);await flush();}
 async function drive<T>(work:Promise<T>,before?:(tick:number)=>void){let done=false,result:T|undefined,failure:unknown;void work.then(value=>{result=value;done=true;},error=>{failure=error;done=true;});for(let n=0;n<1500&&!done;n++){before?.(n);ui.advance();await tick();}assert.equal(done,true,'owned actual scene completes through admitted field ticks');if(failure!==undefined)throw failure;return result!;}
 function key(code:string,type='keydown',repeat=false){const event=new Event(type,{cancelable:true});Object.assign(event,{code,repeat});keys.dispatchEvent(event);return event;}
 return{...f,d,state,life,clock,ui,host,completion,events,errors,key,tick,drive,get output(){return output;},setEnabled(value:boolean){enabled=value;},setPrepare(value:Promise<void>){prepare=value;},dispose(){host.dispose();life.abort();clock.dispose();d.restore();}};
}

test('persistent actual queue, UI printer and native clock evolve Cyndaquil without a field-running scope or audio unlock',async()=>{
 const f=fixture();try{const original=f.state.party[0],party=f.state.party,moves=original.moves;const summary=await f.drive(f.host.run(f.completion));assert.deepEqual(summary,{evolved:[0],cancelled:[],ineligible:[]});assert.equal(original.species,156);assert.equal(f.state.party,party);assert.equal(f.state.party[0],original);assert.equal(original.moves,moves);assert.ok(f.state.caught.includes(156));assert.equal(f.host.queue.pending(f.completion),0);assert.equal(f.host.active,false);assert.equal(f.world.fieldEffect,null);assert.equal(f.actors[0].visible,true);assert.equal(f.ui.busy,false);assert.equal(f.output!(),null);assert.deepEqual(f.events.filter(row=>Array.isArray(row)&&row[0]==='cry'),[['cry',155,0],['cry',156,0]]);assert.deepEqual(f.errors,[]);assert.ok(f.clock.tick>250);await f.host.run(f.completion);assert.equal(f.events.filter(row=>row==='borrow').length,1,'same completion cannot evolve twice');}finally{f.dispose();}
});

test('B only cancels in OSCILLATE; an earlier held key is discarded, a quick new edge is retained',async()=>{
 for(const earlierHeld of[false,true]){const f=fixture();try{const original=structuredClone(f.state.party[0]);let pressed=false,released=false;if(earlierHeld)f.key('KeyB');
  const result=await f.drive(f.host.run(f.completion),()=>{if(f.host.phase==='oscillate'&&!pressed){if(earlierHeld){f.key('KeyB','keydown',true);pressed=true;}else{f.key('KeyB');f.key('KeyB','keyup');pressed=true;}}else if(earlierHeld&&pressed&&!released&&f.host.phase==='oscillate'){f.key('KeyB','keyup');f.key('KeyB');released=true;}});
  assert.deepEqual(result.cancelled,[0]);assert.deepEqual(f.state.party[0],original);assert.equal(f.host.queue.pending(f.completion),0);assert.equal(f.state.caught.includes(156),false);assert.equal(f.events.some(row=>Array.isArray(row)&&row[0]==='fanfare'),false);assert.equal(f.ui.busy,false);
 }finally{f.dispose();}}
});

test('field owner abort during delayed preparation cancels before any view/commit; ignored late readiness cannot revive it',async()=>{
 const f=fixture();let release!:()=>void;try{f.setPrepare(new Promise<void>(resolve=>release=resolve));const before=structuredClone(f.state),work=f.host.run(f.completion),rejected=assert.rejects(work,/room changed/);await flush();assert.equal(f.host.active,true);f.host.cancel(Error('room changed'));await rejected;assert.deepEqual(f.state,before);assert.equal(f.host.queue.pending(f.completion),1);assert.equal(f.view.active,false);assert.equal(f.world.fieldEffect,null);release();await f.tick();assert.deepEqual(f.events,['borrow','prepare','cancel','release']);assert.equal(f.ui.busy,false);}finally{f.dispose();}
});

test('fatal clock failure rejects live scene waits and drains borrowed ownership before rollback can hydrate',async()=>{
 const f=fixture();try{const before=structuredClone(f.state),work=f.host.run(f.completion),rejected=assert.rejects(work,/clock failed/);for(let i=0;i<10&&!f.view.active;i++)await f.tick();assert.equal(f.view.active,true);const fatal=f.clock.onAfterTasks(()=>{throw Error('clock failed');},f.life.signal);await f.tick();await rejected;fatal();assert.deepEqual(f.state,before);assert.equal(f.host.active,false);assert.equal(f.view.active,false);assert.equal(f.ui.busy,false);assert.equal(f.events.at(-1),'release');assert.equal(f.host.queue.pending(f.completion),1);}finally{f.dispose();}
});

test('construction requires actual idle clock admission; waiting settled then constructing is valid',async()=>{
 const f=fixture();try{let observed=false;const remove=f.clock.onAfterTasks(()=>{observed=true;assert.throws(()=>new EvolutionFieldHost((f.host as any).ports),/registration during task execution/);},f.life.signal);await f.tick();remove();assert.equal(observed,true);assert.equal(f.errors.length,0);await f.clock.settled();const second=new EvolutionFieldHost({...((f.host as any).ports),keyboard:undefined});second.dispose();}finally{f.dispose();}
});


test('mobile cancel is visible only in the actual window and owned Enter/Space click cannot double-cancel or outlive cleanup',async()=>{
 const f=fixture();try{const before=structuredClone(f.state.party[0]),work=f.host.run(f.completion);await flush();const button=f.d.ids.get('game')!.querySelector<any>('button[aria-label="Stop evolving"]');assert.ok(button);const stale=button.onclick;assert.equal(button.hidden,true);stale();assert.match(button.getAttribute('style')!,/min-height:44px/);assert.match(button.getAttribute('style')!,/var\(--safe-top/);
  let clicked=false;const result=await f.drive(work,()=>{if(f.host.phase==='oscillate'&&!button.hidden&&!clicked){clicked=true;button.focus();const key=f.d.key('Enter');assert.equal(key.defaultPrevented,false,'native default activation survives the retained source dialogue');button.click();button.click();}});assert.deepEqual(result.cancelled,[0]);assert.equal(clicked,true);assert.deepEqual(f.state.party[0],before);assert.equal(button.onclick,null);assert.equal(button.isConnected,false);assert.equal(f.d.document.activeElement,f.d.ids.get('original-world'));
  const recovery=f.ui.message('New field dialogue');stale();assert.equal(f.d.key('Enter',{target:button}).defaultPrevented,true,'stale native action no longer bypasses dialogue ownership');await recovery;assert.equal(f.state.party[0].species,155);
 }finally{f.dispose();}
});


test('fatal clock permanently closes host; a later eligible completion rejects before borrowing or waiting',async()=>{
 const f=fixture();try{const before=structuredClone(f.state);f.clock.onAfterTasks(()=>{throw Error('permanent clock failure');},f.life.signal);await f.tick();assert.throws(()=>f.host.run(f.completion),/disposed/);assert.deepEqual(f.events,[]);assert.deepEqual(f.state,before);assert.equal(f.host.active,false);assert.equal(f.view.active,false);assert.equal(f.ui.busy,false);}finally{f.dispose();}
});
