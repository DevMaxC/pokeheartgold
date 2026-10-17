import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {NativeFieldClock} from './native-field-clock.ts';
import {AzaleaGymHost,type AzaleaFieldActor,type AzaleaFieldPoint,type AzaleaGymHostWorld,type AzaleaGymAudio} from './gym-azalea-host.ts';
import type {AzaleaGymResources,AzaleaResourceManifest} from './gym-azalea-world.ts';
import {initialAzaleaGymState,planAzaleaGymRide,azaleaGymRideFrame} from './gym-azalea-plan.ts';
import {originalMaterial} from './render-repair.ts';
import {ScriptVM,UnsupportedScript,type ScriptHooks} from './script.ts';
import type {State,GameData,SourceMap} from './types.ts';
import {OriginalWorld} from './world.ts';

const source=new URL('../../public/source/',import.meta.url),read=(path:string)=>readFile(new URL(path,source));
const map=JSON.parse((await read('maps/180.json')).toString())as SourceMap;
const clone=<T>(v:T):T=>structuredClone(v);
async function resources():Promise<AzaleaGymResources>{
 const manifest=JSON.parse((await read('azalea-gym/resources.json')).toString())as AzaleaResourceManifest,models=new Map<number,THREE.Group>(),patterns=new Map<string,THREE.Texture>();
 for(const[id,entry]of Object.entries(manifest.models)){
  const bytes=await read(entry.asset);assert.equal(createHash('sha256').update(bytes).digest('hex'),(entry as any).glbSHA256);const size=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+size).toString());delete doc.images;delete doc.textures;delete doc.samplers;for(const material of doc.materials??[])delete material.pbrMetallicRoughness?.baseColorTexture;
  let text=JSON.stringify(doc);text+=' '.repeat((-Buffer.byteLength(text))&3);const json=Buffer.from(text),tail=bytes.subarray(20+size),out=Buffer.alloc(20+json.length+tail.length);bytes.copy(out,0,0,20);out.writeUInt32LE(out.length,8);out.writeUInt32LE(json.length,12);json.copy(out,20);tail.copy(out,20+json.length);
  const gltf=await new GLTFLoader().parseAsync(out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength),'');gltf.scene.animations=gltf.animations;gltf.scene.traverse(object=>{if(object instanceof THREE.Mesh){const convert=(material:THREE.Material)=>originalMaterial(material as THREE.MeshStandardMaterial);object.material=Array.isArray(object.material)?object.material.map(convert):convert(object.material);}});models.set(Number(id),gltf.scene);
  for(const animation of entry.animations)if(animation.kind==='pattern')for(const track of animation.tracks)for(const key of track.keys)patterns.set(key.asset,new THREE.Texture());
 }return{manifest,models,patterns};
}
async function setup(withFollower=true){
 const events:any[]=[],state={map:180,x:3.5,z:32.5,facing:0,flags:{},vars:{},party:[],name:'Ethan'}as unknown as State;
 const world={scene:new THREE.Scene(),fieldMapID:180,azaleaGym:null,setAzaleaCameraOffset:(_owner:AzaleaGymHost,value:number)=>events.push({camera:value,tick:clock.tick})}as AzaleaGymHostWorld;
 const clock=new NativeFieldClock({field:()=>({map:world.fieldMapID,mapRunning:true}),onError:error=>{events.push({error});}});
 let followerMoving=false,activePlayer:AzaleaFieldActor,activeFollower:AzaleaFieldActor|null;
 function actor(role:string,p:AzaleaFieldPoint):AzaleaFieldActor{let facing=0;return{position:()=>({...p}),facing:()=>facing,place:next=>{Object.assign(p,next);events.push({role,place:{...p},tick:clock.tick});},settle:next=>{Object.assign(p,next);events.push({role,settle:{...p},tick:clock.tick});},face:next=>{facing=next;},movement:value=>{events.push({role,movement:value,tick:clock.tick});}};}
 activePlayer=actor('player',{x:state.x,y:0,z:state.z});activeFollower=withFollower?actor('follower',{x:state.x,y:0,z:state.z+1}):null;
 const audio:AzaleaGymAudio={prepare:async(ids,signal)=>{signal.throwIfAborted();events.push({prepare:ids});},switch1561:async signal=>{signal.throwIfAborted();events.push('switch1561');return{kind:'voice'};},robot2171:owner=>{events.push({robot:true,owner,tick:clock.tick});return{kind:'voice'};},stop2171:(owner,fade)=>{events.push({robot:false,owner,fade,tick:clock.tick});}};
 const ports={actors:()=>({player:activePlayer,follower:activeFollower}),followerMoving:()=>followerMoving,audio};
 const host=new AzaleaGymHost(world,state,clock,ports,resources);await host.enter(map,'warp');
 const context={map,signal:new AbortController().signal};
 async function frame(dt=1/30){clock.frame(dt);await clock.settled();await new Promise<void>(resolve=>setImmediate(resolve));}
 async function until<T>(pending:Promise<T>,limit=1000){let done=false,result:T|undefined,error:unknown;pending.then(v=>{done=true;result=v;},e=>{done=true;error=e;});for(let i=0;!done&&i<limit;i++)await frame();assert.ok(done,'source command failed to settle');if(error!==undefined)throw error;return result!;}
 return{events,state,world,clock,host,ports,audio,context,frame,until,player:()=>activePlayer,follower:()=>activeFollower,setFollowerMoving:(v:boolean)=>{followerMoving=v;},replacePlayer:()=>{activePlayer=actor('replacement',{x:1.5,y:0,z:1.5});},dispose:async()=>{await host.dispose();clock.dispose();}};
}

