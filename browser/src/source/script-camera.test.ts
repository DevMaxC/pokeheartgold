import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {loadData,newState} from './data.ts';
import {FieldObjects} from './objects.ts';
import {movementAction} from './movement.ts';
import {ScriptVM,UnsupportedScript,type ScriptHooks} from './script.ts';
import {SCRIPT_CAMERA_ACTOR,ScriptCameraTarget,setScriptCameraTarget,scriptCameraMovement,type ScriptCameraTween} from './script-camera.ts';
import {OriginalWorld} from './world.ts';
import {fieldCameraEntry} from './camera.ts';
import {sourceJSON,type SourceMap} from './types.ts';

globalThis.fetch=async input=>{try{return new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));}catch{return new Response('',{status:404});}};
const data=await loadData(),native=await sourceJSON<SourceMap>('maps/156.json');
const immediate:ScriptCameraTween=async(_seconds,update)=>{for(const progress of[0,.25,.5,.75,1])update(progress);};

function scene(source:SourceMap=structuredClone(native)){
 const state=newState(data,'Ethan','boy');Object.assign(state,{map:156,x:13.5,z:17.5});
 const objects=new FieldObjects(data,state);objects.load(source.events.objects);
 const target=new ScriptCameraTarget((_x,z)=>2+z/10),positions:{x:number;y:number;z:number}[]=[],moves:string[]=[],messages:string[]=[];
 const tween:ScriptCameraTween=async(seconds,update)=>immediate(seconds,progress=>{update(progress);const point=target.position;if(point)positions.push(point);});
 const host={createScriptCameraTarget:(map:number,x:number,z:number)=>target.create(map,x,z),clearScriptCameraTarget:()=>target.clear(),moveScriptCameraTarget:(map:SourceMap,label:string,animate:ScriptCameraTween)=>target.move(map,label,animate)};
 const hooks:ScriptHooks={message:async text=>{messages.push(text);},choice:async()=>0,chooseStarter:async()=>{},nickname:async()=>{},refresh:async()=>{},battle:async()=>true,warp:async()=>{},face:()=>{},position:()=>{},visible:(id,value)=>objects.show(id,value),
   // Deliberately hostile: reserved 241 must win over ordinary NPC lookup.
   objectName:id=>id===241?source.events.objects[0].id:undefined,
   cameraTarget:point=>setScriptCameraTarget(host,state.map,point),
   move:async(id,label,map)=>{
    moves.push(id);const cameraMove=scriptCameraMovement(host,id,label,map,tween);if(cameraMove){await cameraMove;return;}
    let index=map.scripts.labels[label];assert.notEqual(index,undefined);
    for(;;){const[command,args]=map.scripts.instructions[index++],action=movementAction(command,args);if(action.end)break;
     const actor=id==='obj_player'?null:objects.get(id);assert.ok(id==='obj_player'||actor,`actual source actor ${id}`);
     if(action.facing!==null){if(actor)actor.facingDirection=action.facing;else state.facing=action.facing;}
     if(action.distance&&action.facing!==null){const d=[{x:0,z:-1},{x:0,z:1},{x:-1,z:0},{x:1,z:0}][action.facing],distance=action.distance*action.repeats;if(actor){actor.x+=d.x*distance;actor.z+=d.z*distance;}else{state.x+=d.x*distance;state.z+=d.z*distance;}}
    }
   }};
 return{state,objects,target,positions,moves,messages,hooks,vm:new ScriptVM(data,state,hooks),source};
}

test('actual Sprout Tower 3F script2 pans virtual241 five north then five south and completes the rival flags',async()=>{
 const s=scene();await s.vm.run(s.source,2);
 assert.equal(s.vm.lastUnsupported,null);assert.equal(s.vm.busy,false);
 assert.equal(s.state.flags.FLAG_UNK_078,true);assert.equal(s.state.vars.VAR_UNK_40A4,1);
 assert.deepEqual([s.state.x,s.state.z],[13.5,17.5]);assert.equal(s.target.position,null);
 assert.deepEqual(s.moves.filter(id=>id===SCRIPT_CAMERA_ACTOR),[SCRIPT_CAMERA_ACTOR,SCRIPT_CAMERA_ACTOR]);
 assert.equal(Math.min(...s.positions.map(p=>p.z)),12.5);assert.equal(s.positions.at(-1)?.z,17.5);
 assert.ok(s.positions.some(p=>p.z===17.25));assert.ok(s.positions.every(p=>p.x===13.5&&Math.abs(p.y-(2+p.z/10))<1e-12));
 assert.deepEqual([s.objects.get('obj_D15R0103_gsrivel')?.x,s.objects.get('obj_D15R0103_gsrivel')?.z],[12,13]);
 assert.equal(s.objects.snapshot().find(object=>object.id==='obj_D15R0103_gsrivel')?.visible,false);assert.equal(s.objects.get('obj_D15R0103_gsrivel')?.shown,undefined);assert.equal(s.messages.length,3);
 assert.ok(s.vm.supported.has('CreateCameraTarget')&&s.vm.supported.has('RemoveCameraTarget'));
});

test('camera support remains explicit and a later unsupported scene cleans focus before returning its error',async()=>{
 const missing=scene();delete missing.hooks.cameraTarget;await assert.rejects(missing.vm.run(missing.source,2),error=>error instanceof UnsupportedScript&&error.command==='CreateCameraTarget');
 const s=scene();s.source.scripts.instructions[12]=['UnportedAfterCamera',[]];
 await assert.rejects(s.vm.run(s.source,2),error=>error instanceof UnsupportedScript&&error.command==='UnportedAfterCamera');
 assert.equal(s.target.position,null);assert.equal(s.state.flags.FLAG_UNK_078,undefined);assert.equal(s.vm.busy,false);
});

