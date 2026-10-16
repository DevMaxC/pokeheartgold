import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {battleCameraBlocked,battleCameraDistance,battleCameraEye,battleOpeningYaw,clearBattleCameraEye} from './battle-camera.ts';

test('battle opening chooses a clear shoulder instead of looking through a nearby building',()=>{
 const center=new THREE.Vector3(0,1,0),subjects=[new THREE.Vector3(-1.7,.8,0),new THREE.Vector3(1.7,.8,0)],wall=new THREE.Mesh(new THREE.BoxGeometry(20,8,2),new THREE.MeshBasicMaterial());wall.position.set(0,3,3);wall.updateMatrixWorld(true);
 assert.equal(battleCameraBlocked(battleCameraEye(center,.6,.37,8.4),subjects,[wall]),true);
 const yaw=battleOpeningYaw(center,0,.37,8.4,subjects,[wall]);assert.equal(battleCameraBlocked(battleCameraEye(center,yaw,.37,8.4),subjects,[wall]),false);assert.notEqual(yaw,.6);
});
test('a roof hiding one fighter is detected even when the battle midpoint is visible',()=>{
 const center=new THREE.Vector3(0,1,0),subjects=[new THREE.Vector3(-1.7,.8,0),new THREE.Vector3(1.7,.8,0)],eye=new THREE.Vector3(6,4,-5),roof=new THREE.Mesh(new THREE.BoxGeometry(.8,1,.8),new THREE.MeshBasicMaterial());roof.position.copy(subjects[1]).lerp(eye,.4);roof.updateMatrixWorld(true);
 assert.equal(battleCameraBlocked(eye,[center],[roof]),false);assert.equal(battleCameraBlocked(eye,subjects,[roof]),true);
 const clear=clearBattleCameraEye(eye,subjects,[roof]);assert.ok(clear.y>eye.y);assert.equal(clear.x,eye.x);assert.equal(clear.z,eye.z);assert.equal(battleCameraBlocked(clear,subjects,[roof]),false);
});
test('unobstructed camera orbit stays unchanged and portrait framing retains enough distance',()=>{
 const eye=new THREE.Vector3(6,4,5);assert.deepEqual(clearBattleCameraEye(eye,[new THREE.Vector3()],[]).toArray(),eye.toArray());assert.equal(battleCameraDistance(8.4,1.6),8.4);assert.ok(battleCameraDistance(8.4,.5)>8.4);
});
