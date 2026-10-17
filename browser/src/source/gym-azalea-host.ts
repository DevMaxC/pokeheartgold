import type * as THREE from 'three';
import type {SourceMap,State} from './types.ts';
import type {NativeFieldClock,NativeFieldTaskScope} from './native-field-clock.ts';
import type {ScriptAzaleaGymPorts,ScriptGymContext} from './script.ts';
import {AzaleaGymWorld,AZALEA_GYM_KEY,loadAzaleaGymResources,disposeAzaleaGymResources,type AzaleaTicks,type AzaleaGymResources} from './gym-azalea-world.ts';
import {azaleaGymEntryState,planAzaleaGymRide,type AzaleaGymState} from './gym-azalea-plan.ts';

export type AzaleaFieldPoint={x:number;y:number;z:number};
export type AzaleaFieldMovement={direction:0|1;step:number;current:AzaleaFieldPoint;previous:AzaleaFieldPoint};
/** Stable live actor identities. settle resets current AND previous tile/tween
 * coordinates; movement is an owner-scoped override, not a second animation
 * loop. Main must honor it before its normal player/follower frame writes.
 * movement(null) ONLY releases this host's override (even after map unload);
 * it must not move/face an actor or clear another owner's movement. */
export type AzaleaFieldActor={
 position:()=>AzaleaFieldPoint;facing:()=>number;
 place:(point:AzaleaFieldPoint)=>void;settle:(point:AzaleaFieldPoint)=>void;
 face:(direction:number)=>void;movement:(value:AzaleaFieldMovement|null)=>void;
};
export type AzaleaSEOutcome={kind:'voice'}|{kind:'no-voice';detail:string};
export type AzaleaGymAudio={
 /** Must admit the ACTUAL source SE assets/transport, or reject. No beep,
  * music replacement, silent fallback or completion guessed from a timer. */
 prepare:(ids:readonly[1561,2171],signal:AbortSignal)=>Promise<void>;
 /** Resolves when this SE's native sequence PLAYER is idle (IsSEPlaying),
  * including other sequences on that player, not merely this voice's end;
  * and reports diagnosed technical no-voice without inventing playback.
  * Even a failed voice must wait if another sequence occupies that player.
  * Native PlaySE ignores admission failure; its WaitSE then finishes
  * on the next task poll at which that native player is idle.
  * Source/config absence belongs to prepare's error. */
 switch1561:(signal:AbortSignal)=>Promise<AzaleaSEOutcome>;
 robot2171:(owner:object)=>AzaleaSEOutcome;stop2171:(owner:object,fade:1)=>void;
};
export type AzaleaGymFieldPorts={
 actors:()=>{player:AzaleaFieldActor;follower:AzaleaFieldActor|null};
 followerMoving:()=>boolean;
 audio:AzaleaGymAudio;
};
export type AzaleaGymEntry='continue'|'connection'|'warp';
export type AzaleaGymHostWorld={
 readonly scene:THREE.Scene;readonly fieldMapID:number;
 azaleaGym:AzaleaGymHost|null;
 setAzaleaCameraOffset:(owner:AzaleaGymHost,offset:number)=>void;
};
type TickJob={count:number;index:number;frame:(index:number)=>void;signal:AbortSignal;resolve:()=>void;reject:(reason:unknown)=>void;detach:()=>void};
type Riders={player:AzaleaFieldActor;follower:AzaleaFieldActor|null};
const point=(p:AzaleaFieldPoint):AzaleaFieldPoint=>({x:p.x,y:p.y,z:p.z});
const reason=(signal:AbortSignal)=>signal.reason??new DOMException('Azalea field action cancelled','AbortError');
function check(signal:AbortSignal){if(signal.aborted)throw reason(signal);}
function requireActor(actor:AzaleaFieldActor|null){if(!actor||['position','facing','place','settle','face','movement'].some(key=>typeof actor[key as keyof AzaleaFieldActor]!=='function'))throw Error('Azalea requires live source actor ports');const p=actor.position();if(![p.x,p.y,p.z].every(Number.isFinite))throw Error('Invalid live Azalea actor position');}

