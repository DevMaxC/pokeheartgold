import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {originalMaterial,repairOriginalAsset} from './render-repair.ts';
import {shorelineUnderlay} from './shoreline.ts';
import {terraceModel} from './terrace-model.ts';
import {Terraces} from './ledges.ts';
import type {Cell,Land} from './types.ts';

const source=new URL('../../public/source/',import.meta.url);
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
function glb(bytes:Buffer){const length=bytes.readUInt32LE(12);return{json:JSON.parse(bytes.subarray(20,20+length).toString()),tail:bytes.subarray(20+length)};}
function encode(document:any,tail:Buffer){let raw=Buffer.from(JSON.stringify(document));raw=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,32)]);const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(20+raw.length+tail.length,8);header.writeUInt32LE(raw.length,12);header.writeUInt32LE(0x4e4f534a,16);const result=Buffer.concat([header,raw,tail]);return result.buffer.slice(result.byteOffset,result.byteOffset+result.byteLength) as ArrayBuffer;}
function rgba(bytes:Buffer){
 let width=0,height=0;const parts:Buffer[]=[];
 for(let at=8;at<bytes.length;){const n=bytes.readUInt32BE(at),type=bytes.toString('ascii',at+4,at+8),data=bytes.subarray(at+8,at+8+n);at+=n+12;if(type==='IHDR'){width=data.readUInt32BE();height=data.readUInt32BE(4);assert.equal(data[8],8);assert.equal(data[9],6);assert.equal(data[12],0);}if(type==='IDAT')parts.push(data);}
 const raw=inflateSync(Buffer.concat(parts)),data=new Uint8Array(width*height*4);let at=0;const stride=width*4;
 const paeth=(a:number,b:number,c:number)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++){const filter=raw[at++];assert.ok(filter<=4);for(let x=0;x<stride;x++){const l=x>=4?data[y*stride+x-4]:0,u=y?data[(y-1)*stride+x]:0,c=y&&x>=4?data[(y-1)*stride+x-4]:0;data[y*stride+x]=(raw[at++]+[0,l,u,Math.floor((l+u)/2),paeth(l,u,c)][filter])&255;}}
 return{width,height,data};
}
/** Use the installed real loader/extension; only image decoding is replaced
 * by an offline RGBA loader. Its untransformed texture is retained as a control. */
async function load(bytes:Buffer,corrected=true){
 const {json,tail}=glb(bytes);if(!corrected){for(const material of json.materials??[]){const texture=material.pbrMetallicRoughness?.baseColorTexture;if(texture?.extensions)delete texture.extensions.KHR_texture_transform;}}
 const originalTextures=new Map<number,THREE.DataTexture>();const loader=new GLTFLoader();
 loader.register(()=>({name:'offlineNativePNG',loadTexture(index:number){const definition=json.textures[index],image=json.images[definition.source],pixels=rgba(Buffer.from(image.uri.split(',')[1],'base64')),texture=new THREE.DataTexture(pixels.data,pixels.width,pixels.height);texture.flipY=false;const sampler=json.samplers?.[definition.sampler]??{};texture.wrapS=sampler.wrapS===33071?THREE.ClampToEdgeWrapping:sampler.wrapS===33648?THREE.MirroredRepeatWrapping:THREE.RepeatWrapping;texture.wrapT=sampler.wrapT===33071?THREE.ClampToEdgeWrapping:sampler.wrapT===33648?THREE.MirroredRepeatWrapping:THREE.RepeatWrapping;texture.magFilter=texture.minFilter=THREE.NearestFilter;originalTextures.set(index,texture);return Promise.resolve(texture);}}));
 const result=await loader.parseAsync(encode(json,tail),'');result.scene.traverse(o=>{if(o instanceof THREE.Mesh)o.material=(Array.isArray(o.material)?o.material.map(m=>originalMaterial(m)):originalMaterial(o.material));});
 return{root:result.scene,originalTextures,json};
}
function pixel(material:THREE.MeshBasicMaterial,uv:THREE.Vector2){const map=material.map!;map.updateMatrix();const addressed=map.transformUv(uv.clone()),image=map.image as {width:number;height:number;data:Uint8Array},x=Math.min(image.width-1,Math.floor(addressed.x*image.width)),y=Math.min(image.height-1,Math.floor(addressed.y*image.height));return Array.from(image.data.subarray((y*image.width+x)*4,(y*image.width+x)*4+4));}
function place(root:THREE.Group){const cell=new THREE.Group();cell.position.set(528,0,400);root.scale.setScalar(1/16);cell.add(root);cell.updateWorldMatrix(true,true);cell.updateMatrixWorld(true);return cell;}
function hits(root:THREE.Object3D,x:number,z:number){root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);return new THREE.Raycaster(new THREE.Vector3(x,20,z),new THREE.Vector3(0,-1,0)).intersectObject(root,true).filter(hit=>{let visible=true;for(let o:THREE.Object3D|null=hit.object;o;o=o.parent)visible&&=o.visible;return visible;}).map(hit=>{const mesh=hit.object as THREE.Mesh,material=(Array.isArray(mesh.material)?mesh.material[hit.face!.materialIndex]:mesh.material) as THREE.MeshBasicMaterial;const color=material.map?pixel(material,hit.uv!):[255,255,255,255];return{hit,material,color};}).filter(row=>row.material.alphaTest===0||row.color[3]/255>=row.material.alphaTest);}