test('removing or replacing a camera actor cancels outstanding writes without resurrecting old focus',async()=>{
 const camera=new ScriptCameraTarget((_x,z)=>z);camera.create(156,13,17);
 let tick!:(t:number)=>void,finish!:()=>void;
 const moving=camera.move(native,'_00C0',async(_seconds,update)=>{tick=update;await new Promise<void>(resolve=>finish=resolve);});
 tick(.5);assert.equal(camera.position?.z,17);camera.clear();camera.create(156,2,3);tick(1);finish();
 await assert.rejects(moving,/cancelled by a field change/);assert.deepEqual(camera.position,{map:156,x:2.5,y:3.5,z:3.5});
 camera.clear();camera.clear();await assert.rejects(camera.move(native,'_00C0',immediate),/Missing original camera movement object 241/);
});

function worldFixture(){
 const world=Object.create(OriginalWorld.prototype) as OriginalWorld&Record<string,any>,streamed:{id:number;x:number;z:number}[]=[];
 Object.assign(world,{camera:new THREE.PerspectiveCamera(52),target:new THREE.Vector3(13.5,3.9,17.5),scene:new THREE.Scene(),cells:new Map(),npcSprites:new Map(),activeMatrix:14,activeHeader:156,matrix:{headers:null},generation:0,cameraReady:true,cameraTransition:false,grassTime:0,yaw:1.23,pitch:.57,distance:19,sky:{enter(){},update(){}},renderer:{render(){}},height:(_x:number,z:number)=>3+z/100,stream:async(id:number,x:number,z:number)=>{streamed.push({id,x,z});},map:async()=>native,streamRequest:false,streamCenter:'',nextStreamAttempt:0});
 fieldCameraEntry(world.camera,world.target,world.target.clone(),true,world.yaw,world.pitch,world.distance);return{world,streamed};
}

test('world focuses and streams the invisible source actor smoothly while preserving free-camera orbit',async()=>{
 const{world,streamed}=worldFixture(),target=world.target.clone(),position=world.camera.position.clone();
 world.createScriptCameraTarget(156,13,17);await Promise.resolve();await world.moveScriptCameraTarget(native,'_00C0',immediate);
 assert.deepEqual(world.target.toArray(),target.toArray());assert.deepEqual(world.camera.position.toArray(),position.toArray());
 world.updateStreaming(156,99,99);assert.equal(world.latestStream.x,13.5);assert.equal(world.latestStream.z,12.5);assert.equal(streamed[0].x,13.5);
 world.draw(13.5,17.5,1/60,3);assert.ok(world.target.z<17.5&&world.target.z>12.5);assert.deepEqual([world.yaw,world.pitch,world.distance],[1.23,.57,19]);
 const focus=world.target.clone();world.clearScriptCameraTarget();assert.deepEqual(world.target.toArray(),focus.toArray());world.draw(13.5,17.5,1/60,3);assert.ok(world.target.z>focus.z);assert.deepEqual([world.yaw,world.pitch,world.distance],[1.23,.57,19]);
});

test('map entry and changed connected headers clear script focus before loading the next field',async()=>{
 for(const connection of[false,true]){
  const{world}=worldFixture();world.createScriptCameraTarget(156,13,17);world.map=async()=>({...native,id:157});
  if(connection){world.matrix.headers=[156];await world.connect(157,4.5,5.5);}else await world.enter(157,4.5,5.5);
  assert.equal(world.scriptCameraPosition,null);assert.deepEqual([world.yaw,world.pitch,world.distance],[1.23,.57,19]);
 }
});

test('production routing uses the live field for a common script bank and preserves its actual movement labels',async()=>{
 const s=scene(),{world}=worldFixture(),bank=structuredClone(s.source);bank.id=999;
 s.hooks.cameraTarget=point=>setScriptCameraTarget(world,s.state.map,point);
 const ordinaryMove=s.hooks.move;let cameraMoves=0;
 s.hooks.move=async(object,label,source)=>{const movement=scriptCameraMovement(world,object,label,source,immediate);if(movement){cameraMoves++;await movement;}else await ordinaryMove(object,label,source);};
 await s.vm.run(bank,2);assert.equal(cameraMoves,2);assert.equal(world.scriptCameraPosition,null);assert.equal(s.state.flags.FLAG_UNK_078,true);assert.equal(s.state.vars.VAR_UNK_40A4,1);
});

test('a real World.enter during a pending VM241 movement rejects the scene and never restores stale focus',async()=>{
 const s=scene(),{world}=worldFixture();let tick:((t:number)=>void)|undefined,finish!:()=>void;
 s.hooks.cameraTarget=point=>setScriptCameraTarget(world,s.state.map,point);
 const ordinaryMove=s.hooks.move;
 s.hooks.move=async(object,label,source)=>{const movement=scriptCameraMovement(world,object,label,source,async(_seconds,update)=>{tick=update;await new Promise<void>(resolve=>finish=resolve);});if(movement)await movement;else await ordinaryMove(object,label,source);};
 const running=s.vm.run(s.source,2);for(let i=0;i<20&&!tick;i++)await Promise.resolve();assert.ok(tick);assert.equal(s.vm.busy,true);
 world.map=async()=>({...native,id:157});await world.enter(157,4.5,5.5);assert.equal(world.scriptCameraPosition,null);
 tick(1);finish();await assert.rejects(running,/cancelled by a field change/);assert.equal(s.vm.busy,false);assert.equal(world.scriptCameraPosition,null);assert.equal(s.state.flags.FLAG_UNK_078,undefined);
});
