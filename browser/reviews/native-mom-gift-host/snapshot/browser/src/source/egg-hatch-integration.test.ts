import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData,newState,createMon} from './data.ts';
import {giveTogepiEgg} from './eggs.ts';
import {ScriptVM,type ScriptHooks} from './script.ts';
import {presentNativeEggHatch,type EggHatchHost} from './egg-hatch-presentation.ts';
import {sourceJSON,type SourceMap} from './types.ts';
globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData(),map=await sourceJSON<SourceMap>('maps/73.json'),now=()=>new Date(2026,9,17,12);
function fixture(){
 const state=newState(data,'Ethan','boy',()=>.5);state.map=map.id;state.nativeEggSeed=1;state.party=[createMon(data,155,5,state.name,()=>.5)];giveTogepiEgg(data,state,{now});state.party[1].friendship=0;
 const events:string[]=[];let signal!:AbortSignal;
 const host:EggHatchHost={now,view:next=>{signal=next;return{reveal:async()=>{events.push('reveal');},cry:async()=>{events.push('cry');},finish:async()=>{events.push('finish');},cancel:()=>{events.push('cancel');}};},
  music:{start:async cue=>{assert.equal(cue.id,1011);events.push('music');},fanfare:async cue=>{assert.equal(cue.id,1188);events.push('fanfare');},restore:async()=>{events.push('restore-music');}},
  message:async text=>{assert.equal(text,'TOGEPI hatched from the Egg!');events.push('text');return()=>{events.push('close-text');};},choose:async(text,options)=>{assert.ok(text.includes('newly hatched TOGEPI'));assert.deepEqual(options,['Yes','No']);events.push('choose');return 0;},nickname:async()=>{events.push('name');return'Pip';},resumeField:async()=>{assert.equal(state.party[1].name,'Pip');events.push('resume');}};
 return{state,host,events,signal:()=>signal};
}
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>resolve=done);return{promise,resolve};}
function untilAbort(signal:AbortSignal,started:()=>void){return new Promise<never>((_resolve,reject)=>{const abort=()=>{signal.removeEventListener('abort',abort);reject(signal.reason);};signal.addEventListener('abort',abort,{once:true});started();if(signal.aborted)abort();});}

test('the real standard2021 awaits its EggHatchAnim port and preserves the original Oh intro',async()=>{
 const {state}=fixture(),entered=deferred(),release=deferred(),messages:string[]=[];
 const hooks:ScriptHooks={message:async text=>{messages.push(text);},choice:async()=>0,move:async()=>{},position:()=>{},face:()=>{},visible:()=>{},chooseStarter:async()=>{},nickname:async()=>{},refresh:async()=>{},battle:async()=>false,warp:async()=>{},eggHatchAnim:async()=>{entered.resolve();await release.promise;}};
 const vm=new ScriptVM(data,state,hooks);let settled=false;const pending=vm.run(map,data.constants.std_hatch_egg).then(()=>{settled=true;});await entered.promise;
 assert.equal(vm.busy,true);assert.equal(settled,false);assert.ok(messages.some(text=>text.includes('Oh?')));release.resolve();await pending;assert.equal(vm.busy,false);assert.equal(vm.lastUnsupported,null);
});

test('the real standard2021 propagates a failed awaited hatch instead of finishing its script',async()=>{
 const {state}=fixture(),failure=new Error('view interrupted'),hooks:ScriptHooks={message:async()=>{},choice:async()=>0,move:async()=>{},position:()=>{},face:()=>{},visible:()=>{},chooseStarter:async()=>{},nickname:async()=>{},refresh:async()=>{},battle:async()=>false,warp:async()=>{},eggHatchAnim:async()=>{throw failure;}};
 const vm=new ScriptVM(data,state,hooks);await assert.rejects(vm.run(map,data.constants.std_hatch_egg),error=>error===failure);assert.equal(vm.busy,false);assert.equal(state.party[1].isEgg,true);
});

test('the host reveals in3D, joins original cry and text, then names and restores the field before completion',async()=>{
 const {state,host,events,signal}=fixture(),cry=deferred(),printed=deferred();
 const originalView=host.view;host.view=abort=>{const view=originalView(abort);view.cry=async()=>{events.push('cry');await cry.promise;events.push('cry-done');};return view;};host.message=async()=>{events.push('text');printed.resolve();return()=>{events.push('close-text');};};
 const pending=presentNativeEggHatch(data,state,map,host);await printed.promise;assert.deepEqual(events,['music','reveal','cry','text']);assert.deepEqual(state.caught,[]);cry.resolve();await pending;
 assert.deepEqual(events,['music','reveal','cry','text','cry-done','fanfare','close-text','choose','name','finish','restore-music','resume','cancel']);assert.equal(signal().aborted,true);assert.equal(state.party[1].isEgg,false);assert.equal(state.party[1].name,'Pip');assert.deepEqual(state.caught,[175]);
});