/** Field/VM adapter for the reviewed renderer. Uses the ONE shared native
 * clock; no RAF, timer, catch-up clock or fake move/animation/audio fallback.
 * State holds source logical current tile centers; position-vector overrides
 * hold the moving rider separately. A native step starts its logical target
 * immediately and settles previous coords at completion; the spider route
 * itself changes only vectors until native docking commits coordinates.
 * Ordinary collision remains the source permission/BDHC path; automatic
 * walking is locked during this source-controlled movement only. */
export class AzaleaGymHost{
 readonly renderer:AzaleaGymWorld;
 readonly scriptPorts:ScriptAzaleaGymPorts;
 private resources:Promise<AzaleaGymResources>|null=null;
 private generation=0;private mapID=-1;private mapOwner:AbortController|null=null;private mapScope:NativeFieldTaskScope|null=null;
 private action:AbortController|null=null;private job:TickJob|null=null;
 private disposed=false;private busy=false;
 private view:AzaleaFieldPoint|null=null;private held=false;private streamPoint:{x:number;z:number}|null=null;
 private currentRiders:Riders|null=null;
 private external=new Map<AbortSignal,Set<Promise<unknown>>>();
 private soundResults=new Map<1561|2171,AzaleaSEOutcome>();
 get active(){return this.renderer.active&&this.mapID===this.world.fieldMapID&&this.state.map===this.mapID;}
 get moving(){return this.busy||this.renderer.moving;}
 get riderPosition(){return this.view?point(this.view):null;}
 get riderHeight(){return this.view?.y;}
 get playerHeld(){return this.held;}
 get streamingTarget(){return this.streamPoint?{...this.streamPoint}:null;}
 get audioStatus(){return Object.fromEntries([...this.soundResults].map(([id,result])=>[id,{...result}]));}
 constructor(private world:AzaleaGymHostWorld,private state:State,private clock:NativeFieldClock,private ports:AzaleaGymFieldPorts,load:()=>Promise<AzaleaGymResources>=loadAzaleaGymResources){
  if(world.azaleaGym)throw Error('Another Azalea host is already installed');
  this.renderer=new AzaleaGymWorld(world.scene,()=>this.resources??=load().catch(error=>{this.resources=null;throw error;}),this.ticks);
  this.scriptPorts={init:context=>this.init(context),spinarak:(station,context)=>this.ride(station,context),switch:(index,context)=>this.flipSwitch(index,context)};
  world.azaleaGym=this;
 }
 private assertCurrent(signal?:AbortSignal){if(signal)check(signal);if(this.disposed||!this.active||!this.mapScope?.active)throw Error('Azalea host belongs to an inactive source field');}
 private context(context:ScriptGymContext){check(context.signal);if(context.map.id!==180||context.map.key!==AZALEA_GYM_KEY||context.map.id!==this.state.map)throw Error('Azalea command belongs to a different source field');this.assertCurrent();}
 private commit(value:AzaleaGymState){this.assertCurrent();this.state.gymmick={kind:'azalea',spiders:[...value.spiders],switches:value.switches};}
 async enter(map:SourceMap,kind:AzaleaGymEntry='warp'){
  this.leave();if(this.disposed)throw Error('Azalea host disposed');if(map.key!==AZALEA_GYM_KEY)return;
  if(map.id!==180||this.state.map!==180||this.world.fieldMapID!==180)throw Error('Azalea entry belongs to a different field');
  const saved=kind==='continue'&&this.state.gymmick?.kind==='azalea'?azaleaGymEntryState(this.state.gymmick,'continue'):undefined;
  // Validate saved Continue before loading or publishing anything. Transition
  // entries intentionally ignore old/malformed saved values, as native Init.
  azaleaGymEntryState(saved,kind);const generation=this.generation;
  try{await this.renderer.enter(map,saved,kind);}catch(error){if(generation!==this.generation||this.disposed)return;throw error;}
  if(generation!==this.generation||this.disposed)return;
  // Resource completion may land between task callbacks and the shared
  // phase's finally. Admit the persistent callback after that actual phase,
  // never by inventing SysTask insertion during task execution.
  await this.clock.settled();if(generation!==this.generation||this.disposed)return;
  if(this.world.fieldMapID!==map.id||this.state.map!==map.id){this.renderer.leave();return;}
  const owner=new AbortController();this.mapID=map.id;this.mapOwner=owner;
  try{
   const scope=this.clock.createScope(map.id,owner.signal);this.mapScope=scope;
   scope.onTick(frame=>{if(!scope.active||!this.active||!frame.mapRunning)return;this.renderer.updateNativeTick();const job=this.job;if(!job)return;try{check(job.signal);job.frame(++job.index);if(job.index===job.count)this.finishJob();}catch(error){this.finishJob(error);}});
   scope.signal.addEventListener('abort',()=>{if(this.mapScope===scope)this.leave();},{once:true});
   this.commit(this.renderer.state!);
  }catch(error){this.leave();throw error;}
 }
 /** Literal InitAzaleaGym always resets the save. Continue retains because
  * its field entry bypasses this OnTransition command, not because Init is
  * conditional on the last load kind. */
 init(context:ScriptGymContext){this.context(context);if(this.moving)throw Error('Azalea Gym is busy');this.commit(this.renderer.init(undefined,'warp'));}
 private finishJob(error?:unknown){const job=this.job;if(!job)return;this.job=null;job.detach();if(error!==undefined)job.reject(error);else job.resolve();}
 private ticks:AzaleaTicks=(count,frame,signal)=>{
  check(signal);this.assertCurrent();if(this.job)throw Error('Overlapping Azalea native tick phases');if(!Number.isInteger(count)||count<1)throw Error('Invalid Azalea native tick count');
  return new Promise<void>((resolve,reject)=>{const abort=()=>this.finishJob(reason(signal));this.job={count,index:0,frame,signal,resolve,reject,detach:()=>signal.removeEventListener('abort',abort)};signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
 };
 private riders(){if(typeof this.ports?.actors!=='function'||typeof this.ports.followerMoving!=='function')throw Error('Azalea requires original actor/follower admission');const riders=this.ports.actors();requireActor(riders.player);if(riders.follower)requireActor(riders.follower);return riders;}
 private audio(){const audio=this.ports?.audio;if(!audio||['prepare','switch1561','robot2171','stop2171'].some(key=>typeof audio[key as keyof AzaleaGymAudio]!=='function'))throw Error('Azalea requires native SE1561/2171 audio transport');return audio;}
 private soundResult(id:1561|2171,outcome:AzaleaSEOutcome){if(!outcome||outcome.kind!=='voice'&&(outcome.kind!=='no-voice'||typeof outcome.detail!=='string'||!outcome.detail.trim()))throw Error('Native Azalea audio must report voice or diagnosed technical no-voice');this.soundResults.set(id,{...outcome});}
 private async switchSound(audio:AzaleaGymAudio,scope:NativeFieldTaskScope,signal:AbortSignal,ownerSignal:AbortSignal){
  check(signal);let done=false,outcome:AzaleaSEOutcome|undefined,error:unknown,failed=false;
  const sound=Promise.resolve(audio.switch1561(signal)).then(value=>{outcome=value;done=true;},reason=>{error=reason;failed=true;done=true;});
  const pending=this.external.get(ownerSignal);if(!pending)throw Error('Unowned Azalea audio completion');pending.add(sound);
  try{do{await scope.waitFrames(1,signal);check(signal);}while(!done);if(failed)throw error;this.soundResult(1561,outcome!);}finally{await sound;pending.delete(sound);}
 }
 private sameRiders(riders:Riders){if(!this.active)return false;const now=this.ports.actors();return this.active&&now.player===riders.player&&now.follower===riders.follower;}
 private assertRiders(riders:Riders,signal:AbortSignal){this.assertCurrent(signal);if(!this.sameRiders(riders))throw Error('Azalea live rider identities changed');}
 private actorWrite(riders:Riders,signal:AbortSignal,write:()=>void){this.assertRiders(riders,signal);write();this.assertRiders(riders,signal);}
 private place(riders:Riders,p:AzaleaFieldPoint,f:AzaleaFieldPoint|undefined,signal:AbortSignal){this.assertRiders(riders,signal);this.view=point(p);this.actorWrite(riders,signal,()=>riders.player.place(point(p)));if(f&&riders.follower)this.actorWrite(riders,signal,()=>riders.follower!.place(point(f)));}
 private settle(riders:Riders,p:AzaleaFieldPoint,f:AzaleaFieldPoint|undefined,signal:AbortSignal){this.place(riders,p,f,signal);this.state.x=p.x;this.state.z=p.z;this.state.fieldHeight=p.y;this.actorWrite(riders,signal,()=>riders.player.settle(point(p)));if(f&&riders.follower)this.actorWrite(riders,signal,()=>riders.follower!.settle(point(f)));}
 private release(){this.view=null;this.held=false;this.streamPoint=null;const riders=this.currentRiders;this.currentRiders=null;try{riders?.player.movement(null);}finally{try{riders?.follower?.movement(null);}finally{this.world.setAzaleaCameraOffset(this,0);}}}
 private async run<T>(context:ScriptGymContext,action:(signal:AbortSignal,scope:NativeFieldTaskScope,riders:Riders,audio:AzaleaGymAudio)=>Promise<T>):Promise<T>{
  this.context(context);if(this.moving)throw Error('Azalea Gym is busy');const audio=this.audio(),riders=this.riders();this.context(context);const owner=new AbortController(),abort=()=>owner.abort(reason(context.signal));
  const mapOwner=this.mapOwner!,scope=this.clock.createScope(this.mapID,owner.signal),abortMap=()=>owner.abort(reason(mapOwner.signal)),externals=new Set<Promise<unknown>>();
  context.signal.addEventListener('abort',abort,{once:true});mapOwner.signal.addEventListener('abort',abortMap,{once:true});if(context.signal.aborted)abort();if(mapOwner.signal.aborted)abortMap();
  this.external.set(owner.signal,externals);this.action=owner;this.currentRiders=riders;this.busy=true;
  const cancelRenderer=()=>this.renderer.cancel();owner.signal.addEventListener('abort',cancelRenderer,{once:true});
  let started:Promise<T>|null=null;
  try{
   await audio.prepare([1561,2171],owner.signal);this.assertRiders(riders,owner.signal);
   return await scope.dispatch(()=>{started=action(owner.signal,scope,riders,audio);return started;});
  }finally{
   // Scope rejection alone does not mean the underlying renderer has run its
   // rollback/finally. Drain it before the VM's source recovery can continue.
   if(started)await (started as Promise<T>).catch(()=>{});
   await Promise.allSettled([...externals]);this.external.delete(owner.signal);
   context.signal.removeEventListener('abort',abort);mapOwner.signal.removeEventListener('abort',abortMap);owner.signal.removeEventListener('abort',cancelRenderer);
   scope.cancel();if(this.action===owner){this.action=null;try{this.release();}finally{this.currentRiders=null;this.busy=false;}}
  }
 }
 async flipSwitch(index:number,context:ScriptGymContext){
  if(!Number.isInteger(index)||index<0||index>1)throw RangeError('Invalid original Azalea switch');
  await this.run(context,async(signal,scope,_riders,audio)=>{this.assertCurrent(signal);await this.renderer.flipSwitch(index,{commitState:value=>this.commit(value),switchSound:ownSignal=>this.switchSound(audio,scope,ownSignal,signal)});});
 }
 async ride(station:number,context:ScriptGymContext){
  this.context(context);const plan=planAzaleaGymRide(this.renderer.state!,station);
  await this.run(context,async(signal,scope,riders,audio)=>{
   if(this.state.x!==plan.boarding.from.x||this.state.z!==plan.boarding.from.z)throw Error('Azalea ride requires completed logical boarding coordinates');
   const snapshot={player:point(riders.player.position()),follower:riders.follower?point(riders.follower.position()):null,facing:this.state.facing,followerFacing:riders.follower?.facing(),fieldHeight:this.state.fieldHeight};
   const soundOwner={},forward=()=>this.assertRiders(riders,signal);
   await this.renderer.ride(station,{
    player:()=>{forward();return point(riders.player.position());},
    captureRiders:()=>()=>{if(!this.sameRiders(riders)||!this.mapOwner)return;const restoreSignal=this.mapOwner.signal;this.settle(riders,snapshot.player,snapshot.follower??undefined,restoreSignal);this.state.facing=snapshot.facing;this.actorWrite(riders,restoreSignal,()=>riders.player.face(snapshot.facing));if(riders.follower&&snapshot.followerFacing!==undefined)this.actorWrite(riders,restoreSignal,()=>riders.follower!.face(snapshot.followerFacing!));this.state.fieldHeight=snapshot.fieldHeight;},
    releaseRiders:()=>this.release(),
    waitFollower:async ownSignal=>{while(this.ports.followerMoving()){forward();check(ownSignal);await scope.waitFrames(1,ownSignal);}forward();},
    stepRiders:async(direction,phase,ownSignal)=>{
     forward();const p=point(riders.player.position()),f=riders.follower?point(riders.follower.position()):null,dz=direction===0?-1:1;
     await this.ticks(8,tick=>{forward();if(tick===1){this.state.x=p.x;this.state.z=p.z+dz;this.state.fieldHeight=0;this.state.facing=direction;this.actorWrite(riders,signal,()=>riders.player.face(direction));if(riders.follower)this.actorWrite(riders,signal,()=>riders.follower!.face(direction));}const movement={direction,step:tick-1,current:{x:p.x,y:0,z:p.z+dz},previous:point(p)};this.actorWrite(riders,signal,()=>riders.player.movement(movement));if(riders.follower&&f)this.actorWrite(riders,signal,()=>riders.follower!.movement({direction,step:tick-1,current:{x:f.x,y:0,z:f.z+dz},previous:point(f)}));this.place(riders,{x:p.x,y:0,z:p.z+dz*tick/8},f?{x:f.x,y:0,z:f.z+dz*tick/8}:undefined,signal);},ownSignal);
     forward();this.settle(riders,{x:p.x,y:0,z:p.z+dz},f?{x:f.x,y:0,z:f.z+dz}:undefined,signal);this.actorWrite(riders,signal,()=>riders.player.movement(null));if(riders.follower)this.actorWrite(riders,signal,()=>riders.follower!.movement(null));
     // Task_SpinarakRide completes from the scripts/TaskManager phase after
     // its final movement task, not from inside this task callback. Parent
     // bytecode resumes on that same child-completion tick, with no extra
     // SetupNativeScript-style bytecode wait. Keep it inside the renderer's
     // awaited port so cancellation still owns its rollback/finally.
     // This bounded adapter assumes step observation on its own eighth tick;
     // absolute DS SysTask/MapObject priority ordering is not proven here.
     if(phase==='disembark'){await scope.waitFrames(1,ownSignal);forward();}
    },
    holdPlayer:movement=>{this.held=movement===73;},
    placeRiders:frame=>{forward();this.place(riders,frame.player,frame.follower,signal);},
    dockRiders:frame=>{forward();this.settle(riders,frame.player,frame.follower,signal);this.view=null;},
    cameraOffset:offset=>{this.world.setAzaleaCameraOffset(this,offset);},
    trackPlayer:enabled=>{const p=riders.player.position();this.streamPoint=enabled?null:{x:p.x,z:p.z};},
    facing:()=>this.state.facing,
    robotSound:playing=>{if(playing){forward();const outcome=audio.robot2171(soundOwner);forward();this.soundResult(2171,outcome);}else audio.stop2171(soundOwner,1);},
    switchSound:ownSignal=>this.switchSound(audio,scope,ownSignal,signal),
    commitState:value=>this.commit(value),
   });
   forward();if(this.state.x!==plan.arrival.disembarked.x||this.state.z!==plan.arrival.disembarked.z)throw Error('Azalea final field tile did not persist');
  });
 }
 /** Local cancellation leaves the shared clock and other scopes alone. The
  * reviewed renderer restores same-map rider/puzzle checkpoints on failure. */
 cancel(reason:unknown=new DOMException('Azalea action cancelled','AbortError')){this.action?.abort(reason);this.renderer.cancel();}
 leave(){
  this.generation++;try{this.renderer.leave();}finally{try{this.action?.abort(new DOMException('Azalea field unloaded','AbortError'));this.finishJob(new DOMException('Azalea field unloaded','AbortError'));this.release();}finally{this.currentRiders=null;this.busy=false;const owner=this.mapOwner;this.mapOwner=null;this.mapScope=null;this.mapID=-1;owner?.abort();}}
 }
 async dispose(){if(this.disposed)return;this.leave();this.disposed=true;if(this.world.azaleaGym===this)this.world.azaleaGym=null;const pending=this.resources;this.resources=null;const resources=pending&&await pending.catch(()=>null);if(resources)disposeAzaleaGymResources(resources);}
}
