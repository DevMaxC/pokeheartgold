import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NativeFieldClock,type NativeFieldFrame} from './native-field-clock.ts';
import {createNativeFieldMusicPlayer} from './field-music.ts';
import {NativeSEPlayer3,type NativeAzaleaAudioResources} from '../../reviews/native-sound-phase/frozen-azalea-dependency/gym-azalea-audio.ts';
const fixture=new URL('../../reviews/native-sound-phase/frozen-azalea-dependency/',import.meta.url);
const resources=JSON.parse(await readFile(new URL('resources.json',fixture),'utf8'))as NativeAzaleaAudioResources;
const owner=()=>new AbortController(),field=()=>({map:180,mapRunning:true});
const advance=async(clock:NativeFieldClock,dt=1/30)=>{clock.frame(dt);await clock.settled();};
function deferred<T=void>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes;});return{promise,resolve};}
function voice(){const done=deferred();let stopped=0;return{ended:done.promise,stop(){stopped++;done.resolve();},get stopped(){return stopped;}};}
function music(){let created=0;const player=createNativeFieldMusicPlayer({enabled:true,volume:.5,createContext:()=>{created++;throw Error('No Context should be constructed');}});return{player,get created(){return created;}};}

test('literal normal-loop sound order and Comm_Update unconditional TRUE constrain the cadence claim',async()=>{
 const source=async(path:string)=>readFile(new URL('../../../'+path,import.meta.url),'utf8'),all=await source('src/main.c'),main=all.slice(all.indexOf('void NitroMain(void)'),all.indexOf('void Main_ResetOverlayManager(void)'));
 assert.ok(main.indexOf('Main_RunOverlayManager();')<main.indexOf('SysTaskQueue_RunTasks(gSystem.mainTaskQueue)'));
 assert.ok(main.indexOf('SysTaskQueue_RunTasks(gSystem.mainTaskQueue)')<main.indexOf('DoSoundUpdateFrame();'));
 assert.ok(main.indexOf('gSystem.vBlankIntr(gSystem.vBlankIntrArg)')<main.indexOf('DoSoundUpdateFrame();'));
 assert.equal(main.match(/DoSoundUpdateFrame\(\);/g)?.length,1);assert.equal(main.match(/OS_WaitIrq\(TRUE, OS_IE_VBLANK\);/g)?.length,2);assert.match(main,/if \(!gSystem.frameCounter\)/);
 const communication=await source('src/communication_core.c'),comm=communication.slice(communication.indexOf('BOOL Comm_Update(void)'),communication.indexOf('void Comm_ResetWork(void)'));assert.deepEqual(comm.match(/\breturn[^;]+;/g),['return TRUE;']);
 assert.match(await source('src/system.c'),/void VBlankCB_DmaTasksFramecounter\(void\) \{[^]*?gSystem.frameCounter\+\+;/);assert.match(await source('src/sound.c'),/void DoSoundUpdateFrame\(void\)[^]*?NNS_SndMain\(\);/);
});

test('reviewed native registry dependency remains byte-pinned and test-only',async()=>{
 const m=JSON.parse(await readFile(new URL('manifest.json',fixture),'utf8'));assert.equal(m.runtimeCommit,'e9d894bc');for(const[name,hash]of Object.entries(m.files))assert.equal(createHash('sha256').update(await readFile(new URL(name,fixture))).digest('hex'),hash);
});

test('early onTick is a real negative control: task-completion fade misses that sound update',async()=>{
 const lifetime=owner(),p=new NativeSEPlayer3(resources,lifetime.signal),v=voice(),token={},clock=new NativeFieldClock({field,onError:reason=>{throw reason;}}),scope=clock.createScope(180,owner().signal),complete=deferred();p.play(2171,token,()=>v);
 scope.onTick(()=>p.soundUpdate());scope.onTick(()=>complete.resolve());const finalized=complete.promise.then(async()=>{await Promise.resolve();p.stopOwned(2171,token,1);});await advance(clock);await finalized;assert.equal(p.isPlaying(1561),true,'old order misses final StopSE(fade1)');assert.equal(v.stopped,0);clock.dispose();lifetime.abort();
});

test('post-task boundary drains completion jobs before exact native fade1 even when registered first',async()=>{
 const lifetime=owner(),p=new NativeSEPlayer3(resources,lifetime.signal),v=voice(),token={},clock=new NativeFieldClock({field,onError:reason=>{throw reason;}}),events:string[]=[],complete=deferred();p.play(2171,token,()=>v);
 clock.onAfterTasks(frame=>{events.push('sound:'+frame.tick);assert.equal(clock.phase,'after-tasks');assert.equal(p.isPlaying(1561),true);p.soundUpdate();},lifetime.signal);
 const scope=clock.createScope(180,owner().signal);scope.onTick(()=>{events.push('tasks');complete.resolve();});const finalized=complete.promise.then(async()=>{await Promise.resolve();await Promise.resolve();events.push('StopSE1');p.stopOwned(2171,token,1);});await advance(clock);await finalized;assert.deepEqual(events,['tasks','StopSE1','sound:1']);assert.equal(p.isPlaying(1561),false);assert.equal(v.stopped,1);clock.dispose();lifetime.abort();
});

test('zero field scopes and mapRunning=false still admit one global sound phase',async()=>{
 const lifetime=owner(),p=new NativeSEPlayer3(resources,lifetime.signal),v=voice(),token={},frames:NativeFieldFrame[]=[],clock=new NativeFieldClock({field:()=>({map:-1,mapRunning:false}),onError:reason=>{throw reason;}});p.play(2171,token,()=>v);p.stopOwned(2171,token,1);clock.onAfterTasks(frame=>{frames.push(frame);p.soundUpdate();},lifetime.signal);assert.equal(clock.waiting,0);await advance(clock);assert.deepEqual(frames,[{tick:1,map:-1,mapRunning:false}]);assert.equal(v.stopped,1);await advance(clock);assert.equal(frames.length,2);clock.dispose();lifetime.abort();
});

test('map cancel preserves global registry while retaining exact field rejection reasons',async()=>{
 const m=music(),p=new NativeSEPlayer3(resources,m.player.lifetimeSignal),token={},v=voice(),first=deferred(),second=deferred();let boundaries=0,map=180,calls=0;const clock=new NativeFieldClock({field:()=>({map,mapRunning:false}),onError:reason=>{throw reason;},boundary:()=>++boundaries===1?first.promise:second.promise});clock.onAfterTasks(()=>{calls++;p.soundUpdate();},m.player.lifetimeSignal);const scope=clock.createScope(180,owner().signal),why=Error('Connected field changed during native field tasks'),waiting=scope.waitFrames(3);p.play(2171,token,()=>v);clock.frame(1/30);clock.cancel(why);await assert.rejects(waiting,error=>error===why);assert.equal(scope.signal.reason,why);assert.equal(m.player.lifetimeSignal.aborted,false);assert.equal(p.isPlaying(1561),true);map=181;p.stopOwned(2171,token,1);first.resolve();await new Promise<void>(resolve=>setImmediate(resolve));second.resolve();await clock.settled();assert.equal(calls,1);assert.equal(v.stopped,1);await advance(clock);assert.equal(calls,2);assert.equal(m.created,0);clock.dispose();await m.player.dispose();
});

test('local controller failure leaves the global phase alive',async()=>{
 const errors:unknown[]=[],clock=new NativeFieldClock({field,onError:reason=>errors.push(reason)}),scope=clock.createScope(180,owner().signal),lifetime=owner();let calls=0;clock.onAfterTasks(()=>calls++,lifetime.signal);scope.onTick(()=>{throw Error('owned controller failure');});await advance(clock);assert.equal(scope.active,false);assert.equal(calls,1);await advance(clock);assert.equal(calls,2);assert.equal(errors.length,1);clock.dispose();
});

test('owner abort or final dispose at either boundary prevents late global writes',async()=>{
 for(const mode of['owner','clock']as const)for(const boundaryIndex of[1,2]){let count=0,calls=0;const gates=[deferred(),deferred()],entered=[deferred(),deferred()],lifetime=owner(),clock=new NativeFieldClock({field,onError:reason=>{throw reason;},boundary:()=>{const index=count++;entered[index].resolve();return gates[index].promise;}});clock.onAfterTasks(()=>calls++,lifetime.signal);clock.frame(1/30);await entered[0].promise;if(boundaryIndex===2){gates[0].resolve();await entered[1].promise;}if(mode==='owner')lifetime.abort(Error('audio lifetime ended'));else clock.dispose(Error('clock lifetime ended'));gates[boundaryIndex-1].resolve();await clock.settled();assert.equal(calls,0);clock.dispose();}
});

test('pre-unlock readonly player lifetime owns registry and hook without constructing a Context',async()=>{
 const m=music(),signal=m.player.lifetimeSignal;assert.equal(Object.getOwnPropertyDescriptor(m.player,'lifetimeSignal')?.set,undefined);assert.throws(()=>{(m.player as any).lifetimeSignal=new AbortController().signal;},TypeError);assert.equal(signal,m.player.lifetimeSignal);assert.equal(signal.aborted,false);assert.equal(m.created,0);
 const p=new NativeSEPlayer3(resources,signal),v=voice(),clock=new NativeFieldClock({field,onError:reason=>{throw reason;}});let calls=0;clock.onAfterTasks(()=>{calls++;p.soundUpdate();},signal);p.play(2171,{},()=>v);await advance(clock);assert.equal(calls,1);await m.player.dispose();assert.equal(signal.aborted,true);assert.equal(m.player.lifetimeSignal,signal);assert.equal(v.stopped,1);await advance(clock);assert.equal(calls,1);assert.throws(()=>p.isPlaying(1561));assert.equal(m.created,0);clock.dispose();
});

test('global phase has no overlap/catchup and task-phase registration is rejected',async()=>{
 const gates=[deferred(),deferred()];let boundary=0,calls=0;const lifetime=owner(),clock=new NativeFieldClock({field,onError:reason=>{throw reason;},boundary:()=>gates[Math.min(boundary++,1)].promise}),scope=clock.createScope(180,owner().signal);clock.onAfterTasks(()=>{calls++;assert.throws(()=>clock.onAfterTasks(()=>{},lifetime.signal),/registration during task/);assert.throws(()=>scope.onTick(()=>{}),/registration during task/);},lifetime.signal);scope.onTick(()=>assert.throws(()=>clock.onAfterTasks(()=>{},lifetime.signal),/registration during task/));clock.frame(1/30);gates[0].resolve();await new Promise<void>(resolve=>setImmediate(resolve));clock.frame(10);assert.equal(clock.tick,1);gates[1].resolve();await clock.settled();assert.equal(calls,1);await advance(clock);assert.equal(clock.tick,2);assert.equal(calls,2);clock.dispose();
});

test('fatal global error after map cancellation is observable and stops later hooks',async()=>{
 const errors:unknown[]=[],clock=new NativeFieldClock({field,onError:reason=>errors.push(reason)}),lifetime=owner(),bad=Error('Native sound update failed');let later=0;clock.onAfterTasks(()=>{clock.cancel(Error('map transition'));throw bad;},lifetime.signal);clock.onAfterTasks(()=>later++,lifetime.signal);const failed=assert.rejects(clock.failure,error=>error===bad);await advance(clock);await failed;assert.equal(later,0);assert.equal(errors[0],bad);clock.frame(1/30);assert.equal(clock.tick,1);assert.throws(()=>clock.onAfterTasks(()=>{},lifetime.signal),/disposed/);
});
