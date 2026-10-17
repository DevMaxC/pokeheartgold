import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {closeBuildingBack,originalMaterial,repairOriginalAsset} from './render-repair.ts';
import {closeBurnedTowerShell} from './burned-tower-shells.ts';
const source=new URL('../../public/source/props/',import.meta.url);
function geometryGLB(bytes:Buffer):ArrayBuffer{const n=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+n).toString());delete json.images;delete json.textures;delete json.samplers;for(const m of json.materials||[])delete m.pbrMetallicRoughness?.baseColorTexture;let encoded=JSON.stringify(json);encoded+=' '.repeat((4-Buffer.byteLength(encoded)%4)%4);const b=Buffer.from(encoded),out=Buffer.concat([bytes.subarray(0,20),b,bytes.subarray(20+n)]);out.writeUInt32LE(out.length,8);out.writeUInt32LE(b.length,12);return out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength)as ArrayBuffer;}
function png(bytes:Buffer){
 let width=0,height=0;const compressed:Buffer[]=[];for(let offset=8;offset<bytes.length;){const size=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8),data=bytes.subarray(offset+8,offset+8+size);offset+=size+12;if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);assert.equal(data[8],8);assert.equal(data[9],6);assert.equal(data[12],0);}if(type==='IDAT')compressed.push(data);}
 const raw=inflateSync(Buffer.concat(compressed)),stride=width*4,data=new Uint8Array(stride*height);let offset=0;const paeth=(a:number,b:number,c:number)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++){const filter=raw[offset++];assert.ok(filter<=4);for(let x=0;x<stride;x++){const left=x>=4?data[y*stride+x-4]:0,up=y?data[(y-1)*stride+x]:0,corner=y&&x>=4?data[(y-1)*stride+x-4]:0;data[y*stride+x]=(raw[offset++]+[0,left,up,Math.floor((left+up)/2),paeth(left,up,corner)][filter])&255;}}return{data,width,height};
}
async function asset(file:string){const bytes=await readFile(new URL(file,source)),length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length).toString()),binary=bytes.subarray(28+length),images=json.images.map((image:any)=>{const view=json.bufferViews[image.bufferView];return png(image.uri?Buffer.from(image.uri.split(',')[1],'base64'):binary.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength));}),textures=json.textures.map((texture:any)=>{const image=images[texture.source],map=new THREE.DataTexture(image.data,image.width,image.height),sampler=json.samplers[texture.sampler],wrap=(value:number)=>value===33071?THREE.ClampToEdgeWrapping:value===33648?THREE.MirroredRepeatWrapping:THREE.RepeatWrapping;map.flipY=false;map.wrapS=wrap(sampler.wrapS);map.wrapT=wrap(sampler.wrapT);return map;}),byName=new Map(json.materials.map((m:any)=>[m.name,textures[m.pbrMetallicRoughness.baseColorTexture.index]])),gltf=await new GLTFLoader().parseAsync(geometryGLB(bytes),'');gltf.scene.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const convert=(m:THREE.Material)=>{const material=originalMaterial(m as THREE.MeshStandardMaterial);material.map=byName.get(m.name) as THREE.Texture;return material;};o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);});repairOriginalAsset(gltf.scene,true);return gltf.scene;}
function meshes(root:THREE.Object3D){const result:THREE.Mesh[]=[];root.traverseVisible(o=>{if(o instanceof THREE.Mesh)result.push(o);});return result;}
function cast(root:THREE.Object3D,origin:THREE.Vector3,direction:THREE.Vector3,nativeOnly=false){root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);return new THREE.Raycaster(origin,direction.clone().normalize()).intersectObjects(meshes(root).filter(m=>!nativeOnly||!m.name.startsWith('3d-')&&m.name!=='entrance-rear-wall'&&!m.name.startsWith('burned-tower-')),false).filter(hit=>{const object=hit.object as THREE.Mesh,material=(Array.isArray(object.material)?object.material[hit.face?.materialIndex??0]:object.material) as THREE.MeshBasicMaterial;if(/kage|shadow/.test(material.name)||material.opacity<.5)return false;const map=material.map;if(!map||!hit.uv||!material.transparent&&!material.alphaTest)return true;const p=hit.uv.clone();map.transformUv(p);const image=map.image as{data:Uint8Array;width:number;height:number};const x=Math.max(0,Math.min(image.width-1,Math.floor(p.x*image.width))),y=Math.max(0,Math.min(image.height-1,Math.floor(p.y*image.height)));return image.data[(y*image.width+x)*4+3]/255>=Math.max(material.alphaTest,.5);});}

