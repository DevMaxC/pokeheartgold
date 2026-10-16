import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {readFile,readdir} from 'node:fs/promises';
import {repairOriginalAsset,originalMaterial} from '../src/source/render-repair.ts';
import {terraceModel} from '../src/source/terrace-model.ts';
import {Terraces} from '../src/source/ledges.ts';
const root=new URL('../public/source/',import.meta.url),json=async(p:string)=>JSON.parse(await readFile(new URL(p,root),'utf8'));
function geometryGLB(bytes:Buffer):ArrayBuffer{
  const jsonLength=bytes.readUInt32LE(12);const json=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
  delete json.images;delete json.textures;delete json.samplers;
  for(const material of json.materials||[]){material.extras={...material.extras,geometryAuditHasTexture:!!material.pbrMetallicRoughness?.baseColorTexture};delete material.pbrMetallicRoughness?.baseColorTexture;delete material.pbrMetallicRoughness?.metallicRoughnessTexture;delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;}
  let encoded=JSON.stringify(json);encoded+=' '.repeat((4-Buffer.byteLength(encoded)%4)%4);const jsonBuffer=Buffer.from(encoded);const rest=bytes.subarray(20+jsonLength);
  const result=Buffer.alloc(20+jsonBuffer.length+rest.length);bytes.copy(result,0,0,20);result.writeUInt32LE(result.length,8);result.writeUInt32LE(jsonBuffer.length,12);jsonBuffer.copy(result,20);rest.copy(result,20+jsonBuffer.length);return result.buffer.slice(result.byteOffset,result.byteOffset+result.byteLength) as ArrayBuffer;
}

const load=async(p:string)=>JSON.parse(await readFile(new URL(p,root),'utf8')),matrix=await load('matrices/0.json'),data=await load('terraces/0.json'),terraces=new Terraces(data),cells=new Map<string,any>(),foliage=await load('foliage.json'),loader=new GLTFLoader(),templates=new Map<string,THREE.Group>(),texture=new THREE.Texture(),result:any[]=[];
for(const file of await readdir(new URL('maps/',root))){const m=await load('maps/'+file);if(m.matrix===0)for(const cell of m.cells)cells.set(cell.x+','+cell.z,cell);}
for(const key of Object.keys(data.cells).slice(0,30)){const cell=cells.get(key);if(!cell)continue;
 if(!templates.has(cell.asset)){const gltf=await loader.parseAsync(geometryGLB(await readFile(new URL(cell.asset,root))),'');gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){const convert=(old:THREE.Material)=>{const m=originalMaterial(old as THREE.MeshStandardMaterial);if(old.userData.geometryAuditHasTexture)m.map=texture;const entry=foliage[cell.asset.match(/-(\d+)\.glb$/)[1]]?.[m.name];if(entry)m.userData.treeInfo=entry;return m;};o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);}});repairOriginalAsset(gltf.scene,false);templates.set(cell.asset,gltf.scene);}
 const group=new THREE.Group(),model=clone(templates.get(cell.asset)!);group.position.set(cell.x*32+16,cell.altitude*.5,cell.z*32+16);model.scale.setScalar(1/16);group.add(model);const start=performance.now();await terraceModel(group,terraces);const ms=performance.now()-start;let vertices=0;group.traverseVisible(o=>{if(o instanceof THREE.Mesh&&o.name==='source-terrace-surface'){vertices+=o.geometry.getAttribute('position').count;o.geometry.dispose();}});result.push({key,asset:cell.asset,ms,vertices});
}
console.log(JSON.stringify(result));console.log(JSON.stringify({total:result.reduce((s,v)=>s+v.ms,0),max:Math.max(...result.map(v=>v.ms)),median:result.map(v=>v.ms).sort((a,b)=>a-b)[Math.floor(result.length/2)]}));
