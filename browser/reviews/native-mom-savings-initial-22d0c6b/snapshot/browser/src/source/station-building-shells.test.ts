import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {closeBuildingBack,originalMaterial,repairOriginalAsset} from './render-repair.ts';
import {closeStationBuildingShell} from './station-building-shells.ts';
const source=new URL('../../public/source/props/',import.meta.url);
function geometryGLB(bytes:Buffer):ArrayBuffer{const n=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+n).toString());delete json.images;delete json.textures;delete json.samplers;for(const m of json.materials||[])delete m.pbrMetallicRoughness?.baseColorTexture;let encoded=JSON.stringify(json);encoded+=' '.repeat((4-Buffer.byteLength(encoded)%4)%4);const b=Buffer.from(encoded),out=Buffer.concat([bytes.subarray(0,20),b,bytes.subarray(20+n)]);out.writeUInt32LE(out.length,8);out.writeUInt32LE(b.length,12);return out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength)as ArrayBuffer;}
function png(bytes:Buffer){
 let width=0,height=0;const compressed:Buffer[]=[];for(let offset=8;offset<bytes.length;){const size=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8),data=bytes.subarray(offset+8,offset+8+size);offset+=size+12;if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);assert.equal(data[8],8);assert.equal(data[9],6);assert.equal(data[12],0);}if(type==='IDAT')compressed.push(data);}
 const raw=inflateSync(Buffer.concat(compressed)),stride=width*4,data=new Uint8Array(stride*height);let offset=0;const paeth=(a:number,b:number,c:number)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++){const filter=raw[offset++];assert.ok(filter<=4);for(let x=0;x<stride;x++){const left=x>=4?data[y*stride+x-4]:0,up=y?data[(y-1)*stride+x]:0,corner=y&&x>=4?data[(y-1)*stride+x-4]:0;data[y*stride+x]=(raw[offset++]+[0,left,up,Math.floor((left+up)/2),paeth(left,up,corner)][filter])&255;}}return{data,width,height};
}
async function asset(file:string){const bytes=await readFile(new URL(file,source)),length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length).toString()),binary=bytes.subarray(28+length),images=json.images.map((image:any)=>{const view=json.bufferViews[image.bufferView];return png(image.uri?Buffer.from(image.uri.split(',')[1],'base64'):binary.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength));}),textures=json.textures.map((texture:any)=>{const image=images[texture.source],map=new THREE.DataTexture(image.data,image.width,image.height),sampler=json.samplers[texture.sampler],wrap=(value:number)=>value===33071?THREE.ClampToEdgeWrapping:value===33648?THREE.MirroredRepeatWrapping:THREE.RepeatWrapping;map.flipY=false;map.wrapS=wrap(sampler.wrapS);map.wrapT=wrap(sampler.wrapT);return map;}),byName=new Map(json.materials.map((m:any)=>[m.name,textures[m.pbrMetallicRoughness.baseColorTexture.index]])),gltf=await new GLTFLoader().parseAsync(geometryGLB(bytes),'');gltf.scene.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const convert=(m:THREE.Material)=>{const material=originalMaterial(m as THREE.MeshStandardMaterial);material.map=byName.get(m.name) as THREE.Texture;return material;};o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);});repairOriginalAsset(gltf.scene,true);return gltf.scene;}
function meshes(root:THREE.Object3D){const result:THREE.Mesh[]=[];root.traverseVisible(o=>{if(o instanceof THREE.Mesh)result.push(o);});return result;}
function cast(root:THREE.Object3D,origin:THREE.Vector3,direction:THREE.Vector3){root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);return new THREE.Raycaster(origin,direction.clone().normalize()).intersectObjects(meshes(root),false).filter(hit=>{const object=hit.object as THREE.Mesh,material=(Array.isArray(object.material)?object.material[hit.face?.materialIndex??0]:object.material) as THREE.MeshBasicMaterial;if(/kage|shadow/.test(material.name)||material.opacity<.5)return false;const map=material.map;if(!map||!hit.uv||!material.transparent&&!material.alphaTest)return true;const p=hit.uv.clone();map.transformUv(p);const image=map.image as{data:Uint8Array;width:number;height:number};const x=Math.max(0,Math.min(image.width-1,Math.floor(p.x*image.width))),y=Math.max(0,Math.min(image.height-1,Math.floor(p.y*image.height)));return image.data[(y*image.width+x)*4+3]/255>=Math.max(material.alphaTest,.5);});}