test('Burned Tower receives only a native lower rear story while its front and burned upper opening survive',async()=>{
 const root=await asset('1-8-5.glb'),original=meshes(root).filter(m=>!m.name.startsWith('3d-')),geometry=original.map(m=>m.geometry),materials=original.flatMap(m=>Array.isArray(m.material)?m.material:[m.material]),states=materials.map(m=>({side:m.side,transparent:m.transparent,alphaTest:m.alphaTest,opacity:m.opacity}));
 const upper=original.filter(m=>new THREE.Box3().setFromObject(m).max.y>56.05),upperStates=upper.map(m=>m.visible),probes=[[-24,20,100],[0,20,100],[24,20,100],[0,50,100],[0,65,100]],before=probes.map(p=>cast(root,new THREE.Vector3(...p as[number,number,number]),new THREE.Vector3(0,0,-1))[0]);
 const roofProbes=[-20,0,20].flatMap(x=>[-20,0,20].map(z=>new THREE.Vector3(x,80,z))),openBefore=roofProbes.filter(p=>!cast(root,p,new THREE.Vector3(0,1,0)).length);assert.ok(openBefore.length,'native burned upper story has a real opening');
 closeBuildingBack(root,[{x:0,z:36,axis:2,sign:1}]);const result=closeBurnedTowerShell(root,'props/1-8-5.glb',[{x:0,z:36,axis:2,sign:1}]);assert.ok(result);assert.equal(result.triangles,18);assert.equal(closeBurnedTowerShell(root,'props/1-8-5.glb'),result);
 original.forEach((m,i)=>{assert.equal(m.geometry,geometry[i]);assert.equal(m.visible,true);});materials.forEach((m,i)=>assert.deepEqual({side:m.side,transparent:m.transparent,alphaTest:m.alphaTest,opacity:m.opacity},states[i]));upper.forEach((m,i)=>assert.equal(m.visible,upperStates[i]));
 probes.forEach((p,i)=>{const after=cast(root,new THREE.Vector3(...p as[number,number,number]),new THREE.Vector3(0,0,-1))[0];assert.ok(after?.object===before[i]?.object,'native front remains first visible '+p);assert.ok(after&&before[i]&&after.point.distanceTo(before[i]!.point)<1e-4);});
 for(const origin of openBefore)assert.equal(cast(root,origin,new THREE.Vector3(0,1,0)).length,0,'intentional burned roof opening '+origin.toArray());
 const shell=root.getObjectByName('burned-tower-shell')!;assert.ok(shell);const bounds=new THREE.Box3().setFromObject(shell);assert.equal(bounds.max.y,56);assert.equal(bounds.min.y,8);assert.equal(bounds.min.z,-36);assert.equal(bounds.max.z,-36);
});

test('the measured lower rear windows and wood block interior and oblique rays before the front door card',async()=>{
 const root=await asset('1-8-5.glb');assert.ok(closeBurnedTowerShell(root,'props/1-8-5.glb'));
 for(const x of[-35,-24,-12,0,12,24,35])for(const y of[8.1,15,25,33.8,35,37.9,45,55.9]){
  const inside=cast(root,new THREE.Vector3(x,y,0),new THREE.Vector3(0,0,-1))[0],outside=cast(root,new THREE.Vector3(x,y,-100),new THREE.Vector3(0,0,1))[0];assert.ok(inside&&outside,`rear ${x},${y}`);assert.ok(Math.abs(inside.point.z+36)<.01);assert.ok(Math.abs(outside.point.z+36)<.01);
  for(const dx of[-.3,0,.3]){const hit=cast(root,new THREE.Vector3(x+.03125,y,0),new THREE.Vector3(dx,.05,-1))[0];assert.ok(hit,`rear oblique ${x},${y},${dx}`);}
 }
});

test('a bounded real rear passage remains open beneath its beam and distant entrances cannot suppress cladding',async()=>{
 const root=await asset('1-8-5.glb'),result=closeBurnedTowerShell(root,'props/1-8-5.glb',[{x:0,z:-36,axis:2,sign:-1,passageOnly:true},{x:400,z:-36,axis:2,sign:-1}]);assert.ok(result);assert.equal(result.passages,1);const shell=root.getObjectByName('burned-tower-shell')!;
 for(const x of[-7,0,7])for(const y of[9,20,33])assert.equal(cast(shell,new THREE.Vector3(x,y,-70),new THREE.Vector3(0,0,1)).length,0);
 for(const x of[-24,24])assert.ok(cast(shell,new THREE.Vector3(x,20,-70),new THREE.Vector3(0,0,1)).length);
 assert.ok(cast(shell,new THREE.Vector3(0,35,-70),new THREE.Vector3(0,0,1)).length);
});

