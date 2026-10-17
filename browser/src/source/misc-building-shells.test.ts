import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {closeBuildingBack,originalMaterial,repairOriginalAsset} from './render-repair.ts';
import {closeMiscBuildingShell,MISC_BUILDING_MODELS} from './misc-building-shells.ts';
const source=new URL('../../public/source/props/',import.meta.url);
function geometryGLB(bytes:Buffer):ArrayBuffer{const n=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+n).toString());delete json.images;delete json.textures;delete json.samplers;for(const m of json.materials||[])delete m.pbrMetallicRoughness?.baseColorTexture;let encoded=JSON.stringify(json);encoded+=' '.repeat((4-Buffer.byteLength(encoded)%4)%4);const b=Buffer.from(encoded),out=Buffer.concat([bytes.subarray(0,20),b,bytes.subarray(20+n)]);out.writeUInt32LE(out.length,8);out.writeUInt32LE(b.length,12);return out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength)as ArrayBuffer;}
function png(bytes:Buffer){
 let width=0,height=0;const compressed:Buffer[]=[];for(let offset=8;offset<bytes.length;){const size=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8),data=bytes.subarray(offset+8,offset+8+size);offset+=size+12;if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);assert.equal(data[8],8);assert.equal(data[9],6);assert.equal(data[12],0);}if(type==='IDAT')compressed.push(data);}
 const raw=inflateSync(Buffer.concat(compressed)),stride=width*4,data=new Uint8Array(stride*height);let offset=0;const paeth=(a:number,b:number,c:number)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++){const filter=raw[offset++];assert.ok(filter<=4);for(let x=0;x<stride;x++){const left=x>=4?data[y*stride+x-4]:0,up=y?data[(y-1)*stride+x]:0,corner=y&&x>=4?data[(y-1)*stride+x-4]:0;data[y*stride+x]=(raw[offset++]+[0,left,up,Math.floor((left+up)/2),paeth(left,up,corner)][filter])&255;}}return{data,width,height};
}
async function asset(file:string){const bytes=await readFile(new URL(file,source)),length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length).toString()),binary=bytes.subarray(28+length),images=json.images.map((image:any)=>{const view=json.bufferViews[image.bufferView];return png(image.uri?Buffer.from(image.uri.split(',')[1],'base64'):binary.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength));}),textures=json.textures.map((texture:any)=>{const image=images[texture.source],map=new THREE.DataTexture(image.data,image.width,image.height),sampler=json.samplers[texture.sampler],wrap=(value:number)=>value===33071?THREE.ClampToEdgeWrapping:value===33648?THREE.MirroredRepeatWrapping:THREE.RepeatWrapping;map.flipY=false;map.wrapS=wrap(sampler.wrapS);map.wrapT=wrap(sampler.wrapT);return map;}),byName=new Map(json.materials.map((m:any)=>[m.name,m.pbrMetallicRoughness?.baseColorTexture?textures[m.pbrMetallicRoughness.baseColorTexture.index]:null])),gltf=await new GLTFLoader().parseAsync(geometryGLB(bytes),'');gltf.scene.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const convert=(m:THREE.Material)=>{const material=originalMaterial(m as THREE.MeshStandardMaterial);material.map=byName.get(m.name) as THREE.Texture;return material;};o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);});repairOriginalAsset(gltf.scene,true);return gltf.scene;}
function meshes(root:THREE.Object3D){const result:THREE.Mesh[]=[];root.traverseVisible(o=>{if(o instanceof THREE.Mesh)result.push(o);});return result;}
function cast(root:THREE.Object3D,origin:THREE.Vector3,direction:THREE.Vector3,nativeOnly=false){root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);return new THREE.Raycaster(origin,direction.clone().normalize()).intersectObjects(meshes(root).filter(m=>!nativeOnly||!m.name.startsWith('3d-')&&m.name!=='entrance-rear-wall'&&!m.name.startsWith('misc-building-')),false).filter(hit=>{const object=hit.object as THREE.Mesh,material=(Array.isArray(object.material)?object.material[hit.face?.materialIndex??0]:object.material) as THREE.MeshBasicMaterial;if(/kage|shadow/.test(material.name)||material.opacity<.5)return false;const map=material.map;if(!map||!hit.uv||!material.transparent&&!material.alphaTest)return true;const p=hit.uv.clone();map.transformUv(p);const image=map.image as{data:Uint8Array;width:number;height:number};const x=Math.max(0,Math.min(image.width-1,Math.floor(p.x*image.width))),y=Math.max(0,Math.min(image.height-1,Math.floor(p.y*image.height)));return image.data[(y*image.width+x)*4+3]/255>=Math.max(material.alphaTest,.5);});}

