import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {addTreeVolumes} from './tree-volume.ts';
import {fieldCanopies,canopyBlocks,canopyContains} from './canopy-occlusion.ts';
import {battleCameraBlocked,clearBattleCameraEye} from './battle-camera.ts';

function tree(){const group=new THREE.Group(),trees=addTreeVolumes(group,[{center:new THREE.Vector3(0,-.3,5),width:2,height:3,color:new THREE.Color(1,1,1)}],undefined,{footV:.9,topV:0,crownWidth:.86});group.updateMatrixWorld(true);for(const mesh of [trees.leaves,trees.trunks])mesh.raycast=()=>{throw Error('Tree triangle raycasts must not run');};return{group,...trees};}
test('analytic crown lobes block the actual sight segment without raycasting tree triangles',()=>{
 const {group}=tree(),bounds=fieldCanopies([group]);assert.equal(canopyContains(new THREE.Vector3(0,1.3,5),bounds),true);assert.equal(canopyBlocks(new THREE.Vector3(0,1,0),new THREE.Vector3(0,1,10),bounds),true);assert.equal(canopyBlocks(new THREE.Vector3(0,4,0),new THREE.Vector3(0,4,10),bounds),false);assert.equal(canopyBlocks(new THREE.Vector3(0,1,0),new THREE.Vector3(0,1,2),bounds),false);
});
test('canopy caches preserve hierarchy transforms and invalidate after a moved instance or parent',()=>{
 const {group,leaves}=tree();group.position.set(30,2,40);group.rotation.y=.4;group.scale.set(2,1.5,.5);group.updateMatrixWorld(true);const from=group.localToWorld(new THREE.Vector3(0,1,0)),to=group.localToWorld(new THREE.Vector3(0,1,10)),a=fieldCanopies([group]);assert.equal(canopyBlocks(from,to,a),true);assert.equal(fieldCanopies([group])[0],a[0]);
 const matrix=new THREE.Matrix4();leaves.getMatrixAt(0,matrix);matrix.elements[12]+=100;leaves.setMatrixAt(0,matrix);leaves.instanceMatrix.needsUpdate=true;const b=fieldCanopies([group]);assert.notEqual(b[0],a[0]);assert.equal(canopyBlocks(from,to,b),false);group.position.x+=5;group.updateMatrixWorld(true);assert.notEqual(fieldCanopies([group])[0],b[0]);
});
test('battle camera clears a foreground crown while retaining the requested horizontal orbit',()=>{
 const {group}=tree(),bounds=fieldCanopies([group]),subjects=[new THREE.Vector3(0,.8,0)],desired=new THREE.Vector3(0,3,8);assert.equal(battleCameraBlocked(desired,subjects,[],bounds),true);const clear=clearBattleCameraEye(desired,subjects,[],bounds);assert.equal(clear.x,desired.x);assert.equal(clear.z,desired.z);assert.ok(clear.y>desired.y);assert.equal(battleCameraBlocked(clear,subjects,[],bounds),false);
});
test('hidden tree parents do not obstruct the battle camera',()=>{const {group}=tree();group.visible=false;assert.deepEqual(fieldCanopies([group]),[]);});