test('Burned Tower repairs follow full clone transforms and retain shared native assets',async()=>{
 const template=await asset('1-8-5.glb'),a=clone(template),b=clone(template),parent=new THREE.Group();parent.position.set(45,8,-23);parent.rotation.y=.2;a.position.set(-2,3,5);a.rotation.y=.7;a.scale.set(.05,.07,.04);parent.add(a);parent.updateMatrixWorld(true);
 const entrance=a.localToWorld(new THREE.Vector3(0,0,-36));assert.ok(closeBurnedTowerShell(a,'props/1-8-5.glb',[{x:entrance.x,z:entrance.z}]));const direction=new THREE.Vector3(0,0,-1).transformDirection(a.matrixWorld),hit=cast(a,a.localToWorld(new THREE.Vector3(24,20,0)),direction)[0];assert.ok(hit);assert.ok(Math.abs(a.worldToLocal(hit.point.clone()).z+36)<.01);
 assert.equal(template.getObjectByName('burned-tower-shell'),undefined);assert.equal(b.getObjectByName('burned-tower-shell'),undefined);assert.equal(closeBurnedTowerShell(b,'props/0-8-5.glb'),null);assert.equal(closeBurnedTowerShell(b,'props/1-88-4.glb'),null);
});

test('Burned Tower cladding owns finite geometry/materials and samples opaque native window/wood texels',async()=>{
 const root=await asset('1-8-5.glb'),sourceMaterials=meshes(root).flatMap(m=>Array.isArray(m.material)?m.material:[m.material]),maps=new Set(sourceMaterials.map(m=>(m as THREE.MeshBasicMaterial).map));assert.ok(closeBurnedTowerShell(root,'props/1-8-5.glb'));let count=0;
 for(const mesh of meshes(root.getObjectByName('burned-tower-shell')!)){
  const material=mesh.material as THREE.MeshBasicMaterial;assert.ok(!sourceMaterials.includes(material));assert.ok(maps.has(material.map));assert.equal(material.name,'en_yake2');assert.equal(material.side,THREE.DoubleSide);assert.equal(material.alphaTest,0);assert.equal(material.transparent,false);for(const name of['position','normal','uv','color'])assert.ok(Array.from(mesh.geometry.getAttribute(name).array).every(Number.isFinite));
  const map=material.map!,pixels=map.image as{data:Uint8Array;width:number;height:number},uv=mesh.geometry.getAttribute('uv');for(let i=0;i<uv.count;i+=3)for(let u=0;u<=8;u++)for(let v=0;v<=8-u;v++){const a=u/8,b=v/8,c=1-a-b,p=new THREE.Vector2(uv.getX(i)*a+uv.getX(i+1)*b+uv.getX(i+2)*c,uv.getY(i)*a+uv.getY(i+1)*b+uv.getY(i+2)*c);map.transformUv(p);const x=Math.min(pixels.width-1,Math.floor(p.x*pixels.width)),y=Math.min(pixels.height-1,Math.floor(p.y*pixels.height));assert.equal(pixels.data[(y*pixels.width+x)*4+3],255,`native alpha ${x},${y}`);count++;}
 }assert.ok(count>500);
});

 test('the complete upper-story exterior profile matches the damaged native source without artificial brown backings',async()=>{
  const root=await asset('1-8-5.glb'),probes:{origin:THREE.Vector3;direction:THREE.Vector3;before:THREE.Intersection|undefined}[]=[];
  for(const y of[56.1,60,66,74,78.1,82,86,90,94,98,100])for(let view=0;view<16;view++)for(const offset of[-40,-24,-8,0,8,24,40]){
   const angle=view*Math.PI/8,c=Math.abs(Math.cos(angle))<1e-12?0:Math.cos(angle),s=Math.abs(Math.sin(angle))<1e-12?0:Math.sin(angle),origin=new THREE.Vector3(c*160-s*offset,y,s*160+c*offset),direction=new THREE.Vector3(-c,0,-s);
   probes.push({origin,direction,before:cast(root,origin,direction,true)[0]});
  }
  closeBuildingBack(root,[{x:0,z:36,axis:2,sign:1}]);assert.ok(closeBurnedTowerShell(root,'props/1-8-5.glb',[{x:0,z:36,axis:2,sign:1}]));
  for(const{origin,direction,before}of probes){const after=cast(root,origin,direction)[0];assert.ok(after?.object===before?.object,`native damaged upper profile ${origin.toArray()}`);if(before&&after)assert.ok(after.point.distanceTo(before.point)<1e-4);}
  for(const mesh of meshes(root))assert.ok(!['3d-rear-facade','3d-solid-backing','entrance-rear-wall'].includes(mesh.name),'no artificial upper backing remains');
 });
