import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {closeBuildingBack,originalMaterial,repairOriginalAsset} from './render-repair.ts';
import {closeHouseBuildingShell,HOUSE_BUILDING_MODELS} from './house-building-shells.ts';
const root=new URL('../../public/source/props/',import.meta.url);
function geometryGLB(bytes:Buffer):ArrayBuffer{const jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonLength).toString());delete json.images;delete json.textures;delete json.samplers;for(const m of json.materials||[])delete m.pbrMetallicRoughness?.baseColorTexture;let encoded=JSON.stringify(json);encoded+=' '.repeat((4-Buffer.byteLength(encoded)%4)%4);const b=Buffer.from(encoded),out=Buffer.alloc(20+b.length+bytes.length-20-jsonLength);bytes.copy(out,0,0,20);out.writeUInt32LE(out.length,8);out.writeUInt32LE(b.length,12);b.copy(out,20);bytes.copy(out,20+b.length,20+jsonLength);return out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength)as ArrayBuffer;}
function sourceTextures(bytes:Buffer){
 const n=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+n).toString()),textures=new Map<string,THREE.Texture>();
 for(const material of json.materials??[]){const ti=material.pbrMetallicRoughness?.baseColorTexture?.index;if(ti===undefined)continue;const definition=json.textures[ti],imageDefinition=json.images[definition.source],view=json.bufferViews?.[imageDefinition.bufferView],image=imageDefinition.uri?Buffer.from(imageDefinition.uri.split(',')[1],'base64'):bytes.subarray(28+n+(view.byteOffset??0),28+n+(view.byteOffset??0)+view.byteLength),chunks:Buffer[]=[];let width=0,height=0;
  for(let at=8;at<image.length;){const length=image.readUInt32BE(at),type=image.toString('ascii',at+4,at+8),data=image.subarray(at+8,at+8+length);at+=length+12;if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);assert.equal(data[8],8);assert.equal(data[9],6);assert.equal(data[12],0);}else if(type==='IDAT')chunks.push(data);}
  const raw=inflateSync(Buffer.concat(chunks)),stride=width*4,pixels=new Uint8Array(stride*height);let offset=0;const paeth=(a:number,b:number,c:number)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<height;y++){const filter=raw[offset++];assert.ok(filter<=4);for(let x=0;x<stride;x++){const left=x>=4?pixels[y*stride+x-4]:0,up=y?pixels[(y-1)*stride+x]:0,corner=y&&x>=4?pixels[(y-1)*stride+x-4]:0;pixels[y*stride+x]=(raw[offset++]+[0,left,up,Math.floor((left+up)/2),paeth(left,up,corner)][filter])&255;}}
  const map=new THREE.DataTexture(pixels,width,height),sampler=json.samplers?.[definition.sampler]??{},wrap=(n:number)=>n===33071?THREE.ClampToEdgeWrapping:n===33648?THREE.MirroredRepeatWrapping:THREE.RepeatWrapping;map.flipY=false;map.wrapS=wrap(sampler.wrapS);map.wrapT=wrap(sampler.wrapT);map.colorSpace=THREE.SRGBColorSpace;textures.set(material.name,map);
 }return textures;
}
async function house(file:string){const bytes=await readFile(new URL(file,root)),maps=sourceTextures(bytes),g=await new GLTFLoader().parseAsync(geometryGLB(bytes),'');g.scene.traverse(o=>{if(o instanceof THREE.Mesh){const convert=(m:THREE.Material)=>{const x=originalMaterial(m as THREE.MeshStandardMaterial);x.map=maps.get(m.name)??new THREE.Texture();return x;};o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);}});repairOriginalAsset(g.scene,true);return g.scene;}
function firstPaintedHit(ray:THREE.Raycaster,objects:THREE.Mesh[]){return ray.intersectObjects(objects,false).find(hit=>{const mesh=hit.object as THREE.Mesh,m=(Array.isArray(mesh.material)?mesh.material[hit.face?.materialIndex??0]:mesh.material)as THREE.MeshBasicMaterial;if(m.opacity<.5||/kage|shadow/i.test(m.name))return false;const threshold=m.alphaTest>0?m.alphaTest:m.transparent ? .5 : 0,map=m.map,image=map?.image as {data?:Uint8Array;width:number;height:number}|undefined;if(!threshold||!image?.data||!hit.uv)return true;const uv=hit.uv.clone();map!.transformUv(uv);if(map!.wrapS===THREE.RepeatWrapping&&uv.x===1)uv.x=0;if(map!.wrapT===THREE.RepeatWrapping&&uv.y===1)uv.y=0;const x=THREE.MathUtils.clamp(Math.floor(uv.x*image.width),0,image.width-1),y=THREE.MathUtils.clamp(Math.floor(uv.y*image.height),0,image.height-1);return image.data[(y*image.width+x)*4+3]/255*m.opacity>=threshold;});}
function nativeBounds(root:THREE.Object3D){const box=new THREE.Box3();root.updateMatrixWorld(true);root.traverse(o=>{if(!(o instanceof THREE.Mesh)||o.name.startsWith('3d-'))return;const materials=Array.isArray(o.material)?o.material:[o.material];if(materials.every(m=>m.opacity<.5||/kage|shadow/.test(m.name)))return;const p=o.geometry.getAttribute('position'),i=o.geometry.index;for(let k=0;k<(i?.count??p.count);k++)box.expandByPoint(o.getVertexPosition(i?i.getX(k):k,new THREE.Vector3()).applyMatrix4(o.matrixWorld));});return box;}
function meshes(root:THREE.Object3D){const out:THREE.Mesh[]=[];root.traverseVisible(o=>{if(o instanceof THREE.Mesh)out.push(o);});return out;}
test('every exported ordinary house variant has opaque continuous rear and side cladding under its source roof',async t=>{
 const files=(await readdir(root)).filter(f=>/^1-\d+-\d+\.glb$/.test(f)&&HOUSE_BUILDING_MODELS.has(Number(f.split('-')[1])));let repaired=0;const declined:string[]=[];
 for(const file of files){const scene=await house(file),before=new THREE.Box3().setFromObject(scene),door={x:0,z:nativeBounds(scene).max.z+1},originalMeshes=meshes(scene).filter(o=>!o.name.startsWith('3d-')),originalGeometry=originalMeshes.map(o=>o.geometry);closeBuildingBack(scene,[door]);const summary=closeHouseBuildingShell(scene,'props/'+file,[door]);if(!summary){declined.push(file);continue;}repaired++;
  const body=new THREE.Box3(new THREE.Vector3().fromArray(summary.body.min),new THREE.Vector3().fromArray(summary.body.max)),center=body.getCenter(new THREE.Vector3()),castMeshes=meshes(scene);scene.updateMatrixWorld(true);
  for(const height of [.1,.35,.6])for(const along of [.1,.3,.5,.7,.9]){const y=body.min.y+(body.max.y-body.min.y)*height,x=THREE.MathUtils.lerp(body.min.x,body.max.x,along),z=THREE.MathUtils.lerp(body.min.z,body.max.z,along);
   for(const [origin,direction,name]of [[new THREE.Vector3(x,y,center.z),new THREE.Vector3(0,0,-1),'rear'],[new THREE.Vector3(center.x,y,z),new THREE.Vector3(-1,0,0),'left'],[new THREE.Vector3(center.x,y,z),new THREE.Vector3(1,0,0),'right']]as const){const roofHit=new THREE.Raycaster(new THREE.Vector3(origin.x,before.max.y+1,origin.z),new THREE.Vector3(0,-1,0)).intersectObjects(originalMeshes,false).find(h=>h.point.y>body.min.y+2);if(roofHit)origin.y=Math.min(origin.y,roofHit.point.y-.2);const hits=new THREE.Raycaster(origin,direction).intersectObjects(castMeshes,false);assert.ok(hits.length,`${file} ${name} y=${y} along=${along}`);}
  }
  const after=new THREE.Box3().setFromObject(scene);assert.ok(after.min.x>=before.min.x-.1&&after.max.x<=before.max.x+.1,`${file}: width footprint`);assert.ok(after.min.z>=before.min.z-.1&&after.max.z<=before.max.z+.1,`${file}: depth footprint`);
  originalMeshes.forEach((o,i)=>{assert.equal(o.geometry,originalGeometry[i]);assert.equal(o.visible,true,`${file}: source front and details stay visible`);});
  scene.getObjectByName('house-closed-exterior')!.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const m=o.material as THREE.MeshBasicMaterial;const sourceMaterial=originalMeshes.flatMap(m=>Array.isArray(m.material)?m.material:[m.material]).find(source=>source.name===m.name)as THREE.MeshBasicMaterial;assert.ok(sourceMaterial,`${file}: source material name`);assert.equal(m.map,sourceMaterial.map,`${file}: exact source atlas`);assert.equal(m.transparent,false);assert.equal(m.alphaTest,0);assert.equal(m.opacity,1);for(const n of ['position','uv','normal'])assert.ok(Array.from(o.geometry.getAttribute(n).array).every(Number.isFinite),`${file}: ${n}`);});assert.equal(closeHouseBuildingShell(scene,'props/'+file,[door]),summary,'idempotent');
 }
 t.diagnostic(`Rebuilt ${repaired}/${files.length} ordinary house texture variants. Declined: ${declined.join(', ')}`);assert.equal(repaired,files.length);assert.equal(repaired,45);
});
test('the actual Cherrygrove rear uses side-wall cladding and cannot reflect the recessed front door',async()=>{const scene=await house('1-37-0.glb'),door={x:-8,z:18};closeBuildingBack(scene,[door]);const summary=closeHouseBuildingShell(scene,'props/1-37-0.glb',[door]);assert.ok(summary);scene.updateMatrixWorld(true);for(const y of [3,12,25,37,45,53]){const hit=new THREE.Raycaster(new THREE.Vector3(0,y,-100),new THREE.Vector3(0,0,1)).intersectObjects(meshes(scene),false)[0];assert.ok(hit);assert.ok(hit.point.z<0);assert.ok(hit.object.name.startsWith('house-')||hit.point.z<-19.5,`original door must remain hidden from behind at ${y}`);}assert.ok(meshes(scene).some(m=>m.name==='house-rear-roof-fascia'));});
test('a coplanar native interior door backplate cannot show through NBC rear siding',async()=>{for(const file of ['1-292-16.glb','1-292-95.glb']){const scene=await house(file);assert.ok(closeHouseBuildingShell(scene,'props/'+file,[]));scene.updateMatrixWorld(true);for(const y of [8,20,30]){const hit=firstPaintedHit(new THREE.Raycaster(new THREE.Vector3(-8,y,-100),new THREE.Vector3(0,0,1)),meshes(scene));assert.ok(hit);assert.equal(hit.object.name,'house-rear-cladding',`${file}: continuous siding must be in front of the dark interior card`);}}});
test('house reconstruction ignores bank-zero furniture, unrelated props and opposite passages',async()=>{for(const [asset,doors]of [['props/0-37-0.glb',[{x:0,z:30}]],['props/1-40-0.glb',[{x:0,z:30}]],['props/1-37-0.glb',[{x:0,z:30},{x:0,z:-21}]]]as const){const scene=await house('1-37-0.glb');assert.equal(closeHouseBuildingShell(scene,asset,[...doors]),null);assert.equal(scene.getObjectByName('house-closed-exterior'),undefined);}});
test('a rotated, translated and scaled placement closes in source space without moving its original front',async()=>{const scene=await house('1-37-0.glb'),parent=new THREE.Group();parent.position.set(100,5,-30);scene.rotation.y=.7;scene.scale.setScalar(1/16);parent.add(scene);parent.updateMatrixWorld(true);const door=scene.localToWorld(new THREE.Vector3(-8,0,18));assert.ok(closeHouseBuildingShell(scene,'props/1-37-0.glb',[{x:door.x,z:door.z}]));parent.updateMatrixWorld(true);const origin=scene.localToWorld(new THREE.Vector3(0,20,0)),direction=new THREE.Vector3(0,0,-1).transformDirection(scene.matrixWorld);const hit=new THREE.Raycaster(origin,direction).intersectObjects(meshes(scene),false)[0];assert.ok(hit);assert.ok(scene.worldToLocal(hit.point.clone()).z<-19.5);});

