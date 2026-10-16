import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {solidFurniture} from './furniture.ts';

test('seat repairs preserve transformed prop roots, source materials and separate floor shadows',()=>{
 const root=new THREE.Group();root.position.set(30,4,-12);root.rotation.y=1.2;root.scale.set(2,3,1.5);
 const material=new THREE.MeshBasicMaterial({map:new THREE.Texture(),vertexColors:true,alphaTest:.5,side:THREE.DoubleSide});material.name='chair02_mat';
 const g=new THREE.PlaneGeometry(16,16);g.rotateX(-Math.PI/2);g.translate(0,2.5,0);g.setAttribute('color',new THREE.Float32BufferAttribute(new Array(12).fill(.8),3));const card=new THREE.Mesh(g,material);root.add(card);
 const shadow=new THREE.Mesh(new THREE.PlaneGeometry(16,16),new THREE.MeshBasicMaterial({opacity:.25,transparent:true}));root.add(shadow);root.updateMatrixWorld(true);const before=shadow.matrixWorld.clone();
 assert.equal(solidFurniture(root),1);assert.equal(card.visible,false);const seat=root.getObjectByName('solid-original-furniture') as THREE.Mesh;seat.geometry.computeBoundingBox();assert.ok(Math.abs(seat.geometry.boundingBox!.max.y-8)<.0001);assert.ok(Math.abs(seat.geometry.boundingBox!.min.y)<.0001);root.updateMatrixWorld(true);assert.deepEqual(shadow.matrixWorld.elements,before.elements);assert.equal(shadow.visible,true);assert.equal((seat.material as THREE.MeshBasicMaterial).map,material.map);assert.equal(material.alphaTest,.5);assert.equal(material.transparent,false);assert.equal(material.side,THREE.DoubleSide);assert.equal(solidFurniture(root),0);
 const c=root.localToWorld(new THREE.Vector3(0,8,0)),hit=new THREE.Raycaster(c.clone().add(new THREE.Vector3(0,30,0)),new THREE.Vector3(0,-1,0)).intersectObject(seat)[0];assert.ok(hit);assert.ok(hit.point.distanceTo(c)<.0001);
});
test('unrelated floor pictures and already volumetric furniture keep their source geometry',()=>{
 const root=new THREE.Group();for(const [name,height]of [['chair02_mat',8],['rug',0]] as const){const material=new THREE.MeshBasicMaterial();material.name=name;root.add(new THREE.Mesh(new THREE.BoxGeometry(16,height||.1,16),material));}root.updateMatrixWorld(true);assert.equal(solidFurniture(root),0);assert.ok(root.children.every(o=>o.visible));
});
