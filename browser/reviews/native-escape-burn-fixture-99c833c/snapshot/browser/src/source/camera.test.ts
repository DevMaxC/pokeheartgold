import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {fieldCameraEntry,fieldCameraObstacles} from './camera.ts';

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
test('nearby room coordinates still rebase the entire rig when the scene is replaced',()=>{
 const camera=new THREE.PerspectiveCamera(),target=new THREE.Vector3(8.5,2,10.5);fieldCameraEntry(camera,target,target.clone(),true,1.2,.4,13);const offset=camera.position.clone().sub(target),rotation=camera.quaternion.clone(),destination=new THREE.Vector3(9.5,2.3,10.5);
 fieldCameraEntry(camera,target,destination,false,1.2,.4,13,true);assert.deepEqual(target.toArray(),destination.toArray());assert.ok(camera.position.clone().sub(target).distanceTo(offset)<1e-12);assert.ok(camera.quaternion.angleTo(rotation)<1e-7);
});
test('camera obstruction lists omit paper vegetation, shadows and hidden parents while retaining solid hills and buildings',()=>{
 const root=new THREE.Group(),wall=new THREE.Mesh(new THREE.BoxGeometry(4,4,4),new THREE.MeshBasicMaterial()),hill=new THREE.Mesh(new THREE.BoxGeometry(4,4,4),new THREE.MeshBasicMaterial({alphaTest:.5}));(wall.material as THREE.Material).name='powerplant_wall';(hill.material as THREE.Material).name='allpeak';root.add(wall,hill);
 for(const name of ['camera-facing-original-trees','source-tall-grass','crossed-original-flowers']){const mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(),new THREE.MeshBasicMaterial(),5);mesh.name=name;root.add(mesh);}
 const shadow=new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.MeshBasicMaterial({opacity:.2}));root.add(shadow);const hidden=new THREE.Group(),child=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());hidden.visible=false;hidden.add(child);root.add(hidden);
 assert.deepEqual(fieldCameraObstacles(root),[wall,hill]);hidden.visible=true;assert.ok(fieldCameraObstacles(root).includes(child));
});
test('a hidden parent cannot pull the camera forward through its still-visible child mesh',()=>{
 const root=new THREE.Group(),hidden=new THREE.Group(),material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});hidden.visible=false;const ghost=new THREE.Mesh(new THREE.PlaneGeometry(4,4),material);ghost.position.set(0,2,2);hidden.add(ghost);root.add(hidden);const wall=new THREE.Mesh(new THREE.PlaneGeometry(4,4),material);wall.position.set(0,2,5);root.add(wall);root.updateMatrixWorld(true);const hits=new THREE.Raycaster(new THREE.Vector3(0,2,0),new THREE.Vector3(0,0,1)).intersectObjects(fieldCameraObstacles(root),false);assert.equal(hits[0].object,wall);assert.equal(hits[0].distance,5);
});