test('the native Goldenrod station receives a clone-owned measured rear and three curved roof closures',async()=>{
 const root=await asset('1-88-4.glb'),original=meshes(root).filter(m=>!m.name.startsWith('3d-')),geometry=original.map(m=>m.geometry),materials=original.flatMap(m=>Array.isArray(m.material)?m.material:[m.material]),states=materials.map(m=>({side:m.side,transparent:m.transparent,alphaTest:m.alphaTest,opacity:m.opacity})),maps=new Set(materials.map(m=>(m as THREE.MeshBasicMaterial).map));
 const probes=[[-16,15,100],[12,85,100],[12,108,100],[-100,90,4],[100,90,4]];
 const before=probes.map(p=>cast(root,new THREE.Vector3(...p as[number,number,number]),new THREE.Vector3(p[0]<-80?1:p[0]>80?-1:0,0,p[2]>80?-1:0))[0]);
 closeBuildingBack(root,[{x:-16,z:40,axis:2,sign:1}]);const result=closeStationBuildingShell(root,'props/1-88-4.glb',[{x:-16,z:40,axis:2,sign:1}]);assert.ok(result);assert.equal(result.roofBoundaryEdges,72);assert.equal(closeStationBuildingShell(root,'props/1-88-4.glb'),result);
 original.forEach((m,i)=>{assert.equal(m.geometry,geometry[i]);assert.equal(m.visible,true);});materials.forEach((m,i)=>assert.deepEqual({side:m.side,transparent:m.transparent,alphaTest:m.alphaTest,opacity:m.opacity},states[i]));
 probes.forEach((p,i)=>{const after=cast(root,new THREE.Vector3(...p as[number,number,number]),new THREE.Vector3(p[0]<-80?1:p[0]>80?-1:0,0,p[2]>80?-1:0))[0];assert.ok(after?.object===before[i]?.object,'native front/side roof and artwork remain first visible '+p);assert.ok(after&&before[i]&&after.point.distanceTo(before[i]!.point)<1e-4);});
 const shell=root.getObjectByName('station-building-shell')!;assert.ok(shell);
 for(const mesh of meshes(shell)){const material=mesh.material as THREE.MeshBasicMaterial;assert.ok(!materials.includes(material));assert.ok(maps.has(material.map));assert.equal(material.side,THREE.DoubleSide);assert.equal(material.transparent,false);assert.equal(material.alphaTest,0);for(const name of['position','normal','uv','color'])assert.ok(Array.from(mesh.geometry.getAttribute(name).array).every(Number.isFinite));}
 for(const mesh of meshes(root))assert.ok(!['3d-rear-facade','3d-solid-backing','entrance-rear-wall'].includes(mesh.name));
});

test('station body and roof interior rays cannot see sky through its native curved patch boundaries',async()=>{
 const root=await asset('1-88-4.glb');assert.ok(closeStationBuildingShell(root,'props/1-88-4.glb'));
 for(const x of[-46,-30,-10,12,32,52,70])for(const y of[3,20,35,40,50,69,76]){const hit=cast(root,new THREE.Vector3(x,y,0),new THREE.Vector3(0,0,-1))[0];assert.ok(hit,`rear body ${x},${y}`);if(y<74)assert.ok(Math.abs(hit.point.z+32)<.1,`measured rear ${x},${y}: ${hit.point.z}`);}
 let checked=0;const misses:string[]=[];
 for(const x of[-42,-24,-6,12,30,48,66])for(const z of[-28,-12,4,20,36])for(const y of[80,88,96,104,110]){
  const origin=new THREE.Vector3(x,y,z),up=cast(root,origin,new THREE.Vector3(0,1,0))[0];if(!up||up.point.y-y<.5)continue;
  // These points are below the native roof and above the original body.
  for(const elevation of[0,.25,.6,1])for(let azimuth=0;azimuth<16;azimuth++){
   const angle=azimuth*Math.PI/8,direction=new THREE.Vector3(Math.abs(Math.cos(angle))<1e-12?0:Math.cos(angle),elevation,Math.abs(Math.sin(angle))<1e-12?0:Math.sin(angle)),hit=cast(root,origin,direction)[0];if(!hit)misses.push(`roof escape ${origin.toArray()} direction ${direction.toArray()}`);checked++;
  }
 }
 assert.ok(checked>4000);assert.equal(misses.length,0,misses.join("\n"));
});