test('actual room admission hydrates four spiders only for Continue; warp/connection reset original save state',async()=>{
 const h=await setup();try{assert.equal(h.world.scene.children.length,1);assert.equal(h.host.renderer.spiderModels.length,4);h.state.gymmick={kind:'azalea',spiders:[4,1,2,7],switches:3};await h.host.enter(map,'continue');assert.deepEqual(h.host.renderer.state,{spiders:[4,1,2,7],switches:3});h.host.init(h.context);assert.deepEqual(h.state.gymmick,{kind:'azalea',...initialAzaleaGymState()},'actual InitAzaleaGym resets unconditionally even when previous load was Continue');
 await h.host.enter(map,'connection');assert.deepEqual(h.host.renderer.state,initialAzaleaGymState());h.state.gymmick={kind:'azalea',spiders:[99,1,2,7],switches:3};await h.host.enter(map,'warp');assert.deepEqual(h.host.renderer.state,initialAzaleaGymState());
 h.state.gymmick={kind:'azalea',spiders:[99,1,2,7],switches:3};await assert.rejects(h.host.enter(map,'continue'),/Invalid native/);assert.equal(h.host.active,false);assert.equal(h.world.scene.children.length,0);
 (h.state as any).gymmick={kind:'azalea',switches:99};await h.host.enter(map,'warp');assert.deepEqual(h.host.renderer.state,initialAzaleaGymState());
 }finally{await h.dispose();}
});