const islandBytes=await readFile(new URL('land/4-2.glb',source));
test('native island surf uses the omitted Maya translation, with unchanged geometry and ocean heights',async()=>{
 const before=place((await load(islandBytes,false)).root),after=place((await load(islandBytes)).root);
 const upperBefore=hits(before,524.95,406.6)[0],upperAfter=hits(after,524.95,406.6)[0];
 assert.equal(upperBefore.material.name,'swave_p');assert.deepEqual(upperBefore.color,[49,140,255,255]);
 assert.equal(upperAfter.material.name,'swave_un');assert.deepEqual(upperAfter.color,[231,231,198,255]);
 for(const [x,z]of [[524.15,406.6],[530.85,407.4],[528.6,408.85]]){const sea=hits(after,x,z)[0];assert.equal(sea.material.name,'swave_p');assert.deepEqual(sea.color,[33,115,255,255]);assert.ok(Math.abs(sea.hit.point.y-.584375)<1e-10);}
 const oceanBefore=hits(before,532.3,407.4),oceanAfter=hits(after,532.3,407.4);assert.deepEqual(oceanAfter.map(r=>[r.material.name,r.hit.point.y,r.color]),oceanBefore.map(r=>[r.material.name,r.hit.point.y,r.color]));
 for(const key of ['position','normal','uv','color']){const a:unknown[]=[],b:unknown[]=[];before.traverse(o=>{if(o instanceof THREE.Mesh)a.push(o.geometry.getAttribute(key)?.array);});after.traverse(o=>{if(o instanceof THREE.Mesh)b.push(o.geometry.getAttribute(key)?.array);});assert.deepEqual(b,a);}
});

test('real GLTFLoader clones only the surf transform and originalMaterial keeps native repeat/alpha/flipY',async()=>{
 const {root,originalTextures,json}=await load(islandBytes);let surf:THREE.MeshBasicMaterial|undefined;
 root.traverse(o=>{if(o instanceof THREE.Mesh)for(const material of Array.isArray(o.material)?o.material:[o.material])if(material.name==='swave_p')surf=material;});assert.ok(surf);
 const definition=json.materials.find((m:any)=>m.name==='swave_p').pbrMetallicRoughness.baseColorTexture,original=originalTextures.get(definition.index)!;assert.notEqual(surf.map,original);assert.equal(surf.map!.source,original.source);assert.deepEqual(original.offset.toArray(),[0,0]);assert.deepEqual(surf.map!.offset.toArray(),[0,2458/4096]);assert.equal(surf.map!.flipY,false);assert.equal(surf.map!.wrapS,THREE.RepeatWrapping);assert.equal(surf.map!.wrapT,THREE.RepeatWrapping);assert.equal(surf.transparent,false);assert.equal(surf.alphaTest,.5);assert.equal(surf.depthWrite,true);
 const reference=surf.map!;const originalUV=new THREE.Vector2(-1.2,-.961328125);assert.equal(pixel(surf,originalUV)[3],0);assert.deepEqual(surf.map!.offset.toArray(),[0,2458/4096]);assert.equal(surf.map,reference);
});

