import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {OriginalWorld} from './world.ts';

function fixture(){
 const world=Object.create(OriginalWorld.prototype) as any,cell={x:0,z:0,land:0,altitude:0,asset:'land/test.glb',props:[{id:21,asset:'props/1-21-0.glb',position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}]},land={permissions:Array(1024).fill(0),plates:[{bounds:[-16,-16,16,16],normal:[0,1,0],constant:0}]},map={id:60,matrix:0,cells:[cell],events:{objects:[],bgs:[],coords:[],warps:[]}},template=new THREE.Group();
 const material=new THREE.MeshBasicMaterial();material.name='wall';template.add(new THREE.Mesh(new THREE.BoxGeometry(32,48,32),material));
 Object.assign(world,{scene:new THREE.Scene(),matrix:{width:1,height:1,headers:[60],altitudes:[0],models:[0]},activeMatrix:0,generation:1,pending:null,index:{maps:{60:{id:60}}},maps:new Map([[60,map]]),cells:new Map(),landCache:new Map([[0,Promise.resolve(land)]]),entrances:Promise.resolve({0:[]}),terraces:null,latestStream:{matrix:0,id:60,x:16,z:16},loading:false});
 return{world,template};
}

test('a superseded asset download never constructs a field cell',async()=>{
 const{world,template}=fixture();let started!:()=>void,finish!:(value:THREE.Group)=>void;const downloading=new Promise<void>(resolve=>{started=resolve;}),asset=new Promise<THREE.Group>(resolve=>{finish=resolve;});world.asset=()=>{started();return asset;};
 const stream=world.stream(60,16,16);await downloading;world.generation++;finish(template);await stream;
 assert.equal(world.cells.size,0);assert.equal(world.scene.children.length,0);assert.equal(world.loading,false);
});

test('a superseded prop download cannot run a shell builder or dispose shared source buffers',async()=>{
 const{world,template}=fixture();let started!:()=>void,finish!:(value:THREE.Group)=>void;const downloading=new Promise<void>(resolve=>{started=resolve;}),asset=new Promise<THREE.Group>(resolve=>{finish=resolve;});world.asset=(path:string)=>path.startsWith('props/')?(started(),asset):Promise.resolve(template);
 const released:THREE.Group[]=[];world.releaseCell=function(cell:any){released.push(cell.group);return (OriginalWorld.prototype as any).releaseCell.call(this,cell);};
 let disposed=0;template.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.addEventListener('dispose',()=>disposed++);for(const m of Array.isArray(o.material)?o.material:[o.material])m.addEventListener('dispose',()=>disposed++);}});
 const stream=world.stream(60,16,16);await downloading;world.generation++;finish(template);await stream;
 assert.equal(world.cells.size,0);assert.equal(world.scene.children.length,0);assert.equal(released.length,1);assert.equal(released[0].children.length,2,'the stale prop clone is still attached for lifecycle cleanup');
 assert.equal(released[0].children[1].userData.buildingExterior,undefined,'the stale cell never invoked generic or family shell generation');assert.equal(disposed,0,'cached source geometry and materials remain reusable');
});

test('a stream superseded while waiting for field work cannot build or publish its prop',async()=>{
 const{world,template}=fixture();world.asset=()=>Promise.resolve(template);
 let started!:()=>void,resume!:()=>void;const waiting=new Promise<void>(resolve=>{started=resolve;}),held=new Promise<void>(resolve=>{resume=resolve;}),original=world.sceneryWorkCurrent;
 world.sceneryWorkCurrent=async function(generation:number){started();await held;return original.call(this,generation);};
 const released:THREE.Group[]=[];world.releaseCell=function(cell:any){released.push(cell.group);return (OriginalWorld.prototype as any).releaseCell.call(this,cell);};
 const stream=world.stream(60,16,16);await waiting;world.generation++;resume();await stream;
 assert.equal(world.cells.size,0);assert.equal(world.scene.children.length,0);assert.equal(released.length,1);assert.equal(released[0].children[1].userData.buildingExterior,undefined);
});

test('a current cached stream constructs its exterior and publishes a usable cell',async()=>{
 const{world,template}=fixture();world.asset=()=>Promise.resolve(template);await world.stream(60,16,16);
 assert.equal(world.cells.size,1);assert.equal(world.scene.children.length,1);const loaded=[...world.cells.values()][0]as any;assert.ok(loaded.group.children[1].userData.buildingExterior);assert.equal(world.loading,false);assert.equal(world.walkable(16,16),true);
});