test('known non-enterable source houses receive continuous exteriors without inventing a rear door',async()=>{for(const file of ['1-216-10.glb','1-236-14.glb']){const scene=await house(file);assert.ok(closeHouseBuildingShell(scene,'props/'+file,[]));assert.ok(scene.getObjectByName('house-closed-exterior'));}});

test('a matrix-wide distant northern entrance cannot suppress a local house repair',async()=>{const scene=await house('1-37-0.glb');assert.ok(closeHouseBuildingShell(scene,'props/1-37-0.glb',[{x:-8,z:18},{x:-8,z:-10000}]));});
test('the original recessed front door stays in front of every generated wall, and rear UVs use side cladding only',async()=>{const scene=await house('1-37-0.glb');scene.updateMatrixWorld(true);const ray=new THREE.Raycaster(new THREE.Vector3(-8,12,100),new THREE.Vector3(0,0,-1)),before=ray.intersectObjects(meshes(scene).filter(m=>!m.name.startsWith('3d-')),false)[0];assert.ok(before);assert.ok(closeHouseBuildingShell(scene,'props/1-37-0.glb',[{x:-8,z:18}]));scene.updateMatrixWorld(true);const after=ray.intersectObjects(meshes(scene),false)[0];assert.ok(after);assert.ok(after.object===before.object&&after.point.distanceTo(before.point)<.001,'recess depth and original front door artwork remain untouched');const cladding=scene.getObjectByName('house-rear-cladding')as THREE.Mesh,uv=cladding.geometry.getAttribute('uv');for(let i=0;i<uv.count;i++){const wrapped=((uv.getX(i)%1)+1)%1;assert.ok(wrapped>.52&&wrapped<.58,'rear wall samples native side-wall strip, never the front door atlas region');}});

