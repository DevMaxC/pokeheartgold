import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {originalMaterial,repairOriginalAsset,closeBuildingBack} from './render-repair.ts';
import {closeSpecialBuildingShell} from './special-building-shells.ts';

const root=new URL('../../public/source/props/',import.meta.url);
const near=(a:number,b:number)=>Math.abs(a-b)<1e-5;
function geometryGLB(bytes:Buffer){
  const n=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+n).toString());delete json.images;delete json.textures;delete json.samplers;
  for(const material of json.materials||[]){delete material.pbrMetallicRoughness?.baseColorTexture;delete material.pbrMetallicRoughness?.metallicRoughnessTexture;delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;}
  let encoded=JSON.stringify(json);encoded+=' '.repeat((4-Buffer.byteLength(encoded)%4)%4);const buffer=Buffer.from(encoded),result=Buffer.alloc(20+buffer.length+bytes.length-20-n);bytes.copy(result,0,0,20);result.writeUInt32LE(result.length,8);result.writeUInt32LE(buffer.length,12);buffer.copy(result,20);bytes.copy(result,20+buffer.length,20+n);return result.buffer.slice(result.byteOffset,result.byteOffset+result.byteLength) as ArrayBuffer;
}
async function load(file:string){const gltf=await new GLTFLoader().parseAsync(geometryGLB(await readFile(new URL(file,root))),'');gltf.scene.traverse(object=>{if(object instanceof THREE.Mesh)object.material=Array.isArray(object.material)?object.material.map(material=>originalMaterial(material as THREE.MeshStandardMaterial)):originalMaterial(object.material as THREE.MeshStandardMaterial);});repairOriginalAsset(gltf.scene,true);return gltf.scene;}
function visibleMeshes(root:THREE.Object3D){const meshes:THREE.Mesh[]=[];root.traverseVisible(object=>{if(object instanceof THREE.Mesh)meshes.push(object);});return meshes;}
const ray=(meshes:THREE.Mesh[],origin:THREE.Vector3,direction:THREE.Vector3)=>new THREE.Raycaster(origin,direction.normalize()).intersectObjects(meshes,false)[0];

