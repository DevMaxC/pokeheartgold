import {NativeFieldClock,type NativeFieldTaskScope} from './native-field-clock.ts';
import {NativeCutFieldEffect,createNativeCutAudio,type NativeCutResources,type CutAudioPorts,type CutFieldPerformer} from './cut-field-effect.ts';
import type {OriginalWorld} from './world.ts';
import type {ScriptFieldMoveContext,ScriptFieldMovePorts} from './script.ts';
import type {Mon,State} from './types.ts';

export class UnsupportedNativeCutHost extends Error{constructor(message:string){super(message);this.name='UnsupportedNativeCutHost';}}
const cancelled=(reason?:unknown)=>reason??new DOMException('Native Cut field action cancelled','AbortError');
const check=(signal:AbortSignal)=>{if(signal.aborted)throw cancelled(signal.reason);};
export {nativeFieldTaskBoundary as cutNativeTaskBoundary} from './native-field-clock.ts';
export type NativeCutActorSnapshot={player:CutFieldPerformer;follower:CutFieldPerformer|null;followerMon:Mon|null;followerVisibleFlag:boolean};
/** Required REAL native presentation/actor completions. They must honour the
 * passed signal, stop their actor writes and settle before rejecting. A swap
 * or hop completes at TaskManager child completion, so parent resumes that
 * tick. CutIn is native banner kind0; no immediate/synthetic substitute. */
export type NativeCutActorPorts={
 snapshot:()=>NativeCutActorSnapshot;
 cutIn:(slot:number,context:ScriptFieldMoveContext,clock:NativeFieldTaskScope)=>Promise<void>;
 swap:(mode:1|2,context:ScriptFieldMoveContext,clock:NativeFieldTaskScope)=>Promise<void>;
 jump:(count:number,context:ScriptFieldMoveContext,clock:NativeFieldTaskScope)=>Promise<void>;
 reset:(context:ScriptFieldMoveContext)=>void;
};
export type NativeCutHostPorts={clock:NativeFieldClock;state:()=>State|null;running:()=>boolean;actors:NativeCutActorPorts;audio:CutAudioPorts;ownerSignal:AbortSignal;cancelScript:(reason:unknown)=>void;onError:(reason:unknown)=>void};
type WorldPort=Pick<OriginalWorld,'scene'|'fieldTasks'|'fieldMapID'|'fieldMapRunning'>;
type Action={map:number;state:State;controller:AbortController;signal:AbortSignal;scope:NativeFieldTaskScope;pending:Set<Promise<void>>;script:Promise<unknown>|null;cancelled:boolean};
/** Boundary integration only. Root attaches this after ALL actor/audio ports
 * are admitted, wraps run() in OUTER SourceActionRecovery, and saves after its
 * whole source VM/presentation finishes. Resources/templates stay caller-owned.
 * No main/VM/UI/music owner is replaced and no camera orbit is changed. */