test('native roofs remain visible and block upward light from the central body of every house variant',async()=>{const files=(await readdir(root)).filter(f=>/^1-\d+-\d+\.glb$/.test(f)&&HOUSE_BUILDING_MODELS.has(Number(f.split('-')[1])));for(const file of files){const scene=await house(file),summary=closeHouseBuildingShell(scene,'props/'+file,[])!;assert.ok(summary,file);scene.updateMatrixWorld(true);const body=new THREE.Box3(new THREE.Vector3().fromArray(summary.body.min),new THREE.Vector3().fromArray(summary.body.max)),center=body.getCenter(new THREE.Vector3());for(const x of [.4,.5,.6])for(const z of [.4,.5,.6]){const origin=new THREE.Vector3(THREE.MathUtils.lerp(body.min.x,body.max.x,x),body.min.y+3,THREE.MathUtils.lerp(body.min.z,body.max.z,z));assert.ok(new THREE.Raycaster(origin,new THREE.Vector3(0,1,0)).intersectObjects(meshes(scene),false).length,`${file}: roof above central body ${x},${z}`);}}});

test('a newly placed skinned source clone refreshes bind matrices before enclosure analysis',async()=>{const scene=await house('1-37-0.glb');scene.scale.setScalar(1/16);scene.position.set(564,1,390);const summary=closeHouseBuildingShell(scene,'props/1-37-0.glb',[]);assert.ok(summary);assert.deepEqual(summary.body.min,[-30,2,-20]);assert.deepEqual(summary.body.max,[30,55,16]);});
test('source snow remains a transparent overlay rather than supplying opaque structural roof patches',async()=>{const scene=await house('1-335-98.glb'),originalSnow=meshes(scene).filter(m=>/yuki|snow/.test((m.material as THREE.Material).name));assert.ok(originalSnow.length);const original=originalSnow.map(m=>m.material);assert.ok(closeHouseBuildingShell(scene,'props/1-335-98.glb',[]));scene.getObjectByName('house-closed-exterior')!.traverse(o=>{if(o instanceof THREE.Mesh)assert.ok(!/yuki|snow/.test((o.material as THREE.Material).name),'closures use underlying painted native roof, preserving alpha snow');});originalSnow.forEach((mesh,i)=>{assert.equal(mesh.visible,true);assert.equal(mesh.material,original[i]);assert.ok((mesh.material as THREE.Material).alphaTest>0);});});

