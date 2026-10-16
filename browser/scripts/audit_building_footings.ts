import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {readFile,writeFile} from 'node:fs/promises';
import {closeBuildingFooting} from '../src/source/building-footing.ts';
import {Terraces} from '../src/source/ledges.ts';
import {repairOriginalAsset,originalMaterial,closeBuildingBack} from '../src/source/render-repair.ts';
const root=new URL('../public/source/',import.meta.url);
function geometryGLB(bytes:Buffer):ArrayBuffer{
  const jsonLength=bytes.readUInt32LE(12);const json=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
  delete json.images;delete json.textures;delete json.samplers;
  for(const material of json.materials||[]){material.extras={...material.extras,geometryAuditHasTexture:!!material.pbrMetallicRoughness?.baseColorTexture};delete material.pbrMetallicRoughness?.baseColorTexture;delete material.pbrMetallicRoughness?.metallicRoughnessTexture;delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;}
  let encoded=JSON.stringify(json);encoded+=' '.repeat((4-Buffer.byteLength(encoded)%4)%4);const jsonBuffer=Buffer.from(encoded);const rest=bytes.subarray(20+jsonLength);
  const result=Buffer.alloc(20+jsonBuffer.length+rest.length);bytes.copy(result,0,0,20);result.writeUInt32LE(result.length,8);result.writeUInt32LE(jsonBuffer.length,12);jsonBuffer.copy(result,20);rest.copy(result,20+jsonBuffer.length);return result.buffer.slice(result.byteOffset,result.byteOffset+result.byteLength) as ArrayBuffer;
}

const load=async(p:string)=>JSON.parse(await readFile(new URL(p,root),'utf8')),matrix=await load('matrices/0.json'),entrances=await load('entrances.json'),terraces=new Terraces(await load('terraces/0.json')),foundations=(await load('terraces/foundations-0.json')).structures,maps=new Map<number,any>(),templates=new Map<string,THREE.Group>(),loader=new GLTFLoader(),results:any[]=[];
for(const b of foundations){const [cellKey,n]=b.key.split(':'),[cx,cz]=cellKey.split(',').map(Number),owner=matrix.headers[cz*matrix.width+cx];if(!maps.has(owner))maps.set(owner,await load('maps/'+owner+'.json'));const cell=maps.get(owner).cells.find((c:any)=>c.x===cx&&c.z===cz),prop=cell.props[Number(n)];
 if(!templates.has(prop.asset)){const gltf=await loader.parseAsync(geometryGLB(await readFile(new URL(prop.asset,root))),'');gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh)o.material=Array.isArray(o.material)?o.material.map(m=>originalMaterial(m as THREE.MeshStandardMaterial)):originalMaterial(o.material as THREE.MeshStandardMaterial);});repairOriginalAsset(gltf.scene,true);templates.set(prop.asset,gltf.scene);}
 const p=clone(templates.get(prop.asset)!),offset=terraces.height(...b.anchor);p.scale.set(prop.scale[0]/16,prop.scale[1]/16,prop.scale[2]/16);p.rotation.set(...prop.rotation.map((v:number)=>v*Math.PI/180));p.position.set(cx*32+16+prop.position[0],cell.altitude*.5+prop.position[1]+offset,cz*32+16+prop.position[2]);closeBuildingBack(p,entrances[0]||[]);const start=performance.now(),footing=closeBuildingFooting(p,terraces,offset),ms=performance.now()-start;
 if(footing){const values=Array.from(footing.geometry.attributes.position.array);if(!values.every(Number.isFinite))throw Error('Non-finite footing '+b.key);footing.geometry.dispose();for(const m of footing.material as THREE.Material[])m.dispose();}results.push({key:b.key,asset:b.asset,vertices:footing?.geometry.attributes.position.count??0,ms});}
console.log(JSON.stringify({structures:results.length,footings:results.filter(v=>v.vertices).length,totalMs:results.reduce((s,v)=>s+v.ms,0),maxMs:Math.max(...results.map(v=>v.ms)),largest:results.sort((a,b)=>b.vertices-a.vertices).slice(0,10),reported:results.filter(v=>['39,7:2','16,4:0','16,5:13','40,8:1'].includes(v.key))}));
