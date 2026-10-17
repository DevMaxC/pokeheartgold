import {syntheticTreeTexture} from './tree-fixture.test.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFile} from 'node:fs/promises';
import {Terraces,type TerraceData} from './ledges.ts';
import {terraceModel,terraceWalls,terraceCliffMaterial} from './terrace-model.ts';
import type {Cell,Land} from './types.ts';
import {OriginalWorld} from './world.ts';

test('deformed original ground agrees with actor height on both terraces and retains shared source geometry',async()=>{
 const terrain=new Terraces(JSON.parse(await readFile(new URL('../../public/source/terraces/0.json',import.meta.url),'utf8')) as TerraceData),root=new THREE.Group(),model=new THREE.Group();root.position.set(592,0,400);model.scale.setScalar(1/16);root.add(model);
 const geometry=new THREE.BufferGeometry(),corners=[[598,394],[602,394],[602,399],[598,399]];geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,1,2,0,2,3].flatMap(i=>[(corners[i][0]-592)*16,16,(corners[i][1]-400)*16]),3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,0,1,1,0,1],2));const source=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));model.add(source);const original=Array.from(geometry.getAttribute('position').array);await terraceModel(root,terrain);root.updateMatrixWorld(true);
 assert.equal(source.visible,false);assert.deepEqual(Array.from(geometry.getAttribute('position').array),original);const surfaces:THREE.Mesh[]=[];root.traverseVisible(o=>{if(o instanceof THREE.Mesh)surfaces.push(o);});assert.equal(surfaces.length,1);
 for(const[x,z]of [[599.5,395.5],[599.2,395.8],[599.5,397.5],[600.7,398.3]]){const hit=new THREE.Raycaster(new THREE.Vector3(x,8,z),new THREE.Vector3(0,-1,0)).intersectObjects(surfaces,false)[0];assert.ok(hit);assert.ok(Math.abs(hit.point.y-1-terrain.height(x,z))<1e-5,`${x},${z}: actor and ground must agree`);}
});

test('new ledge faces are opaque from both sides and join upper/lower floor edges',async()=>{
 const terraces=new Terraces(JSON.parse(await readFile(new URL('../../public/source/terraces/0.json',import.meta.url),'utf8')) as TerraceData),cell={x:18,z:12,altitude:0} as Cell,land={permissions:[],plates:[{bounds:[-16,-16,16,16],normal:[0,1,0],constant:-1}]} as Land,material=new THREE.MeshBasicMaterial({transparent:true,alphaTest:.5,vertexColors:true}),wall=terraceWalls(terraces,cell,land,material)!;assert.ok(wall);wall.position.set(592,0,400);wall.updateMatrixWorld(true);const surface=wall.material as THREE.MeshBasicMaterial;assert.equal(surface.transparent,false);assert.equal(surface.alphaTest,0);assert.equal(surface.vertexColors,false);assert.equal(surface.side,THREE.DoubleSide);
 const uv=wall.geometry.getAttribute('uv');assert.deepEqual([...new Set(Array.from({length:uv.count},(_,i)=>uv.getY(i)))].sort(),[0,1],'One ledge face must not repeat vertical soil bands');
 const top=1+terraces.height(599.5,396.9999),bottom=1+terraces.height(599.5,397.0001),y=(top+bottom)/2;assert.ok(top-bottom>.7);for(const[origin,direction]of [[new THREE.Vector3(599.5,y,396),new THREE.Vector3(0,0,1)],[new THREE.Vector3(599.5,y,398),new THREE.Vector3(0,0,-1)]]){const hits=new THREE.Raycaster(origin,direction).intersectObject(wall);assert.ok(hits.length);assert.ok(Math.abs(hits[0].point.z-397)<1e-6);}
});
test('raised ledges select continuous cliff art instead of the stacked native soil-rim atlas',()=>{
 const root=new THREE.Group(),cliff=new THREE.MeshBasicMaterial(),rim=new THREE.MeshBasicMaterial();cliff.name='cliff01';rim.name='wall01_d';for(const m of [rim,cliff,rim])root.add(new THREE.Mesh(new THREE.PlaneGeometry(),m));assert.equal(terraceCliffMaterial(root),cliff);root.remove(root.children[1]);assert.equal(terraceCliffMaterial(root),undefined);
});