test('paired raised roof ridges continue their native vertical fascia paint across the rear',async()=>{
 const rgba=(hit:THREE.Intersection)=>{const mesh=hit.object as THREE.Mesh,material=(Array.isArray(mesh.material)?mesh.material[hit.face?.materialIndex??0]:mesh.material)as THREE.MeshBasicMaterial,map=material.map!,uv=hit.uv!.clone();map.transformUv(uv);const image=map.image as{data:Uint8Array;width:number;height:number},x=THREE.MathUtils.clamp(Math.floor(uv.x*image.width),0,image.width-1),y=THREE.MathUtils.clamp(Math.floor(uv.y*image.height),0,image.height-1);return Array.from(image.data.subarray((y*image.width+x)*4,(y*image.width+x)*4+4));};
 const structural=(mesh:THREE.Mesh)=>!(Array.isArray(mesh.material)?mesh.material:[mesh.material]).some(m=>/yuki|snow/.test(m.name));
 for(const file of ['1-153-19.glb','1-335-98.glb']){const scene=await house(file),source=meshes(scene).filter(m=>!m.name.startsWith('3d-')&&structural(m)),front=file.includes('-335-')?11:3;scene.updateMatrixWorld(true);const samples=[-30,-25,0,25,30].flatMap(x=>[48.5,50,51.5].map(y=>{const hit=firstPaintedHit(new THREE.Raycaster(new THREE.Vector3(x,y,100),new THREE.Vector3(0,0,-1)),source);assert.ok(hit);assert.ok(Math.abs(hit.point.z-front)<1e-5,'measured source vertical ridge fascia');return{x,y,rgba:rgba(hit),map:((hit.object as THREE.Mesh).material as THREE.MeshBasicMaterial).map};}));
  assert.ok(closeHouseBuildingShell(scene,'props/'+file,[]));scene.updateMatrixWorld(true);for(const sample of samples){const hit=firstPaintedHit(new THREE.Raycaster(new THREE.Vector3(sample.x,sample.y,-100),new THREE.Vector3(0,0,1)),meshes(scene).filter(structural));assert.ok(hit);assert.equal(hit.object.name,'house-rear-ridge-fascia');assert.equal(((hit.object as THREE.Mesh).material as THREE.MeshBasicMaterial).map,sample.map);assert.deepEqual(rgba(hit),sample.rgba,`${file}: rear ridge cannot replace native fascia with unrelated pale roof-edge texels`);}
 }
});

test('actual enclosure-audit witnesses cannot escape through rear eaves, atlas-band joins or stepped roof gaps',async()=>{
 // These are measured native-space rays from placed source buildings, rather
 // than samples chosen from the generated geometry itself.
 const cases:[string,number[],number[]][]=[
  ['1-12-5.glb',[-15,8.8,7.5],[.874208496943145,.40673664307580015,.26518824832906246]],
  ['1-272-91.glb',[0,46.595703125,-15],[.19319171630366124,.13917310096006544,.9712403447157677]],
  ['1-236-14.glb',[-15.49365234375,42.4,5.1767578125],[.28745964708409416,.13917310096006544,.9476274580899691]],
  ['1-238-14.glb',[1.5,78.3984375,14.798828125],[.29028467725446205,0,-.9569403357322089]],
  ['1-46-3.glb',[0,22,8.79296875],[-.2569382405078354,.9510565162951538,-.17168064357190668]],
  ['1-237-14.glb',[-14.265625,61.29609375,-7.1396484375],[.9238795325112867,0,-.3826834323650897]],
  ['1-102-6.glb',[-15,47.70625,-9.25],[.8314696123025453,0,-.5555702330196021]],
  ['1-20-0.glb',[-19,71.159375,-13],[0,0,-1]],
  ['1-20-0.glb',[-19,71.159375,13],[.3495987113522072,.40673664307580015,.8440059503346556]],
  ['1-20-0.glb',[19,71.159375,13],[.3826834323650898,0,.9238795325112867]],
  ['1-153-19.glb',[-15,37.2,-10.25],[.8314696123025452,0,.5555702330196023]],
  ['1-153-19.glb',[-15,37.2,9.25],[-.8314696123025455,0,.5555702330196018]],
  ['1-335-98.glb',[-15,37.2,-2.25],[.8314696123025452,0,.5555702330196023]],
  ['1-335-98.glb',[-15,37.2,17.25],[-.8314696123025455,0,.5555702330196018]],
  ['1-132-8.glb',[15.228515625,18.03515625,8.1337890625],[-.473146789255815,.7431448254773942,-.47314678925581516]],
  ['1-299-15.glb',[15,24,-9.3759765625],[.473146789255815,.7431448254773942,.47314678925581505]],
  ['1-299-15.glb',[15,24,12.2080078125],[.47314678925581505,.7431448254773942,-.473146789255815]],
  ['1-313-17.glb',[19,67.365625,2.00390625],[.9238795325112867,0,.3826834323650898]],
  ['1-315-9.glb',[-15,37.2,10],[-.8440059503346555,.40673664307580015,.34959871135220744]],
  ['1-315-9.glb',[15,10.8,1],[.645974188021251,.40673664307580015,.6459741880212511]],
  ['1-316-9.glb',[0,24,-10.25],[-.6459741880212512,.40673664307580015,.6459741880212508]],
  ['1-316-9.glb',[15,37.2,-.5],[-.9148884004098167,.13917310096006544,.378959183507573]],
  ['1-53-0.glb',[-15,34,-10.25],[.1950903220161286,0,-.9807852804032304]],
  ['1-112-6.glb',[1.705078125,17.36015625,-14.50390625],[.21850801222441063,.9510565162951538,-.2185080122244106]],
  ['1-134-7.glb',[-15.509765625,32.403125,8.25],[.3495987113522073,.40673664307580015,-.8440059503346556]],
  ['1-252-11.glb',[13.5,22,-1],[.3090169943749475,.9510565162951538,0]],
  ['1-297-15.glb',[-13.5,11.6,-9.37744140625],[.21850801222441063,.9510565162951538,-.2185080122244106]],
  ['1-298-15.glb',[-13.5,11.6,-9.3759765625],[-.2185080122244106,.9510565162951538,-.2185080122244106]],
 ];
 for(const[file,origin,direction]of cases){const scene=await house(file);assert.ok(closeHouseBuildingShell(scene,'props/'+file,[]));scene.updateMatrixWorld(true);const hit=firstPaintedHit(new THREE.Raycaster(new THREE.Vector3().fromArray(origin),new THREE.Vector3().fromArray(direction).normalize()),meshes(scene));assert.ok(hit,`${file}: measured native enclosure ray ${origin}`);assert.ok(hit.distance>0);}
});

