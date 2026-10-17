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
 let started!:()=>void,resume!:()=>void;const waiting=new Promise<void>(resolve=>{started=resolve;}),held=new Promise<void>(resolve=>{resume=resolve;}),original=world.runSceneryWork;
 world.runSceneryWork=async function(generation:number,build:()=>void){started();await held;return original.call(this,generation,build);};
 const released:THREE.Group[]=[];world.releaseCell=function(cell:any){released.push(cell.group);return (OriginalWorld.prototype as any).releaseCell.call(this,cell);};
 const stream=world.stream(60,16,16);await waiting;world.generation++;resume();await stream;
 assert.equal(world.cells.size,0);assert.equal(world.scene.children.length,0);assert.equal(released.length,1);assert.equal(released[0].children[1].userData.buildingExterior,undefined);
});

test('a current cached stream constructs its exterior and publishes a usable cell',async()=>{
 const{world,template}=fixture();world.asset=()=>Promise.resolve(template);await world.stream(60,16,16);
 assert.equal(world.cells.size,1);assert.equal(world.scene.children.length,1);const loaded=[...world.cells.values()][0]as any;assert.ok(loaded.group.children[1].userData.buildingExterior);assert.equal(world.loading,false);assert.equal(world.walkable(16,16),true);
});

test('concurrent cached scenery jobs consume the shared budget before another job can pass it',async()=>{
 // A controlled browser task clock makes the scheduling contract observable
 // without treating a Node wall-clock timing as a browser frame benchmark.
 const saved=new Map<string,PropertyDescriptor|undefined>();for(const key of ['window','performance','MessageChannel'])saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
 let now=0,turn=0;const messages:(()=>void)[]=[],workByTurn=new Map<number,number>();
 class TaskChannel{port1:{onmessage:(()=>void)|null}={onmessage:null};port2={postMessage:(_value:unknown)=>messages.push(()=>this.port1.onmessage?.())};}
 const world=Object.create(OriginalWorld.prototype)as any;world.generation=1;
 try{
  Object.defineProperty(globalThis,'window',{value:{},configurable:true});Object.defineProperty(globalThis,'performance',{value:{now:()=>now},configurable:true});Object.defineProperty(globalThis,'MessageChannel',{value:TaskChannel,configurable:true});
  let completed=0;const jobs=Array.from({length:21},()=>world.runSceneryWork(1,()=>{completed++;now+=4;workByTurn.set(turn,(workByTurn.get(turn)??0)+4);}));
  for(let guard=0;completed<21&&guard<30;guard++){
   assert.equal(messages.length,1,'all waiters share one pending task');turn++;now++;messages.shift()!();await Promise.resolve();await Promise.resolve();await Promise.resolve();
  }
  assert.equal(completed,21);assert.ok((await Promise.all(jobs)).every(Boolean));
  assert.ok(turn>=11,'21 four-millisecond builders must span multiple six-millisecond budgets');assert.ok(Math.max(...workByTurn.values())<=8,'each turn may overrun only by its final indivisible builder');
  now+=10;let staleBuilt=false;const stale=world.runSceneryWork(1,()=>{staleBuilt=true;});assert.equal(messages.length,1);world.generation++;turn++;now++;messages.shift()!();assert.equal(await stale,false);assert.equal(staleBuilt,false,'a superseded waiter never executes its callback');
 }finally{for(const[key,descriptor]of saved)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}
});