test('shared clock publishes every actual route frame with follower, endpoint save before dock, eight-tick board/disembark',async()=>{
 const h=await setup(),plan=planAzaleaGymRide(initialAzaleaGymState(),0);try{
  const stop=h.audio.stop2171;let endpoint:any;h.audio.stop2171=(owner,fade)=>{endpoint={puzzle:clone(h.state.gymmick),logical:[h.state.x,h.state.z],vector:h.player().position()};stop(owner,fade);};const place=h.player().place,logicalSamples:any[]=[];h.player().place=p=>{logicalSamples.push({vector:p.z,logical:h.state.z});place(p);};
  const pending=h.host.ride(0,h.context);assert.equal(h.host.moving,true);await h.until(pending);
  const playerMoves=h.events.filter(e=>e.role==='player'&&e.place),robotStart=h.events.find(e=>e.robot===true),robotStop=h.events.find(e=>e.robot===false);
  const riding=playerMoves.filter(e=>e.tick>=robotStart.tick&&e.tick<=robotStop.tick);assert.equal(riding.length,plan.movementTicks);
  for(let i=0;i<riding.length;i++)assert.deepEqual(riding[i].place,azaleaGymRideFrame(plan,i+1).player);
  assert.deepEqual(h.player().position(),{x:9.5,y:0,z:23.5});assert.deepEqual(h.follower()!.position(),{x:9.5,y:0,z:24.5});assert.deepEqual([h.state.x,h.state.z,h.state.fieldHeight],[9.5,23.5,0]);assert.deepEqual(h.state.gymmick,{kind:'azalea',spiders:[4,1,2,7],switches:0});
  assert.deepEqual(endpoint,{puzzle:{kind:'azalea',spiders:[4,1,2,7],switches:0},logical:[3.5,31.5],vector:{x:9.5,y:0,z:24.5}},'source endpoint saves puzzle before the following docking tick updates logical tile coords');
  const steps=h.events.filter(e=>e.role==='player'&&e.movement);assert.equal(steps.length,16);assert.deepEqual(steps.slice(0,8).map(e=>e.movement.step),[0,1,2,3,4,5,6,7]);assert.equal(robotStop.tick-robotStart.tick,209);assert.equal(robotStop.fade,1);assert.equal(robotStop.owner,robotStart.owner);
  assert.deepEqual(logicalSamples[0],{vector:32.375,logical:31.5},'MapObject_StartWalkMovement changes current coordinates before its eight vector offsets');assert.deepEqual(steps[0].movement.previous,{x:3.5,y:0,z:32.5});assert.deepEqual(steps[0].movement.current,{x:3.5,y:0,z:31.5});
  assert.equal(h.host.riderPosition,null);assert.equal(h.host.playerHeld,false);assert.equal(h.host.streamingTarget,null);assert.equal(h.host.moving,false);assert.ok(h.events.filter(e=>e.camera!==undefined).some(e=>Math.abs(e.camera)===1/16));
  assert.ok(h.events.some(e=>e.role==='player'&&e.settle?.z===24.5&&e.tick===robotStop.tick+1),'docking updates current/previous coordinates one tick after endpoint');
 }finally{await h.dispose();}
});

test('reverse source station rides south with no follower and persists final native grid centers',async()=>{
 const h=await setup(false);try{h.state.gymmick={kind:'azalea',spiders:[4,1,2,7],switches:0};await h.host.enter(map,'continue');const plan=planAzaleaGymRide(h.host.renderer.state!,4);Object.assign(h.state,{x:plan.boarding.from.x,z:plan.boarding.from.z});h.player().place({...plan.boarding.from,y:0});await h.until(h.host.ride(4,h.context));assert.deepEqual(h.player().position(),{...plan.arrival.disembarked,y:0});assert.deepEqual([h.state.x,h.state.z],[plan.arrival.disembarked.x,plan.arrival.disembarked.z]);assert.deepEqual(h.state.gymmick,{kind:'azalea',...initialAzaleaGymState()});assert.ok(h.events.filter(e=>e.movement).every(e=>e.movement.direction===1));}finally{await h.dispose();}
});

test('source follower wait delays boarding; shared static phase continues and stalled draw never catches up',async()=>{
 const h=await setup();try{h.setFollowerMoving(true);const pending=h.host.ride(0,h.context);await h.frame();await h.frame(1);assert.equal(h.events.filter(e=>e.place).length,0);assert.equal(h.clock.tick,2);assert.ok((h.host.renderer as any).tick>=2);h.setFollowerMoving(false);await h.until(pending);assert.equal(h.state.z,23.5);}finally{await h.dispose();}
});

test('source switch awaits actual1561 completion and missing audio rejects before puzzle/rider mutation',async()=>{
 const h=await setup(false);try{let finish:(()=>void)|undefined;h.audio.switch1561=()=>new Promise(resolve=>{finish=()=>resolve({kind:'voice'});});const pending=h.host.flipSwitch(1,h.context);pending.catch(()=>{});for(let i=0;!finish&&i<4;i++)await h.frame();assert.ok(finish);assert.equal(h.state.gymmick?.kind,'azalea');assert.equal((h.state.gymmick as any).switches,2);assert.equal(h.host.moving,true);finish();await h.until(pending);assert.equal(h.host.moving,false);
 const previous=clone(h.state.gymmick);(h.ports as any).audio={};await assert.rejects(h.host.flipSwitch(0,h.context),/SE1561\/2171/);assert.deepEqual(h.state.gymmick,previous);assert.equal(h.events.filter(e=>e.place).length,0);
 }finally{await h.dispose();}
});