test('the native WK_HH roof-plane crossing bounds its loft cap without a new peak through the roof',async()=>{
 const scene=await house('1-20-0.glb');scene.updateMatrixWorld(true);const original=meshes(scene).filter(m=>!m.name.startsWith('3d-'));assert.ok(closeHouseBuildingShell(scene,'props/1-20-0.glb',[]));const front=meshes(scene).filter(m=>m.name==='house-front-interior-closure');let upper=0;for(const mesh of front){const p=mesh.geometry.getAttribute('position');for(let i=0;i<p.count;i++){const v=new THREE.Vector3().fromBufferAttribute(p,i);if(v.y<80)continue;const roof=firstPaintedHit(new THREE.Raycaster(new THREE.Vector3(v.x,150,v.z),new THREE.Vector3(0,-1,0)),original);assert.ok(roof,'literal native roof above upper front cap');assert.ok(v.y<=roof.point.y+.002,`cap ${v.toArray()} must not protrude above roof ${roof.point.y}`);upper++;}}assert.ok(upper>4,'cross-gable envelope vertices were exercised');
});

test('the farm cabin and dairy wing retain their separate native wall palettes across the rear',async()=>{
 const scene=await house('1-112-6.glb');assert.ok(closeHouseBuildingShell(scene,'props/1-112-6.glb',[]));const rear=meshes(scene).filter(m=>m.name==='house-rear-cladding');
 const cabin=rear.filter(m=>/wak_h01_a_lm7/.test((m.material as THREE.Material).name)),dairy=rear.filter(m=>/wak_h01_a_lm8/.test((m.material as THREE.Material).name));assert.ok(cabin.length);assert.ok(dairy.length);
 const bounds=(list:THREE.Mesh[])=>new THREE.Box3().setFromPoints(list.flatMap(m=>{const p=m.geometry.getAttribute('position');return Array.from({length:p.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(p,i));}));
 assert.ok(bounds(cabin).max.x>60&&bounds(cabin).min.x>-4,'native log-cabin cladding stays on the cabin volume');assert.ok(bounds(dairy).min.x<-60&&bounds(dairy).max.x<0,'native dairy planks stay on the lower wing');
});

test('front interior closure preserves both deeply recessed YBC window surfaces',async()=>{const scene=await house('1-252-11.glb');scene.updateMatrixWorld(true);const samples=[-12,12].map(x=>{const ray=new THREE.Raycaster(new THREE.Vector3(x,22,100),new THREE.Vector3(0,0,-1)),hit=ray.intersectObjects(meshes(scene).filter(m=>!m.name.startsWith('3d-')),false)[0];assert.ok(hit);assert.match((hit.object as THREE.Mesh).material instanceof Array?'':((hit.object as THREE.Mesh).material as THREE.Material).name,/mado/);return{ray,hit};});assert.ok(closeHouseBuildingShell(scene,'props/1-252-11.glb',[]));scene.updateMatrixWorld(true);for(const{ray,hit}of samples){const after=ray.intersectObjects(meshes(scene),false)[0];assert.ok(after);assert.equal(after.object,hit.object,'source glass remains visible behind its original frame');assert.ok(after.point.distanceTo(hit.point)<.001);}});

test('every placed house variant preserves vertical facade first hits across a dense front grid and visible window pixels',async t=>{
 const inventory=JSON.parse(await readFile(new URL('../../public/source/inspection/building-visual-inventory.json',import.meta.url),'utf8')),entrances=JSON.parse(await readFile(new URL('../../public/source/entrances.json',import.meta.url),'utf8'));let tested=0,painted=0,microLining=0,windowSamples=0;const misses:unknown[]=[],microWitnesses:unknown[]=[];
 for(const entry of inventory.assets.filter((a:{modelId:number})=>HOUSE_BUILDING_MODELS.has(a.modelId))){const scene=await house(entry.asset.replace('props/','')),bounds=nativeBounds(scene),source=meshes(scene).filter(m=>!m.name.startsWith('3d-')),placement=entry.placements[0],group=new THREE.Group();group.position.set(placement.cell.x*32+16,placement.cell.altitude*.5,placement.cell.z*32+16);scene.position.fromArray(placement.position);scene.scale.set(...placement.scale.map((v:number)=>v/16)as [number,number,number]);scene.rotation.set(...placement.rotation.map((v:number)=>v*Math.PI/180)as [number,number,number]);group.add(scene);group.updateMatrixWorld(true);const samples:{ray:THREE.Raycaster;hit:THREE.Intersection;kind?:'window'}[]=[];const windowBounds:THREE.Box3[]=[];for(const mesh of source){const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material],g=mesh.geometry,index=g.index;for(const part of g.groups.length?g.groups:[{start:0,count:index?.count??g.getAttribute('position').count,materialIndex:0}])if(/mado|window|light|hikari/i.test(materials[part.materialIndex??0].name)){const points=[];for(let i=part.start;i<part.start+part.count;i++)points.push(scene.worldToLocal(mesh.getVertexPosition(index?index.getX(i):i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld)));windowBounds.push(new THREE.Box3().setFromPoints(points).expandByScalar(5));}}
  for(const[axis,sign]of [[2,1]]as const){const tangent=axis===2?0:2,direction=new THREE.Vector3().setComponent(axis,-sign).transformDirection(scene.matrixWorld);for(let q=bounds.min.getComponent(tangent)+.371;q<bounds.max.getComponent(tangent);q+=2)for(let y=bounds.min.y+.619;y<bounds.max.y;y+=2){const origin=new THREE.Vector3().setComponent(axis,(sign>0?bounds.max:bounds.min).getComponent(axis)+sign*32).setComponent(tangent,q);origin.y=y;const ray=new THREE.Raycaster(scene.localToWorld(origin),direction),hit=firstPaintedHit(ray,source);if(hit){const dot=Math.abs(hit.face!.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).dot(direction.clone().negate())),nearWindow=windowBounds.some(b=>b.containsPoint(scene.worldToLocal(hit.point.clone())));if(dot>.995||dot>.25&&nearWindow)samples.push({ray,hit,kind:nearWindow?'window':undefined});}}}
  for(const mesh of source){const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material],geometry=mesh.geometry,indices=geometry.index,position=geometry.getAttribute('position');for(const part of geometry.groups.length?geometry.groups:[{start:0,count:indices?.count??position.count,materialIndex:0}]){if(!/mado|window|light|hikari/i.test(materials[part.materialIndex??0].name))continue;for(let i=part.start;i<part.start+part.count;i+=3){const points=[0,1,2].map(k=>mesh.getVertexPosition(indices?indices.getX(i+k):i+k,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld)),normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();for(const weights of [[.2,.2,.6],[.2,.6,.2],[.6,.2,.2],[1/3,1/3,1/3]]){const point=points[0].clone().multiplyScalar(weights[0]).addScaledVector(points[1],weights[1]).addScaledVector(points[2],weights[2]),ray=new THREE.Raycaster(point.clone().addScaledVector(normal,10),normal.clone().negate()),hit=firstPaintedHit(ray,source);if(hit&&hit.point.distanceTo(point)<1e-5)samples.push({ray,hit,kind:'window'});}}}}
  assert.ok(samples.length>40,entry.asset+': meaningful native painted facade coverage');const doors=entrances[placement.matrix]??[];closeBuildingBack(scene,doors);assert.ok(closeHouseBuildingShell(scene,entry.asset,doors));group.updateMatrixWorld(true);const after=meshes(scene);
  for(const{ray,hit,kind}of samples){const actual=firstPaintedHit(ray,after),mesh=hit.object as THREE.Mesh,material=Array.isArray(mesh.material)?mesh.material[hit.face?.materialIndex??0]:mesh.material,isWindow=kind==='window'||/mado|window|light|hikari/i.test(material.name);if(isWindow)windowSamples++;const nativePoint=scene.worldToLocal(hit.point.clone());if(!actual){misses.push({asset:entry.asset,kind:isWindow?'window':'facade',source:hit.object.name,at:nativePoint.toArray(),actual:null});continue;}const actualPoint=scene.worldToLocal(actual.point.clone()),difference=actualPoint.distanceTo(nativePoint),same=actual.object===hit.object&&difference<.00016,micro=!isWindow&&actual.object.name==='house-roof-lining'&&difference<=.05;if(micro&&!same){microLining++;microWitnesses.push({asset:entry.asset,source:hit.object.name,at:nativePoint.toArray(),actualAt:actualPoint.toArray(),distanceNative:difference});}if(!same&&!micro)misses.push({asset:entry.asset,kind:isWindow?'window':'facade',source:hit.object.name,at:nativePoint.toArray(),actual:actual.object.name,actualAt:actualPoint.toArray(),distanceNative:difference});}
  tested++;painted+=samples.length;
 }
 assert.equal(tested,45);t.diagnostic(JSON.stringify({variants:tested,paintedSamples:painted,windowSamples,microLining,microWitnesses,strictMisses:misses.length,misses}));assert.equal(misses.length,0,'Native facade/window first-hit regressions; exact witnesses are in diagnostics');
});