const cases=[{file:'1-290-10.glb',x:-8,y:12},{file:'1-290-12.glb',x:-8,y:12},{file:'1-339-13.glb',x:-8,y:12},{file:'1-339-14.glb',x:-8,y:12},{file:'1-264-90.glb',x:22,y:25},{file:'1-89-4.glb',x:0,y:20},{file:'1-275-93.glb',x:0,y:15},{file:'1-174-18.glb',x:0,y:40},{file:'1-314-17.glb',x:0,y:20}];
test('both underground exit contexts share the exact measured stairhead structure and native map',async()=>{
 const structural=(root:THREE.Object3D)=>{root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const result:number[][]=[];for(const mesh of meshes(root).filter(m=>!m.name.startsWith('3d-'))){const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material],g=mesh.geometry,p=g.getAttribute('position'),uv=g.getAttribute('uv'),index=g.index;for(const group of g.groups.length?g.groups:[{start:0,count:index?.count??p.count,materialIndex:0}]){const material=materials[group.materialIndex??0]as THREE.MeshBasicMaterial;if(material.name!=='ko_chika_a')continue;for(let at=group.start;at<group.start+group.count;at++){const i=index?index.getX(at):at;result.push([...mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).toArray(),uv.getX(i),uv.getY(i)]);}}}return result;};
 const template=await asset('1-290-10.glb'),signature=structural(template),map=meshes(template).flatMap(m=>Array.isArray(m.material)?m.material:[m.material]).find(m=>m.name==='ko_chika_a')as THREE.MeshBasicMaterial;assert.equal(signature.length,309);
 for(const file of['1-339-13.glb','1-339-14.glb']){const root=await asset(file);assert.deepEqual(structural(root),signature);const material=meshes(root).flatMap(m=>Array.isArray(m.material)?m.material:[m.material]).find(m=>m.name==='ko_chika_a')as THREE.MeshBasicMaterial;assert.deepEqual(material.map!.image,map.map!.image);const result=closeMiscBuildingShell(root,'props/'+file);assert.ok(result);assert.equal(result.family,'underground-stairhead');for(const x of[-29,-15,0,12,23])for(const y of[3,10,14]){const hit=cast(root,new THREE.Vector3(x,y,-100),new THREE.Vector3(0,0,1))[0];assert.ok(hit,file+' rear');assert.ok(Math.abs(hit.point.z+16)<.01);}}
});
test('the native opaque gray mullion under the Wi-Fi annex dish remains a painted wall',async()=>{
 const root=await asset('1-89-4.glb'),rays=[20,40].map(y=>new THREE.Vector3(-140,y,-20)),before=rays.map(p=>cast(root,p,new THREE.Vector3(1,0,0),true)[0]);assert.ok(closeMiscBuildingShell(root,'props/1-89-4.glb'));
 rays.forEach((p,i)=>{const hit=cast(root,p,new THREE.Vector3(1,0,0))[0];assert.ok(hit&&hit.object===before[i]?.object);assert.ok(Math.abs(hit.point.x+81.59375)<1e-5);const material=(hit.object as THREE.Mesh).material as THREE.MeshBasicMaterial;assert.equal(material.name,'lambert7');const map=material.map!,uv=hit.uv!.clone();map.transformUv(uv);const image=map.image as{data:Uint8Array;width:number;height:number},x=Math.min(image.width-1,Math.floor(uv.x*image.width)),y=Math.min(image.height-1,Math.floor(uv.y*image.height));assert.deepEqual(Array.from(image.data.slice((y*image.width+x)*4,(y*image.width+x)*4+4)),[66,66,66,255]);});
});
test('all six measured miscellaneous families preserve their native front and use clone-owned resources',async()=>{
 for(const{file,x,y}of cases){
  const root=await asset(file),original=meshes(root).filter(m=>!m.name.startsWith('3d-')),geometries=original.map(m=>m.geometry),materials=original.flatMap(m=>Array.isArray(m.material)?m.material:[m.material]),states=materials.map(m=>({side:m.side,transparent:m.transparent,opacity:m.opacity,alphaTest:m.alphaTest})),maps=new Set(materials.map(m=>(m as THREE.MeshBasicMaterial).map)),before=cast(root,new THREE.Vector3(x,y,250),new THREE.Vector3(0,0,-1),true)[0];
  const result=closeMiscBuildingShell(root,'props/'+file);assert.ok(result,file+' measured profile');assert.equal(closeMiscBuildingShell(root,'props/'+file),result);const after=cast(root,new THREE.Vector3(x,y,250),new THREE.Vector3(0,0,-1))[0];assert.ok(after?.object===before?.object,file+' native front identity');if(after&&before)assert.ok(after.point.distanceTo(before.point)<1e-4);
  original.forEach((m,i)=>{assert.ok(m.geometry===geometries[i]);assert.equal(m.visible,true);});materials.forEach((m,i)=>assert.deepEqual({side:m.side,transparent:m.transparent,opacity:m.opacity,alphaTest:m.alphaTest},states[i]));
  for(const mesh of meshes(root.getObjectByName('misc-building-shell')!)){const material=mesh.material as THREE.MeshBasicMaterial;assert.ok(!materials.includes(material));assert.ok(maps.has(material.map));assert.equal(material.side,THREE.DoubleSide);assert.equal(material.alphaTest,0);assert.equal(material.transparent,false);for(const name of['position','normal','uv','color'])assert.ok(Array.from(mesh.geometry.getAttribute(name).array).every(Number.isFinite),file+' '+name);}
 }
});
test('the asymmetric stairhead and penthouse receive continuous native rear profiles without reflected doors',async()=>{
 for(const[file,rear,xs,ys]of [['1-290-10.glb',-16,[-29,-16,0,12,22],[2.1,8,14]],['1-275-93.glb',-32,[-39,-20,0,20,39],[2.1,7,12,25,31,37]]] as const){const root=await asset(file);assert.ok(closeMiscBuildingShell(root,'props/'+file));for(const x of xs)for(const y of ys){const hit=cast(root,new THREE.Vector3(x,y,-150),new THREE.Vector3(0,0,1))[0];assert.ok(hit,`${file} rear ${x},${y}`);assert.ok((Math.abs(hit.point.z-rear)<.1||file.includes("275")&&hit.point.z<=rear&&hit.point.z>=rear-4.1),`${file} measured rear ${x},${y} ${hit.point.z}`);}}
 const penthouse=await asset('1-275-93.glb');assert.ok(closeMiscBuildingShell(penthouse,'props/1-275-93.glb'));for(const x of[-35,-15,5,20,35])for(const y of[39,44,49]){const top=x<=11?50:50-(x-11)*12/29;if(y>top)continue;assert.ok(cast(penthouse,new THREE.Vector3(x,y,0),new THREE.Vector3(.05,.01,-1)).length,'upper rear under native roof '+x+','+y);}
});
test('the Wi-Fi tower uses measured stepped window bands and preserves its antenna silhouette',async()=>{
 const root=await asset('1-89-4.glb');assert.ok(closeMiscBuildingShell(root,'props/1-89-4.glb'));
 for(const[y,width]of [[5,63],[20,59],[50,59],[65,59],[75,47],[90,49],[110,49],[122,51],[140,43],[155,43],[165,45]])for(const x of[-width,-20,0,20,width]){
  const hit=cast(root,new THREE.Vector3(x,y,-150),new THREE.Vector3(0,0,1))[0];assert.ok(hit,`Wi-Fi rear ${x},${y}`);assert.ok(hit.point.z<-50,'rear window must hide the entrance');
 }
 assert.ok(new THREE.Box3().setFromObject(root.getObjectByName('misc-building-shell')!).max.y<172,'341-unit antenna must not set envelope height');
});
test('the native tent keeps its wide east approach and gains only the omitted polygonal rear perimeter',async()=>{
 const root=await asset('1-264-90.glb'),result=closeMiscBuildingShell(root,'props/1-264-90.glb',[{x:64,z:16,axis:0,sign:1},{x:64,z:32,axis:0,sign:1},{x:128,z:16,axis:0,sign:1,passageOnly:true}]);assert.ok(result);const shell=root.getObjectByName('misc-building-shell')!;
 for(const z of[9,16,24,32,39])for(const y of[5,20,40,70,80]){const ray=new THREE.Raycaster(new THREE.Vector3(140,y,z),new THREE.Vector3(-1,0,0),0,76);assert.equal(ray.intersectObjects(meshes(shell),false).length,0,`actual east approach ${z},${y}`);}
 for(const x of[-60,-30,0,30,60,100])for(const y of[5,25,55,80]){const hit=cast(root,new THREE.Vector3(x,y,-10),new THREE.Vector3(0,0,-1))[0];assert.ok(hit,`tent rear ${x},${y}`);assert.ok(hit.point.z<-40,'only omitted rear perimeter is enclosed');}
 for(const x of[-25,20,65])assert.ok(cast(root,new THREE.Vector3(x,90,-60),new THREE.Vector3(0,.2,-1)).length,'roof-to-cornice seam closes below sloping native cone');
});
test('the produce stall remains exactly open, with its native striped canopy and produce unchanged',async()=>{
 const root=await asset('1-174-18.glb'),origins=[new THREE.Vector3(0,20,-100),new THREE.Vector3(0,38,-100),new THREE.Vector3(0,44,-100),new THREE.Vector3(-20,20,-100),new THREE.Vector3(20,20,-100)],before=origins.map(p=>cast(root,p,new THREE.Vector3(0,0,1),true)[0]);const result=closeMiscBuildingShell(root,'props/1-174-18.glb');assert.ok(result);assert.equal(result.triangles,0);
 origins.forEach((p,i)=>{const after=cast(root,p,new THREE.Vector3(0,0,1))[0];assert.ok(after?.object===before[i]?.object,'stall source profile '+p.toArray());if(after&&before[i])assert.ok(after.point.distanceTo(before[i]!.point)<1e-4);});for(const mesh of meshes(root))assert.ok(!mesh.name.startsWith('3d-'));
});
test('Oak Lab removes the generated door ghost at the rear foundation with native foundation and brick',async()=>{
 const root=await asset('1-314-17.glb');closeBuildingBack(root,[{x:0,z:23,axis:2,sign:1}]);assert.ok(closeMiscBuildingShell(root,'props/1-314-17.glb'));
 for(const y of[2.1,4,7,9,15,27]){const hit=cast(root,new THREE.Vector3(0,y,-100),new THREE.Vector3(0,0,1))[0];assert.ok(hit);assert.ok(hit.object.name.startsWith('misc-building-'));assert.ok(Math.abs(hit.point.z+28.03)<.02);assert.notEqual(((hit.object as THREE.Mesh).material as THREE.Material).name,'h_in');}
});
test('native local profiles survive placed SkinnedMesh transforms and bounded rear passage cuts',async()=>{
 for(const file of['1-290-10.glb','1-275-93.glb','1-89-4.glb']){const template=await asset(file),root=clone(template),other=clone(template),parent=new THREE.Group();parent.position.set(40,8,-20);parent.rotation.y=.2;root.rotation.y=.8;root.position.set(-2,3,4);root.scale.set(.05,.07,.04);parent.add(root);assert.ok(closeMiscBuildingShell(root,'props/'+file));const origin=root.localToWorld(new THREE.Vector3(0,12,0)),direction=new THREE.Vector3(0,0,-1).transformDirection(root.matrixWorld);assert.ok(cast(root,origin,direction).length);assert.equal(template.getObjectByName('misc-building-shell'),undefined);assert.equal(other.getObjectByName('misc-building-shell'),undefined);}
 const root=await asset('1-275-93.glb'),result=closeMiscBuildingShell(root,'props/1-275-93.glb',[{x:0,z:-32,axis:2,sign:-1},{x:400,z:-32,axis:2,sign:-1}]);assert.ok(result);assert.equal(result.passages,1);const shell=root.getObjectByName('misc-building-shell')!;for(const y of[5,15,30])assert.equal(cast(shell,new THREE.Vector3(0,y,-100),new THREE.Vector3(0,0,1)).length,0);assert.ok(cast(shell,new THREE.Vector3(25,15,-100),new THREE.Vector3(0,0,1)).length);assert.equal(closeMiscBuildingShell(await asset('1-275-93.glb'),'props/0-275-93.glb'),null);
});
test('all new opaque miscellaneous cladding samples painted native PNG pixels',async()=>{
 let count=0;
 for(const{file}of cases){const root=await asset(file);assert.ok(closeMiscBuildingShell(root,'props/'+file));for(const mesh of meshes(root.getObjectByName('misc-building-shell')!)){const material=mesh.material as THREE.MeshBasicMaterial,map=material.map!,pixels=map.image as{data:Uint8Array;width:number;height:number},uv=mesh.geometry.getAttribute('uv');for(let i=0;i<uv.count;i+=3)for(let u=0;u<=8;u++)for(let v=0;v<=8-u;v++){const a=u/8,b=v/8,c=1-a-b,p=new THREE.Vector2(uv.getX(i)*a+uv.getX(i+1)*b+uv.getX(i+2)*c,uv.getY(i)*a+uv.getY(i+1)*b+uv.getY(i+2)*c);map.transformUv(p);const x=Math.min(pixels.width-1,Math.floor(p.x*pixels.width)),y=Math.min(pixels.height-1,Math.floor(p.y*pixels.height));assert.ok(pixels.data[(y*pixels.width+x)*4+3]>=(material.name==='lambert7'?128:250),`${file} ${material.name} native alpha ${x},${y}: ${pixels.data[(y*pixels.width+x)*4+3]}`);count++;}}}assert.ok(count>6000);
});
test('confirmed oblique rear roof and tier seam rays close on the native penthouse eave and Wi-Fi deck',async()=>{
 const penthouse=await asset('1-275-93.glb');assert.ok(closeMiscBuildingShell(penthouse,'props/1-275-93.glb'));
 for(const[origin,direction]of [
  [[0,43.25,-3.4228515625],[.7071067811865476,0,-.7071067811865475]],
  [[0,43.25,10.86572265625],[.5555702330196022,0,-.8314696123025453]],
  [[20.82421875,43.25,-17.71142578125],[.5555702330196022,0,-.8314696123025453]],
  [[20.82421875,43.25,-17.71142578125],[-.3495987113522071,.40673664307580015,-.8440059503346556]],
  [[20.82421875,43.25,-3.4228515625],[0,.13917310096006544,-.9902680687415704]],
  [[20.82421875,27.78125,10.86572265625],[0,.40673664307580015,-.9135454576426009]],
 ])assert.ok(cast(penthouse,new THREE.Vector3(...origin as[number,number,number]),new THREE.Vector3(...direction as[number,number,number])).length,'confirmed native eave seam '+origin);
 const tower=await asset('1-89-4.glb');assert.ok(closeMiscBuildingShell(tower,'props/1-89-4.glb'));for(const y of[63.5,64.5])assert.ok(cast(tower,new THREE.Vector3(-47.6015625,y,-35.99609375),new THREE.Vector3(.9148884004098168,.13917310096006544,-.37895918350757274)).length,'72.5-unit setback deck '+y);
});
test('the actual tent placement closes all seven above-lintel escapes while preserving its native Y81 porch',async()=>{
 const root=await asset('1-264-90.glb');root.position.set(15.5,1,33.5);root.scale.setScalar(1/16);assert.ok(closeMiscBuildingShell(root,'props/1-264-90.glb',[{x:19.5,z:34.5,axis:0,sign:1},{x:19.5,z:35.5,axis:0,sign:1},{x:23.5,z:34.5,axis:0,sign:1,passageOnly:true}]));
 for(const[origin,direction]of [
  [[13.0355224609375,2.158012995403923,35.805419921875],[.9135454576426009,.40673664307580015,0]],
  [[13.0355224609375,5.2980481707259806,35.805419921875],[.9902680687415704,.13917310096006544,0]],
  [[16.583251953125,3.7280305830649523,35.805419921875],[.9135454576426009,.40673664307580015,0]],
  [[16.583251953125,5.2980481707259806,35.805419921875],[.9902680687415704,.13917310096006544,0]],
  [[16.583251953125,3.7280305830649523,38.6527099609375],[.8440059503346556,.40673664307580015,-.3495987113522072]],
  [[16.583251953125,5.2980481707259806,38.6527099609375],[.9148884004098168,.13917310096006544,-.37895918350757274]],
  [[20.1309814453125,5.2980481707259806,35.805419921875],[.9135454576426009,.40673664307580015,0]],
 ])assert.ok(cast(root,new THREE.Vector3(...origin as[number,number,number]),new THREE.Vector3(...direction as[number,number,number])).length,'confirmed main-cone header '+origin);
});
test('Oak Lab closes its omitted raised rear fascia and bevel returns at the actual dense witnesses',async()=>{
 const root=await asset('1-314-17.glb');root.position.set(1045.5,1,372);root.scale.setScalar(1/16);closeBuildingBack(root,[{x:1045.5,z:373.5,axis:2,sign:1}]);assert.ok(closeMiscBuildingShell(root,'props/1-314-17.glb'));
 for(const x of[-26,0,26])for(const sign of[-1,1])for(const dy of[-.01,0,.01]){
  const local=new THREE.Vector3(x,45.2+dy,-15.25),direction=new THREE.Vector3(sign*.8056751650438592,.40673664307580015,-.43064234767493476),hit=cast(root,root.localToWorld(local),direction.transformDirection(root.matrixWorld))[0];assert.ok(hit,'native rear fascia witness '+x+','+sign+','+dy);assert.equal(hit.object.name,'misc-building-oak-laboratory-cladding');assert.equal(((hit.object as THREE.Mesh).material as THREE.Material).name,'mt_okl04');
  const point=root.worldToLocal(hit.point.clone());assert.ok(point.y>=52&&point.y<=64);assert.ok(Math.abs(point.z+32)<1e-5||Math.abs(Math.abs(point.x)-point.z-84)<1e-5,'hit actual rear plane or measured bevel');
 }
});
test('the tent joins native window-frame tops to the cornice without covering glazing or the east porch',async()=>{
 const root=await asset('1-264-90.glb'),origin=new THREE.Vector3(74.095703125,68.76877073161569,36.88671875),directions=[new THREE.Vector3(.1931917164130824,.13917310096006544,.9712403454750665),new THREE.Vector3(-.09706324425772538,.13917310096006544,.985499657322784)],native=cast(root,new THREE.Vector3(origin.x,50,origin.z),new THREE.Vector3(0,0,1),true)[0];assert.ok(native);assert.equal(((native.object as THREE.Mesh).material as THREE.Material).name,'h_mado_lm3');
 assert.ok(closeMiscBuildingShell(root,'props/1-264-90.glb',[{x:64,z:16,axis:0,sign:1},{x:64,z:32,axis:0,sign:1},{x:128,z:16,axis:0,sign:1,passageOnly:true}]));
 for(const direction of directions)for(const dx of[-.01,0,.01]){const hit=cast(root,origin.clone().add(new THREE.Vector3(dx,0,0)),direction)[0];assert.ok(hit,'native front cornice join '+direction.toArray());assert.equal(hit.object.name,'misc-building-pokeathlon-tent-cladding');assert.equal(((hit.object as THREE.Mesh).material as THREE.Material).name,'d32_s02b_lm2');assert.ok(hit.point.y>=73.078125&&hit.point.y<=78);assert.ok(hit.point.z>45.1640625,'closure is outside the native east porch');}
 const after=cast(root,new THREE.Vector3(origin.x,50,origin.z),new THREE.Vector3(0,0,1))[0];assert.equal(after.object,native.object);assert.ok(after.point.distanceTo(native.point)<1e-8,'native glazing first hit is unchanged');
 const shell=root.getObjectByName('misc-building-shell')!;for(const z of[9,16,24,32,39])for(const y of[50,70,80])assert.equal(new THREE.Raycaster(new THREE.Vector3(140,y,z),new THREE.Vector3(-1,0,0),0,76).intersectObjects(meshes(shell),false).length,0,'native approach remains open');
});
