import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Terraces,type TerraceData} from './ledges.ts';
import {terraceModel,terraceWalls} from './terrace-model.ts';
import type {Cell,Land} from './types.ts';
const json=async(path:string)=>JSON.parse(await readFile(new URL('../../public/source/'+path,import.meta.url),'utf8'));
const data:TerraceData=await json('terraces/0.json'),terrain=new Terraces(data),directions:Record<number,[number,number]>={56:[1,0],57:[-1,0],58:[0,-1],59:[0,1]};
function geometryGLB(bytes:Buffer):ArrayBuffer{
 const length=bytes.readUInt32LE(12),j=JSON.parse(bytes.subarray(20,20+length).toString());delete j.images;delete j.textures;delete j.samplers;
 for(const m of j.materials??[]){delete m.pbrMetallicRoughness?.baseColorTexture;delete m.pbrMetallicRoughness?.metallicRoughnessTexture;delete m.normalTexture;delete m.occlusionTexture;delete m.emissiveTexture;}
 let encoded=JSON.stringify(j);encoded+=' '.repeat((4-Buffer.byteLength(encoded)%4)%4);const content=Buffer.from(encoded),rest=bytes.subarray(20+length),out=Buffer.alloc(20+content.length+rest.length);bytes.copy(out,0,0,20);out.writeUInt32LE(out.length,8);out.writeUInt32LE(content.length,12);content.copy(out,20);rest.copy(out,20+content.length);return out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength) as ArrayBuffer;
}
async function nativeRim(asset:string,pattern=/allpeak|^cliff\d/i){
 const gltf=await new GLTFLoader().parseAsync(geometryGLB(await readFile(new URL('../../public/source/'+asset,import.meta.url))),'');
 gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){const materials=Array.isArray(o.material)?o.material:[o.material];o.visible=materials.some(m=>pattern.test(m.name));for(const material of materials)material.side=THREE.DoubleSide;}});return gltf.scene;
}
function worldWall(cell:Cell,land:Land){const material=new THREE.MeshBasicMaterial(),wall=terraceWalls(terrain,cell,land,material)!;assert.ok(wall);wall.position.set(cell.x*32+16,cell.altitude*.5,cell.z*32+16);wall.updateMatrixWorld(true);return wall;}

test('the actual Route29 blocked rim remains on the upper terrace instead of sagging between the two cliff ends',async()=>{
 const source=await nativeRim('land/1-2.glb'),root=new THREE.Group();root.position.set(592,0,400);source.scale.setScalar(1/16);root.add(source);
 const originals:{geometry:THREE.BufferGeometry;position:number[];uv:number[];index:number[]|null}[]=[];
 source.traverseVisible(o=>{if(o instanceof THREE.Mesh)originals.push({geometry:o.geometry,position:Array.from(o.geometry.attributes.position.array),uv:Array.from(o.geometry.attributes.uv.array),index:o.geometry.index?Array.from(o.geometry.index.array):null});});
 await terraceModel(root,terrain);root.updateMatrixWorld(true);const rendered:THREE.Mesh[]=[];root.traverseVisible(o=>{if(o instanceof THREE.Mesh)rendered.push(o);});
 for(const[x,z]of[[603.25,396.25],[603.75,396.25],[603.25,396.75],[603.875,396.875]]){
  const hit=new THREE.Raycaster(new THREE.Vector3(x,5,z),new THREE.Vector3(0,-1,0)).intersectObjects(rendered)[0];assert.ok(hit);
  assert.ok(hit.point.y>2,`${x},${z}: original art must stay on the upper side`);assert.ok(Math.abs(hit.point.y-1.0625-terrain.height(x,z))<1e-6);
 }
 const oldEndpointUpper=[terrain.sample(603,395,604,396),terrain.sample(602,396,603,397)];assert.ok(oldEndpointUpper.every(value=>value>1),'Both incoming cliff tips must also stay raised');
 for(const item of originals){assert.deepEqual(Array.from(item.geometry.attributes.position.array),item.position);assert.deepEqual(Array.from(item.geometry.attributes.uv.array),item.uv);assert.deepEqual(item.geometry.index?Array.from(item.geometry.index.array):null,item.index);}
});

