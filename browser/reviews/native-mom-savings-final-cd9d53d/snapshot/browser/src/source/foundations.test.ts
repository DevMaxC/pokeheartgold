import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {forestFoundation} from './foundations.ts';
import type {Cell,Matrix} from './types.ts';

test('raised background forest steps receive opaque sides down to adjacent matrix ground',()=>{
 const matrix={width:3,height:3,models:Array(9).fill(208),altitudes:[6,6,6,6,6,2,6,6,6]} as Matrix,cell={x:1,z:1,altitude:6} as Cell,source=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.5,alphaTest:.5});
 const mesh=forestFoundation(cell,matrix,source)!;assert.ok(mesh);const b=new THREE.Box3().setFromObject(mesh);assert.ok(Math.abs(b.min.y+2.1)<.001);assert.equal(b.max.y,0);assert.ok(b.min.x>15.99);assert.equal(mesh.geometry.getAttribute('position').count,6);assert.equal(mesh.material.transparent,false);assert.equal(mesh.material.vertexColors,false);assert.equal(source.transparent,true);
 matrix.altitudes.fill(6);assert.equal(forestFoundation(cell,matrix,source),null,'Level adjacent forest cells need no overlapping internal walls');
});