type NativeRoof={p:THREE.Vector3[];uv:THREE.Vector2[];material:THREE.MeshBasicMaterial;plane:THREE.Plane;id:number};
function literalRoofs(scene:THREE.Object3D){scene.updateWorldMatrix(true,true);scene.updateMatrixWorld(true);const inverse=scene.matrixWorld.clone().invert(),roofs:NativeRoof[]=[];for(const mesh of meshes(scene)){if(mesh.name.startsWith('3d-'))continue;const g=mesh.geometry,index=g.index,pos=g.getAttribute('position'),uv=g.getAttribute('uv'),materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];for(const group of g.groups.length?g.groups:[{start:0,count:index?.count??pos.count,materialIndex:0}]){const material=materials[group.materialIndex??0]as THREE.MeshBasicMaterial;if(/kage|shadow|h_in|yuki|snow|flower|hana|tree|plant|light|hikari|mado|window/i.test(material.name)||material.opacity<.99)continue;for(let at=group.start;at<group.start+group.count;at+=3){const ids=[0,1,2].map(i=>index?index.getX(at+i):at+i),p=ids.map(i=>mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse)),n=p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0])),area=n.length()/2;if(area<1e-10||Math.abs(n.normalize().y)<=.25)continue;roofs.push({p,uv:ids.map(i=>new THREE.Vector2(uv.getX(i),uv.getY(i))),material,plane:new THREE.Plane().setFromCoplanarPoints(p[0],p[1],p[2]),id:roofs.length});}}}return roofs;}
function baryXZ(f:NativeRoof,x:number,z:number){const[a,b,c]=f.p,den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z),u=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/den,v=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/den,w=1-u-v;return[u,v,w];}
function roofY(f:NativeRoof,x:number,z:number){return-(f.plane.normal.x*x+f.plane.normal.z*z+f.plane.constant)/f.plane.normal.y;}
function painted(f:NativeRoof,x:number,z:number){const m=f.material;if(!m.alphaTest&&!m.transparent)return true;const weights=baryXZ(f,x,z),uv=f.uv[0].clone().multiplyScalar(weights[0]).addScaledVector(f.uv[1],weights[1]).addScaledVector(f.uv[2],weights[2]),map=m.map!,image=map.image as{data:Uint8Array;width:number;height:number};map.transformUv(uv);if(map.wrapS===THREE.RepeatWrapping&&uv.x===1)uv.x=0;if(map.wrapT===THREE.RepeatWrapping&&uv.y===1)uv.y=0;const ix=THREE.MathUtils.clamp(Math.floor(uv.x*image.width),0,image.width-1),iy=THREE.MathUtils.clamp(Math.floor(uv.y*image.height),0,image.height-1);return image.data[(iy*image.width+ix)*4+3]/255*m.opacity>=Math.max(.5,m.alphaTest);}
function envelope(roofs:NativeRoof[],p:THREE.Vector3){const covering=roofs.filter(f=>baryXZ(f,p.x,p.z).every(w=>w>=0)&&painted(f,p.x,p.z));if(!covering.length)return null;return covering.reduce((a,b)=>roofY(a,p.x,p.z)>=roofY(b,p.x,p.z)?a:b);}
function cutsForEdge(roofs:NativeRoof[],a:THREE.Vector3,b:THREE.Vector3){const cuts=new Map<number,string>([[0,'vertex'],[1,'vertex']]),dx=b.x-a.x,dz=b.z-a.z,cross=(ax:number,az:number,bx:number,bz:number)=>ax*bz-az*bx;
 for(const f of roofs){for(let i=0;i<3;i++){const c=f.p[i],d=f.p[(i+1)%3],ex=d.x-c.x,ez=d.z-c.z,den=cross(dx,dz,ex,ez);if(Math.abs(den)<1e-12)continue;const t=cross(c.x-a.x,c.z-a.z,ex,ez)/den,u=cross(c.x-a.x,c.z-a.z,dx,dz)/den;if(t>0&&t<1&&u>=0&&u<=1)cuts.set(t,'native-triangle-edge');}
  if(f.material.alphaTest||f.material.transparent){const wa=baryXZ(f,a.x,a.z),wb=baryXZ(f,b.x,b.z),uva=f.uv[0].clone().multiplyScalar(wa[0]).addScaledVector(f.uv[1],wa[1]).addScaledVector(f.uv[2],wa[2]),uvb=f.uv[0].clone().multiplyScalar(wb[0]).addScaledVector(f.uv[1],wb[1]).addScaledVector(f.uv[2],wb[2]),image=f.material.map!.image as{width:number;height:number};f.material.map!.updateMatrix();uva.applyMatrix3(f.material.map!.matrix);uvb.applyMatrix3(f.material.map!.matrix);for(const[axis,size]of[['x',image.width],['y',image.height]]as const){const delta=uvb[axis]-uva[axis];if(Math.abs(delta)<1e-12)continue;const min=Math.min(uva[axis],uvb[axis])*size,max=Math.max(uva[axis],uvb[axis])*size;assert.ok(max-min<10000,'finite native atlas traversal');for(let i=Math.ceil(min);i<max;i++){const t=(i/size-uva[axis])/delta;if(t>0&&t<1)cuts.set(t,'native-alpha-texel-edge');}}}
 }
 for(let i=0;i<roofs.length;i++)for(let j=i+1;j<roofs.length;j++){const f=roofs[i],g=roofs[j],at=roofY(f,a.x,a.z)-roofY(g,a.x,a.z),bt=roofY(f,b.x,b.z)-roofY(g,b.x,b.z),delta=at-bt;if(Math.abs(delta)<1e-12)continue;const t=at/delta;if(t>0&&t<1){const p=a.clone().lerp(b,t);if(baryXZ(f,p.x,p.z).every(w=>w>=0)&&baryXZ(g,p.x,p.z).every(w=>w>=0))cuts.set(t,'native-roof-plane-crossing');}}
 const ordered=[...cuts].sort((a,b)=>a[0]-b[0]);return ordered.flatMap(([t,reason],i)=>i?[[t,reason],[(ordered[i-1][0]+t)/2,'interval-interior']]:[[t,reason]])as[number,string][];
}

