import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {OriginalWorld} from './world.ts';
import {fieldCameraEntry} from './camera.ts';

function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return{promise,resolve};}
function fixture(){
 const world=Object.create(OriginalWorld.prototype) as any;let renders=0;
 Object.assign(world,{camera:new THREE.PerspectiveCamera(52),target:new THREE.Vector3(564.5,2,391.5),scene:new THREE.Scene(),cells:new Map(),npcSprites:new Map(),activeMatrix:1,activeHeader:67,matrix:{headers:null},generation:0,cameraReady:true,cameraTransition:false,grassTime:0,yaw:1.2,pitch:.4,distance:13,sky:{enter(){},update(){}},renderer:{render(){renders++;}},height:()=>1,stream:async()=>{},map:async()=>({matrix:1})});
 fieldCameraEntry(world.camera,world.target,world.target.clone(),true,world.yaw,world.pitch,world.distance);
 return{world,renders:()=>renders};
}
test('a deferred room load never chases incoming coordinates through the outgoing scene',async()=>{
 const{world,renders}=fixture(),metadata=deferred<any>(),stream=deferred<void>();world.map=()=>metadata.promise;world.stream=()=>stream.promise;
 const position=world.camera.position.clone(),rotation=world.camera.quaternion.clone(),target=world.target.clone(),offset=position.clone().sub(target),entering=world.enter(68,8.5,19.5);
 for(let i=0;i<12;i++)world.draw(8.5,19.5,1/60,1);
 assert.deepEqual(world.target.toArray(),target.toArray());assert.deepEqual(world.camera.position.toArray(),position.toArray());assert.deepEqual(world.camera.quaternion.toArray(),rotation.toArray());assert.equal(renders(),0);
 metadata.resolve({matrix:1});await Promise.resolve();await Promise.resolve();
 for(let i=0;i<12;i++)world.draw(8.5,19.5,1/60,1);
 assert.deepEqual(world.target.toArray(),target.toArray());assert.deepEqual(world.camera.position.toArray(),position.toArray());assert.equal(renders(),0);
 stream.resolve();await entering;
 assert.deepEqual(world.target.toArray(),[8.5,1.9,19.5]);assert.ok(world.camera.position.clone().sub(world.target).distanceTo(offset)<1e-10);assert.ok(world.camera.quaternion.angleTo(rotation)<1e-7);
 world.draw(8.5,19.5,1/60,1);assert.equal(renders(),1);assert.ok(world.camera.quaternion.angleTo(rotation)<1e-7);
});
test('caller-owned loading stays frozen through actor placement and releases before entry-script movement',async()=>{
 const{world,renders}=fixture();world.beginFieldTransition();await world.enter(68,8.5,19.5);
 const position=world.camera.position.clone(),target=world.target.clone();world.draw(8.5,19.5,1/60,22);
 assert.equal(renders(),0);assert.deepEqual(world.camera.position.toArray(),position.toArray());assert.deepEqual(world.target.toArray(),target.toArray());
 world.endFieldTransition();world.draw(8.5,19.4,1/60,1);assert.equal(renders(),1);assert.ok(world.target.z<target.z);
});
test('failed direct loads release their guard, while outer callers retain ownership until cleanup',async()=>{
 for(const outer of[false,true]){
  const{world,renders}=fixture();if(outer)world.beginFieldTransition();world.map=async()=>{throw Error('source unavailable');};
  await assert.rejects(world.enter(68,8.5,19.5),/source unavailable/);world.draw(564.5,391.5,1/60,1);assert.equal(renders(),outer?0:1);
  if(outer){world.endFieldTransition();world.draw(564.5,391.5,1/60,1);assert.equal(renders(),1);}
 }
});