test('separate solid rocks retain their shapes when rooted on different terrace heights',async()=>{
 const terraces=new Terraces(JSON.parse(await readFile(new URL('../../public/source/terraces/0.json',import.meta.url),'utf8')) as TerraceData),root=new THREE.Group(),geometry=new THREE.BufferGeometry(),positions:number[]=[];
 for(const z of [395.5,397.5]){const box=new THREE.BoxGeometry(.7,.8,.7).toNonIndexed();box.translate(599.5,1.4,z);positions.push(...box.getAttribute('position').array);box.dispose();}geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));const rock=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());rock.name='solid-original-rocks';root.add(rock);await terraceModel(root,terraces);const output=root.getObjectByName('source-terrace-surface') as THREE.Mesh,p=output.geometry.getAttribute('position');
 assert.equal(p.count,positions.length/3);for(let i=0;i<p.count;i++){const z=i<36?395.5:397.5,expected=terraces.height(599.5,z);assert.ok(Math.abs(p.getX(i)-positions[i*3])<1e-4);assert.ok(Math.abs(p.getZ(i)-positions[i*3+2])<1e-4);assert.ok(Math.abs(p.getY(i)-positions[i*3+1]-expected)<1e-5);}
});

test('jump landing selection preserves the native floor beneath a bridge when terrace offsets differ',async()=>{
 const terraces=new Terraces(JSON.parse(await readFile(new URL('../../public/source/terraces/0.json',import.meta.url),'utf8')) as TerraceData),cell={x:18,z:12,altitude:0} as Cell,land={permissions:[],plates:[1,3].map(y=>({bounds:[-16,-16,16,16],normal:[0,1,0],constant:-y}))} as Land,world=Object.create(OriginalWorld.prototype) as OriginalWorld;Object.assign(world,{cells:new Map([['18,12',{cell,land}]]),terraces});
 const upper=world.height(599.5,395.5,1);assert.ok(upper>2);const lower=world.height(599.5,397.5,upper,599.5,395.5);assert.ok(Math.abs(lower-1-terraces.height(599.5,397.5))<1e-8,'Synthetic relief must not select the overhead native bridge plate');
});