// The Float32 position buffer can encode a literal roof-edge contact just
// outside its double-precision intersection. Match that same encoding, not a
// dilated triangle. The height bound is derived from Float32 rounding alone.
function float32Step(value:number){return Math.max(2**-149,2**(Math.floor(Math.log2(Math.abs(value)||2**-126))-23));}
function roofEncodingBound(f:NativeRoof,a:THREE.Vector3,b:THREE.Vector3,t:number){
 const error=(axis:'x'|'y'|'z')=>((1-t)*float32Step(a[axis])+t*float32Step(b[axis]))/2;
 const sx=Math.abs(f.plane.normal.x/f.plane.normal.y),sz=Math.abs(f.plane.normal.z/f.plane.normal.y);
 return error('y')+sx*error('x')+sz*error('z')+Number.EPSILON*64*(Math.abs(f.plane.constant/f.plane.normal.y)+sx*Math.max(Math.abs(a.x),Math.abs(b.x))+sz*Math.max(Math.abs(a.z),Math.abs(b.z))+Math.max(Math.abs(a.y),Math.abs(b.y)));
}
function encodedRoofContacts(roofs:NativeRoof[],point:THREE.Vector3){
 const projected=new THREE.Vector3(point.x,0,point.z);
 return roofs.flatMap(f=>{
  const triangle=new THREE.Triangle(...f.p.map(p=>new THREE.Vector3(p.x,0,p.z))as[THREE.Vector3,THREE.Vector3,THREE.Vector3]),q=triangle.closestPointToPoint(projected,new THREE.Vector3());
  if(Math.fround(q.x)!==Math.fround(point.x)||Math.fround(q.z)!==Math.fround(point.z)||!painted(f,q.x,q.z))return[];
  return[{f,y:roofY(f,q.x,q.z)}];
 });
}