test('station rear entrance cuts use bounded transformed entrances and leave the beam above the passage',async()=>{
 const root=await asset('1-88-4.glb'),result=closeStationBuildingShell(root,'props/1-88-4.glb',[{x:12,z:-32,axis:2,sign:-1,passageOnly:true},{x:500,z:-32,axis:2,sign:-1}]);assert.ok(result);assert.equal(result.passages,1);const shell=root.getObjectByName('station-building-shell')!;
 for(const x of[5,12,19])for(const y of[5,20,33])assert.equal(cast(shell,new THREE.Vector3(x,y,-60),new THREE.Vector3(0,0,1)).length,0);
 for(const x of[-30,40])assert.ok(cast(shell,new THREE.Vector3(x,20,-60),new THREE.Vector3(0,0,1)).length);
 assert.ok(cast(shell,new THREE.Vector3(12,36,-60),new THREE.Vector3(0,0,1)).length);
});

test('station construction follows placed SkinnedMesh transforms and cannot mutate shared native templates',async()=>{
 const template=await asset('1-88-4.glb'),a=clone(template),b=clone(template),parent=new THREE.Group();parent.position.set(30,7,-60);parent.rotation.y=.3;a.position.set(-5,2,8);a.rotation.y=.8;a.scale.set(.06,.08,.04);parent.add(a);parent.updateMatrixWorld(true);
 const entrance=a.localToWorld(new THREE.Vector3(12,0,-32)),direction=new THREE.Vector3(0,0,-1).transformDirection(a.matrixWorld);assert.ok(closeStationBuildingShell(a,'props/1-88-4.glb',[{x:entrance.x,z:entrance.z}]));
 for(const local of[new THREE.Vector3(-25,20,0),new THREE.Vector3(12,90,4)]){const hit=cast(a,a.localToWorld(local.clone()),direction)[0];assert.ok(hit);if(local.y<78)assert.ok(Math.abs(a.worldToLocal(hit.point.clone()).z+32)<.1);}
 assert.equal(template.getObjectByName('station-building-shell'),undefined);assert.equal(b.getObjectByName('station-building-shell'),undefined);assert.equal(closeStationBuildingShell(b,'props/0-88-4.glb'),null);assert.equal(closeStationBuildingShell(b,'props/1-256-11.glb'),null);
});

test('generated station cladding uses painted native atlas texels, including every alpha channel',async()=>{
 const root=await asset('1-88-4.glb');assert.ok(closeStationBuildingShell(root,'props/1-88-4.glb'));let count=0;
 for(const mesh of meshes(root.getObjectByName('station-building-shell')!)){const material=mesh.material as THREE.MeshBasicMaterial,map=material.map!,pixels=map.image as{data:Uint8Array;width:number;height:number},uv=mesh.geometry.getAttribute('uv');
  for(let i=0;i<uv.count;i+=3)for(let u=0;u<=8;u++)for(let v=0;v<=8-u;v++){const a=u/8,b=v/8,c=1-a-b,p=new THREE.Vector2(uv.getX(i)*a+uv.getX(i+1)*b+uv.getX(i+2)*c,uv.getY(i)*a+uv.getY(i+1)*b+uv.getY(i+2)*c);map.transformUv(p);const x=Math.min(pixels.width-1,Math.floor(p.x*pixels.width)),y=Math.min(pixels.height-1,Math.floor(p.y*pixels.height)),alpha=pixels.data[(y*pixels.width+x)*4+3];assert.equal(alpha,255,`${material.name} at ${x},${y}`);count++;}
 }assert.ok(count>5000);
});
