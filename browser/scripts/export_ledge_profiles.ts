/** Run after export_terraces.py. Join cliff walls to actual original mesh heights,
 * which occasionally differ from the collision plates by a fraction of a tile. */
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {repairOriginalAsset,originalMaterial} from '../src/source/render-repair.ts';
import {terrainHeight} from '../src/source/terrain.ts';
import type {Cell,Land} from '../src/source/types.ts';
const root=new URL('../public/source/',import.meta.url),json=async(p:string)=>JSON.parse(await readFile(new URL(p,root),'utf8'));
function geometryGLB(bytes:Buffer):ArrayBuffer{
  const jsonLength=bytes.readUInt32LE(12);const json=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
  delete json.images;delete json.textures;delete json.samplers;
  for(const material of json.materials||[]){material.extras={...material.extras,geometryAuditHasTexture:!!material.pbrMetallicRoughness?.baseColorTexture};delete material.pbrMetallicRoughness?.baseColorTexture;delete material.pbrMetallicRoughness?.metallicRoughnessTexture;delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;}
  let encoded=JSON.stringify(json);encoded+=' '.repeat((4-Buffer.byteLength(encoded)%4)%4);const jsonBuffer=Buffer.from(encoded);const rest=bytes.subarray(20+jsonLength);
  const result=Buffer.alloc(20+jsonBuffer.length+rest.length);bytes.copy(result,0,0,20);result.writeUInt32LE(result.length,8);result.writeUInt32LE(jsonBuffer.length,12);jsonBuffer.copy(result,20);rest.copy(result,20+jsonBuffer.length);return result.buffer.slice(result.byteOffset,result.byteOffset+result.byteLength) as ArrayBuffer;
}

const data=await json('terraces/0.json'),foliage=await json('foliage.json'),cells=new Map<string,Cell>(),lands=new Map<number,Land>(),templates=new Map<string,{p:THREE.Vector3[];normal:THREE.Vector3}[]>(),texture=new THREE.Texture();
for(const name of await readdir(new URL('maps/',root))){const map=await json('maps/'+name);if(map.matrix===0)for(const c of map.cells)cells.set(c.x+','+c.z,c);}
let fallback=0,samples=0,maxDelta=0;
async function surface(x:number,z:number,owner:Cell){
 const cell=cells.get(Math.floor(x/32)+','+Math.floor(z/32))??owner;
 if(!lands.has(cell.land))lands.set(cell.land,await json('lands/'+cell.land+'.json'));
 const native=terrainHeight(lands.get(cell.land)!,cell,x,z,cell.altitude*.5);
 if(!templates.has(cell.asset)){
  const gltf=await new GLTFLoader().parseAsync(geometryGLB(await readFile(new URL(cell.asset,root))),'');
  gltf.scene.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const convert=(old:THREE.Material)=>{const m=originalMaterial(old as THREE.MeshStandardMaterial);if(old.userData.geometryAuditHasTexture)m.map=texture;const entry=foliage[cell.asset.match(/-(\d+)\.glb$/)![1]]?.[m.name];if(entry)m.userData.treeInfo=entry;return m;};o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);});
  repairOriginalAsset(gltf.scene,false);gltf.scene.updateMatrixWorld(true);const triangles:{p:THREE.Vector3[];normal:THREE.Vector3}[]=[];
  gltf.scene.traverseVisible(o=>{
   if(!(o instanceof THREE.Mesh)||o instanceof THREE.InstancedMesh)return;
   const g=o.geometry,p=g.getAttribute('position'),roots=g.getAttribute('sceneryRoot'),index=g.index,materials=Array.isArray(o.material)?o.material:[o.material];
   for(let i=0;i<(index?.count??p.count);i+=3){const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),slot=g.groups.find(v=>i>=v.start&&i<v.start+v.count)?.materialIndex??0,m=materials[slot];if(roots?.getW(ids[0])||/flower|fence|saku|kage|shadow|shade|rock/i.test(m.name))continue;
    const points=ids.map(id=>o.getVertexPosition(id,new THREE.Vector3()).applyMatrix4(o.matrixWorld)),normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();if(Math.abs(normal.y)>.7)triangles.push({p:points,normal});
   }
  });templates.set(cell.asset,triangles);
 }
 const px=(x-cell.x*32-16)*16,pz=(z-cell.z*32-16)*16;let best:number|undefined;
 for(const {p:[a,b,c]}of templates.get(cell.asset)!){const den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(Math.abs(den)<1e-10)continue;const wa=((b.z-c.z)*(px-c.x)+(c.x-b.x)*(pz-c.z))/den,wb=((c.z-a.z)*(px-c.x)+(a.x-c.x)*(pz-c.z))/den,wc=1-wa-wb;if(Math.min(wa,wb,wc)<-1e-5)continue;const y=(a.y*wa+b.y*wb+c.y*wc)/16+cell.altitude*.5;if(best===undefined||Math.abs(y-native)<Math.abs(best-native))best=y;}
 samples++;if(best===undefined){fallback++;return native;}maxDelta=Math.max(maxDelta,Math.abs(best-native));return Math.round(best*4096)/4096;
}
const nativeEdges:Record<string,number[]>={};
for(const[x,z,b]of data.ledges){
 const cell=cells.get(Math.floor(x/32)+','+Math.floor(z/32));if(!cell)throw Error('Missing original ledge cell');const[dx,dz]=({56:[1,0],57:[-1,0],58:[0,-1],59:[0,1]} as Record<number,number[]>)[b];
 const points=dx===1?[[x+1,z],[x+1,z+.5],[x+1,z+1]]:dx===-1?[[x,z+1],[x,z+.5],[x,z]]:dz===1?[[x+1,z+1],[x+.5,z+1],[x,z+1]]:[[x,z],[x+.5,z],[x+1,z]];
 const sides:number[]=[];
 for(const side of [-1,1])for(let i=0;i<3;i++){const [px,pz]=points[i],towards=points[1],sx=px+dx*side*.00001+(towards[0]-px)*.00001,sz=pz+dz*side*.00001+(towards[1]-pz)*.00001;sides.push(await surface(sx,sz,cell));}nativeEdges[x+','+z]=sides;
}
data.nativeEdges=nativeEdges;await writeFile(new URL('terraces/0.json',root),JSON.stringify(data)+'\n');
console.log(JSON.stringify({ledges:data.ledges.length,samples,nativeFallbackSamples:fallback,maxVisualCollisionDelta:maxDelta,assets:templates.size}));