test('crossed flowers crossing a ledge translate as one rooted clump',async()=>{
 const terraces=new Terraces(JSON.parse(await readFile(new URL('../../public/source/terraces/0.json',import.meta.url),'utf8')) as TerraceData),root=new THREE.Group(),model=new THREE.Group();root.position.set(592,0,400);model.scale.setScalar(1/16);root.add(model);
 const {repairOriginalAsset}=await import('./render-repair.ts'),g=new THREE.PlaneGeometry(32,16);g.translate(120,24,-56);const m=new THREE.MeshBasicMaterial({alphaTest:.5});m.name='flower01';model.add(new THREE.Mesh(g,m));repairOriginalAsset(model,false);const flowers=model.getObjectByName('crossed-original-flowers') as THREE.Mesh,p=flowers.geometry.getAttribute('position'),r=flowers.geometry.getAttribute('sceneryRoot');assert.ok(r);const original=Array.from(p.array);await terraceModel(root,terraces);const out=root.getObjectByName('source-terrace-surface') as THREE.Mesh,q=out.geometry.getAttribute('position');assert.equal(q.count,p.count);const offset=terraces.height(599.5,396.5);for(let i=0;i<q.count;i++){assert.ok(Math.abs(q.getX(i)-original[i*3]/16)<1e-5);assert.ok(Math.abs(q.getY(i)-original[i*3+1]/16-offset)<1e-5);assert.ok(Math.abs(q.getZ(i)-original[i*3+2]/16)<1e-5);}
});
test('touching boulders retain distinct authored roots across a ledge',async()=>{
 const terraces=new Terraces(JSON.parse(await readFile(new URL('../../public/source/terraces/0.json',import.meta.url),'utf8')) as TerraceData),root=new THREE.Group(),g=new THREE.BufferGeometry(),positions:number[]=[],roots:number[]=[];
 for(const z of [395.5,397.5]){const box=new THREE.BoxGeometry(.8,.8,2).toNonIndexed();box.translate(599.5,1.4,z);positions.push(...box.getAttribute('position').array);for(let i=0;i<36;i++)roots.push(599.5,1,z,1);box.dispose();}g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('sceneryRoot',new THREE.Float32BufferAttribute(roots,4));const rocks=new THREE.Mesh(g,new THREE.MeshBasicMaterial());rocks.name='solid-original-rocks';root.add(rocks);await terraceModel(root,terraces);const p=(root.getObjectByName('source-terrace-surface') as THREE.Mesh).geometry.getAttribute('position');assert.equal(p.count,72);for(let i=0;i<p.count;i++)assert.ok(Math.abs(p.getY(i)-positions[i*3+1]-terraces.height(599.5,i<36?395.5:397.5))<1e-5);
});
test('native water and shoreline artwork stays flat when it overhangs a displaced land tile',async()=>{
 const terraces=new Terraces(JSON.parse(await readFile(new URL('../../public/source/terraces/0.json',import.meta.url),'utf8')) as TerraceData);
 for(const name of ['pond_line','sea01','water01']){const root=new THREE.Group(),g=new THREE.PlaneGeometry(2,4).toNonIndexed();g.rotateX(-Math.PI/2);g.translate(599.5,1,397);const before=Array.from(g.getAttribute('position').array),m=new THREE.MeshBasicMaterial();m.name=name;root.add(new THREE.Mesh(g,m));await terraceModel(root,terraces);const p=(root.getObjectByName('source-terrace-surface') as THREE.Mesh).geometry.getAttribute('position');assert.deepEqual(Array.from(p.array),before,name);}
});
test('exported visual floor profiles cover both sides of every native ledge',async()=>{
 const terraces=new Terraces(JSON.parse(await readFile(new URL('../../public/source/terraces/0.json',import.meta.url),'utf8')) as TerraceData);assert.equal(Object.keys(terraces.data.nativeEdges!).length,1453);
 for(const[x,z]of terraces.data.ledges){const profile=terraces.data.nativeEdges![x+','+z];assert.equal(profile.length,6);assert.ok(profile.every(Number.isFinite));}
 // This original landscape's visible lower floor is 1/8 tile above its BDHC.
 const profile=terraces.data.nativeEdges!['1032,196'];assert.equal(profile[4],3.125);const cell={x:32,z:6,altitude:0} as Cell,land={permissions:[],plates:[{bounds:[-16,-16,16,16],normal:[0,1,0],constant:-3}]} as Land,wall=terraceWalls(terraces,cell,land,new THREE.MeshBasicMaterial())!,p=wall.geometry.getAttribute('position'),expected=3.125+terraces.sample(1032,197,1032.5,197);let joined=false;for(let i=0;i<p.count;i++)if(Math.abs(p.getX(i)+1040-1032.5)<1e-6&&Math.abs(p.getZ(i)+208-197)<1e-6&&Math.abs(p.getY(i)-expected)<1e-5)joined=true;assert.ok(joined,'The cliff bottom must meet actual artwork at 3.125, not the collision plate at 3');
});
test('split native crown/stump components move by the same authored ground height',async()=>{
 const{addTreeVolumes}=await import('./tree-volume.ts'),terraces=new Terraces(JSON.parse(await readFile(new URL('../../public/source/terraces/0.json',import.meta.url),'utf8'))as TerraceData),root=new THREE.Group(),groundRoot=new THREE.Vector3(599.5,1,395.5),texture=syntheticTreeTexture(),crown=addTreeVolumes(root,[{center:new THREE.Vector3(599.5,.8125,397.5),groundRoot,width:2,height:2,color:new THREE.Color(1,1,1)}],texture,{footV:.90625}),stump=addTreeVolumes(root,[{center:new THREE.Vector3(599.5,.8125,395.5),groundRoot,width:2,height:2,color:new THREE.Color(1,1,1)}],texture,{footV:.90625});assert.ok(crown&&stump);await terraceModel(root,terraces);const a=new THREE.Matrix4(),b=new THREE.Matrix4();crown.leaves.getMatrixAt(0,a);stump.leaves.getMatrixAt(0,b);assert.ok(Math.abs(a.elements[13]-1-terraces.height(599.5,395.5))<1e-5);assert.equal(a.elements[13],b.elements[13]);assert.equal(a.elements[14]-b.elements[14],2);
});
test('stale terrain work stops before replacing shared source geometry',async()=>{
 const terraces=new Terraces(JSON.parse(await readFile(new URL('../../public/source/terraces/0.json',import.meta.url),'utf8')) as TerraceData),root=new THREE.Group(),mesh=new THREE.Mesh(new THREE.PlaneGeometry(4,4),new THREE.MeshBasicMaterial());root.add(mesh);assert.equal(await terraceModel(root,terraces,()=>false),false);assert.equal(mesh.visible,true);assert.equal(root.children.length,1);
});