test('a failed cry aborts and drains pending text before lifecycle rollback and field music cleanup',async()=>{
 const {state,host,events}=fixture(),before=structuredClone(state),printed=deferred(),failure=new Error('cry failed');
 const originalView=host.view;host.view=abort=>{const view=originalView(abort);view.cry=async()=>{await printed.promise;throw failure;};return view;};host.message=async(_text,signal)=>untilAbort(signal,printed.resolve);
 await assert.rejects(presentNativeEggHatch(data,state,map,host),error=>error===failure);assert.deepEqual(state,before);assert.equal(events.filter(event=>event==='restore-music').length,1);assert.ok(!events.includes('choose'));assert.ok(!events.includes('resume'));
});

test('native fanfare starts after the cry while a slow printer can still be running without a confirm click',async()=>{
 const {state,host,events}=fixture(),printer=deferred(),fanfare=deferred();
 host.message=async()=>{events.push('printing');await printer.promise;events.push('printed');return()=>{events.push('close-text');};};
 host.music.fanfare=async()=>{events.push('fanfare');fanfare.resolve();};
 const pending=presentNativeEggHatch(data,state,map,host);await fanfare.promise;assert.ok(events.includes('printing'));assert.ok(!events.includes('printed'));assert.ok(!events.includes('choose'));printer.resolve();await pending;assert.ok(events.indexOf('fanfare')<events.indexOf('printed'));assert.ok(events.indexOf('printed')<events.indexOf('choose'));
});

test('failed announcement text aborts and drains its pending cry before lifecycle rollback',async()=>{
 const {state,host,events}=fixture(),before=structuredClone(state),started=deferred(),failure=new Error('text failed');
 const originalView=host.view;host.view=abort=>{const view=originalView(abort);view.cry=async()=>untilAbort(abort,started.resolve);return view;};host.message=async()=>{await started.promise;throw failure;};
 await assert.rejects(presentNativeEggHatch(data,state,map,host),error=>error===failure);assert.deepEqual(state,before);assert.equal(events.filter(event=>event==='restore-music').length,1);assert.ok(!events.includes('name'));
});

test('a failed cry cannot release the source lifecycle before its aborted printer has finished cleanup',async()=>{
 const {state,host}=fixture(),before=structuredClone(state),printed=deferred(),aborted=deferred(),cleanup=deferred(),failure=new Error('cry failed during print');let settled=false;
 const originalView=host.view;host.view=signal=>{const view=originalView(signal);view.cry=async()=>{await printed.promise;throw failure;};return view;};
 host.message=async(_text,signal)=>new Promise<never>((_resolve,reject)=>{signal.addEventListener('abort',()=>{aborted.resolve();void cleanup.promise.then(()=>reject(signal.reason));},{once:true});printed.resolve();});
 const pending=presentNativeEggHatch(data,state,map,host).finally(()=>{settled=true;}),rejected=assert.rejects(pending,error=>error===failure);await aborted.promise;await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(settled,false);assert.equal(state.party[1].isEgg,false);cleanup.resolve();await rejected;assert.deepEqual(state,before);
});

test('a rejected or unresolved nickname decision cannot commit memo, Dex or field control',async()=>{
 for(const answer of['throw','invalid']){const {state,host,events}=fixture(),before=structuredClone(state);host.choose=async()=>{if(answer==='throw')throw Error('choice interrupted');return 2;};await assert.rejects(presentNativeEggHatch(data,state,map,host),/choice interrupted|not resolved/);assert.deepEqual(state,before);assert.ok(!events.includes('resume'));assert.equal(events.filter(event=>event==='restore-music').length,1);}
});

test('failed coherent field resume rolls back the already named mon and Dex while releasing presentation resources',async()=>{
 const {state,host,events}=fixture(),before=structuredClone(state);host.resumeField=async()=>{throw Error('field restore failed');};await assert.rejects(presentNativeEggHatch(data,state,map,host),/field restore failed/);assert.deepEqual(state,before);assert.ok(events.includes('finish'));assert.equal(events.filter(event=>event==='restore-music').length,1);assert.ok(events.includes('cancel'));
});
