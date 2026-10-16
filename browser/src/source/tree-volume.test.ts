import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {addTreeVolumes} from './tree-volume.ts';
import {fieldCameraObstacles} from './camera.ts';

test('tree crowns are closed volumes from above, behind and either side with independently rooted trunks',()=>{
 const root=new THREE.Group(),footV=.90625,trees=[{center:new THREE.Vector3(0,-6,0),width:64,height:64,color:new THREE.Color(1,1,1)},{center:new THREE.Vector3(64,-6,0),width:64,height:64,color:new THREE.Color(.8,.9,.8)}],{leaves,trunks}=addTreeVolumes(root,trees,undefined,footV);root.updateMatrixWorld(true);assert.equal(leaves.count,2);assert.equal(trunks.count,2);assert.equal(fieldCameraObstacles(root).length,0);
 const p=leaves.geometry.getAttribute('position'),edges=new Map<string,number>();for(let i=0;i<p.count;i+=3)for(let j=0;j<3;j++){const key=[i+j,i+(j+1)%3].map(k=>[p.getX(k),p.getY(k),p.getZ(k)].map(n=>Math.round(n*1e6)).join(',')).sort().join('|');edges.set(key,(edges.get(key)||0)+1);}assert.ok([...edges.values()].every(n=>n===2),'Every crown lobe is closed');
 for(const [origin,direction]of [[new THREE.Vector3(0,100,0),new THREE.Vector3(0,-1,0)],[new THREE.Vector3(0,25,-100),new THREE.Vector3(0,0,1)],[new THREE.Vector3(0,25,100),new THREE.Vector3(0,0,-1)],[new THREE.Vector3(-100,25,0),new THREE.Vector3(1,0,0)]])assert.ok(new THREE.Raycaster(origin,direction).intersectObject(leaves).some(h=>h.instanceId===0));
 const matrix=new THREE.Matrix4();for(let i=0;i<2;i++){trunks.getMatrixAt(i,matrix);const position=new THREE.Vector3().setFromMatrixPosition(matrix);assert.equal(position.x,i*64);assert.equal(position.y,0);assert.equal(position.z,0);}assert.equal((leaves.material as THREE.Material).transparent,false);assert.ok(leaves.geometry.getAttribute('color'));assert.ok(Array.from(leaves.instanceMatrix.array).every(Number.isFinite));
});
test('tree volumes retain source ground pivots when their asset group is scaled and translated',()=>{
 const root=new THREE.Group();root.position.set(40,3,60);root.scale.setScalar(1/16);const {leaves,trunks}=addTreeVolumes(root,[{center:new THREE.Vector3(16,-6,32),width:64,height:64,color:new THREE.Color(1,1,1)}],undefined,.90625);root.updateMatrixWorld(true);const m=new THREE.Matrix4();trunks.getMatrixAt(0,m);const foot=new THREE.Vector3().setFromMatrixPosition(m).applyMatrix4(trunks.matrixWorld);assert.deepEqual(foot.toArray(),[41,3,62]);const hit=new THREE.Raycaster(new THREE.Vector3(41,20,62),new THREE.Vector3(0,-1,0)).intersectObject(leaves)[0];assert.ok(hit);assert.ok(Math.abs(hit.point.y-(3+58/16))<1e-4);
});
test('transparent sprite margins do not enlarge the visible canopy',()=>{
 const root=new THREE.Group(),{leaves}=addTreeVolumes(root,[{center:new THREE.Vector3(0,-6,0),width:64,height:64,color:new THREE.Color(1,1,1)}],undefined,.90625,.25,.65);root.updateMatrixWorld(true);const top=new THREE.Raycaster(new THREE.Vector3(0,100,0),new THREE.Vector3(0,-1,0)).intersectObject(leaves)[0];assert.ok(top);assert.ok(Math.abs(top.point.y-42)<1e-5);const bounds=new THREE.Box3().setFromObject(leaves);assert.ok(Math.abs(bounds.max.x-bounds.min.x-41.6)<1e-4);
});
