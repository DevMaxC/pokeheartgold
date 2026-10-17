import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {OpeningTitleCamera,loadOpeningTitleAssets} from './opening-stage.ts';
const assets=new URL('../../public/source/opening/',import.meta.url),repo=new URL('../../../',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('assets.json',assets),'utf8'));
test('all displayed native portraits, shrink frames and demonstration resources retain exact source hashes and literal cell/animation structure',async()=>{
 for(const source of manifest.sources){const bytes=await readFile(new URL(source.path,repo));assert.equal(createHash('sha256').update(bytes).digest('hex'),source.sha256,source.path);}
 for(const key of['oak','boy','girl',...['boy','girl'].flatMap(g=>[1,2,3,4].map(i=>`${g}-shrink-${i}`))]){const entry=manifest.backgrounds[key],bytes=await readFile(new URL(entry.image,assets));assert.equal(bytes.toString('hex',0,8),'89504e470d0a1a0a');assert.equal(bytes.readUInt32BE(16),256);assert.equal(bytes.readUInt32BE(20),192);assert.equal(entry.tilemap,9);assert.ok(entry.opaqueBounds[3]>entry.opaqueBounds[1]);}
 assert.deepEqual(manifest.demo.cells.map((c:{bounds:number[]})=>[c.bounds[2]-c.bounds[0]+1,c.bounds[3]-c.bounds[1]+1]),[[48,48],[80,80],[16,16]]);assert.deepEqual(manifest.demo.sequences.map((s:{frames:unknown[]})=>s.frames.length),[1,24,2,1]);assert.deepEqual(manifest.demo.sourceSpritePosition,[160,80]);assert.equal(manifest.demo.sequences[1].frames[0].scale[0],205/4096);for(const s of manifest.demo.sequences)for(const f of s.frames)assert.ok(f.duration>0&&f.cell>=0&&f.cell<3);
});
test('native Marill and Ho-Oh WAVs preserve the original PCM sample bytes, rates and lengths',async()=>{
 for(const species of['183','250']){const entry=manifest.cries[species],b=await readFile(new URL(`cry-${species}.wav`,assets));assert.equal(b.toString('ascii',0,4),'RIFF');assert.equal(b.toString('ascii',8,12),'WAVE');assert.equal(b.readUInt16LE(22),1);assert.equal(b.readUInt32LE(24),10512);assert.equal(b.readUInt16LE(34),8);assert.equal(b.readUInt32LE(40),entry.frames);const native=Buffer.from(Array.from(b.subarray(44),v=>(v+128)&255));assert.equal(createHash('sha256').update(native).digest('hex'),entry.signedPCMSourceSHA256);}
});
function withoutImages(bytes:Buffer){const n=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+n).toString());delete json.images;delete json.textures;delete json.samplers;for(const m of json.materials||[])delete m.pbrMetallicRoughness?.baseColorTexture;let encoded=JSON.stringify(json);encoded+=' '.repeat((4-Buffer.byteLength(encoded)%4)%4);const b=Buffer.from(encoded),out=Buffer.concat([bytes.subarray(0,20),b,bytes.subarray(20+n)]);out.writeUInt32LE(out.length,8);out.writeUInt32LE(b.length,12);return out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength)as ArrayBuffer;}
test('the original Ho-Oh model has playable native joint tracks rather than invalid material-animation node targets',async()=>{
 const bytes=await readFile(new URL('ho-oh.glb',assets)),json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());assert.equal(json.animations.length,1);assert.equal(json.animations[0].channels.length,57);assert.ok(json.animations[0].channels.every((c:{target:{node?:number}})=>Number.isInteger(c.target.node)));assert.ok(json.images.every((i:{uri:string})=>i.uri.startsWith('data:image/png;base64,')));
 const gltf=await new GLTFLoader().parseAsync(withoutImages(bytes),'');assert.equal(gltf.animations.length,1);const mixer=new THREE.AnimationMixer(gltf.scene);mixer.clipAction(gltf.animations[0]).play();for(const time of[0,1,3,5.9]){mixer.setTime(time);gltf.scene.updateMatrixWorld(true);gltf.scene.traverse(o=>assert.ok(o.matrixWorld.elements.every(Number.isFinite)));}assert.ok(manifest.title.unsupported.includes('NSBMA palette animation28'));
});
test('title camera uses native world-unit placement and scripted movements, independent of huge background-cloud mesh bounds',()=>{
 const view=new OpeningTitleCamera();assert.deepEqual(view.camera.position.toArray(),[625,152,256]);view.update(10,16/9);assert.deepEqual(view.camera.position.toArray(),[625,152,256]);view.update(1/30,16/9);assert.deepEqual(view.camera.position.toArray(),[620,157,261]);assert.equal(view.camera.near,.5);assert.equal(view.camera.far,900);assert.equal(view.camera.aspect,16/9);assert.ok(view.camera.projectionMatrix.elements.every(Number.isFinite));
});
test('a failed optional title request disposes the other completed resource, including duplicated native maps exactly once',async()=>{
 const scene=new THREE.Group(),map=new THREE.Texture(),material=new THREE.MeshBasicMaterial({map}),geometry=new THREE.BoxGeometry();scene.add(new THREE.Mesh(geometry,material),new THREE.Mesh(geometry,material));const disposed={map:0,material:0,geometry:0,background:0};map.addEventListener('dispose',()=>disposed.map++);material.addEventListener('dispose',()=>disposed.material++);geometry.addEventListener('dispose',()=>disposed.geometry++);
 await assert.rejects(loadOpeningTitleAssets(async()=>({scene}as GLTF),async()=>{throw Error('missing native background');}),/missing native background/);assert.deepEqual(disposed,{map:1,material:1,geometry:1,background:0});
 const background=new THREE.Texture();background.addEventListener('dispose',()=>disposed.background++);await assert.rejects(loadOpeningTitleAssets(async()=>{throw Error('missing title model');},async()=>background),/missing title model/);assert.equal(disposed.background,1);
});
