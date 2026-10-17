export type NativeFieldPhase='idle'|'scripts'|'tasks'|'after-tasks';
export type NativeFieldFrame={tick:number;map:number;mapRunning:boolean};
export type NativeFieldTaskScope={
 readonly map:number;readonly signal:AbortSignal;readonly active:boolean;readonly tick:number;readonly phase:NativeFieldPhase;
 waitFrames:(frames:number,signal?:AbortSignal)=>Promise<void>;
 dispatch:<T>(action:()=>Promise<T>,signal?:AbortSignal)=>Promise<T>;
 onTick:(callback:(frame:NativeFieldFrame)=>void)=>()=>void;
 cancel:(reason?:unknown)=>void;
};
type AfterTasks={callback:(frame:NativeFieldFrame)=>void;signal:AbortSignal;remove:()=>void};
type Wait={at:number;resolve:()=>void;reject:(reason:unknown)=>void;detach:()=>void};
type Dispatch={start:()=>void;reject:(reason:unknown)=>void;detach:()=>void};
type Scope={map:number;controller:AbortController;signal:AbortSignal;waits:Set<Wait>;dispatches:Set<Dispatch>;tasks:Set<(frame:NativeFieldFrame)=>void>;detach:()=>void;cancel:(reason?:unknown)=>void};
const cancelled=(reason?:unknown)=>reason??new DOMException('Native field task cancelled','AbortError');
const check=(signal:AbortSignal)=>{if(signal.aborted)throw cancelled(signal.reason);};
/** One actual host TASK boundary drains currently runnable Promise jobs. This
 * is not a chosen Promise-flush count, a frame timer or a second RAF. Pending
 * source IO remains pending; it is never declared equivalent to native work. */
export function nativeFieldTaskBoundary(signal:AbortSignal):Promise<void>{return new Promise((resolve,reject)=>{
 check(signal);const channel=new MessageChannel();let settled=false;
 const finish=(reason?:unknown)=>{if(settled)return;settled=true;signal.removeEventListener('abort',abort);channel.port1.close();channel.port2.close();if(reason!==undefined)reject(reason);else resolve();};
 const abort=()=>finish(cancelled(signal.reason));signal.addEventListener('abort',abort,{once:true});channel.port1.onmessage=()=>finish();channel.port1.onmessageerror=()=>finish(Error('Native field task boundary failed'));channel.port2.postMessage(0);if(signal.aborted)abort();
});}
/** Persistent30Hz field driver, independent of any one presentation. Owned
 * scopes share script→task phases and cancel independently. Registered tasks
 * are opaque controller blocks in stable registration order, NOT a complete
 * emulation of every DS SysTask priority/insertion or hardware timing rule. */
