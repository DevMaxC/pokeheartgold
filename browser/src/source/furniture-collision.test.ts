import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {furnitureObstacles,furnitureBlocksStep} from './furniture-collision.ts';
import {OriginalWorld} from './world.ts';
import {solidFurniture} from './furniture.ts';
function stool(){const root=new THREE.Group(),g=new THREE.PlaneGeometry(16,16);g.rotateX(-Math.PI/2);g.translate(0,2.5,0);const m=new THREE.MeshBasicMaterial();m.name='chair02_mat';root.add(new THREE.Mesh(g,m));root.updateMatrixWorld(true);solidFurniture(root);root.scale.setScalar(1/16);root.position.set(8.5,0,5.5);return root;}
test('actual solid stools block entry from all sides and swept movement while adjacent tiles stay open',()=>{
 const obstacles=furnitureObstacles(stool());assert.equal(obstacles.length,1);
 for(const [x,z]of [[8.5,4.5],[8.5,6.5],[7.5,5.5],[9.5,5.5]])assert.equal(furnitureBlocksStep(obstacles,x,z,8.5,5.5,0,0),true);
 assert.equal(furnitureBlocksStep(obstacles,7.5,5.5,9.5,5.5,0,0),true,'A clear destination cannot tunnel across the stool');
 assert.equal(furnitureBlocksStep(obstacles,9.5,6.5,9.5,5.5,0,0),false,'The neighbouring aisle remains open');
 assert.equal(furnitureBlocksStep(obstacles,8.5,6.5,9.5,6.5,0,0),false);
 assert.equal(furnitureBlocksStep(obstacles,8.5,5.5,8.5,6.5,0,0),false,'An old save inside the stool can leave');
});
test('furniture respects rotated bench footprints and separate floor heights',()=>{
 const root=new THREE.Group(),bench=new THREE.Mesh(new THREE.BoxGeometry(1,.5,4),new THREE.MeshBasicMaterial());bench.name='solid-original-furniture';bench.position.y=.25;bench.rotation.y=Math.PI/4;root.add(bench);const obstacles=furnitureObstacles(root);
 assert.equal(furnitureBlocksStep(obstacles,-1.5,1.5,-1.5,1.5,0,0),false,'A rotated AABB corner is not furniture');
 assert.equal(furnitureBlocksStep(obstacles,-2,0,2,0,0,0),true);
 assert.equal(furnitureBlocksStep(obstacles,-2,0,2,0,3,3),false,'Furniture downstairs does not block an upper floor');
 root.position.y=3;const raised=furnitureObstacles(root);assert.equal(furnitureBlocksStep(raised,-2,0,2,0,0,0),false);assert.equal(furnitureBlocksStep(raised,-2,0,2,0,3,3),true);
 bench.visible=false;assert.equal(furnitureObstacles(root).length,0);
});
test('world movement combines native floor permissions with cached furniture collision',()=>{
 const group=stool(),furniture=furnitureObstacles(group),cell={x:0,z:0,altitude:0},land={permissions:new Array(1024).fill(0),plates:[{bounds:[-16,-16,16,16],normal:[0,1,0],constant:0}]},world=Object.create(OriginalWorld.prototype) as OriginalWorld;Object.assign(world,{cells:new Map([['0,0',{cell,land,group,map:{id:65},furniture}]])});
 assert.equal(world.walkable(8.5,5.5,8.5,6.5,0),false);assert.equal(world.walkable(9.5,5.5,9.5,6.5,0),true);assert.equal(world.walkable(8.5,6.5,8.5,5.5,0),true);land.permissions[6*32+8]=0x8000;assert.equal(world.walkable(8.5,6.5),false,'Furniture collision never bypasses a blocked source tile');
});
test('a save near a thin seat can move away but cannot cross through its footprint',()=>{
 const root=new THREE.Group(),seat=new THREE.Mesh(new THREE.BoxGeometry(.6,.5,1),new THREE.MeshBasicMaterial());seat.name='solid-original-furniture';seat.position.y=.25;root.add(seat);const obstacles=furnitureObstacles(root);
 assert.equal(furnitureBlocksStep(obstacles,-.4,0,.6,0,0,0),true);assert.equal(furnitureBlocksStep(obstacles,-.4,0,-1.4,0,0,0),false);assert.equal(furnitureBlocksStep(obstacles,0,0,.9,0,0,0),false);
});
test('furniture extending across a cell border blocks movement until its owning cell unloads',()=>{
 const group=stool();group.position.x=31.9;const furniture=furnitureObstacles(group),land={permissions:new Array(1024).fill(0),plates:[]},world=Object.create(OriginalWorld.prototype) as OriginalWorld;Object.assign(world,{cells:new Map([['0,0',{cell:{x:0,z:0,altitude:0},land,group:new THREE.Group(),map:{id:65}}],['1,0',{cell:{x:1,z:0,altitude:0},land,group,map:{id:65},furniture}]])});
 assert.equal(world.terrainWalkable(31.5,5.5),true);assert.equal(world.walkable(31.5,5.5,30.5,5.5,0),false);world.cells.delete('1,0');assert.equal(world.walkable(31.5,5.5,30.5,5.5,0),true);
});
