import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {OriginalWorld} from './world.ts';
import {closeTerrainScenery,planTerrainScenery} from './terrain-scenery.ts';
import {Terraces} from './ledges.ts';
import {terraceModel} from './terrace-model.ts';
import {closeBuildingExterior,ownsBuildingExteriorResources} from './building-exterior.ts';
import {originalMaterial,repairOriginalAsset} from './render-repair.ts';
import type {Cell,Land,Matrix} from './types.ts';

async function nativeTemplate(path:string,texture:THREE.Texture){
 const bytes=await readFile(new URL('../../public/source/'+path,import.meta.url)),length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length).toString());
 delete json.images;delete json.textures;delete json.samplers;for(const material of json.materials??[])delete material.pbrMetallicRoughness?.baseColorTexture;
 const encoded=JSON.stringify(json),text=Buffer.from(encoded+' '.repeat((4-Buffer.byteLength(encoded)%4)%4)),out=Buffer.concat([bytes.subarray(0,20),text,bytes.subarray(20+length)]);out.writeUInt32LE(out.length,8);out.writeUInt32LE(text.length,12);
 const result=await new GLTFLoader().parseAsync(out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength),'');
 result.scene.traverse(o=>{if(o instanceof THREE.Mesh){const convert=(m:THREE.Material)=>{const material=originalMaterial(m as THREE.MeshStandardMaterial);material.map=texture;return material;};o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);}});
 repairOriginalAsset(result.scene,path.startsWith('props/'));return result.scene;
}
function ownedMeshes(root:THREE.Object3D){const result:THREE.Mesh[]=[];root.traverse(o=>{if(o instanceof THREE.Mesh&&(ownsBuildingExteriorResources(o.name)||o.name.startsWith('terrain-scenery-')))result.push(o);});return result;}
function sharedResources(...roots:THREE.Object3D[]){const resources=new Set<THREE.BufferGeometry|THREE.Material|THREE.Texture>();for(const root of roots)root.traverse(o=>{if(o instanceof THREE.Mesh){resources.add(o.geometry);for(const material of Array.isArray(o.material)?o.material:[o.material]){resources.add(material);const map=(material as THREE.MeshBasicMaterial).map;if(map)resources.add(map);}}});return resources;}

test('streaming releases placed terrain repairs once without disposing reusable native assets',()=>{
 const texture=new THREE.Texture(),nativeMaterial=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide});nativeMaterial.name='cliff01';
 const nativeGeometry=new THREE.PlaneGeometry(32,32);nativeGeometry.rotateX(-Math.PI/2);
 const source=new THREE.Group();source.add(new THREE.Mesh(nativeGeometry,nativeMaterial));
 const cell:Cell={x:0,z:0,land:210,altitude:14,props:[],asset:'land/210-0.glb'},land:Land={permissions:Array(1024).fill(0x8000),plates:[{bounds:[-16,-16,16,16],normal:[0,1,0],constant:0}]},matrix:Matrix={width:2,height:2,headers:[0,0,0,0],altitudes:[14,2,2,2],models:[210,208,208,208]};
 const neighbors=new Map<string,{cell:Cell;land:Land}>();for(const[x,z]of[[1,0],[0,1]])neighbors.set(x+','+z,{cell:{...cell,x,z,altitude:2,land:208},land});
 const first=clone(source),second=clone(source),group=new THREE.Group(),scene=new THREE.Scene();group.position.set(16,7,16);group.add(first);scene.add(group);
 const summary=closeTerrainScenery(group,{cell,land,matrix,neighbors});assert.ok(summary.sideTriangles>0);
 const repair=group.children.find(o=>o.name==='terrain-scenery-boundary') as THREE.Mesh;
 assert.ok(repair);const geometry=repair.geometry,material=repair.material as THREE.MeshBasicMaterial;
 assert.notEqual(geometry,nativeGeometry);assert.notEqual(material,nativeMaterial);assert.equal(material.map,texture);
 // Shared repair resources can occur across several panels after batching.
 const duplicate=new THREE.Mesh(geometry,material);duplicate.name='terrain-scenery-test-shared-panel';group.add(duplicate);
 const disposed=new Map<object,number>();for(const resource of [geometry,material,nativeGeometry,nativeMaterial,texture])resource.addEventListener('dispose',()=>disposed.set(resource,(disposed.get(resource)??0)+1));
 const world=Object.create(OriginalWorld.prototype);world.scene=scene;world.releaseCell({group});
 assert.equal(disposed.get(geometry),1);assert.equal(disposed.get(material),1);
 for(const resource of [nativeGeometry,nativeMaterial,texture])assert.equal(disposed.get(resource),undefined);
 assert.equal(group.parent,null);assert.equal(second.userData.terrainScenery,undefined);
 const reloaded=new THREE.Group();reloaded.position.copy(group.position);reloaded.add(second);assert.ok(closeTerrainScenery(reloaded,{cell,land,matrix,neighbors}).sideTriangles>0);
});