export class NativeCutFieldHost{
 readonly clock:NativeFieldClock;readonly effect:NativeCutFieldEffect;readonly fieldMoves:ScriptFieldMovePorts;readonly failure:Promise<never>;
 private audio:ReturnType<typeof createNativeCutAudio>;private action:Action|null=null;private disposed=false;private admitted=false;private fatal:unknown;private rejectFailure!:(reason:unknown)=>void;private ownerAbort:()=>void;
 constructor(readonly world:WorldPort,resources:NativeCutResources,private ports:NativeCutHostPorts){
  if(!ports||!(ports.clock instanceof NativeFieldClock)||typeof ports.state!=='function'||typeof ports.running!=='function'||typeof ports.onError!=='function'||typeof ports.cancelScript!=='function'||!ports.ownerSignal||['snapshot','cutIn','swap','jump','reset'].some(key=>typeof ports.actors?.[key as keyof NativeCutActorPorts]!=='function'))throw new UnsupportedNativeCutHost('Native Cut requires actual field, banner, swap, hop, reset, lifetime and error ports');
  this.failure=new Promise((_,reject)=>{this.rejectFailure=reject;});void this.failure.catch(()=>{});
  this.audio=createNativeCutAudio(resources,ports.audio);this.effect=new NativeCutFieldEffect(resources,{scene:world.scene,field:()=>this.field(),audio:this.audio});
  this.clock=ports.clock;
  this.ownerAbort=()=>this.dispose(cancelled(ports.ownerSignal.reason));ports.ownerSignal.addEventListener('abort',this.ownerAbort,{once:true});if(ports.ownerSignal.aborted)this.ownerAbort();
  void this.audio.failure.catch(reason=>this.fail(reason));
  this.fieldMoves={
   cutIn:(slot,context)=>this.perform(context,input=>{if(!Number.isInteger(slot)||slot<0||!this.action!.state.party[slot])throw new UnsupportedNativeCutHost('Native Cut banner has no actual party slot');return this.nativePoll(ports.actors.cutIn(slot,input,this.action!.scope),input);}),
   startEffect:(kind,context)=>this.perform(context,input=>{
    if(this.clock.phase!=='scripts')throw new UnsupportedNativeCutHost('Native Cut effect dispatch is not aligned with the global script phase');
    const object=input.map.constants[input.object];if(!Number.isInteger(object))throw new UnsupportedNativeCutHost('Native Cut requires its original map object identity');
    return this.effect.start(kind,{map:input.map.id,object,signal:input.signal});
   }),
   swapPlayerFollower:(mode,context)=>this.perform(context,input=>ports.actors.swap(mode,input,this.action!.scope)),
   jumpFollower:(count,context)=>this.perform(context,input=>{
    if(!Number.isInteger(count)||count<0||count>255)throw Error('Invalid native follower hop count');const mon=this.followerMon();
    // Literal FollowMon_JumpOnSpot omits its child for Diglett/Dugtrio, but the
    // TRUE script command still yields one source dispatch tick.
    return mon.species===50||mon.species===51?this.action!.scope.waitFrames(1,input.signal):ports.actors.jump(count,input,this.action!.scope);
   }),
   resetFollowerMovement:context=>this.perform(context,input=>{ports.actors.reset(input);return Promise.resolve();}),
   addFollowerMood:delta=>{this.current();if(!Number.isInteger(delta)||delta< -128||delta>127)throw Error('Invalid signed native follower mood');const mon=this.followerMon()as Mon&{mood?:number},mood=mon.mood??0;if(!Number.isInteger(mood)||mood< -128||mood>127)throw Error('Invalid native follower mood');mon.mood=Math.max(-127,Math.min(127,mood+delta));},
   followerVisibleFlag:()=>{this.current();const value=ports.actors.snapshot().followerVisibleFlag;if(typeof value!=='boolean')throw new UnsupportedNativeCutHost('Native Cut requires the logical follower visible flag');return value;},
   cry:(species,pattern,context)=>this.perform(context,input=>this.nativePoll(this.audio.cry(species,pattern,input.signal),input)),
   waitFrames:(frames,context)=>this.perform(context,input=>this.action!.scope.waitFrames(frames,input.signal)),
  };
 }
 admit(){if(this.disposed)throw Error('Native Cut host disposed');if(this.world.fieldTasks!==this.clock)throw new UnsupportedNativeCutHost('Native Cut requires the installed shared field clock');this.admitted=true;}
 private reportFatal(reason:unknown){if(this.fatal!==undefined)return;let why=cancelled(reason);this.fatal=why;try{this.ports.onError(why);}catch(error){why=new AggregateError([why,error],'Native Cut host error reporting failed');this.fatal=why;}this.rejectFailure(why);}
 private fail(reason:unknown){if(this.fatal!==undefined)return;this.cancel(reason);this.reportFatal(reason);}
 private field(){const state=this.ports.state();if(!state)throw new UnsupportedNativeCutHost('Native Cut has no loaded field State');const actors=this.ports.actors.snapshot(),running=this.ports.running();if(typeof running!=='boolean')throw new UnsupportedNativeCutHost('Native Cut requires actual field-running admission');return{map:state.map,mapRunning:running&&this.world.fieldMapRunning,player:actors.player,follower:actors.follower};}
 private current(context?:ScriptFieldMoveContext){
  if(this.disposed)throw Error('Native Cut host disposed');if(this.fatal!==undefined)throw this.fatal;const action=this.action;if(!action)throw new UnsupportedNativeCutHost('Native Cut was not prepared for this source dispatch');check(action.signal);
  if(this.ports.state()!==action.state||action.state.map!==action.map||this.world.fieldMapID!==action.map||context&&context.map.id!==action.map)throw Error('Native Cut field changed');if(context)check(context.signal);return action;
 }
 private followerMon(){const action=this.current(),snapshot=this.ports.actors.snapshot(),mon=snapshot.followerMon;if(!snapshot.follower||!mon||!action.state.party.includes(mon)||mon.isEgg||mon.checksumFailed)throw new UnsupportedNativeCutHost('Native Cut has no registered logical follower Pokémon');return mon;}
 /** SysTask/audio completion becomes visible at the NEXT native script poll.
  * ScriptVM's local Cut SetupNativeScript adapter then yields its separate
  * bytecode-resumption tick. TaskManager children (swap/hop) do not use this. */
 private async nativePoll(pending:Promise<unknown>,context:ScriptFieldMoveContext):Promise<void>{
  if(!pending||typeof pending.then!=='function')throw new UnsupportedNativeCutHost('Native Cut presentation must return actual completion');await pending;const action=this.current(context);await action.scope.waitFrames(1,context.signal);
 }
 private perform(context:ScriptFieldMoveContext,work:(context:ScriptFieldMoveContext)=>Promise<void>):Promise<void>{
  const action=this.current(context),signal=AbortSignal.any([action.signal,action.scope.signal,context.signal]),input={...context,signal};let promise:Promise<void>;
  try{const pending=work(input);if(!pending||typeof pending.then!=='function')throw new UnsupportedNativeCutHost('Native Cut actor port must return its actual completion Promise');promise=Promise.resolve(pending).then(()=>{this.current(input);},reason=>{this.cancel(reason);throw reason;});}catch(reason){this.cancel(reason);throw reason;}
  action.pending.add(promise);void promise.finally(()=>action.pending.delete(promise)).catch(()=>{});return promise;
 }
 async run<T>(map:number,signal:AbortSignal,script:()=>Promise<T>):Promise<T>{
  if(this.disposed)throw Error('Native Cut host disposed');if(this.fatal!==undefined)throw this.fatal;if(this.action)throw Error('Native Cut source action already active');if(!this.admitted||this.world.fieldTasks!==this.clock)throw new UnsupportedNativeCutHost('Native Cut field clock is not admitted');check(signal);
  const state=this.ports.state();if(!state||state.map!==map||this.world.fieldMapID!==map||!this.world.fieldMapRunning||!this.ports.running())throw new UnsupportedNativeCutHost('Native Cut requires an admitted running field');
  const controller=new AbortController(),input=AbortSignal.any([signal,this.ports.ownerSignal,controller.signal]),scope=this.clock.createScope(map,input),action:Action={map,state,controller,signal:input,scope,pending:new Set(),script:null,cancelled:false};this.action=action;
  const abort=()=>this.cancel(cancelled(action.signal.aborted?action.signal.reason:scope.signal.reason));action.signal.addEventListener('abort',abort,{once:true});scope.signal.addEventListener('abort',abort,{once:true});
  try{if(this.clock.phase==='tasks')await this.clock.settled();this.current();scope.onTick(()=>this.effect.stepNativeQueue());await this.audio.prepareSE(action.signal);this.current();const result=await scope.dispatch(()=>{this.current();const pending=script();action.script=pending;return pending;},action.signal);this.current();await Promise.all([...action.pending]);this.current();return result;}
  catch(reason){this.cancel(reason);await Promise.allSettled([...action.pending,...(action.script?[action.script]:[])]);throw reason;}
  finally{action.signal.removeEventListener('abort',abort);scope.signal.removeEventListener('abort',abort);scope.cancel();if(this.action===action)this.action=null;}
 }
 cancel(reason?:unknown){let why=cancelled(reason),broken=false;const action=this.action;if(action?.cancelled)return;
  if(action){action.cancelled=true;try{this.ports.cancelScript(why);}catch(error){why=new AggregateError([why,error],'Native Cut script cancellation failed');broken=true;}action.controller.abort(why);}
  this.effect.cancel(why);action?.scope.cancel(why);if(broken)this.reportFatal(why);
 }
 dispose(reason?:unknown){if(this.disposed)return;this.disposed=true;this.cancel(reason);this.audio.dispose();this.ports.ownerSignal.removeEventListener('abort',this.ownerAbort);}
}