test('native Route29 convex corner has continuous opaque faces to both lower floors and one exact shared endpoint',async()=>{
 const cell={x:18,z:12,altitude:0} as Cell,land=await json('lands/1.json') as Land,wall=worldWall(cell,land);
 const rays=([[56,604,396],[59,603,397]] as const).flatMap(([b,x,z])=>[.125,.375,.625,.875].map(t=>({b,x:x+(b===59?t:0),z:z+(b===56?t:0)})));
 for(const{b,x,z}of rays){const[dx,dz]=directions[b],upper=1+terrain.sample(603,396,x,z),lower=1+terrain.sample(603+dx,396+dz,x,z),origin=new THREE.Vector3(x+dx*.25,1.5,z+dz*.25),direction=new THREE.Vector3(-dx,0,-dz);
  const hit=new THREE.Raycaster(origin,direction,0,.5).intersectObject(wall)[0];assert.ok(hit,`closed corner face ${b} ${x},${z}`);assert.equal(hit.point.x,x);assert.equal(hit.point.z,z);assert.ok(upper-lower>.9);
 }
 const position=wall.geometry.attributes.position,joint=[] as number[];for(let i=0;i<position.count;i++)if(position.getX(i)===12&&position.getZ(i)===-3)joint.push(position.getY(i));
 assert.equal(new Set(joint).size,2,'Both directions must store the identical upper/lower Float32 corner vertices');assert.ok(joint.length>=4);
 const material=wall.material as THREE.MeshBasicMaterial;assert.equal(material.side,THREE.DoubleSide);assert.equal(material.transparent,false);assert.equal(material.alphaTest,0);
});

test('actual emitted grass-floor boundaries share the exact stored cliff top and bottom vertices at the repaired turn',async()=>{
 const source=await nativeRim('land/1-2.glb',/^grass01(?:_|$)/),root=new THREE.Group();root.position.set(592,0,400);source.scale.setScalar(1/16);root.add(source);await terraceModel(root,terrain);root.updateMatrixWorld(true);
 const floorVertices:THREE.Vector3[]=[];root.traverseVisible(o=>{if(o instanceof THREE.Mesh){const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++)floorVertices.push(new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld));}});
 const wall=worldWall({x:18,z:12,altitude:0} as Cell,await json('lands/1.json')),p=wall.geometry.attributes.position,wallVertices:THREE.Vector3[]=[];for(let i=0;i<p.count;i++)wallVertices.push(new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(wall.matrixWorld));
 for(const b of[56,59]){const[dx,dz]=directions[b];for(const t of[0,.5,1]){const x=b===56?604:603+t,z=b===56?396+t:397;
  for(const y of[1+terrain.sample(603,396,x,z),1+terrain.sample(603+dx,396+dz,x,z)]){
   assert.ok(floorVertices.some(v=>v.x===x&&v.y===y&&v.z===z),`literal native floor vertex ${x},${y},${z}`);assert.ok(wallVertices.some(v=>v.x===x&&v.y===y&&v.z===z),`literal cliff vertex ${x},${y},${z}`);
  }
 }}
});