test('terrace deformation keeps legacy backing out of evidence for new solid hill volumes',async()=>{
 const group=new THREE.Group(),material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});material.name='cliff01';group.position.set(16,7,16);
 const wall=new THREE.Mesh(new THREE.PlaneGeometry(2,1),material);wall.position.set(0,.5,2);group.add(wall);
 const oldGeometry=new THREE.PlaneGeometry(32,32);oldGeometry.rotateX(-Math.PI/2);const legacy=new THREE.Mesh(oldGeometry,material);legacy.name='textured-terrain-back';group.add(legacy);
 const terraces=new Terraces({version:2,scale:256,cells:{},ledges:[],cliffAssets:{}});await terraceModel(group,terraces);
 const replacements=group.children.filter(o=>o.name==='source-terrace-surface');assert.equal(replacements.length,2);assert.equal(replacements.filter(o=>o.userData.terrainSceneryCoverageOnly).length,1);
 const cell:Cell={x:0,z:0,land:210,altitude:14,props:[],asset:'land/210-0.glb'},land:Land={permissions:Array(1024).fill(0x8000),plates:[{bounds:[-16,-16,16,16],normal:[0,1,0],constant:0}]},matrix:Matrix={width:2,height:2,headers:[0,0,0,0],altitudes:[14,2,2,2],models:[210,208,208,208]},neighbors=new Map<string,{cell:Cell;land:Land}>();
 for(const[x,z]of[[1,0],[0,1]])neighbors.set(x+','+z,{cell:{...cell,x,z,altitude:2,land:208},land});
 const plan=planTerrainScenery(group,{cell,land,matrix,neighbors});assert.equal(plan.sourceFaces,2,'Only the native wall is evidence; its old synthetic top is coverage only');assert.equal(plan.patches.length,0,'A synthetic backing must not establish a new opaque hill');
});

test('one cell releases actual native building and terrain repairs together without freeing cached source resources',async()=>{
 const texture=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1),cliff=await nativeTemplate('land/210-0.glb',texture),house=await nativeTemplate('props/1-37-0.glb',texture),shared=sharedResources(cliff,house),scene=new THREE.Scene(),group=new THREE.Group();group.position.set(16,7,16);
 const cell:Cell={x:0,z:0,land:210,altitude:14,props:[],asset:'land/210-0.glb'},land:Land={permissions:Array(1024).fill(0x8000),plates:[{bounds:[-16,-16,16,16],normal:[0,1,0],constant:0}]},matrix:Matrix={width:1,height:2,headers:[60,65535],models:[210,208],altitudes:[14,2]},neighbors=new Map([['0,1',{cell:{...cell,z:1,land:208,altitude:2},land}]]),context={cell,land,matrix,neighbors};
 const placedCliff=clone(cliff);placedCliff.scale.setScalar(1/16);group.add(placedCliff);assert.ok(closeTerrainScenery(group,context).sideTriangles>0);
 const placedHouse=clone(house);placedHouse.scale.setScalar(1/16);group.add(placedHouse);assert.equal(closeBuildingExterior(placedHouse,'props/1-37-0.glb',[]).family,'house');scene.add(group);
 const owned=ownedMeshes(group),terrain=owned.find(m=>m.name.startsWith('terrain-scenery-'))!,building=owned.find(m=>ownsBuildingExteriorResources(m.name))!;assert.ok(terrain&&building,'the same placed cell exercises both resource families');
 for(const [mesh,name]of[[terrain,'terrain-scenery-shared-panel'],[building,'house-shared-panel']]as const){const duplicate=new THREE.Mesh(mesh.geometry,mesh.material);duplicate.name=name;group.add(duplicate);}
 const ownedResources=new Set<THREE.BufferGeometry|THREE.Material>();for(const mesh of ownedMeshes(group)){ownedResources.add(mesh.geometry);for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])ownedResources.add(material);}for(const resource of ownedResources)assert.ok(!shared.has(resource));
 const second=new THREE.Group(),secondCliff=clone(cliff),secondHouse=clone(house);second.position.copy(group.position);secondCliff.scale.setScalar(1/16);secondHouse.scale.setScalar(1/16);second.add(secondCliff,secondHouse);scene.add(second);
 const calls=new Map<object,number>();for(const resource of new Set([...shared,...ownedResources]))resource.addEventListener('dispose',()=>calls.set(resource,(calls.get(resource)??0)+1));
 const world=Object.create(OriginalWorld.prototype);world.scene=scene;world.releaseCell({group});
 for(const resource of ownedResources)assert.equal(calls.get(resource),1,'both resource families are disposed once despite shared panels');for(const resource of shared)assert.equal(calls.get(resource),undefined,'cached native buffers/materials/maps survive');assert.equal(group.parent,null);assert.equal(second.parent,scene);assert.equal(secondHouse.userData.buildingExterior,undefined);
 // Match the real dispatcher order when rebuilding another placement.
 second.remove(secondHouse);assert.ok(closeTerrainScenery(second,context).sideTriangles>0);second.add(secondHouse);assert.equal(closeBuildingExterior(secondHouse,'props/1-37-0.glb',[]).family,'house');world.releaseCell({group:second});
 for(const resource of shared)assert.equal(calls.get(resource),undefined);assert.equal(cliff.userData.terrainScenery,undefined);assert.equal(house.userData.buildingExterior,undefined);
});