test('all 27 native surf asset variants carry their exact source translation',async()=>{
 const report=JSON.parse(await readFile(new URL('../../reviews/shoreline-native-translation/asset-correction.json',import.meta.url),'utf8'));assert.equal(report.assets.length,27);
 for(const record of report.assets){const bytes=await readFile(new URL('../../../'+record.asset,import.meta.url));assert.equal(digest(bytes),record.afterSHA256);const {root,json,originalTextures}=await load(bytes);const surf=json.materials.find((m:any)=>m.name==='swave_p');assert.deepEqual(surf.pbrMetallicRoughness.baseColorTexture.extensions.KHR_texture_transform,{offset:[0,2458/4096]});assert.deepEqual(record.native.swave_p.translationFx32,[0,2458]);let count=0;root.traverse(o=>{if(o instanceof THREE.Mesh)for(const material of Array.isArray(o.material)?o.material:[o.material]){const m=material as THREE.MeshBasicMaterial;if(m.name==='swave_p'){assert.deepEqual(m.map!.offset.toArray(),[0,2458/4096]);count++;}else if(m.map){assert.deepEqual(m.map.offset.toArray(),[0,0]);assert.ok([...originalTextures.values()].some(t=>t===m.map));}}});assert.ok(count>0,record.asset);}
});

test('actual native island backing stays below the corrected shoreline at 560 finite samples',async()=>{
 const {root}=await load(islandBytes);repairOriginalAsset(root,false);const group=place(root),land=JSON.parse(await readFile(new URL('lands/4.json',source),'utf8')) as Land,cell={x:16,z:12,altitude:0,land:4,asset:'land/4-2.glb',props:[]} as Cell;
 let beach:THREE.MeshBasicMaterial|undefined;root.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.name==='beach01')beach=m;});assert.ok(beach);
 const backing=shorelineUnderlay(land,cell,beach)!;assert.ok(backing);group.add(backing);const terraces=new Terraces(JSON.parse(await readFile(new URL('terraces/0.json',source),'utf8')));assert.equal(await terraceModel(group,terraces),true);const backingMeshes=group.children.filter(o=>o instanceof THREE.Mesh&&o.name==='source-terrace-surface'&&(o as THREE.Mesh).material===backing.material);assert.equal(backingMeshes.length,1);const activeBacking=backingMeshes[0];let sampled=0,occlusions=0;
 for(let z=404.125;z<409;z+=.25)for(let x=524.125;x<531;x+=.25){const rows=hits(group,x,z);sampled++;if(rows[0]?.hit.object===activeBacking)occlusions++;}
 assert.equal(sampled,560);assert.equal(occlusions,0);
 const observed=[];
 for(const[x,z]of [[524.95,406.6],[524.15,406.6],[530.85,407.4],[528.6,408.85],[524.4,404.6],[530.4,405.6],[530.4,408.6],[524.4,408.6],[527.4,407.4],[532.3,407.4]]){activeBacking.visible=false;const native=hits(group,x,z)[0];activeBacking.visible=true;const corrected=hits(group,x,z)[0];assert.equal(corrected.material.name,native.material.name);assert.deepEqual(corrected.color,native.color);assert.equal(corrected.hit.point.y,native.hit.point.y);observed.push({point:[x,z],material:native.material.name,rgba:native.color,y:native.hit.point.y});}
 const receipt={scope:'Actual originalMaterial/repairOriginalAsset/shorelineUnderlay/terraceModel pipeline; 560 finite native island ray/nearest-PNG samples plus 10 explicit witnesses; no browser/continuous visibility claim',legacyBackingOcclusions:occlusions,nativeSamples:observed};
 console.log('native island backing adjudication '+JSON.stringify(receipt));
});