export class NativeFieldClock{
 tick=0;phase:NativeFieldPhase='idle';readonly failure:Promise<never>;
 private scopes=new Set<Scope>();private afterTasks=new Set<AfterTasks>();private elapsed=0;private pending=false;private work:Promise<void>=Promise.resolve();private generation=0;private disposed=false;private phaseAbort:AbortController|null=null;private attached:{fieldTasks:{frame:(dt:number)=>void;cancel:(reason?:unknown)=>void}|null}|null=null;private rejectFailure!:(reason:unknown)=>void;
 constructor(private ports:{field:()=>{map:number;mapRunning:boolean};onError:(reason:unknown)=>void;boundary?:(signal:AbortSignal)=>Promise<void>}){
  if(typeof ports?.field!=='function'||typeof ports.onError!=='function')throw Error('Native field clock requires actual field and error ports');this.failure=new Promise((_,reject)=>{this.rejectFailure=reject;});void this.failure.catch(()=>{});
 }
 get busy(){return this.pending;}
 get waiting(){return[...this.scopes].reduce((sum,scope)=>sum+scope.waits.size+scope.dispatches.size,0);}
 settled(){return this.work;}
 attach(world:{fieldTasks:{frame:(dt:number)=>void;cancel:(reason?:unknown)=>void}|null}){if(this.disposed)throw Error('Native field clock disposed');if(this.attached&&this.attached!==world||world.fieldTasks&&world.fieldTasks!==this)throw Error('Another field task driver is already installed');this.attached=world;world.fieldTasks=this;}
 private field(){const field=this.ports.field();if(!Number.isInteger(field.map)||typeof field.mapRunning!=='boolean')throw Error('Native field clock requires actual map/running state');return field;}
 private report(reason:unknown){try{this.ports.onError(reason);}catch(error){this.fatal(new AggregateError([reason,error],'Native field error reporting failed'));}}
 private fatal(reason:unknown){if(this.disposed)return;this.disposed=true;this.phaseAbort?.abort(cancelled(reason));this.cancel(reason);for(const hook of[...this.afterTasks])hook.remove();if(this.attached?.fieldTasks===this)this.attached.fieldTasks=null;this.rejectFailure(reason);}
 /** Global post-task driver, e.g. the source NNS_SndMain update. It outlives
  * field scopes/map transitions but belongs to an explicit root lifetime.
  * A second real task boundary drains runnable task-completion Promise jobs
  * before these synchronous callbacks. No new timer/RAF or DS-wide clock. */
 onAfterTasks(callback:(frame:NativeFieldFrame)=>void,owner:AbortSignal):()=>void{
  if(this.disposed)throw Error('Native field clock disposed');check(owner);if(typeof callback!=='function')throw Error('Native after-task callback required');
  if(this.phase==='tasks'||this.phase==='after-tasks')throw Error('Native after-task registration during task execution is unsupported');
  const hook:AfterTasks={callback,signal:owner,remove:()=>{this.afterTasks.delete(hook);owner.removeEventListener('abort',hook.remove);}};
  this.afterTasks.add(hook);owner.addEventListener('abort',hook.remove,{once:true});if(owner.aborted)hook.remove();return hook.remove;
 }
 createScope(map:number,owner:AbortSignal):NativeFieldTaskScope{
  if(this.disposed)throw Error('Native field clock disposed');check(owner);if(!Number.isInteger(map)||map<0||this.field().map!==map)throw Error('Native field scope belongs to an inactive map');const clock=this,controller=new AbortController();
  const scope:Scope={map,controller,signal:controller.signal,waits:new Set(),dispatches:new Set(),tasks:new Set(),detach:()=>owner.removeEventListener('abort',abort),cancel:reason=>{
   if(!this.scopes.delete(scope))return;const why=cancelled(reason);scope.detach();controller.abort(why);
   for(const wait of[...scope.waits]){scope.waits.delete(wait);wait.detach();wait.reject(why);}for(const task of[...scope.dispatches]){scope.dispatches.delete(task);task.detach();task.reject(why);}scope.tasks.clear();
  }};
  const abort=()=>scope.cancel(cancelled(owner.reason));this.scopes.add(scope);owner.addEventListener('abort',abort,{once:true});if(owner.aborted)abort();
  const current=(signal=scope.signal)=>{check(scope.signal);check(signal);if(this.disposed||!this.scopes.has(scope))throw Error('Native field scope is inactive');if(this.field().map!==map){scope.cancel(Error('Native field scope changed map'));check(scope.signal);}};
  return{map,signal:scope.signal,get active(){return clock.scopes.has(scope)&&!scope.signal.aborted;},get tick(){return clock.tick;},get phase(){return clock.phase;},cancel:scope.cancel,
   waitFrames:(frames,signal=scope.signal)=>{signal=signal===scope.signal?signal:AbortSignal.any([scope.signal,signal]);current(signal);if(!Number.isInteger(frames)||frames<1||frames>65536)throw Error('Invalid native field frame wait');return new Promise<void>((resolve,reject)=>{
    const abort=()=>finish(cancelled(signal.reason)),wait:Wait={at:this.tick+frames,resolve:()=>finish(),reject,detach:()=>signal.removeEventListener('abort',abort)};
    const finish=(reason?:unknown)=>{if(!scope.waits.delete(wait))return;wait.detach();if(reason!==undefined)reject(reason);else resolve();};scope.waits.add(wait);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
   });},
   dispatch:<T>(action:()=>Promise<T>,signal=scope.signal)=>{signal=signal===scope.signal?signal:AbortSignal.any([scope.signal,signal]);current(signal);return new Promise<T>((resolve,reject)=>{
    const abort=()=>{scope.dispatches.delete(dispatch);dispatch.detach();reject(cancelled(signal.reason));},done=(value:T)=>{dispatch.detach();resolve(value);},failed=(reason:unknown)=>{dispatch.detach();reject(reason);};
    const dispatch:Dispatch={reject,detach:()=>signal.removeEventListener('abort',abort),start:()=>{if(!scope.dispatches.delete(dispatch))return;try{current(signal);void action().then(done,failed);}catch(reason){failed(reason);}}};scope.dispatches.add(dispatch);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
   });},
   onTick:callback=>{current();if(this.phase==='tasks'||this.phase==='after-tasks')throw Error('Native field task registration during task execution is unsupported');scope.tasks.add(callback);return()=>scope.tasks.delete(callback);},
  };
 }
 frame(dt:number){
  if(this.disposed)return;if(!Number.isFinite(dt)||dt<0){this.report(Error('Invalid native field frame time'));return;}this.elapsed+=dt;if(this.elapsed<1/30)return;this.elapsed%=1/30;
  // Stalls slow native execution: no overlap, backlog loop or catch-up burst.
  if(this.pending)return;this.tick++;if(!this.afterTasks.size&&![...this.scopes].some(s=>s.waits.size||s.dispatches.size||s.tasks.size))return;
  const generation=this.generation,controller=new AbortController();this.pending=true;this.phaseAbort=controller;this.phase='scripts';
  const run=async()=>{
   for(const scope of[...this.scopes]){if(scope.map!==this.field().map){scope.cancel(Error('Native field changed map'));continue;}for(const dispatch of[...scope.dispatches])dispatch.start();for(const wait of[...scope.waits])if(wait.at<=this.tick)wait.resolve();}
   await(this.ports.boundary??nativeFieldTaskBoundary)(controller.signal);check(controller.signal);if(this.disposed)return;this.phase='tasks';
   if(generation===this.generation)for(const scope of[...this.scopes]){for(const callback of[...scope.tasks]){if(!this.scopes.has(scope))break;if(!scope.tasks.has(callback))continue;const field=this.field();if(scope.map!==field.map){scope.cancel(Error('Native field changed map'));break;}try{const result:unknown=callback({tick:this.tick,...field});if(result&&typeof(result as Promise<unknown>).then==='function'){void Promise.resolve(result).catch(reason=>this.report(reason));throw Error('Native field task callbacks must be synchronous');}}catch(reason){scope.cancel(reason);this.report(reason);break;}}}
   if(this.afterTasks.size){
    await(this.ports.boundary??nativeFieldTaskBoundary)(controller.signal);check(controller.signal);if(this.disposed)return;this.phase='after-tasks';
    for(const hook of[...this.afterTasks]){if(this.disposed)break;if(!this.afterTasks.has(hook)||hook.signal.aborted)continue;const result:unknown=hook.callback({tick:this.tick,...this.field()});if(result&&typeof(result as Promise<unknown>).then==='function'){void Promise.resolve(result).catch(reason=>this.report(reason));throw Error('Native after-task callbacks must be synchronous');}}
   }
  };
  this.work=run().catch(reason=>{if(!this.disposed){this.report(reason);this.fatal(reason);}}).finally(()=>{if(this.phaseAbort===controller)this.phaseAbort=null;this.pending=false;this.phase='idle';});
 }
 /** Actual field transition only: preserve the admitted global phase/sound
  * hooks while cancelling field work with its exact reason. A final clock
  * dispose/fatal aborts that phase. Controller failures use scope.cancel. */
 cancel(reason?:unknown){const why=cancelled(reason);this.generation++;for(const scope of[...this.scopes])scope.cancel(why);}
 dispose(reason?:unknown){if(this.disposed)return;this.disposed=true;this.phaseAbort?.abort(cancelled(reason));this.cancel(reason);for(const hook of[...this.afterTasks])hook.remove();if(this.attached?.fieldTasks===this)this.attached.fieldTasks=null;}
}
