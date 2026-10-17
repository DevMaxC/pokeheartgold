/** Run after export_terraces.py. Join cliff walls to actual original mesh heights,
 * which occasionally differ from the collision plates by a fraction of a tile. */
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mkdir,readFile,readdir,writeFile,rename,unlink} from 'node:fs/promises';
import {repairOriginalAsset,originalMaterial} from '../src/source/render-repair.ts';
import {terrainHeight} from '../src/source/terrain.ts';
import {Terraces} from '../src/source/ledges.ts';
import {assertFreshTerraceGeneration} from './terrace_stage.ts';
import {assertNativeCornerFloor,nativeCornerWitness} from './ledge_corner_art.ts';
import type {Cell,Land} from '../src/source/types.ts';
const root=new URL('../public/source/',import.meta.url),json=async(p:string)=>JSON.parse(await readFile(new URL(p,root),'utf8'));
function geometryGLB(bytes:Buffer):ArrayBuffer{
  const jsonLength=bytes.readUInt32LE(12);const json=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
  delete json.images;delete json.textures;delete json.samplers;
  for(const material of json.materials||[]){material.extras={...material.extras,geometryAuditHasTexture:!!material.pbrMetallicRoughness?.baseColorTexture};delete material.pbrMetallicRoughness?.baseColorTexture;delete material.pbrMetallicRoughness?.metallicRoughnessTexture;delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;}
  let encoded=JSON.stringify(json);encoded+=' '.repeat((4-Buffer.byteLength(encoded)%4)%4);const jsonBuffer=Buffer.from(encoded);const rest=bytes.subarray(20+jsonLength);
  const result=Buffer.alloc(20+jsonBuffer.length+rest.length);bytes.copy(result,0,0,20);result.writeUInt32LE(result.length,8);result.writeUInt32LE(jsonBuffer.length,12);jsonBuffer.copy(result,20);rest.copy(result,20+jsonBuffer.length);return result.buffer.slice(result.byteOffset,result.byteOffset+result.byteLength) as ArrayBuffer;
}

