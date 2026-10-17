import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {sourceTallGrass} from './grass.ts';
import type {Cell,Land} from './types.ts';
test('grass volume is deterministic and stays on original walkable tall-grass tiles',()=>{const land:Land={permissions:Array(1024).fill(0),plates:[]};land.permissions[0]=2;land.permissions[1]=3;land.permissions[2]=8;land.permissions[3]=0x8002;const cell:Cell={x:2,z:3,land:1,altitude:0,props:[],asset:'test'};const a=sourceTallGrass(land,cell)!,b=sourceTallGrass(land,cell)!;assert.equal(a.count,14);assert.deepEqual(Array.from(a.instanceMatrix.array),Array.from(b.instanceMatrix.array));for(let i=0;i<a.count;i++){const matrix=new THREE.Matrix4();a.getMatrixAt(i,matrix);const p=new THREE.Vector3().setFromMatrixPosition(matrix);assert.ok(p.x>-16&&p.x<-14);assert.ok(p.z>-16&&p.z<-15);assert.ok(Math.abs(p.y-.015)<.0001);}a.geometry.computeBoundingBox();assert.ok(a.geometry.boundingBox!.max.x-a.geometry.boundingBox!.min.x>.1);assert.ok(a.geometry.boundingBox!.max.z-a.geometry.boundingBox!.min.z>.1);assert.equal(land.permissions[2],8);});
