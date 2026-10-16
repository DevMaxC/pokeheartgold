import {test} from 'node:test';
import assert from 'node:assert/strict';
import {OriginalWorld} from './world.ts';
import * as THREE from 'three';
import {readFile} from 'node:fs/promises';
import type {SourceMap} from './types.ts';
import {clone} from 'three/addons/utils/SkeletonUtils.js';

test('field prefetch coalesces movement to the latest cell without queuing obsolete loads',async()=>{
 const world=Object.create(OriginalWorld.prototype) as OriginalWorld,calls:{id:number;x:number;z:number}[]=[],release:(()=>void)[]=[];
 Object.assign(world,{activeMatrix:0,loading:false,streamCenter:'',streamRequest:false,nextStreamAttempt:0});
 world.stream=async(id,x,z)=>{calls.push({id,x,z});await new Promise<void>(resolve=>release.push(resolve));};
 world.updateStreaming(67,575.5,399.5);assert.equal(calls.length,1);world.updateStreaming(33,576.5,399.5);world.updateStreaming(33,609.5,399.5);assert.equal(calls.length,1,'Movement must not queue one awaited stream per step');release.shift()!();await new Promise(resolve=>setImmediate(resolve));
 world.updateStreaming(33,609.5,399.5);assert.deepEqual(calls[1],{id:33,x:609.5,z:399.5});release.shift()!();await new Promise(resolve=>setImmediate(resolve));world.updateStreaming(33,610.5,399.5);assert.equal(calls.length,2,'Further movement in the same loaded cell needs no duplicate request');
});

test('actual Centers sharing a headerless matrix retain their own room identity after a warp',async()=>{
 const load=async(id:number)=>JSON.parse(await readFile(new URL(`../../public/source/maps/${id}.json`,import.meta.url),'utf8')) as SourceMap,cherrygrove=await load(69),violet=await load(81);assert.equal(cherrygrove.matrix,violet.matrix);
 const world=Object.create(OriginalWorld.prototype) as OriginalWorld,oldGroup=new THREE.Group(),scene=new THREE.Scene();scene.add(oldGroup);
 Object.assign(world,{activeMatrix:cherrygrove.matrix,activeHeader:69,matrix:{headers:null},generation:1,cells:new Map(),scene,camera:new THREE.PerspectiveCamera(),target:new THREE.Vector3(),cameraReady:false,yaw:0,pitch:.4,distance:13,sky:{enter:()=>{}},height:()=>0});
 world.cells.set('0,0',{cell:cherrygrove.cells[0],land:{permissions:[],plates:[]},group:oldGroup,map:cherrygrove});world.map=async()=>violet;
 world.stream=async()=>{assert.equal(world.cells.size,0,'A different Center must release the old header ownership');const group=new THREE.Group();world.cells.set('0,0',{cell:violet.cells[0],land:{permissions:[],plates:[]},group,map:violet});scene.add(group);};
 await world.enter(81,8.5,19.5);assert.equal(world.owner(8.5,19.5),81);assert.equal(oldGroup.parent,null);assert.equal((world as unknown as {generation:number}).generation,2);
});

test('finishing an old prefetch keeps the current cell when the player backtracks',async()=>{
 const world=Object.create(OriginalWorld.prototype) as OriginalWorld,scene=new THREE.Scene(),land={permissions:Array(1024).fill(0),plates:[]},cells=Array.from({length:8},(_,x)=>({x,z:0,land:0,altitude:0,props:[],asset:'land/fixture.glb'})),map={id:33,matrix:0,cells,events:{warps:[]}} as unknown as SourceMap;
 Object.assign(world,{activeMatrix:0,activeHeader:33,matrix:{width:8,height:1,headers:null,models:Array(8).fill(0),altitudes:Array(8).fill(0)},generation:1,cells:new Map(),scene,pending:null,loading:false,index:{maps:{33:{id:33}}},landCache:new Map([[0,Promise.resolve(land)]]),entrances:Promise.resolve({}),latestStream:{matrix:0,id:33,x:.5,z:.5}});
 for(const x of [0,7]){const group=new THREE.Group();scene.add(group);world.cells.set(x+',0',{cell:cells[x],land,group,map});}world.map=async()=>map;let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});world.asset=async()=>{await gate;return new THREE.Group();};
 const pending=world.stream(33,96.5,.5);release();await pending;assert.ok(world.cells.has('0,0'),'Finishing a request for an old centre must not remove the ground under the player');assert.equal(world.cells.has('7,0'),false);
 await world.stream(33,.5,.5);assert.deepEqual([...world.cells.keys()].sort(),['0,0','1,0','2,0'],'The next current-centre pass releases the retained distant cells');
});