test('every native Center and Mart variant has a complete rear, joined roof, and unchanged front',async t=>{
  const ids=new Set([1,2,39,40,62,63]),files=(await readdir(root)).filter(file=>file.startsWith('1-')&&ids.has(Number(file.split('-')[1])));let rays=0;
  for(const file of files){
    const scene=await load(file),family=[2,40,62].includes(Number(file.split('-')[1]))?'center':'mart';scene.updateMatrixWorld(true);
    const frontSamples=(family==='center'?[-34,-24,-8,0,8,24,34]:[-28,-20,-8,0,8,20,30]).flatMap(x=>[6,16,26,36,44].map(y=>new THREE.Vector3(x,y,100)));
    const before=frontSamples.map(origin=>ray(visibleMeshes(scene),origin,new THREE.Vector3(0,0,-1)));
    // Reproduce the old placed repair first; its generic source mirror must not
    // remain visible over the measured replacement shell.
    closeBuildingBack(scene,[{x:0,z:family==='center'?26:13,axis:2,sign:1}]);
    assert.ok(closeSpecialBuildingShell(scene,'props/'+file)>0,file);assert.equal(closeSpecialBuildingShell(scene,'props/'+file),0,file+' idempotence');scene.updateMatrixWorld(true);const meshes=visibleMeshes(scene);
    frontSamples.forEach((origin,i)=>{const after=ray(meshes,origin,new THREE.Vector3(0,0,-1));assert.equal(after?.object,before[i]?.object,file+' front source mesh');if(after&&before[i])assert.ok(Math.abs(after.distance-before[i]!.distance)<1e-5,file+' front geometry stays fixed');});
    const levels=family==='center'?[5,16,28,36,44]:[5,16,26,30,36];
    for(const x of [-7,0,7])for(const z of [-16,-4,6])for(const y of levels)for(let angle=0;angle<360;angle+=5){
      const direction=new THREE.Vector3(Math.cos(angle*Math.PI/180),0,Math.sin(angle*Math.PI/180));
      const hit=ray(meshes,new THREE.Vector3(x,y,z),direction),frontX=x+direction.x*(13-z)/direction.z;
      // The Mart's real recessed front doorway is the one permitted escape.
      const door=family==='mart'&&direction.z>0&&y<28&&frontX>=-20&&frontX<=2;
      assert.ok(hit||door,`${file} inside escape ${x},${y},${z}, angle ${angle}`);rays++;
    }
    // Direct outside rear rays must hit the rear shell, not a front door seen
    // through the whole building, including the center's projecting ward.
    for(const x of family==='center'?[-34,-24,-10,0,10,24,34]:[-28,-18,-8,0,8,18,30])for(const y of levels){const hit=ray(meshes,new THREE.Vector3(x,y,-100),new THREE.Vector3(0,0,1));assert.ok(hit&&hit.point.z<0,`${file} rear at ${x},${y}`);rays++;}
    for(const [x,z]of family==='center'?[[-28,-25],[0,-29],[28,-25]]:[[-20,-25],[1,-25],[22,-25]]){const hit=ray(meshes,new THREE.Vector3(x,120,z),new THREE.Vector3(0,-1,0));assert.ok(hit&&hit.point.y>(family==='center'?45:39),`${file} roof closes over rear ${x},${z}`);rays++;}
    scene.getObjectByName('special-building-shell')!.traverse(object=>{if(!(object instanceof THREE.Mesh))return;const material=object.material as THREE.MeshBasicMaterial;assert.equal(material.transparent,false);assert.equal(material.alphaTest,0);assert.equal(material.opacity,1);
      if(family==='center'&&material.name==='gs_pc_a'){const position=object.geometry.getAttribute('position'),uv=object.geometry.getAttribute('uv');for(let i=0;i<position.count;i++)if(near(position.getY(i),2)&&position.getZ(i)<-20){assert.ok(uv.getX(i)>=-.427735&&uv.getX(i)<=-.412108,file+' rear base samples the exact native side band, not extrapolated adjacent atlas art');assert.ok(near(uv.getY(i),1.984375));}}
    });
  }
  assert.ok(files.length>=30);t.diagnostic(`Checked all ${files.length} Center/Mart GLB variants using ${rays} interior/rear/roof rays and front-surface identity comparisons.`);
});

test('placed special shells respect rotation and nonuniform scale without mutating shared templates',async()=>{
  const template=await load('1-40-0.glb'),first=clone(template),second=clone(template),parent=new THREE.Group();parent.position.set(21,8,-19);parent.rotation.y=.53;parent.scale.set(1.2,.9,.8);parent.add(first,second);first.scale.set(.0625,.071,.055);first.rotation.y=-.31;first.position.set(3,2,1);parent.updateMatrixWorld(true);
  const originalGeometries:THREE.BufferGeometry[]=[];template.traverse(object=>{if(object instanceof THREE.Mesh)originalGeometries.push(object.geometry);});const arrays=originalGeometries.map(geometry=>Array.from(geometry.getAttribute('position').array));
  assert.ok(closeSpecialBuildingShell(first,'props/1-40-0.glb')>0);parent.updateMatrixWorld(true);const meshes=visibleMeshes(first);
  for(const x of [-25,0,25])for(const y of [10,25,40]){const origin=new THREE.Vector3(x,y,-100).applyMatrix4(first.matrixWorld),direction=new THREE.Vector3(0,0,1).transformDirection(first.matrixWorld),hit=ray(meshes,origin,direction);assert.ok(hit);assert.ok(hit.point.clone().applyMatrix4(first.matrixWorld.clone().invert()).z<0);}
  assert.equal(second.getObjectByName('special-building-shell'),undefined);assert.equal(template.getObjectByName('special-building-shell'),undefined);originalGeometries.forEach((geometry,i)=>assert.deepEqual(Array.from(geometry.getAttribute('position').array),arrays[i]));
  assert.ok(visibleMeshes(second).some(mesh=>mesh.name==='3d-rear-facade'),'other clone keeps its independent visibility');
});

