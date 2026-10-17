import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setImmediate as task} from 'node:timers/promises';
import {NativeFieldClock,nativeFieldTaskBoundary} from './native-field-clock.ts';

function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes;});return{promise,resolve};}
const owner=()=>new AbortController();
const field=()=>({map:34,mapRunning:true});
const advance=async(clock:NativeFieldClock,dt=1/30)=>{clock.frame(dt);await clock.settled();};

test('literal field dispatcher runs TaskManager before main SysTask queue, independent of UI/VM busy state',async()=>{
 const source=async(file:string)=>readFile(new URL('../../../'+file,import.meta.url),'utf8');const main=await source('src/main.c'),field=await source('src/field_system.c'),tasks=await source('src/task.c'),sys=await source('src/sys_task.c'),models=await source('src/field/field_3d_object_task.c');
 assert.ok(main.indexOf('Main_RunOverlayManager();')<main.indexOf('SysTaskQueue_RunTasks(gSystem.mainTaskQueue)'));
 const body=field.slice(field.indexOf('static BOOL FieldSystem_Main(FieldSystem *fieldSystem) {'));assert.ok(body.indexOf('FieldSystem_RunTaskFrame')<body.indexOf('ppOverlayManager_RunFrame_DeleteIfFinished'));
 assert.match(tasks,/while \(fieldSystem->taskman->func\(fieldSystem->taskman\) == TRUE\)[^]*?fieldSystem->taskman = prevTask;/);
 assert.match(sys,/else \{\s*ret->runNow = FALSE;\s*\}/);assert.match(field,/BOOL FieldSystem_IsFieldMapRunning[^]*?processManager->parent != NULL && fieldSystem->runningFieldMap/);assert.match(models,/Task_Field3dObject_Update[^]*?FieldSystem_IsFieldMapRunning/);
});

test('persistent30Hz script→task phase admits same-dispatch tasks without overlap or catch-up bursts',async()=>{
 const gate=deferred<void>(),events:string[]=[],controller=owner(),clock=new NativeFieldClock({field,onError:reason=>{throw reason;},boundary:()=>gate.promise}),scope=clock.createScope(34,controller.signal);
 scope.onTick(()=>events.push('queue'));const waiting=scope.waitFrames(1).then(()=>{events.push('script');});clock.frame(1/30);await task();assert.deepEqual(events,['script']);assert.equal(clock.phase,'scripts');clock.frame(10);assert.equal(clock.tick,1);
 gate.resolve();await clock.settled();await waiting;assert.deepEqual(events,['script','queue']);await advance(clock,10);assert.equal(clock.tick,2);assert.equal(clock.phase,'idle');clock.dispose();
});

test('actual task boundary drains runnable source awaits and preserves field running flags for task admission',async()=>{
 let running=true;const events:string[]=[],clock=new NativeFieldClock({field:()=>({map:34,mapRunning:running}),onError:reason=>{throw reason;}}),scope=clock.createScope(34,owner().signal);
 const dispatched=scope.dispatch(async()=>{events.push('dispatch');await Promise.resolve();await Promise.resolve();events.push('continued');scope.onTick(frame=>events.push(frame.mapRunning?'model':'paused'));});await advance(clock);await dispatched;assert.deepEqual(events,['dispatch','continued','model']);running=false;await advance(clock);assert.equal(events.at(-1),'paused');clock.dispose();
});

test('scope failure cancels only its action; static and other controller queues retain global tick phase',async()=>{
 const errors:unknown[]=[],clock=new NativeFieldClock({field,onError:reason=>errors.push(reason)}),a=clock.createScope(34,owner().signal),b=clock.createScope(34,owner().signal),events:string[]=[];
 a.onTick(()=>{throw Error('owned task failed');});b.onTick(()=>events.push('other'));const wa=assert.rejects(a.waitFrames(2),/owned task failed/),wb=b.waitFrames(2).then(()=>events.push('completed'));
 await advance(clock);assert.equal(a.active,false);assert.equal(b.active,true);await advance(clock);await Promise.all([wa,wb]);assert.deepEqual(events,['other','completed','other']);assert.equal(errors.length,1);const c=clock.createScope(34,owner().signal);assert.equal(c.tick,2);clock.dispose();
});

test('scope cancellation rejects started dispatch and explicit-signal waits, never claiming underlying work drained',async()=>{
 const clock=new NativeFieldClock({field,onError:reason=>{throw reason;}}),scope=clock.createScope(34,owner().signal),external=owner(),underlying=deferred<void>();let finallyDrained=false;
 const active=scope.dispatch(async()=>{try{await underlying.promise;}finally{finallyDrained=true;}},external.signal),rejected=assert.rejects(active,/owner left/),waiting=assert.rejects(scope.waitFrames(20,external.signal),/owner left/);
 await advance(clock);scope.cancel(Error('owner left'));await Promise.all([rejected,waiting]);assert.equal(finallyDrained,false,'caller still owns draining non-cooperative source work');assert.equal(external.signal.aborted,false);underlying.resolve();await task();assert.equal(finallyDrained,true);clock.dispose();
});

test('one driver owns World slot across maps, while transition cancel removes scopes rather than resetting time',async()=>{
 let map=34;const world:{fieldTasks:NativeFieldClock|null}={fieldTasks:null},clock=new NativeFieldClock({field:()=>({map,mapRunning:true}),onError:reason=>{throw reason;}});clock.attach(world);const other=new NativeFieldClock({field,onError(){}});assert.throws(()=>other.attach(world),/already installed/);
 const a=clock.createScope(34,owner().signal),waiting=assert.rejects(a.waitFrames(4),/transition/);await advance(clock);clock.cancel(Error('transition'));await waiting;map=35;const b=clock.createScope(35,owner().signal);await advance(clock);assert.equal(b.tick,2);assert.equal(world.fieldTasks,clock);clock.dispose();assert.equal(world.fieldTasks,null);other.dispose();
});

test('task callbacks observe stable ownership: removals skip only removed callback, new task-phase registration is rejected',async()=>{
 const events:string[]=[],clock=new NativeFieldClock({field,onError:reason=>{throw reason;}}),scope=clock.createScope(34,owner().signal);let remove=()=>{};
 scope.onTick(()=>{events.push('first');remove();assert.throws(()=>scope.onTick(()=>{}),/registration during task/);});remove=scope.onTick(()=>events.push('removed'));scope.onTick(()=>events.push('last'));await advance(clock);assert.deepEqual(events,['first','last']);clock.dispose();
});

test('native task boundary cancellation releases ownership and map mismatch does not run stale callbacks',async()=>{
 const abort=owner(),boundary=nativeFieldTaskBoundary(abort.signal),rejected=assert.rejects(boundary,/aborted before task/);abort.abort(Error('aborted before task'));await rejected;
 let map=34,called=false;const clock=new NativeFieldClock({field:()=>({map,mapRunning:true}),onError:reason=>{throw reason;}}),scope=clock.createScope(34,owner().signal);scope.onTick(()=>{called=true;});map=35;await advance(clock);assert.equal(called,false);assert.equal(scope.active,false);clock.dispose();
});


test('one queue callback changing field admission cannot run stale callbacks from another map scope',async()=>{
 let map=34,running=true;const events:string[]=[],clock=new NativeFieldClock({field:()=>({map,mapRunning:running}),onError:reason=>{throw reason;}}),a=clock.createScope(34,owner().signal),b=clock.createScope(34,owner().signal);a.onTick(()=>{events.push('transition');map=35;running=false;});b.onTick(()=>events.push('stale'));await advance(clock);assert.deepEqual(events,['transition']);assert.equal(b.active,false);clock.dispose();
});