test('native ignored PlaySE failure permits visual progression with explicit no-voice diagnostics and a real task poll',async()=>{
 const h=await setup(false);try{h.audio.switch1561=async()=>({kind:'no-voice',detail:'browser audio context unavailable'});h.audio.robot2171=()=>({kind:'no-voice',detail:'native voice capacity unavailable'});const pending=h.host.flipSwitch(0,h.context);for(let i=0;i<2;i++)await h.frame();assert.equal((h.state.gymmick as any).switches,1);assert.equal(h.host.moving,true,'even no-voice waits for native completion poll');await h.until(pending);assert.equal(h.host.audioStatus[1561].kind,'no-voice');await h.until(h.host.ride(0,h.context));assert.deepEqual([h.state.x,h.state.z],[9.5,23.5]);assert.equal(h.host.audioStatus[2171].kind,'no-voice');}finally{await h.dispose();}
});

test('abort drains asynchronous sound finalization before the VM-owned action rejects',async()=>{
 const h=await setup(false);try{let soundStarted=false,release!:()=>void,settled=false;h.audio.switch1561=signal=>new Promise((resolve,reject)=>{soundStarted=true;signal.addEventListener('abort',()=>{release=()=>{settled=true;reject(signal.reason);};},{once:true});});const controller=new AbortController(),pending=h.host.flipSwitch(0,{map,signal:controller.signal});let rejected=false;pending.catch(()=>{rejected=true;});for(let i=0;!soundStarted&&i<5;i++)await h.frame();assert.equal(soundStarted,true);controller.abort(new Error('abort sound'));await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(rejected,false);assert.equal(settled,false);release();await assert.rejects(pending,/abort sound/);assert.equal(settled,true);assert.deepEqual(h.state.gymmick,{kind:'azalea',...initialAzaleaGymState()});}finally{await h.dispose();}
});

test('local abort restores same-map checkpoint and never cancels another admitted field scope',async()=>{
 const h=await setup(),owner=new AbortController(),other=h.clock.createScope(180,owner.signal);let otherTicks=0;other.onTick(()=>otherTicks++);try{
 const controller=new AbortController(),pending=h.host.ride(0,{map,signal:controller.signal});pending.catch(()=>{});for(let i=0;i<30;i++)await h.frame();assert.notEqual(h.state.z,32.5);controller.abort(new Error('script cancelled'));await assert.rejects(pending,/cancel/);assert.deepEqual([h.state.x,h.state.z],[3.5,32.5]);assert.deepEqual(h.state.gymmick,{kind:'azalea',...initialAzaleaGymState()});const before=otherTicks;await h.frame();assert.equal(otherTicks,before+1);assert.equal(other.active,true);assert.equal(h.host.riderPosition,null);
 }finally{owner.abort();await h.dispose();}
});

test('unload while moving releases owned view without restoring departed actor coordinates or saving stale puzzle',async()=>{
 const h=await setup();try{const pending=h.host.ride(0,h.context);pending.catch(()=>{});for(let i=0;i<30;i++)await h.frame();const placements=h.events.filter(e=>e.place).length;h.host.leave();(h.world as any).fieldMapID=1;h.state.map=1;h.state.x=20.5;h.state.z=20.5;await assert.rejects(pending);for(let i=0;i<3;i++)await h.frame();assert.equal(h.events.filter(e=>e.place).length,placements);assert.deepEqual([h.state.x,h.state.z],[20.5,20.5]);assert.equal(h.host.riderHeight,undefined);assert.equal(h.host.playerHeld,false);assert.equal(h.world.scene.children.length,0);}finally{await h.dispose();}
});

test('reentrant actor port unload stops before follower or further actor writes in the same source tick',async()=>{
 const h=await setup();try{const original=h.player().place;h.player().place=p=>{original(p);h.host.leave();(h.world as any).fieldMapID=1;h.state.map=1;h.state.x=99.5;h.state.z=99.5;};const pending=h.host.ride(0,h.context);pending.catch(()=>{});await assert.rejects(h.until(pending));assert.equal(h.events.filter(e=>e.role==='follower'&&e.place).length,0);assert.deepEqual([h.state.x,h.state.z],[99.5,99.5]);assert.equal(h.host.moving,false);}finally{await h.dispose();}
});

