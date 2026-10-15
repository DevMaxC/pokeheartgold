import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {fieldCameraEntry} from './camera.ts';

test('the first field camera starts in its orbit rather than an unrelated south-facing position',()=>{
 const camera=new THREE.PerspectiveCamera(),target=new THREE.Vector3(),destination=new THREE.Vector3(6.5,2,6.5);fieldCameraEntry(camera,target,destination,true,1.2,.4,13);assert.ok(Math.abs(camera.position.distanceTo(target)-13)<1e-12);assert.ok(Math.abs(Math.atan2(camera.position.x-target.x,camera.position.z-target.z)-1.2)<1e-12);assert.deepEqual(target.toArray(),destination.toArray());
});
test('walking across a connected map header keeps the exact camera pose and target',()=>{
 const camera=new THREE.PerspectiveCamera(),target=new THREE.Vector3(575.5,2,399.4);camera.position.set(584,8,390);camera.lookAt(target);const position=camera.position.toArray(),rotation=camera.quaternion.toArray(),before=target.toArray();fieldCameraEntry(camera,target,new THREE.Vector3(575.5,2,399.5),false,2.1,.6,21);assert.deepEqual(camera.position.toArray(),position);assert.deepEqual(camera.quaternion.toArray(),rotation);assert.deepEqual(target.toArray(),before);
});
test('building entrances and distant warps translate the rig without changing the viewing direction or zoom',()=>{
 const camera=new THREE.PerspectiveCamera(52),target=new THREE.Vector3(564.5,2,391.5);camera.position.set(573,7,382);camera.lookAt(target);const offset=camera.position.clone().sub(target),rotation=camera.quaternion.toArray();
 for(const destination of [new THREE.Vector3(8.5,1,19.5),new THREE.Vector3(564.5,2,391.5)]){fieldCameraEntry(camera,target,destination,false,2.1,.6,21);assert.ok(camera.position.clone().sub(target).distanceTo(offset)<1e-10);assert.deepEqual(camera.quaternion.toArray(),rotation);assert.equal(camera.fov,52);assert.deepEqual(target.toArray(),destination.toArray());}
});
