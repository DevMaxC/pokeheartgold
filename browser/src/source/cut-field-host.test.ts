import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setImmediate as task} from 'node:timers/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OriginalWorld} from './world.ts';
import {NativeFieldClock} from './native-field-clock.ts';
import {NativeCutResources,type NativeCutManifest} from './cut-field-effect.ts';
import {NativeCutFieldHost,UnsupportedNativeCutHost,cutNativeTaskBoundary,type NativeCutActorPorts} from './cut-field-host.ts';
import {loadData,newState,createMon} from './data.ts';
import {ScriptVM,type ScriptHooks} from './script.ts';
import {FieldObjects} from './objects.ts';
import {SourceActionRecovery} from './script-recovery.ts';
import {sourceJSON,type SourceMap} from './types.ts';

globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData(),route=await sourceJSON<SourceMap>('maps/34.json'),tree=route.events.objects.find(o=>o.id==='obj_R30_tree')!;
const directory=new URL('../../public/source/cut/',import.meta.url),manifest=JSON.parse(await readFile(new URL('resources.json',directory),'utf8'))as NativeCutManifest;
function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(reason:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
// Parse original native geometry/joints. Strip only embedded image references
// for Node (no browser image decoder); no rendering/palette approval is implied.
async function resources(){
 const raw=await readFile(new URL('model.glb',directory));assert.equal(createHash('sha256').update(raw).digest('hex'),manifest.glbSHA256);
 const size=raw.readUInt32LE(12),doc=JSON.parse(raw.subarray(20,20+size).toString());doc.images=[];doc.textures=[];for(const material of doc.materials)delete material.pbrMetallicRoughness.baseColorTexture;
 const json=Buffer.from(JSON.stringify(doc)),padding=(4-json.length%4)%4,bytes=Buffer.alloc(20+json.length+padding+raw.length-20-size,32);raw.copy(bytes,0,0,20);bytes.writeUInt32LE(bytes.length,8);bytes.writeUInt32LE(json.length+padding,12);json.copy(bytes,20);raw.copy(bytes,20+json.length+padding,20+size);
 const parsed=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');parsed.scene.traverse(object=>{if(object instanceof THREE.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material])(material as THREE.MeshBasicMaterial).map=new THREE.Texture();});return new NativeCutResources(structuredClone(manifest),parsed.scene);
}
function world(){
 const w=Object.create(OriginalWorld.prototype)as any;Object.assign(w,{scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(52,1,.05,140),target:new THREE.Vector3(),activeHeader:route.id,cameraTransition:false,cells:new Map(),npcSprites:new Map(),grassTime:0,yaw:.8,pitch:.5,distance:12,fieldEffect:null,fieldTasks:null,battleStage:null,sky:{update(){},enter(){}},height:()=>2,renderer:{render(){w.renders++;}},renders:0,maps:new Map([[route.id,route]]),activeMatrix:route.matrix,matrix:{headers:[]},cell:()=>({}),updateStreaming(){},clearScriptCameraTarget(){}});return w as OriginalWorld&{renders:number};
}
async function fixture(options:{activeFollower?:boolean;species?:number;statusThrows?:boolean}={}){
 const assets=await resources(),w=world(),owner=new AbortController(),signal=new AbortController(),state=newState(data,'Case','boy',()=>.5);Object.assign(state,{map:route.id,x:558.5,z:295.5,facing:3});const mon=createMon(data,options.species??19,8,'Case',()=>.5);mon.moves=[{id:15,pp:0,maxPP:data.moves[15].pp}];state.party=[mon];state.badges=[1];
 const objects=new FieldObjects(data,state);objects.load(route.events.objects);const events:{name:string;tick:number;value?:unknown}[]=[],errors:unknown[]=[],statuses:string[]=[],cancelReasons:unknown[]=[];let vm:ScriptVM;let cancelUI:(()=>void)|undefined,cancelledScripts=0;let follower={x:557.5,y:7,z:295.5,facing:3};
 let host:NativeCutFieldHost;const record=(name:string,value?:unknown)=>events.push({name,tick:host.clock.tick,value});
 // These are admitted completion-port fixtures, NOT implementations/claims of
 // native banner, actor swap or hop presentation. Those remain required ports.
 const actors:NativeCutActorPorts={snapshot:()=>({player:{x:state.x,y:2,z:state.z,facing:state.facing},follower:options.activeFollower?follower:null,followerMon:options.activeFollower?mon:null,followerVisibleFlag:!options.activeFollower}),cutIn:async(_,context,clock)=>{record('cutIn');await clock.waitFrames(1,context.signal);},swap:async(_,context,clock)=>{record('swap');await clock.waitFrames(1,context.signal);const from={x:state.x,z:state.z};state.x=follower.x;state.z=follower.z;follower={...follower,...from};},jump:async(_,context,clock)=>{record('jump');await clock.waitFrames(1,context.signal);},reset:()=>{record('reset');}};
 const clock=new NativeFieldClock({field:()=>({map:w.fieldMapID,mapRunning:w.fieldMapRunning}),onError:reason=>errors.push(reason),boundary:cutNativeTaskBoundary});clock.attach(w);
 host=new NativeCutFieldHost(w,assets,{clock,state:()=>state,running:()=>true,actors,audio:{output:()=>{throw Error('Muted host must not request a Context');},enabled:()=>false,onStatus:event=>{statuses.push(event.status);if(options.statusThrows)throw Error('status sink failed');}},ownerSignal:owner.signal,onError:reason=>errors.push(reason),cancelScript:reason=>{cancelReasons.push(reason);cancelledScripts++;vm?.cancel(reason);cancelUI?.();}});host.admit();
 const hooks:ScriptHooks={message:async()=>{},choice:async()=>0,move:async()=>{},position:(id,x,z)=>objects.position(id,x,z),face:()=>{},visible:(id,value)=>{record('visible',value);objects.show(id,value);},chooseStarter:async()=>{},nickname:async()=>1,refresh:async()=>{},battle:async()=>true,warp:async()=>{},followerActive:()=>!!options.activeFollower,fieldMoves:host.fieldMoves};
 vm=new ScriptVM(data,state,hooks);const recovery=new SourceActionRecovery(state,{capture:()=>({actors:objects.save(route.id),follower}),restore:async snapshot=>{objects.load(route.events.objects);objects.restore(state.map,snapshot.actors);follower={...snapshot.follower};record('restored');}});
 const add=w.scene.add.bind(w.scene);w.scene.add=(...nodes)=>{for(const node of nodes)if(node.name==='native-cut-field-effect')record('effectStart',node.position.toArray());return add(...nodes);};
 const advance=async(frames=1)=>{for(let i=0;i<frames;i++){w.draw(state.x,state.z,1/30,2);await host.clock.settled();await task();}};
 const reach=async(predicate:()=>boolean)=>{for(let i=0;i<150;i++){await task();if(predicate())return;await advance();}throw Error('Host fixture did not reach native boundary');};
 const run=()=>recovery.run(()=>host.run(route.id,signal.signal,()=>vm.run(route,data.constants.std_field_cut,tree.id)));
 return{assets,w,owner,signal,state,mon,objects,events,errors,statuses,cancelReasons,actors,host,vm,recovery,hooks,advance,reach,run,record,get follower(){return follower;},get cancelledScripts(){return cancelledScripts;},set cancelUI(value:(()=>void)|undefined){cancelUI=value;},dispose(){host.dispose();clock.dispose();assets.dispose();}};
}

test('World field task hook preserves free camera updates and runs before transition/battle/egg branches',async()=>{
 const a=world(),b=world(),frames:number[]=[];b.fieldTasks={frame:dt=>frames.push(dt),cancel(){}};a.draw(5,7,.033,2);b.draw(5,7,.033,2);assert.deepEqual(a.camera.position.toArray(),b.camera.position.toArray());assert.deepEqual(a.target.toArray(),b.target.toArray());assert.deepEqual([b.yaw,b.pitch,b.distance],[.8,.5,12]);assert.equal(b.renders,1);assert.equal(frames.length,1);
 b.beginFieldTransition();assert.equal(b.fieldMapRunning,false);b.draw(5,7,.033,2);assert.equal(frames.length,2);b.endFieldTransition();(b as any).battleStage={active:true,update(){}};b.draw(5,7,.033,2);assert.equal(frames.length,3);assert.equal(b.fieldMapRunning,false);b.battleStage=null;b.fieldEffect={active:true,update(){},cancel(){}};b.draw(5,7,.033,2);assert.equal(frames.length,4);assert.equal(b.fieldMapRunning,false);
});

test('actualVM10000 plus native Cut model hides at dispatch+9, uses same-tick queue start and completes after47 queue passes',async()=>{
 const f=await fixture();try{
  await f.advance(7);const before=f.host.clock.tick,pending=f.run();void pending.catch(()=>{});await f.reach(()=>f.events.some(e=>e.name==='effectStart'));const start=f.events.find(e=>e.name==='effectStart')!;assert.ok(start.tick>before);assert.equal(f.host.effect.group.visible,true);assert.equal(f.vm.value('VAR_SPECIAL_x8005',route),0);
  await f.advance(8);assert.equal(f.objects.snapshot().find(o=>o.id===tree.id)!.visible,true);await f.advance();assert.equal(f.objects.snapshot().find(o=>o.id===tree.id)!.visible,false);assert.equal(f.events.find(e=>e.name==='visible')!.tick-start.tick,9);
  await f.advance(35);assert.equal(f.host.clock.tick-start.tick,44);assert.equal(f.host.effect.group.visible,false,'45th model update includes dispatch tick');assert.equal(f.host.effect.active,true);await f.advance(2);assert.equal(f.host.clock.tick-start.tick,46);assert.equal(f.host.effect.active,false);assert.equal(f.vm.value('VAR_SPECIAL_x8005',route),1);await f.advance();await pending;assert.equal(f.host.clock.tick-start.tick,47);assert.equal(f.recovery.busy,false);assert.ok(f.statuses.includes('muted'));assert.equal(f.errors.length,0);
 }finally{f.dispose();}
});

test('performers use logical follower tile/baseY and explicit visible flag, never an interpolated/hopping render coordinate',async()=>{
 const f=await fixture({activeFollower:true,species:152});try{const pending=f.run();void pending.catch(()=>{});await f.reach(()=>f.events.some(e=>e.name==='effectStart'));assert.deepEqual(f.events.find(e=>e.name==='effectStart')!.value,[f.follower.x+1,7,f.follower.z]);assert.equal((f.mon as any).mood,21);await f.advance(48);await pending;assert.ok(f.events.some(e=>e.name==='swap'));assert.ok(f.events.some(e=>e.name==='jump'));}finally{f.dispose();}
});

test('transition cancels owned VM/effect/waits, drains rollback and keeps cached native templates intact',async()=>{
 const f=await fixture();try{const before=structuredClone(f.state),position=f.assets.template.position.clone(),pending=f.run(),rejected=assert.rejects(pending);await f.reach(()=>f.host.effect.active);f.w.beginFieldTransition();assert.equal(f.host.effect.active,false);assert.equal(f.w.scene.getObjectByName('native-cut-field-effect'),undefined);await rejected;assert.deepEqual(f.state,before);assert.equal(f.vm.busy,false);assert.equal(f.recovery.busy,false);assert.equal(f.assets.disposed,false);assert.deepEqual(f.assets.template.position.toArray(),position.toArray());assert.equal(f.host.clock.waiting,0);}finally{f.dispose();}
});

test('missing actor ports never attach or dispatch; UI-busy is not a model-running substitute',async()=>{
 const assets=await resources(),w=world(),state=newState(data,'Case','boy',()=>.5);state.map=route.id;let errors=0;
 try{assert.throws(()=>new NativeCutFieldHost(w,assets,{clock:new NativeFieldClock({field:()=>({map:route.id,mapRunning:true}),onError(){}}),state:()=>state,running:()=>true,actors:{}as any,audio:{}as any,ownerSignal:new AbortController().signal,cancelScript(){},onError(){errors++;}}),UnsupportedNativeCutHost);assert.equal(w.fieldTasks,null);assert.equal(errors,0);assert.equal(w.fieldMapRunning,true,'no UI/VM busy inference in World map-running');}finally{assets.dispose();}
});

test('persistent audio status failure blocks dispatch and is separately observed without creating a private Context',async()=>{
 const f=await fixture({statusThrows:true});try{const failure=assert.rejects(f.host.failure),run=assert.rejects(f.run());await run;await failure;assert.equal(f.events.some(e=>e.name==='cutIn'||e.name==='effectStart'),false);assert.equal(f.errors.length,1);assert.equal(f.host.effect.active,false);assert.equal(f.recovery.busy,false);}finally{f.dispose();}
});


test('ordinary transitions and native connected Warp do not cancel unrelated VM when no Cut action is owned',async()=>{
 const f=await fixture();try{f.w.beginFieldTransition();assert.equal(f.cancelledScripts,0);f.w.endFieldTransition();const next=await sourceJSON<SourceMap>('maps/35.json');f.w.maps.set(next.id,next);f.state.map=next.id;await f.w.connect(next.id,558.5,284.5);assert.equal(f.cancelledScripts,0);assert.equal(f.w.fieldMapID,next.id);}finally{f.dispose();}
});

test('required source cancellation drains an admitted owned UI wait before recovery returns, with no late flags',async()=>{
 const f=await fixture();try{const message=deferred<void>();let opened=false;f.hooks.message=()=>{opened=true;return message.promise;};f.cancelUI=()=>message.resolve();const before=structuredClone(f.state),pending=f.run(),rejected=assert.rejects(pending);await f.reach(()=>opened);f.signal.abort(Error('external recovery'));await rejected;assert.deepEqual(f.state,before);assert.equal(f.vm.busy,false);assert.equal(f.recovery.busy,false);assert.equal(f.cancelledScripts,1);assert.equal(f.events.some(e=>e.name==='effectStart'),false);assert.equal(f.host.clock.waiting,0);}finally{f.dispose();}
});


test('local Cut cancellation leaves an independently owned field controller and persistent World clock running',async()=>{
 const f=await fixture();try{const otherOwner=new AbortController(),other=f.host.clock.createScope(route.id,otherOwner.signal);let updates=0;other.onTick(()=>{updates++;});f.actors.cutIn=async(_,context,scope)=>{await scope.waitFrames(1,context.signal);throw Error('banner failed');};const rejected=assert.rejects(f.run(),/banner failed/);await f.reach(()=>f.cancelledScripts>0);await rejected;assert.equal(other.active,true);assert.equal(f.w.fieldTasks,f.host.clock);const before=updates,finished=other.waitFrames(1);await f.advance();await finished;assert.equal(updates,before+1);f.host.dispose();assert.equal(other.active,true);assert.equal(f.w.fieldTasks,f.host.clock);other.cancel();}finally{f.dispose();}
});


test('Cut admission from another task-phase continuation cannot leak its action and prevent retry',async()=>{
 const f=await fixture();try{const other=f.host.clock.createScope(route.id,new AbortController().signal);let pending:Promise<unknown>|null=null;other.onTick(()=>{other.cancel();pending=f.run();void pending.catch(()=>{});});await f.advance();await f.reach(()=>f.host.effect.active);await f.advance(48);await pending;assert.equal(f.recovery.busy,false);const retry=f.run();void retry.catch(()=>{});await f.reach(()=>f.host.effect.active);await f.advance(48);await retry;}finally{f.dispose();}
});

test('queue-phase native banner completion is polled next script tick then bytecode resumes one tick later',async()=>{
 const f=await fixture();try{let done=-1;f.actors.cutIn=(_,context,scope)=>new Promise<void>((resolve,reject)=>{let ticks=0;const abort=()=>{off();reject(context.signal.reason);},off=scope.onTick(()=>{if(++ticks===3){done=scope.tick;off();context.signal.removeEventListener('abort',abort);resolve();}});context.signal.addEventListener('abort',abort,{once:true});});const pending=f.run();void pending.catch(()=>{});await f.reach(()=>f.host.effect.active);assert.ok(done>0);assert.equal(f.events.find(e=>e.name==='effectStart')!.tick-done,2);await f.advance(48);await pending;}finally{f.dispose();}
});

test('real sound native callback observes cry completion before the following bytecode tick',async()=>{
 const sound=await readFile(new URL('../../../src/scrcmd_sound.c',import.meta.url),'utf8');assert.match(sound,/ScrCmd_WaitCry[^]*?SetupNativeScript\(ctx, ScrNative_WaitCry\)/);assert.match(sound,/ScrNative_WaitCry\(ScriptContext \*ctx\) \{\s*if \(!IsCryFinished\(\)\) \{\s*return TRUE;/);
 const f=await fixture({activeFollower:true,species:152});try{let done=-1;(f.host as any).audio.cry=async()=>{const scope=f.host.clock.createScope(route.id,f.signal.signal);await new Promise<void>(resolve=>{let ticks=0;const off=scope.onTick(()=>{if(++ticks===3){done=scope.tick;off();resolve();}});});scope.cancel();};const pending=f.run();void pending.catch(()=>{});await f.reach(()=>f.host.effect.active);assert.ok(done>0);assert.equal(f.events.find(e=>e.name==='effectStart')!.tick-done,2);await f.advance(48);await pending;}finally{f.dispose();}
});

test('actual transition reason reaches the owned source VM instead of generic cancellation',async()=>{
 const f=await fixture();try{const rejected=assert.rejects(f.run());await f.reach(()=>f.host.effect.active);f.w.beginFieldTransition();await rejected;assert.equal(f.cancelReasons.length,1);assert.match(String(f.cancelReasons[0]),/Field transition interrupted native field tasks/);}finally{f.dispose();}
});