test('changed actor identity fails rather than moving a replacement into a stale ride',async()=>{
 const h=await setup();try{const pending=h.host.ride(0,h.context);pending.catch(()=>{});for(let i=0;i<20;i++)await h.frame();h.replacePlayer();await assert.rejects(h.until(pending),/identities/);assert.deepEqual(h.player().position(),{x:1.5,y:0,z:1.5});}finally{await h.dispose();}
});

test('a render vector cannot silently replace an unrelated logical boarding tile',async()=>{
 const h=await setup(false);try{h.state.x=1.5;await assert.rejects(h.until(h.host.ride(0,h.context)),/completed logical boarding/);assert.deepEqual(h.player().position(),{x:3.5,y:0,z:32.5});assert.deepEqual(h.state.gymmick,{kind:'azalea',...initialAzaleaGymState()});assert.equal(h.events.filter(e=>e.place).length,0);}finally{await h.dispose();}
});

const baseHooks={message:async()=>{},choice:async()=>0,move:async()=>{},position:()=>{},face:()=>{},visible:()=>{},chooseStarter:async()=>{},nickname:async()=>{},refresh:async()=>{},battle:async()=>true,warp:async()=>{}}satisfies ScriptHooks;
test('real0869 station/switch byte commands reach required ports with source map and abort signal',async()=>{
 const state={map:180,vars:{},flags:{},party:[],name:'Ethan'}as unknown as State,events:any[]=[],hooks={...baseHooks,azaleaGym:{init:context=>{events.push(['init',context.map.id,context.signal.aborted]);},spinarak:async(index,context)=>{events.push(['ride',index,context.map.id,context.signal.aborted]);},switch:async(index,context)=>{events.push(['switch',index,context.map.id,context.signal.aborted]);}}}satisfies ScriptHooks;
 const vm=new ScriptVM({constants:{},index:{stdScripts:[]}}as unknown as GameData,state,hooks);for(let script=3;script<=16;script++)await vm.run(map,script);
 assert.deepEqual(events.slice(0,12).map(e=>e.slice(0,2)),Array.from({length:12},(_,i)=>['ride',i]));assert.deepEqual(events.slice(12).map(e=>e.slice(0,2)),[['switch',0],['switch',1]]);assert.ok(events.every(e=>e[2]===180&&e[3]===false));
 const initMap=clone(map);initMap.scripts={entries:['init'],labels:{init:0},instructions:[['AzaleaGymInit',[]],['End',[]]]};await vm.run(initMap,1);assert.deepEqual(events.at(-1),['init',180,false]);
 const noPort=new ScriptVM({constants:{}}as GameData,state,baseHooks);await assert.rejects(noPort.run(map,3),UnsupportedScript);const foreign=clone(map);foreign.id=1;await assert.rejects(vm.run(foreign,3),UnsupportedScript);
});

test('VM cancellation aborts and drains the owned Azalea port before source recovery can resume',async()=>{
 const state={map:180,vars:{},flags:{},party:[],name:'Ethan'}as unknown as State;let settled=false,observed:AbortSignal|undefined;
 const vm=new ScriptVM({constants:{}}as GameData,state,{...baseHooks,azaleaGym:{init:()=>{},switch:async()=>{},spinarak:async(_index,context)=>{observed=context.signal;await new Promise<void>((_resolve,reject)=>context.signal.addEventListener('abort',()=>{settled=true;reject(context.signal.reason);},{once:true}));}}});
 const pending=vm.run(map,3);pending.catch(()=>{});assert.ok(observed);vm.cancel(new Error('map exit'));await assert.rejects(pending,/map exit/);assert.equal(observed.aborted,true);assert.equal(settled,true);assert.equal(vm.busy,false);
});

test('actual0869 VM ride command waits for native host final tiles and resumes in the child-completion scripts phase',async()=>{
 const h=await setup(false);try{let finishedPhase:string|undefined;const vm=new ScriptVM({constants:{}}as GameData,h.state,{...baseHooks,azaleaGym:h.host.scriptPorts}),pending=vm.run(map,3);pending.then(()=>{finishedPhase=h.clock.phase;});assert.equal(vm.busy,true);await h.frame();assert.equal(vm.busy,true);await h.until(pending);assert.equal(vm.busy,false);assert.deepEqual([h.state.x,h.state.z],[9.5,23.5]);assert.equal(h.host.moving,false);assert.equal(finishedPhase,'scripts');}finally{await h.dispose();}
});

