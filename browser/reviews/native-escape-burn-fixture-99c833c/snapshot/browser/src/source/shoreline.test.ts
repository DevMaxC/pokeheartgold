import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {shorelineUnderlay} from './shoreline.ts';
import type {Cell,Land} from './types.ts';

test('shoreline backing fills native sand and shallows below the art while deep water stays exposed',()=>{
 const land={permissions:Array(1024).fill(21),plates:[{bounds:[-16,-16,16,16],normal:[0,1,0],constant:-1}]} as Land,cell={x:2,z:3,altitude:0} as Cell;land.permissions[5*32+6]=33;land.permissions[5*32+7]=0x8021;
 const mesh=shorelineUnderlay(land,cell,new THREE.MeshBasicMaterial({vertexColors:true}))!;assert.ok(mesh);const bounds=new THREE.Box3().setFromObject(mesh);assert.equal(bounds.min.x,-10);assert.equal(bounds.max.x,-9);assert.equal(bounds.min.z,-11);assert.equal(bounds.max.z,-10);assert.ok(Math.abs(bounds.max.y-.84)<.001);assert.equal(mesh.material.vertexColors,false);assert.equal(mesh.material.transparent,false);assert.equal(mesh.geometry.getAttribute('position').count,30);
 land.permissions[5*32+5]=23;const wet=shorelineUnderlay(land,cell,new THREE.MeshBasicMaterial())!;assert.equal(wet.geometry.getAttribute('position').count,60);assert.equal(new THREE.Box3().setFromObject(wet).min.x,-11);
});
