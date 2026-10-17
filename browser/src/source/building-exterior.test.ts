import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {repairOriginalAsset,originalMaterial,closeBuildingBack} from './render-repair.ts';
import {closeBuildingExterior,ownsBuildingExteriorResources} from './building-exterior.ts';
import {OriginalWorld} from './world.ts';

async function template(file:string){
  const bytes=await readFile(new URL('../../public/source/props/'+file,import.meta.url)),length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length).toString());
  delete json.images;delete json.textures;delete json.samplers;
  for(const material of json.materials??[])delete material.pbrMetallicRoughness?.baseColorTexture;
  const encoded=JSON.stringify(json),text=Buffer.from(encoded+' '.repeat((4-Buffer.byteLength(encoded)%4)%4)),out=Buffer.alloc(20+text.length+bytes.length-20-length);
  bytes.copy(out,0,0,20);out.writeUInt32LE(out.length,8);out.writeUInt32LE(text.length,12);text.copy(out,20);bytes.copy(out,20+text.length,20+length);
  const result=await new GLTFLoader().parseAsync(out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength),'');
  result.scene.traverse(object=>{if(object instanceof THREE.Mesh){const convert=(material:THREE.Material)=>originalMaterial(material as THREE.MeshStandardMaterial);object.material=Array.isArray(object.material)?object.material.map(convert):convert(object.material);}});
  repairOriginalAsset(result.scene,true);return result.scene;
}

const exteriorFixtures=[['1-37-0.glb','house'],['1-40-0.glb','special'],['1-7-86.glb','landmark'],['1-10-5.glb','civic'],['1-88-4.glb','station'],['1-8-5.glb','burned-tower'],['1-76-4.glb','urban'],['1-165-4.glb','facility'],['1-44-2.glb','gym'],['1-89-4.glb','misc'],['1-262-90.glb','industrial'],['1-9-86.glb','pagoda'],['1-181-5.glb','pokeathlon'],['1-71-72.glb','shrine'],['1-104-6.glb','decorative'],['1-110-6.glb','decorative'],['1-113-6.glb','decorative'],['1-317-9.glb','small'],['1-58-2.glb','small'],['1-75-4.glb','small'],['1-241-14.glb','small'],['1-35-6.glb','gate'],['1-147-9.glb','landmark-annex'],['1-154-19.glb','landmark-annex'],['1-263-90.glb','frontier'],['1-278-12.glb','frontier'],['1-79-4.glb','name-rater-game'],['1-87-4.glb','name-rater-game'],['1-87-13.glb','name-rater-game'],['1-167-6.glb','aquatic-gate'],['1-167-92.glb','aquatic-gate']]as const;

test('the game dispatcher applies family shells once on native placed clones',async()=>{
  for(const [file,family]of exteriorFixtures){
    const source=await template(file),placed=clone(source),group=new THREE.Group();group.position.set(30,4,-18);group.add(placed);placed.scale.setScalar(1/16);placed.rotation.y=.3;
    // No preparatory matrix refresh: runtime sets the placement and immediately
    // invokes this dispatcher, which must also refresh native skinned vertices.
    const summary=closeBuildingExterior(placed,'props/'+file,[]);assert.equal(summary.family,family,file);
    const count=placed.children.length;assert.equal(closeBuildingExterior(placed,'props/'+file,[]),summary);assert.equal(placed.children.length,count);
    assert.equal(source.userData.buildingExterior,undefined);source.traverse(object=>{assert.ok(!ownsBuildingExteriorResources(object.name),file+' cached template is unchanged');});
  }
});