test('World applies cumulative camera shake to position AND target without orbit reset or drift',()=>{
 const world=Object.create(OriginalWorld.prototype)as any,owner={};world.azaleaGym=owner;world.azaleaCameraZ=0;world.target=new THREE.Vector3(4,5,6);world.camera=new THREE.PerspectiveCamera();world.camera.position.set(10,11,12);Object.assign(world,{yaw:1.2,pitch:.65,distance:20});
 for(const z of [1/16,1/16,0,0,-1/16,0])world.setAzaleaCameraOffset(owner,z);
 assert.deepEqual(world.target.toArray(),[4,5,6]);assert.deepEqual(world.camera.position.toArray(),[10,11,12]);assert.deepEqual([world.yaw,world.pitch,world.distance],[1.2,.65,20]);world.setAzaleaCameraOffset({},1);assert.equal(world.target.z,6);
});

test('actual World streaming suppresses only managed Azalea props when an owning host is installed',async()=>{
 const matrix=JSON.parse((await read('matrices/105.json')).toString());
 async function admitted(key:string,host:boolean){const loaded:string[]=[],world=Object.create(OriginalWorld.prototype)as any,sourceMap={...map,key};Object.assign(world,{matrix,activeMatrix:105,activeHeader:180,generation:0,pending:null,loading:false,cells:new Map(),scene:new THREE.Scene(),index:{maps:{180:sourceMap}},terraces:null,entrances:Promise.resolve({105:[]}),latestStream:{matrix:105,id:180,x:3.5,z:32.5},azaleaGym:host?{}:null});world.map=async()=>sourceMap;world.land=async()=>({permissions:new Array(1024).fill(32768),plates:[]});world.asset=async(path:string)=>{loaded.push(path);return new THREE.Group();};await world.stream(180,3.5,32.5);return loaded;}
 const managed=map.cells.flatMap(cell=>cell.props.filter(prop=>[115,116,117,122].includes(prop.id)).map(prop=>prop.asset));assert.equal(managed.length,6);
 const owned=await admitted(map.key,true);for(const asset of managed)assert.equal(owned.includes(asset),false);
 for(const args of [[map.key,false],['MAP_OTHER_ROOM',true]]as const){const original=await admitted(...args);for(const asset of managed)assert.ok(original.includes(asset));}
});

test('real World transition releases Azalea actor/view ownership before globally cancelling shared field scopes',()=>{
 const events:string[]=[],world=Object.create(OriginalWorld.prototype)as any;Object.assign(world,{azaleaGym:{leave:()=>events.push('azalea release')},fieldTasks:{cancel:()=>events.push('all scopes cancel')},fieldEffect:{cancel:()=>events.push('presentation cancel')}});world.beginFieldTransition();assert.deepEqual(events,['azalea release','all scopes cancel','presentation cancel']);assert.equal(world.fieldTransitionActive,true);
});

test('a superseded asynchronous room load never publishes an incoming field cart, scope or save',async()=>{
 let release!:(value:AzaleaGymResources)=>void;const sourceResources=await resources(),state={map:180,x:3.5,z:32.5,facing:0}as State,world={scene:new THREE.Scene(),fieldMapID:180,azaleaGym:null,setAzaleaCameraOffset:()=>{}}as AzaleaGymHostWorld,clock=new NativeFieldClock({field:()=>({map:world.fieldMapID,mapRunning:true}),onError:error=>{throw error;}});
 const host=new AzaleaGymHost(world,state,clock,{}as any,()=>new Promise(resolve=>{release=resolve;}));try{const pending=host.enter(map,'warp');host.leave();(world as any).fieldMapID=1;state.map=1;release(sourceResources);await pending;assert.equal(host.active,false);assert.equal(world.scene.children.length,0);assert.equal(state.gymmick,undefined);assert.equal(clock.waiting,0);}finally{await host.dispose();clock.dispose();}
});