test('oblique interior rays cannot escape through Center or Mart roof/eave seams',async()=>{
  for(const [file,family]of [['1-40-0.glb','center'],['1-39-0.glb','mart']] as const){
    const scene=await load(file);assert.ok(closeSpecialBuildingShell(scene,'props/'+file)>0);scene.updateMatrixWorld(true);const meshes=visibleMeshes(scene);
    for(const x of [-19.5,0,19.5])for(const z of [-20,-8,4])for(const y of [10,24])for(const pitch of [15,30,45,60,75,90])for(let yaw=0;yaw<360;yaw+=15){
      const elevation=pitch*Math.PI/180,angle=yaw*Math.PI/180,direction=new THREE.Vector3(Math.cos(elevation)*Math.cos(angle),Math.sin(elevation),Math.cos(elevation)*Math.sin(angle)),origin=new THREE.Vector3(x,y,z),hit=ray(meshes,origin,direction);
      const front=family==='mart'?13:26,distance=(front-z)/direction.z,frontX=x+direction.x*distance,frontY=y+direction.y*distance;
      const door=direction.z>0&&frontY<=(family==='mart'?28:32)+1e-5&&frontX>=(family==='mart'?-20:-10)-1e-5&&frontX<=(family==='mart'?2:10)+1e-5;
      assert.ok(hit||door,`${file} upper escape from ${origin.toArray()} at yaw ${yaw}, pitch ${pitch}`);
    }
  }
  // Exact native split-edge ray from the independent world-placement audit.
  // Use the game's mesh-local ray casting, retaining sin(pi)'s tiny x term.
  for(const translated of [false,true]){const scene=await load('1-40-0.glb');if(translated){scene.scale.setScalar(1/16);scene.position.set(564.5,1,390);}assert.ok(closeSpecialBuildingShell(scene,'props/1-40-0.glb')>0);scene.updateMatrixWorld(true);const point=new THREE.Vector3(0,24,-14.427734375).applyMatrix4(scene.matrixWorld),direction=new THREE.Vector3(3.7843667304341506e-17,.9510565162951535,-.30901699437494745).transformDirection(scene.matrixWorld);assert.ok(ray(visibleMeshes(scene),point,direction),'Center rear roof seam at native split x=0; translated='+translated);}
});

test('gates and a special model with a genuine opposite exit keep their passages',async()=>{
  const gate=await load('1-35-0.glb');assert.equal(closeSpecialBuildingShell(gate,'props/1-35-0.glb'),0);assert.equal(gate.getObjectByName('special-building-shell'),undefined);
  const center=await load('1-40-0.glb');center.scale.setScalar(1/16);center.updateMatrixWorld(true);assert.equal(closeSpecialBuildingShell(center,'props/1-40-0.glb',[{x:0,z:-1.875,axis:2,sign:-1}]),0);assert.equal(center.getObjectByName('special-building-shell'),undefined);
  const rotated=await load('1-40-0.glb');rotated.scale.setScalar(1/16);rotated.rotation.y=Math.PI/2;rotated.position.set(8,0,14);rotated.updateMatrixWorld(true);assert.equal(closeSpecialBuildingShell(rotated,'props/1-40-0.glb',[{x:6.125,z:14,axis:0,sign:-1}]),0,'opposite exit follows placed rotation');
  const distant=await load('1-40-0.glb');distant.scale.setScalar(1/16);assert.ok(closeSpecialBuildingShell(distant,'props/1-40-0.glb',[{x:0,z:-200,axis:2,sign:-1}])>0,'a different building entrance elsewhere in the matrix is irrelevant');
});