test('failed prefetch waits for late props before releasing its partial cell and permits retry',async()=>{
 const world=Object.create(OriginalWorld.prototype) as OriginalWorld,scene=new THREE.Scene(),land={permissions:Array(1024).fill(0),plates:[]},prop=(asset:string)=>({asset,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}),cell={x:0,z:0,land:0,altitude:0,props:[prop('broken'),prop('late')],asset:'land/fixture.glb'},map={id:33,matrix:0,cells:[cell],events:{warps:[]}} as unknown as SourceMap;
 Object.assign(world,{activeMatrix:0,activeHeader:33,matrix:{width:1,height:1,headers:null,models:[0],altitudes:[0]},generation:1,cells:new Map(),scene,pending:null,loading:false,index:{maps:{33:{id:33}}},landCache:new Map([[0,Promise.resolve(land)]]),entrances:Promise.resolve({})});world.map=async()=>map;
 let finish!:()=>void,broken=true;const gate=new Promise<void>(resolve=>{finish=resolve;});world.asset=async path=>{if(path==='broken'&&broken)throw Error('network fixture');if(path==='late')await gate;const node=new THREE.Group();node.name=path;return node;};
 const released:THREE.Group[]=[],release=Reflect.get(OriginalWorld.prototype,'releaseCell');Reflect.set(world,'releaseCell',(loaded:{group:THREE.Group})=>{released.push(loaded.group);release.call(world,loaded);});
 const pending=world.stream(33,.5,.5);await new Promise(resolve=>setImmediate(resolve));assert.equal(released.length,0,'A failed sibling must not release a group while another prop is still loading');finish();await assert.rejects(pending,/network fixture/);assert.equal(released.length,1);assert.ok(released[0].children.some(child=>child.name==='late'));assert.equal(world.cells.size,0);assert.equal(world.loading,false);assert.equal(Reflect.get(world,'pending'),null);
 broken=false;await world.stream(33,.5,.5);assert.equal(world.cells.size,1,'A failed prefetch must not poison future entry');assert.equal(released.length,1);
});

test('releasing a streamed clone disposes its skeleton texture without disposing shared assets or other cells',()=>{
 const template=new THREE.Group(),bone=new THREE.Bone(),geometry=new THREE.BoxGeometry(),material=new THREE.MeshBasicMaterial(),mesh=new THREE.SkinnedMesh(geometry,material);mesh.add(bone);mesh.bind(new THREE.Skeleton([bone]));template.add(mesh);
 const first=clone(template),second=clone(template),skin=(group:THREE.Group)=>group.children[0] as THREE.SkinnedMesh;for(const group of [template,first,second])skin(group).skeleton.computeBoneTexture();
 let disposed=0,sharedDisposals=0;skin(first).skeleton.boneTexture!.addEventListener('dispose',()=>disposed++);geometry.addEventListener('dispose',()=>sharedDisposals++);material.addEventListener('dispose',()=>sharedDisposals++);
 const scene=new THREE.Scene();scene.add(first,second);const world=Object.create(OriginalWorld.prototype) as OriginalWorld;Object.assign(world,{scene});Reflect.get(OriginalWorld.prototype,'releaseCell').call(world,{group:first});
 assert.equal(disposed,1);assert.equal(skin(first).skeleton.boneTexture,null);assert.ok(skin(template).skeleton.boneTexture);assert.ok(skin(second).skeleton.boneTexture);assert.equal(sharedDisposals,0);assert.equal(first.parent,null);assert.equal(second.parent,scene);
 for(const group of [template,second])skin(group).skeleton.dispose();geometry.dispose();material.dispose();
});