test('a superseded delayed cliff donor cannot finalize terrain or request props, and the current generation can retry',async()=>{
 const texture=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1),donor=await nativeTemplate('land/210-0.glb',texture),house=await nativeTemplate('props/1-37-0.glb',texture),grass=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide});grass.name='grass01';const geometry=new THREE.PlaneGeometry(512,512);geometry.rotateX(-Math.PI/2);const template=new THREE.Group();template.add(new THREE.Mesh(geometry,grass));
 const cell:Cell={x:0,z:0,land:208,altitude:14,asset:'land/no-cliff-fixture.glb',props:[{id:37,asset:'props/1-37-0.glb',position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}]},land:Land={permissions:Array(1024).fill(0x8000),plates:[{bounds:[-16,-16,16,16],normal:[0,1,0],constant:0}]},map={id:60,matrix:0,mapType:'MAP_TYPE_CITY',cells:[cell],events:{warps:[],objects:[],bgs:[],coords:[]}},world=Object.create(OriginalWorld.prototype)as any;
 Object.assign(world,{scene:new THREE.Scene(),matrix:{width:1,height:2,headers:[60,65535],models:[208,0],altitudes:[14,2]},activeMatrix:0,generation:1,pending:null,index:{maps:{60:{id:60}}},maps:new Map([[60,map]]),cells:new Map(),landCache:new Map([[208,Promise.resolve(land)],[0,Promise.resolve(land)]]),entrances:Promise.resolve({0:[]}),terraces:null,backgroundCliff:null,latestStream:{matrix:0,id:60,x:16,z:16},loading:false});
 let started!:()=>void,finish!:(value:THREE.Group)=>void;const downloading=new Promise<void>(resolve=>{started=resolve;}),download=new Promise<THREE.Group>(resolve=>{finish=resolve;}),requests:string[]=[];
 world.asset=(path:string)=>{requests.push(path);if(path==='land/210-0.glb'){started();return download;}if(path===cell.asset)return Promise.resolve(template);if(path===cell.props[0].asset)return Promise.resolve(house);throw Error('Unexpected fixture download '+path);};
 const released:THREE.Group[]=[];world.releaseCell=function(c:any){released.push(c.group);return(OriginalWorld.prototype as any).releaseCell.call(this,c);};const shared=sharedResources(template,donor,house),disposed=new Set<object>();for(const resource of shared)resource.addEventListener('dispose',()=>disposed.add(resource));
 const streaming=world.stream(60,16,16);await downloading;world.generation++;finish(donor);await streaming;
 assert.equal(world.cells.size,0);assert.equal(world.scene.children.length,0);assert.equal(world.pending,null);assert.equal(world.loading,false);assert.equal(released.length,1);assert.equal(ownedMeshes(released[0]).length,0,'generation is checked after donor load and before terrain finalization');assert.equal(requests.includes(cell.props[0].asset),false,'stale terrain must not start any prop download');assert.equal(disposed.size,0);
 await world.stream(60,16,16);assert.equal(world.cells.size,1);const loaded=[...world.cells.values()][0]as any;assert.ok(ownedMeshes(loaded.group).some(m=>m.name.startsWith('terrain-scenery-')));assert.ok(ownedMeshes(loaded.group).some(m=>ownsBuildingExteriorResources(m.name)));assert.equal(loaded.group.children.find((o:THREE.Object3D)=>o.userData.buildingExterior)?.userData.buildingExterior.family,'house');assert.equal(requests.filter(p=>p==='land/210-0.glb').length,1,'successful shared donor is reused');assert.equal(world.pending,null);assert.equal(world.loading,false);world.releaseCell(loaded);assert.equal(disposed.size,0);
});
