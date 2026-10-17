import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {addTreeVolumes} from './tree-volume.ts';
import {fieldCameraObstacles} from './camera.ts';

test('tree crowns are closed volumes from above, behind and either side with independently rooted trunks',()=>{
 const root=new THREE.Group(),footV=.90625,trees=[{center:new THREE.Vector3(0,-6,0),width:64,height:64,color:new THREE.Color(1,1,1)},{center:new THREE.Vector3(64,-6,0),width:64,height:64,color:new THREE.Color(.8,.9,.8)}],{leaves,trunks}=addTreeVolumes(root,trees,undefined,{footV});root.updateMatrixWorld(true);assert.equal(leaves.count,2);assert.equal(trunks.count,2);assert.equal(fieldCameraObstacles(root).length,0);
 const p=leaves.geometry.getAttribute('position'),edges=new Map<string,number>();for(let i=0;i<p.count;i+=3)for(let j=0;j<3;j++){const key=[i+j,i+(j+1)%3].map(k=>[p.getX(k),p.getY(k),p.getZ(k)].map(n=>Math.round(n*1e6)).join(',')).sort().join('|');edges.set(key,(edges.get(key)||0)+1);}assert.ok([...edges.values()].every(n=>n===2),'Every crown lobe is closed');
 for(const [origin,direction]of [[new THREE.Vector3(0,100,0),new THREE.Vector3(0,-1,0)],[new THREE.Vector3(0,25,-100),new THREE.Vector3(0,0,1)],[new THREE.Vector3(0,25,100),new THREE.Vector3(0,0,-1)],[new THREE.Vector3(-100,25,0),new THREE.Vector3(1,0,0)]])assert.ok(new THREE.Raycaster(origin,direction).intersectObject(leaves).some(h=>h.instanceId===0));
 const matrix=new THREE.Matrix4();for(let i=0;i<2;i++){trunks.getMatrixAt(i,matrix);const position=new THREE.Vector3().setFromMatrixPosition(matrix);assert.equal(position.x,i*64);assert.equal(position.y,0);assert.equal(position.z,0);}assert.equal((leaves.material as THREE.Material).transparent,false);assert.ok(leaves.geometry.getAttribute('color'));assert.ok(Array.from(leaves.instanceMatrix.array).every(Number.isFinite));
});
test('tree volumes retain source ground pivots when their asset group is scaled and translated',()=>{
 const root=new THREE.Group();root.position.set(40,3,60);root.scale.setScalar(1/16);const {leaves,trunks}=addTreeVolumes(root,[{center:new THREE.Vector3(16,-6,32),width:64,height:64,color:new THREE.Color(1,1,1)}],undefined,{footV:.90625});root.updateMatrixWorld(true);const m=new THREE.Matrix4();trunks.getMatrixAt(0,m);const foot=new THREE.Vector3().setFromMatrixPosition(m).applyMatrix4(trunks.matrixWorld);assert.deepEqual(foot.toArray(),[41,3,62]);const hit=new THREE.Raycaster(new THREE.Vector3(41,20,62),new THREE.Vector3(0,-1,0)).intersectObject(leaves)[0];assert.ok(hit);assert.ok(Math.abs(hit.point.y-(3+58/16))<1e-4);
});
test('transparent sprite margins do not enlarge the visible canopy',()=>{
 const root=new THREE.Group(),{leaves}=addTreeVolumes(root,[{center:new THREE.Vector3(0,-6,0),width:64,height:64,color:new THREE.Color(1,1,1)}],undefined,{footV:.90625,topV:.25,crownWidth:.65});root.updateMatrixWorld(true);const top=new THREE.Raycaster(new THREE.Vector3(0,100,0),new THREE.Vector3(0,-1,0)).intersectObject(leaves)[0];assert.ok(top);assert.ok(Math.abs(top.point.y-42)<1e-5);const bounds=new THREE.Box3().setFromObject(leaves);assert.ok(Math.abs(bounds.max.x-bounds.min.x-41.6)<1e-4);
});
test('off-centre crowns keep their authored position while the trunk stays rooted and connects to them',()=>{
 const root=new THREE.Group(),offset=new THREE.Vector3(20,0,-4),{leaves,trunks}=addTreeVolumes(root,[{center:new THREE.Vector3(0,-6,0),width:64,height:64,color:new THREE.Color(1,1,1),crownOffset:offset}],undefined,{footV:.90625,topV:.25,crownWidth:.65});root.updateMatrixWorld(true);const leaf=new THREE.Matrix4(),trunk=new THREE.Matrix4();leaves.getMatrixAt(0,leaf);trunks.getMatrixAt(0,trunk);assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(leaf).toArray(),[20,0,-4]);assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(trunk).toArray(),[0,0,0]);const tip=new THREE.Vector3(0,1,0).applyMatrix4(trunk);assert.ok(tip.distanceTo(new THREE.Vector3(20,42*.34,-4))<1e-5);assert.ok(new THREE.Raycaster(new THREE.Vector3(20,100,-4),new THREE.Vector3(0,-1,0)).intersectObject(leaves).length);
});
test('the battle camera skips tree instance raycasts while retaining solid walls',async()=>{
 const {WorldBattleView}=await import('./battle-stage.ts'),group=new THREE.Group(),{leaves,trunks}=addTreeVolumes(group,[{center:new THREE.Vector3(0,-.375,6),width:4,height:4,color:new THREE.Color(1,1,1)}],undefined,{footV:.90625,topV:.234375,crownWidth:.64});for(const mesh of [leaves,trunks])mesh.raycast=()=>{throw Error('Battle camera must exclude tree instances');};
 const camera=new THREE.PerspectiveCamera(52,1.6,.05,100),world={camera,yaw:0,pitch:.37,distance:8.4,cells:new Map([['0,0',{group}]])},view=new WorldBattleView(world as never,()=>({x:0,z:0,facing:0,location:'forest',gender:'boy',actors:[]}));view.active=true;view.update(1);const clearY=camera.position.y;
 const wall=new THREE.Mesh(new THREE.BoxGeometry(1,8,1),new THREE.MeshBasicMaterial());wall.position.set(0,2,4);group.add(wall);group.updateMatrixWorld(true);camera.position.set(0,0,0);view.update(1);assert.ok(camera.position.y>clearY+.5,'Solid architecture still raises the battle camera');
});