const args=process.argv.slice(2),positional=args.filter(arg=>arg!=='--staged'),usedStaged=args.includes('--staged'),matrixId=Number(positional[0]??0);if(positional.length>1||args.length>positional.length+1||!Number.isInteger(matrixId)||matrixId<0)throw Error('Invalid terrace matrix/arguments');
const browser=new URL('../',import.meta.url),staging=new URL('.generated/terraces/',browser),staged=new URL(matrixId+'.json',staging),published=new URL('terraces/'+matrixId+'.json',root);
const data=JSON.parse(await readFile(usedStaged?staged:published,'utf8'));if(usedStaged)await assertFreshTerraceGeneration(browser,matrixId,data._generation);
const heightfield=new Terraces(data),foliage=await json('foliage.json'),cells=new Map<string,Cell>(),lands=new Map<number,Land>(),templates=new Map<string,{p:THREE.Vector3[];normal:THREE.Vector3;material:string}[]>(),texture=new THREE.Texture();
for(const name of await readdir(new URL('maps/',root))){const map=await json('maps/'+name);if(map.matrix===matrixId)for(const c of map.cells)cells.set(c.x+','+c.z,c);}
let fallback=0,samples=0,maxDelta=0;
async function surface(x:number,z:number,owner:Cell){
 const cell=cells.get(Math.floor(x/32)+','+Math.floor(z/32))??owner;
 if(!lands.has(cell.land))lands.set(cell.land,await json('lands/'+cell.land+'.json'));
 const native=terrainHeight(lands.get(cell.land)!,cell,x,z,cell.altitude*.5);
 if(!templates.has(cell.asset)){
  const gltf=await new GLTFLoader().parseAsync(geometryGLB(await readFile(new URL(cell.asset,root))),'');
  gltf.scene.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const convert=(old:THREE.Material)=>{const m=originalMaterial(old as THREE.MeshStandardMaterial);if(old.userData.geometryAuditHasTexture)m.map=texture;const entry=foliage[cell.asset.match(/-(\d+)\.glb$/)![1]]?.[m.name];if(entry)m.userData.treeInfo=entry;return m;};o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);});
  repairOriginalAsset(gltf.scene,false);gltf.scene.updateMatrixWorld(true);const triangles:{p:THREE.Vector3[];normal:THREE.Vector3;material:string}[]=[];
  gltf.scene.traverseVisible(o=>{
   if(!(o instanceof THREE.Mesh)||o instanceof THREE.InstancedMesh)return;
   const g=o.geometry,p=g.getAttribute('position'),roots=g.getAttribute('sceneryRoot'),index=g.index,materials=Array.isArray(o.material)?o.material:[o.material];
   for(let i=0;i<(index?.count??p.count);i+=3){const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),slot=g.groups.find((v:{start:number;count:number;materialIndex?:number})=>i>=v.start&&i<v.start+v.count)?.materialIndex??0,m=materials[slot];if(roots?.getW(ids[0])||/flower|fence|saku|kage|shadow|shade|rock/i.test(m.name))continue;
    const points=ids.map(id=>o.getVertexPosition(id,new THREE.Vector3()).applyMatrix4(o.matrixWorld)),normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();if(Math.abs(normal.y)>.7)triangles.push({p:points,normal,material:m.name});
   }
  });templates.set(cell.asset,triangles);
 }
 const px=(x-cell.x*32-16)*16,pz=(z-cell.z*32-16)*16;let best:number|undefined;
 for(const {p:[a,b,c]}of templates.get(cell.asset)!){const den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(Math.abs(den)<1e-10)continue;const wa=((b.z-c.z)*(px-c.x)+(c.x-b.x)*(pz-c.z))/den,wb=((c.z-a.z)*(px-c.x)+(a.x-c.x)*(pz-c.z))/den,wc=1-wa-wb;if(Math.min(wa,wb,wc)<-1e-5)continue;const y=(a.y*wa+b.y*wb+c.y*wc)/16+cell.altitude*.5;if(best===undefined||Math.abs(y-native)<Math.abs(best-native))best=y;}
 samples++;if(best===undefined){fallback++;return native;}maxDelta=Math.max(maxDelta,Math.abs(best-native));return Math.round(best*4096)/4096;
}
function edgePoints(x:number,z:number,b:number){const[dx,dz]=({56:[1,0],57:[-1,0],58:[0,-1],59:[0,1]} as Record<number,number[]>)[b];return dx===1?[[x+1,z],[x+1,z+.5],[x+1,z+1]]:dx===-1?[[x,z+1],[x,z+.5],[x,z]]:dz===1?[[x+1,z+1],[x+.5,z+1],[x,z+1]]:[[x,z],[x+.5,z],[x+1,z]];}
async function profile(x:number,z:number,b:number){
 const cell=cells.get(Math.floor(x/32)+','+Math.floor(z/32));if(!cell)throw Error('Missing original ledge cell');const[dx,dz]=({56:[1,0],57:[-1,0],58:[0,-1],59:[0,1]} as Record<number,number[]>)[b],points=edgePoints(x,z,b);
 const sides:number[]=[];
 for(const side of [-1,1])for(let i=0;i<3;i++){const [px,pz]=points[i],towards=points[1],sx=px+dx*side*.00001+(towards[0]-px)*.00001,sz=pz+dz*side*.00001+(towards[1]-pz)*.00001;sides.push(await surface(sx,sz,cell));}return sides;
}
const nativeEdges:Record<string,number[]>={},nativeCornerEdges:Record<string,number[]>={},verified=new Set<string>(),artProof=new Map<string,unknown>();let minimumCornerDrop=Infinity;
for(const[x,z,b]of data.ledges)nativeEdges[x+','+z]=await profile(x,z,b);
for(const[x,z,b]of data.cornerEdges??[]){
 const direction=({56:[1,0],57:[-1,0],58:[0,-1],59:[0,1]} as Record<number,number[]>)[b];if(!direction)throw Error('Invalid corner direction');
 const beforeFallback=fallback;
 const floorProfile=nativeCornerEdges[x+','+z+','+b]=await profile(x,z,b);
 if(fallback!==beforeFallback)throw Error('Missing native visible-floor corner profile '+[x,z,b].join(','));
 const[dx,dz]=direction;
 for(const[index,[px,pz]]of edgePoints(x,z,b).entries()){const drop=floorProfile[index]+heightfield.sample(x,z,px,pz)-floorProfile[index+3]-heightfield.sample(x+dx,z+dz,px,pz);if(!Number.isFinite(drop)||drop<=.8)throw Error('Corner has no supported physical drop '+[x,z,b].join(','));minimumCornerDrop=Math.min(minimumCornerDrop,drop);}
 const key=x+','+z;
 const cell=cells.get(Math.floor(x/32)+','+Math.floor(z/32))!;
 const collisionFloor=terrainHeight(lands.get(cell.land)!,cell,x+.5,z+.5,cell.altitude*.5);
 assertNativeCornerFloor(floorProfile,collisionFloor);
 const edges=(data.cornerEdges as [number,number,number][]).filter(([xx,zz])=>xx===x&&zz===z);
 if(edges.length!==2||!edges.some(edge=>edge[2]<58)||!edges.some(edge=>edge[2]>=58))throw Error('Invalid corner sector '+key);
 const points=[[x+.5,z+.5],...edges.map(([, ,behavior])=>{const[ex,ez]=({56:[1,0],57:[-1,0],58:[0,-1],59:[0,1]} as Record<number,number[]>)[behavior];return[x+.5+ex*.5,z+.5+ez*.5];})];
 // Collision topology alone cannot authorize a new visual wall. Require
 // the literal native flat allpeak rim, one source pixel over this floor,
 // at the centre and both exterior edge midpoints. Unknown variants reject.
 const witnesses=points.map(([x,z])=>{const face=nativeCornerWitness(templates.get(cell.asset)!,cell,collisionFloor,x,z);if(!face)throw Error('Unproven native ledge corner '+key+' in '+cell.asset);return{point:[x,z],material:face.material,normalY:face.normal.y,triangle:face.p.map(p=>[p.x,p.y,p.z])};});
 artProof.set(key,{x,z,cell:{x:cell.x,z:cell.z,altitude:cell.altitude},asset:cell.asset,nativeFloor:collisionFloor,directions:edges.map(edge=>edge[2]),floorProfile,witnesses});
 verified.add(key);
}
if(usedStaged)await assertFreshTerraceGeneration(browser,matrixId,data._generation);delete data._generation;data.nativeEdges=nativeEdges;data.nativeCornerEdges=nativeCornerEdges;await mkdir(staging,{recursive:true});await writeFile(new URL(matrixId+'.corner-proof.json',staging),JSON.stringify([...artProof.values()],null,2)+'\n');const complete=new URL(matrixId+'.verified.json',staging);await writeFile(complete,JSON.stringify(data)+'\n');await rename(complete,published);if(usedStaged)await unlink(staged);
console.log(JSON.stringify({input:usedStaged?'verified-stage':'published',ledges:data.ledges.length,corners:verified.size,cornerEdges:Object.keys(nativeCornerEdges).length,minimumCornerDrop:verified.size?minimumCornerDrop:null,samples,nativeFallbackSamples:fallback,maxVisualCollisionDelta:maxDelta,assets:templates.size}));