test('every upper rear, front and post closure stays within the literal painted native roof envelope',async t=>{
 const files=(await readdir(root)).filter(f=>/^1-(?:20|102|237|238|153|335)-\d+\.glb$/.test(f)).sort();
 const failures:unknown[]=[],details:unknown[]=[];let vertices=0,edgeChecks=0,planeCrossings=0,alphaCuts=0,encodedContacts=0;
 for(const file of files){
  const scene=await house(file),roofs=literalRoofs(scene),id=Number(file.split('-')[1]);
  assert.ok(roofs.length>0,file+': native roof triangles');
  assert.ok(closeHouseBuildingShell(scene,'props/'+file,[]));
  const roles=id===153||id===335?['house-post-header-closure','house-post-side-closure']:['house-rear-cladding','house-wall-lining',...(id===20?['house-front-interior-closure']:[])];
  for(const role of roles){
   const panels=meshes(scene).filter(m=>m.name===role);assert.ok(panels.length,file+': '+role);let roleChecks=0;
   const check=(point:THREE.Vector3,why:string,a=point,b=point,t=0)=>{
    const roof=envelope(roofs,point);
    if(roof&&point.y-roofY(roof,point.x,point.z)<=roofEncodingBound(roof,a,b,t))return;
    const contact=encodedRoofContacts(roofs,point).find(c=>point.y-c.y<=roofEncodingBound(c.f,a,b,t));
    if(contact){encodedContacts++;return;}
    if(failures.length<30)failures.push({file,role,why,point:point.toArray(),nativeRoof:roof?roofY(roof,point.x,point.z):null});
   };
   for(const mesh of panels){
    const p=mesh.geometry.getAttribute('position'),indices=mesh.geometry.index;
    for(let i=0;i<p.count;i++){vertices++;check(new THREE.Vector3().fromBufferAttribute(p,i),'vertex');}
    for(let i=0;i<(indices?.count??p.count);i+=3){
     const points=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,indices?indices.getX(i+k):i+k));
     assert.ok(points.every(p=>p.x===points[0].x)||points.every(p=>p.z===points[0].z),'closure triangles are vertical, so their upper edges bound their interiors');
     for(let k=0;k<3;k++)for(const[t,why]of cutsForEdge(roofs,points[k],points[(k+1)%3])){
      edgeChecks++;roleChecks++;if(why==='native-roof-plane-crossing')planeCrossings++;if(why==='native-alpha-texel-edge')alphaCuts++;
      check(points[k].clone().lerp(points[(k+1)%3],t),why,points[k],points[(k+1)%3],t);
     }
    }
   }
   details.push({file,role,checks:roleChecks});
  }
 }
 // Triangle edges, plane crossings and actual PNG texel boundaries partition
 // every wall edge into intervals with one affine native upper envelope.
 assert.equal(files.length,6);assert.ok(vertices>2000);assert.ok(edgeChecks>100000);assert.ok(planeCrossings>0);assert.ok(alphaCuts>0);
 t.diagnostic(JSON.stringify({vertices,edgeChecks,planeCrossings,alphaCuts,encodedContacts,details,failures}));
 assert.equal(failures.length,0,'literal native roof-envelope protrusions; see diagnostics');
});
