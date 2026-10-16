import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFile} from 'node:fs/promises';
import {Terraces,type TerraceData} from './ledges.ts';
import {terraceModel,terraceWalls} from './terrace-model.ts';
import type {Cell,Land} from './types.ts';
import {OriginalWorld} from './world.ts';

test('deformed original ground agrees with actor height on both terraces and retains shared source geometry',async()=>{
 const terrain=new Terraces(JSON.parse(await readFile(new URL('../../public/source/terraces/0.json',import.meta.url),'utf8')) as TerraceData),root=new THREE.Group(),model=new THREE.Group();root.position.set(592,0,400);model.scale.setScalar(1/16);root.add(model);
 const geometry=new THREE.BufferGeometry(),corners=[[598,394],[602,394],[602,399],[598,399]];geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,1,2,0,2,3].flatMap(i=>[(corners[i][0]-592)*16,16,(corners[i][1]-400)*16]),3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,0,1,1,0,1],2));const source=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));model.add(source);const original=Array.from(geometry.getAttribute('position').array);terraceModel(root,terrain);root.updateMatrixWorld(true);
 assert.equal(source.visible,false);assert.deepEqual(Array.from(geometry.getAttribute('position').array),original);const surfaces:THREE.Mesh[]=[];root.traverseVisible(o=>{if(o instanceof THREE.Mesh)surfaces.push(o);});assert.equal(surfaces.length,1);
 for(const[x,z]of [[599.5,395.5],[599.2,395.8],[599.5,397.5],[600.7,398.3]]){const hit=new THREE.Raycaster(new THREE.Vector3(x,8,z),new THREE.Vector3(0,-1,0)).intersectObjects(surfaces,false)[0];assert.ok(hit);assert.ok(Math.abs(hit.point.y-1-terrain.height(x,z))<1e-5,`${x},${z}: actor and ground must agree`);}
});

test('new ledge faces are opaque from both sides and join upper/lower floor edges',async()=>{
 const terraces=new Terraces(JSON.parse(await readFile(new URL('../../public/source/terraces/0.json',import.meta.url),'utf8')) as TerraceData),cell={x:18,z:12,altitude:0} as Cell,land={permissions:[],plates:[{bounds:[-16,-16,16,16],normal:[0,1,0],constant:-1}]} as Land,material=new THREE.MeshBasicMaterial({transparent:true,alphaTest:.5,vertexColors:true}),wall=terraceWalls(terraces,cell,land,material)!;assert.ok(wall);wall.position.set(592,0,400);wall.updateMatrixWorld(true);const surface=wall.material as THREE.MeshBasicMaterial;assert.equal(surface.transparent,false);assert.equal(surface.alphaTest,0);assert.equal(surface.vertexColors,false);assert.equal(surface.side,THREE.DoubleSide);
 const top=1+terraces.height(599.5,396.9999),bottom=1+terraces.height(599.5,397.0001),y=(top+bottom)/2;assert.ok(top-bottom>.7);for(const[origin,direction]of [[new THREE.Vector3(599.5,y,396),new THREE.Vector3(0,0,1)],[new THREE.Vector3(599.5,y,398),new THREE.Vector3(0,0,-1)]]){const hits=new THREE.Raycaster(origin,direction).intersectObject(wall);assert.ok(hits.length);assert.ok(Math.abs(hits[0].point.z-397)<1e-6);}
});

test('separate solid rocks retain their shapes when rooted on different terrace heights',async()=>{
 const terraces=new Terraces(JSON.parse(await readFile(new URL('../../public/source/terraces/0.json',import.meta.url),'utf8')) as TerraceData),root=new THREE.Group(),geometry=new THREE.BufferGeometry(),positions:number[]=[];
 for(const z of [395.5,397.5]){const box=new THREE.BoxGeometry(.7,.8,.7).toNonIndexed();box.translate(599.5,1.4,z);positions.push(...box.getAttribute('position').array);box.dispose();}geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));const rock=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());rock.name='solid-original-rocks';root.add(rock);terraceModel(root,terraces);const output=root.getObjectByName('source-terrace-surface') as THREE.Mesh,p=output.geometry.getAttribute('position');
 assert.equal(p.count,positions.length/3);for(let i=0;i<p.count;i++){const z=i<36?395.5:397.5,expected=terraces.height(599.5,z);assert.ok(Math.abs(p.getX(i)-positions[i*3])<1e-4);assert.ok(Math.abs(p.getZ(i)-positions[i*3+2])<1e-4);assert.ok(Math.abs(p.getY(i)-positions[i*3+1]-expected)<1e-5);}
});

test('jump landing selection preserves the native floor beneath a bridge when terrace offsets differ',async()=>{
 const terraces=new Terraces(JSON.parse(await readFile(new URL('../../public/source/terraces/0.json',import.meta.url),'utf8')) as TerraceData),cell={x:18,z:12,altitude:0} as Cell,land={permissions:[],plates:[1,3].map(y=>({bounds:[-16,-16,16,16],normal:[0,1,0],constant:-y}))} as Land,world=Object.create(OriginalWorld.prototype) as OriginalWorld;Object.assign(world,{cells:new Map([['18,12',{cell,land}]]),terraces});
 const upper=world.height(599.5,395.5,1);assert.ok(upper>2);const lower=world.height(599.5,397.5,upper,599.5,395.5);assert.ok(Math.abs(lower-1-terraces.height(599.5,397.5))<1e-8,'Synthetic relief must not select the overhead native bridge plate');
});
