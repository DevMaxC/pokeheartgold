import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {readFile,writeFile} from 'node:fs/promises';
import {repairOriginalAsset,originalMaterial} from '../src/source/render-repair.ts';
const root=new URL('../public/source/',import.meta.url);
function geometryGLB(bytes:Buffer):ArrayBuffer{
  const jsonLength=bytes.readUInt32LE(12);const json=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
  delete json.images;delete json.textures;delete json.samplers;
  for(const material of json.materials||[]){material.extras={...material.extras,geometryAuditHasTexture:!!material.pbrMetallicRoughness?.baseColorTexture};delete material.pbrMetallicRoughness?.baseColorTexture;delete material.pbrMetallicRoughness?.metallicRoughnessTexture;delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;}
  let encoded=JSON.stringify(json);encoded+=' '.repeat((4-Buffer.byteLength(encoded)%4)%4);const jsonBuffer=Buffer.from(encoded);const rest=bytes.subarray(20+jsonLength);
  const result=Buffer.alloc(20+jsonBuffer.length+rest.length);bytes.copy(result,0,0,20);result.writeUInt32LE(result.length,8);result.writeUInt32LE(jsonBuffer.length,12);jsonBuffer.copy(result,20);rest.copy(result,20+jsonBuffer.length);return result.buffer.slice(result.byteOffset,result.byteOffset+result.byteLength) as ArrayBuffer;
}

const load=async(p:string)=>JSON.parse(await readFile(new URL(p,root),'utf8')),matrix=await load('matrices/0.json'),index=await load('index.json'),maps=new Map<number,any>(),templates=new Map<string,THREE.Group>(),loader=new GLTFLoader(),structures:any[]=[];
for(let i=0;i<matrix.models.length;i++){
 const cx=i%matrix.width,cz=Math.floor(i/matrix.width),owner=matrix.headers?.[i];if(matrix.models[i]===65535||!index.maps[owner])continue;
 if(!maps.has(owner))maps.set(owner,await load('maps/'+owner+'.json'));const cell=maps.get(owner).cells.find((c:any)=>c.x===cx&&c.z===cz);if(!cell)continue;
 for(const [n,prop]of cell.props.entries()){
  if(!prop.asset.startsWith('props/1-'))continue;
  if(!templates.has(prop.asset)){const gltf=await loader.parseAsync(geometryGLB(await readFile(new URL(prop.asset,root))),'');gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh)o.material=Array.isArray(o.material)?o.material.map(m=>originalMaterial(m as THREE.MeshStandardMaterial)):originalMaterial(o.material as THREE.MeshStandardMaterial);});repairOriginalAsset(gltf.scene,true);templates.set(prop.asset,gltf.scene);}
  const p=clone(templates.get(prop.asset)!);p.scale.set(prop.scale[0]/16,prop.scale[1]/16,prop.scale[2]/16);p.rotation.set(...prop.rotation.map((v:number)=>v*Math.PI/180));p.position.set(cx*32+16+prop.position[0],cell.altitude*.5+prop.position[1],cz*32+16+prop.position[2]);p.updateMatrixWorld(true);const b=new THREE.Box3();
  p.traverseVisible(o=>{if(!(o instanceof THREE.Mesh)||o instanceof THREE.InstancedMesh)return;const g=o.geometry,v=g.getAttribute('position'),idx=g.index,materials=Array.isArray(o.material)?o.material:[o.material];for(let j=0;j<(idx?.count??v.count);j++){const slot=g.groups.find(v=>j>=v.start&&j<v.start+v.count)?.materialIndex??0,m=materials[slot];if(m.opacity<.5||/tree|bush|flower|hana|grass|fence|saku|plant|kage|shadow/i.test(m.name))continue;b.expandByPoint(o.getVertexPosition(idx?idx.getX(j):j,new THREE.Vector3()).applyMatrix4(o.matrixWorld));}});
  const size=b.getSize(new THREE.Vector3());if(size.x<2||size.z<2||size.y<2)continue;
  // The outermost roof eave is not the foundation. Leave that narrow overhang,
  // then the height exporter adds a one-tile apron for shared corner samples.
  const bounds=[b.min.x+.4,b.min.z+.4,b.max.x-.4,b.max.z-.4].map(v=>Math.round(v*4096)/4096),anchor=[THREE.MathUtils.clamp(p.position.x,bounds[0],bounds[2]),THREE.MathUtils.clamp(p.position.z,bounds[1],bounds[3])];
  structures.push({key:cx+','+cz+':'+n,asset:prop.asset,bounds,anchor});
 }
}
await writeFile(new URL('terraces/foundations-0.json',root),JSON.stringify({version:1,structures})+'\n');console.log(JSON.stringify({structures:structures.length,assets:templates.size}));
