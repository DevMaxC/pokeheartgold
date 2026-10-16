import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {closeBuildingFooting} from './building-footing.ts';
import type {Terraces} from './ledges.ts';
import {OriginalWorld} from './world.ts';

test('a fresh scaled skinned placement produces the same footing as an explicitly refreshed bind pose',()=>{
 const placed=()=>{const root=new THREE.Group(),geometry=new THREE.BoxGeometry(32,32,32);geometry.translate(0,16,0);const count=geometry.attributes.position.count,weights=new Float32Array(count*4);for(let i=0;i<count;i++)weights[i*4]=1;geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(count*4),4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshBasicMaterial()),bone=new THREE.Bone();mesh.add(bone);root.add(mesh);mesh.bind(new THREE.Skeleton([bone]));root.scale.setScalar(1/16);root.rotation.y=.3;root.position.set(10,.6,12);return root;};
 const fresh=placed(),refreshed=placed(),terrain={height:()=>0}as unknown as Terraces;refreshed.updateMatrixWorld(true);const expected=closeBuildingFooting(refreshed,terrain,.6),actual=closeBuildingFooting(fresh,terrain,.6);assert.ok(actual&&expected);assert.deepEqual(Array.from(actual.geometry.attributes.position.array),Array.from(expected.geometry.attributes.position.array),'call order must not alter skinned wall positions');
});

test('rigid native walls receive a continuous footing where terrain falls below their base',()=>{
 const root=new THREE.Group(),geometry=new THREE.BoxGeometry(32,32,32),material=new THREE.MeshBasicMaterial(),mesh=new THREE.Mesh(geometry,material);mesh.position.y=16;root.add(mesh);root.scale.setScalar(1/16);root.rotation.y=.3;root.position.set(8,.3,9);const original=Array.from(geometry.attributes.position.array),terrain={height:(x:number,z:number)=>-.2+Math.sin(x*2+z)*.1} as Terraces,footing=closeBuildingFooting(root,terrain,.3)!;assert.ok(footing);assert.deepEqual(Array.from(geometry.attributes.position.array),original);assert.equal(material.side,THREE.FrontSide);assert.ok((footing.material as THREE.Material[]).every(m=>m!==material&&m.side===THREE.DoubleSide));root.updateMatrixWorld(true);
 const p=footing.geometry.attributes.position;for(let i=0;i<p.count;i+=6){for(const n of [2,4,5]){const point=new THREE.Vector3().fromBufferAttribute(p,i+n).applyMatrix4(root.matrixWorld);assert.ok(Math.abs(point.y-terrain.height(point.x,point.z))<1e-5);}}
 const origin=new THREE.Vector3(8,-.05,12),hits=new THREE.Raycaster(origin,new THREE.Vector3(0,0,-1)).intersectObject(footing);assert.ok(hits.length,'The exposed strip must be solid from an outside camera');
});
test('level plots add no redundant foundation and decorative shadows cannot define the wall floor',()=>{
 const root=new THREE.Group(),wall=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshBasicMaterial());wall.position.y=1;root.add(wall);const shadow=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshBasicMaterial({opacity:.2,transparent:true}));shadow.position.y=-2;root.add(shadow);assert.equal(closeBuildingFooting(root,{height:()=>.3} as unknown as Terraces,.3),null);
});
test('footings extend gate columns without closing the original passage',()=>{
 const root=new THREE.Group(),material=new THREE.MeshBasicMaterial();for(const x of [-1,1]){const post=new THREE.Mesh(new THREE.BoxGeometry(.4,2,.5),material);post.position.set(x,1,0);root.add(post);}const lintel=new THREE.Mesh(new THREE.BoxGeometry(2.4,.5,.5),material);lintel.position.y=2.25;root.add(lintel);const footing=closeBuildingFooting(root,{height:()=>-.3} as unknown as Terraces,0)!;root.updateMatrixWorld(true);
 assert.equal(new THREE.Raycaster(new THREE.Vector3(0,-.15,2),new THREE.Vector3(0,0,-1)).intersectObject(footing).length,0);assert.ok(new THREE.Raycaster(new THREE.Vector3(1,-.15,2),new THREE.Vector3(0,0,-1)).intersectObject(footing).length);
});
test('unloading a footing frees its geometry and cloned material without disposing source assets',()=>{
 const group=new THREE.Group(),material=new THREE.MeshBasicMaterial(),geometry=new THREE.BoxGeometry(2,2,2),wall=new THREE.Mesh(geometry,material);wall.position.y=1;group.add(wall);const footing=closeBuildingFooting(group,{height:()=>-.3} as unknown as Terraces,0)!;let source=0,owned=0;geometry.addEventListener('dispose',()=>source++);material.addEventListener('dispose',()=>source++);footing.geometry.addEventListener('dispose',()=>owned++);for(const m of footing.material as THREE.Material[])m.addEventListener('dispose',()=>owned++);
 const world=Object.create(OriginalWorld.prototype);world.scene=new THREE.Scene();world.scene.add(group);world.releaseCell({group});assert.equal(source,0);assert.equal(owned,2);assert.equal(group.parent,null);
});