test('all added native corner sectors retain physical drops and closed emitted joints, including existing three-level turns',async()=>{
 assert.deepEqual(data.cornerEdges?.filter(([x,z])=>x===603&&z===396),[[603,396,56],[603,396,59]]);
 assert.equal(data.ledges.length,1453);assert.equal(data.cornerEdges?.length,96);assert.equal(Object.keys(data.nativeCornerEdges??{}).length,96);
 const byTile=new Map<string,[number,number,number][]>();for(const edge of data.cornerEdges!){const key=edge[0]+','+edge[1],rows=byTile.get(key)??[];rows.push(edge);byTile.set(key,rows);}
 const matrix=await json('matrices/0.json'),walls=new Map<string,THREE.Mesh>();
 const wallAt=(x:number,z:number)=>{const key=x+','+z;let wall=walls.get(key);if(!wall){wall=worldWall({x,z,altitude:matrix.altitudes[z*matrix.width+x]} as Cell,{permissions:[],plates:[]} as Land);walls.set(key,wall);}return wall;};
 for(const[key,edges]of byTile){assert.equal(edges.length,2);const[x,z]=key.split(',').map(Number),horizontal=edges.find(edge=>directions[edge[2]][0])!,vertical=edges.find(edge=>directions[edge[2]][1])!,dx=directions[horizontal[2]][0],dz=directions[vertical[2]][1],cx=x+(dx===1?1:0),cz=z+(dz===1?1:0);
  const upper=terrain.sample(x,z,cx,cz),lowerX=terrain.sample(x+dx,z,cx,cz),lowerZ=terrain.sample(x,z+dz,cx,cz);assert.ok(upper>Math.max(lowerX,lowerZ),key+' physical corner');
  for(const[ex,ez,b]of edges){const[ax,az]=directions[b],px=ex+.5+ax*.5,pz=ez+.5+az*.5;assert.ok(terrain.sample(ex,ez,px,pz)-terrain.sample(ex+ax,ez+az,px,pz)>.8,key+' edge '+b);const profile=data.nativeCornerEdges![ex+','+ez+','+b];assert.equal(profile.length,6);assert.ok(profile.every(Number.isFinite));}
  // A stair-shaped turn has two different lower sectors. The original third
  // wall must meet the two new faces; forcing those floors equal would destroy
  // a real level. Check literal emitted Float32 vertical intervals instead.
  const intervals:[number,number][]=[];
  for(const cellX of new Set([Math.floor((cx-1)/32),Math.floor(cx/32)]))for(const cellZ of new Set([Math.floor((cz-1)/32),Math.floor(cz/32)])){
   const wall=wallAt(cellX,cellZ),p=wall.geometry.attributes.position;
   for(let i=0;i<p.count;i+=3){const ys:number[]=[];for(let j=0;j<3;j++){const v=new THREE.Vector3().fromBufferAttribute(p,i+j).applyMatrix4(wall.matrixWorld);if(v.x===cx&&v.z===cz)ys.push(v.y);}if(ys.length===2&&ys[0]!==ys[1])intervals.push([Math.min(...ys),Math.max(...ys)]);}
  }
  const levels=[...new Set(intervals.flat())].sort((a,b)=>a-b);assert.ok(levels.length>=2,key);
  for(let i=1;i<levels.length;i++){const mid=(levels[i-1]+levels[i])/2;assert.equal(intervals.filter(([a,b])=>a<mid&&mid<b).length,2,key+' sealed interval '+levels[i-1]+'..'+levels[i]);}
 }
});

test('corner wall emission handles every orientation and cell-border endpoint and refuses missing source profiles',()=>{
 const land={permissions:[],plates:[{bounds:[-16,-16,16,16],normal:[0,1,0],constant:-1}]} as Land,cell={x:0,z:0,altitude:0} as Cell;
 for(const horizontal of[56,57])for(const vertical of[58,59])for(const tile of[15,31]){
  const values=new Int16Array(32*32*9);for(let i=0;i<9;i++)values[(tile*32+tile)*9+i]=256;const corners:[number,number,number][]=[[tile,tile,horizontal],[tile,tile,vertical]],profiles=Object.fromEntries(corners.map(row=>[row.join(','),Array(6).fill(1)]));
  const fixture=new Terraces({version:2,scale:256,cells:{'0,0':Buffer.from(values.buffer).toString('base64')},ledges:[],cornerEdges:corners,nativeCornerEdges:profiles,cliffAssets:{}}),wall=terraceWalls(fixture,cell,land,new THREE.MeshBasicMaterial())!;assert.ok(wall);assert.equal(wall.geometry.attributes.position.count,24);assert.equal(fixture.ledgeCells.has('0,0'),true);
  const[dx]=directions[horizontal],[,dz]=directions[vertical],x=tile+(dx===1?1:0),z=tile+(dz===1?1:0),p=wall.geometry.attributes.position,joint:number[]=[];for(let i=0;i<p.count;i++)if(p.getX(i)===x-16&&p.getZ(i)===z-16)joint.push(p.getY(i));assert.deepEqual([...new Set(joint)].sort(),[1,2]);
  delete profiles[corners[0].join(',')];assert.throws(()=>terraceWalls(fixture,cell,land,new THREE.MeshBasicMaterial()),/Missing native ledge corner profile/);
 }
});

test('an invalid corner profile rejects its own cell without preventing unrelated native ledge cells from loading',()=>{
 const invalid=new Terraces({...data,nativeCornerEdges:{...data.nativeCornerEdges}});delete invalid.data.nativeCornerEdges!['603,396,56'];
 const material=new THREE.MeshBasicMaterial(),land={permissions:[],plates:[]} as Land;
 assert.throws(()=>terraceWalls(invalid,{x:18,z:12,altitude:0} as Cell,land,material),/Missing native ledge corner profile 603,396,56/);
 const other=data.ledges.find(([x,z])=>Math.floor(x/32)!==18||Math.floor(z/32)!==12)!;
 assert.ok(terraceWalls(invalid,{x:Math.floor(other[0]/32),z:Math.floor(other[1]/32),altitude:0} as Cell,land,material));
});
