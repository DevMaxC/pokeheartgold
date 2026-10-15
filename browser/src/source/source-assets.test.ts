import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,access} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {repairOriginalAsset} from './render-repair.ts';

const root=new URL('../../public/source/',import.meta.url);
const readJSON=async(path:string)=>JSON.parse(await readFile(new URL(path,root),'utf8'));

// Keep the original binary geometry, accessors, material names and transforms.
// Omit only image references: this batch checks geometry, not texture decoding.
function geometryGLB(bytes:Buffer):ArrayBuffer{
  const jsonLength=bytes.readUInt32LE(12);const json=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
  delete json.images;delete json.textures;delete json.samplers;
  for(const material of json.materials||[]){delete material.pbrMetallicRoughness?.baseColorTexture;delete material.pbrMetallicRoughness?.metallicRoughnessTexture;delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;}
  let encoded=JSON.stringify(json);encoded+=' '.repeat((4-Buffer.byteLength(encoded)%4)%4);const jsonBuffer=Buffer.from(encoded);const rest=bytes.subarray(20+jsonLength);
  const result=Buffer.alloc(20+jsonBuffer.length+rest.length);bytes.copy(result,0,0,20);result.writeUInt32LE(result.length,8);result.writeUInt32LE(jsonBuffer.length,12);jsonBuffer.copy(result,20);rest.copy(result,20+jsonBuffer.length);return result.buffer.slice(result.byteOffset,result.byteOffset+result.byteLength) as ArrayBuffer;
}
test('all imported prop and landscape geometries accept shared rendering repairs without invalid vertices',async t=>{
  const loader=new GLTFLoader(),foliage=await readJSON('foliage.json');let props=0,lands=0,solidAssets=0,treeAssets=0,uprightAssets=0,fenceAssets=0,flowerAssets=0,terrainAssets=0;
  for(const folder of ['props','land'])for(const file of (await readdir(new URL(folder+'/',root))).filter(f=>f.endsWith('.glb'))){
    const gltf=await loader.parseAsync(geometryGLB(await readFile(new URL(folder+'/'+file,root))),'');
    gltf.scene.traverse(object=>{if(!(object instanceof THREE.Mesh))return;const convert=(old:THREE.Material)=>{const m=new THREE.MeshBasicMaterial({side:THREE.DoubleSide,opacity:old.opacity,alphaTest:(old as THREE.MeshStandardMaterial).alphaTest,transparent:old.transparent});m.name=old.name;const entry=foliage[file.match(/-(\d+)\.glb$/)![1]]?.[m.name];if(folder==='land'&&entry)m.userData.treeInfo=entry;return m;};object.material=Array.isArray(object.material)?object.material.map(convert):convert(object.material);});
    const result=repairOriginalAsset(gltf.scene,folder==='props');if(result.solidFaces)solidAssets++;if(result.billboardTrees)treeAssets++;if(result.uprightPanels)uprightAssets++;if(result.fencePosts)fenceAssets++;if(result.flowerClumps)flowerAssets++;if(result.terrainSkirts)terrainAssets++;
    if(folder==='land'&&file==='0-2.glb')gltf.scene.traverse(object=>{if(!(object instanceof THREE.InstancedMesh)||object.name!=='camera-facing-original-trees')return;assert.ok(Array.from(object.geometry.getAttribute('pivotOffset').array).every(v=>v===0));for(let i=0;i<object.count;i++){const matrix=new THREE.Matrix4();object.getMatrixAt(i,matrix);assert.ok(new THREE.Vector3().setFromMatrixScale(matrix).x<=64.001,'Original New Bark forest rows must be split into individual 64-unit trees.');}});
    gltf.scene.traverse(object=>{if(!(object instanceof THREE.Mesh))return;if(object instanceof THREE.InstancedMesh)assert.ok(Array.from(object.instanceMatrix.array).every(Number.isFinite));const p=object.geometry.getAttribute('position');assert.ok(Array.from(p.array).every(Number.isFinite),folder+'/'+file);object.geometry.dispose();for(const m of Array.isArray(object.material)?object.material:[object.material])m.dispose();});
    if(folder==='props')props++;else lands++;
  }
  assert.equal(props,946);assert.equal(lands,648);assert.ok(solidAssets>100);assert.ok(treeAssets>10);t.diagnostic(`Audited ${props} prop contexts and ${lands} landscapes; repaired ${solidAssets} structural assets and ${treeAssets} tree assets and ${uprightAssets} upright cut-out assets; ${fenceAssets} solid-fence, ${flowerAssets} flower-volume and ${terrainAssets} terrain-closure contexts.`);
});
test('all 540 map headers reference existing imported geometry and tile data',async()=>{
  const index=await readJSON('index.json');assert.equal(Object.keys(index.maps).length,540);const paths=new Set<string>();
  for(const id of Object.keys(index.maps)){const map=await readJSON(`maps/${id}.json`);assert.equal(map.id,Number(id));paths.add(`matrices/${map.matrix}.json`);
    for(const cell of map.cells){paths.add(cell.asset);paths.add(`lands/${cell.land}.json`);for(const prop of cell.props)paths.add(prop.asset);}
    // 0xFFF is the source's dynamic return-location sentinel (field_control.c).
    for(const warp of map.events.warps||[])if(Number(warp.header)!==0xFFF)assert.notEqual(index.mapIds[warp.header],undefined,`${id}: ${warp.header}`);
  }
  await Promise.all([...paths].map(path=>access(new URL(path,root))));
});
test('repeated lightmap forest textures resolve to complete individual-tree artwork',async()=>{
 const foliage=await readJSON('foliage.json');let repeated=0;
 for(const group of Object.values(foliage) as Record<string,{asset:string;centers:number[];footV:number}>[])for(const [name,entry]of Object.entries(group))if(/_re(?:_|$)/.test(name)){
  repeated++;assert.ok(!/_re(?:_|\.)/.test(entry.asset),name);assert.ok(entry.centers.length>=1);assert.ok(entry.footV>0&&entry.footV<=1);await access(new URL(entry.asset,root));
 }
 assert.ok(repeated>10);assert.equal(foliage['2'].tree01_re_lm1.asset,'foliage/2-tree01gs_lm1.png');assert.equal(foliage['2'].treekn_re_lm1.asset,'foliage/2-treekn_lm1.png');
});