test('the runtime dispatcher uses real placement entrances before family repairs and removes false arch and castle hulls',async t=>{
 const base=new URL('../../public/source/',import.meta.url),doors=JSON.parse(await readFile(new URL('entrances.json',base),'utf8')),placements=new Map<string,{matrix:number;cell:any;prop:any}>();
 for(const file of(await readdir(new URL('maps/',base))).filter(f=>/\.json$/.test(f)).sort((a,b)=>Number.parseInt(a)-Number.parseInt(b))){const map=JSON.parse(await readFile(new URL('maps/'+file,base),'utf8'));for(const cell of map.cells)for(const prop of cell.props)if(!placements.has(prop.asset))placements.set(prop.asset,{matrix:map.matrix,cell,prop});}
 let genericRepairs=0;
 for(const[file,family]of exteriorFixtures){
  const context=placements.get('props/'+file);assert.ok(context,file+' has an actual source placement');const{cell,prop,matrix}=context,source=await template(file),entrances=doors[matrix]??[];
  const placed=()=>{const root=clone(source);root.position.set(cell.x*32+16+prop.position[0],cell.altitude*.5+prop.position[1],cell.z*32+16+prop.position[2]);root.scale.fromArray(prop.scale).multiplyScalar(1/16);root.rotation.set(...prop.rotation.map((n:number)=>n*Math.PI/180)as[number,number,number]);return root;};
  const probe=placed(),generated=closeBuildingBack(probe,entrances),root=placed(),summary=closeBuildingExterior(root,'props/'+file,entrances);assert.equal(summary.family,family,file);assert.equal(summary.generatedGenericPanels,generated,file+' executes the same real entrance pass first');genericRepairs+=generated;
  let visible=0;root.traverseVisible(o=>{if(o.name==='entrance-rear-wall')visible++;});assert.equal(summary.genericPanels,visible);
  if(file==='1-147-9.glb')assert.equal(root.userData.landmarkAnnexShell.removedHullFaces,6,'the actual League arch loses its false enclosed hull');
  if(file==='1-263-90.glb')assert.equal(root.userData.frontierBuildingShell.removedHullFaces,3,'the actual Castle loses its three overheight backing facets');
 }
 assert.ok(genericRepairs>0,'the test must exercise real generic rear panels, not an empty entrance list');t.diagnostic(`Exercised ${genericRepairs} actual generic panels across ${exteriorFixtures.length} family/context fixtures.`);
});

test('stream unload frees each placed shell resource once while keeping source assets and textures reusable',async()=>{
  for(const [file,family]of exteriorFixtures){
  const source=await template(file),texture=new THREE.Texture();source.traverse(object=>{if(object instanceof THREE.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material])(material as THREE.MeshBasicMaterial).map=texture;});
  const first=clone(source),second=clone(source),scene=new THREE.Scene(),group=new THREE.Group();group.add(first);scene.add(group);first.scale.setScalar(1/16);
  closeBuildingExterior(first,'props/'+file,[]);
  const ownedGeometry=new Set<THREE.BufferGeometry>(),ownedMaterial=new Set<THREE.Material>(),sharedGeometry=new Set<THREE.BufferGeometry>(),sharedMaterial=new Set<THREE.Material>();
  const maps=new Set<THREE.Texture>();source.traverse(object=>{if(object instanceof THREE.Mesh){sharedGeometry.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material]){sharedMaterial.add(material);const texture=(material as THREE.MeshBasicMaterial).map;if(texture)maps.add(texture);}}});
  first.traverse(object=>{if(object instanceof THREE.Mesh&&ownsBuildingExteriorResources(object.name)){ownedGeometry.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])ownedMaterial.add(material);}});
  if(!['1-9-86.glb','1-147-9.glb','1-263-90.glb'].includes(file))assert.ok(ownedGeometry.size>0&&ownedMaterial.size>0,file+' creates owned shell resources');for(const geometry of ownedGeometry)assert.ok(!sharedGeometry.has(geometry));for(const material of ownedMaterial)assert.ok(!sharedMaterial.has(material));
  const calls=new Map<object,number>();for(const resource of [...ownedGeometry,...ownedMaterial,...sharedGeometry,...sharedMaterial,...maps])resource.addEventListener('dispose',()=>calls.set(resource,(calls.get(resource)??0)+1));
  const world=Object.create(OriginalWorld.prototype);world.scene=scene;world.releaseCell({group});
  for(const resource of [...ownedGeometry,...ownedMaterial])assert.equal(calls.get(resource),1,'owned buffer/material is freed once even when several panels share a material');
  for(const resource of [...sharedGeometry,...sharedMaterial,...maps])assert.equal(calls.get(resource),undefined,'cached source resource stays alive');
  assert.equal(group.parent,null);assert.equal(second.userData.buildingExterior,undefined);assert.equal(closeBuildingExterior(second,'props/'+file,[]).family,family);
  }
});


test('no inventoried native node can be mistaken for a disposable placed exterior',async()=>{
  const inventory=JSON.parse(await readFile(new URL('../../reviews/building-visual-inventory.json',import.meta.url),'utf8'));
  let checked=0;
  for(const item of inventory.assets){
    const bytes=await readFile(new URL('../../public/source/'+item.asset,import.meta.url));
    const length=bytes.readUInt32LE(12),source=JSON.parse(bytes.subarray(20,20+length).toString());
    for(const node of source.nodes??[]){assert.equal(ownsBuildingExteriorResources(node.name??''),false,item.asset+': '+node.name);checked++;}
  }
  assert.ok(checked>200);
});
