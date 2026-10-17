import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {backgroundCliffShell as currentBackgroundCliffShell,backgroundCliffWallMaterial,BACKGROUND_CLIFF_WALL_BAND,BACKGROUND_CLIFF_SHELL} from './background-cliff-shells.ts';
import {nativeTreeAsset,closedTreeGeometry} from './tree-fixture.test.ts';
import {repairOriginalAsset} from './render-repair.ts';
import {Terraces} from './ledges.ts';
import {terraceModel} from './terrace-model.ts';
import {OriginalWorld} from './world.ts';
import {fieldCameraObstacles} from './camera.ts';
import {terrainHeight,permissionWalkable} from './terrain.ts';
import {backgroundCliffPixelReference} from '../../scripts/background-cliff-pixel-reference.ts';
import {backgroundCliffBeforeWorld,backgroundCliffPreviousShell,withoutBackgroundCliffIntegration} from '../../scripts/background-cliff-test-support.ts';
import type {Cell,Land,Matrix,SourceMap} from './types.ts';

const source=new URL('../../public/source/',import.meta.url),json=async<T=any>(p:string):Promise<T>=>JSON.parse(await readFile(new URL(p,source),'utf8'));
const matrix=await json<Matrix>('matrices/0.json'),land=await json<Land>('lands/210.json'),forest=await json<Land>('lands/208.json'),terraces=new Terraces(await json('terraces/0.json')),background=await json<SourceMap>('maps/0.json'),doors=(await json('entrances.json'))[0];
const cells=[[21,10],[22,11],[23,11]].map(([x,z])=>background.cells.find(c=>c.x===x&&c.z===z)!);
const cache=new Map<string,Promise<THREE.Group>>();
function asset(path:string){if(!cache.has(path))cache.set(path,nativeTreeAsset(path).then(root=>{if(path!=='land/112-9.glb')repairOriginalAsset(root,path.startsWith('props/'));return root;}));return cache.get(path)!;}
async function placed(cell:Cell){const root=new THREE.Group(),model=clone(await asset(cell.asset));root.position.set(cell.x*32+16,cell.altitude*.5,cell.z*32+16);model.scale.setScalar(1/16);root.add(model);await terraceModel(root,terraces);root.updateMatrixWorld(true);return root;}
function meshes(root:THREE.Object3D){const out:THREE.Mesh[]=[];root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);root.traverseVisible(o=>{if(o instanceof THREE.Mesh&&!Array.isArray(o.material)&&!/(tree|flower|kage|shadow|egrass)/i.test(o.material.name))out.push(o);});return out;}
function buffers(root:THREE.Object3D){return meshes(root).filter(m=>m.name!==BACKGROUND_CLIFF_SHELL).map(m=>({name:m.name,geometry:m.geometry,material:m.material,attributes:Object.fromEntries(['position','uv','color','skinIndex','skinWeight'].map(k=>[k,m.geometry.getAttribute(k)?Array.from(m.geometry.getAttribute(k).array):null])),index:m.geometry.index?Array.from(m.geometry.index.array):null}));}
function first(objects:THREE.Object3D[],origin:THREE.Vector3,direction:THREE.Vector3,far=140){return new THREE.Raycaster(origin,direction.clone().normalize(),0,far).intersectObjects(objects,false)[0];}
const backgroundCliffShell=process.env.HG_BACKGROUND_CLIFF_OLD_ART==='1'?await backgroundCliffPreviousShell():currentBackgroundCliffShell;
const wallRoot=await asset('land/112-9.glb'),wallMaterial=backgroundCliffWallMaterial(wallRoot);assert.ok(wallMaterial);
const camera=new THREE.PerspectiveCamera(52,1280/800,.05,140);camera.position.set(695.5,6.96243845,410.47379292);camera.lookAt(695.5,1.9,398.5);camera.updateMatrixWorld(true);
function pixel(x:number,y:number){const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(x/1280*2-1,1-y/800*2),camera);return ray.ray;}

test('source pins retain the actual flat32-face background and current277bac field',async()=>{
 const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
 assert.equal(hash(await readFile(new URL('land/210-0.glb',source))),'ed5036caec6fdacdd3a463d3e6c6b542eb457b80aa1d885ae8a860d6f347bcab');
 assert.equal(hash(await readFile(new URL('terraces/0.json',source))),'277bac25178f99dfe3caa9ace134cf9097fbe5149e7e3733fb58f16ebfd87323');
 for(const cell of cells){const root=await placed(cell),before=buffers(root),shell=backgroundCliffShell(root,cell,matrix,land,forest,doors,terraces,wallRoot);assert.ok(shell,'actual current canonical placement must admit the intended production fix');root.add(shell);assert.deepEqual(buffers(root),before);assert.equal(shell.material.map,wallMaterial.map);assert.notEqual(shell.material,before[0].material);assert.equal(shell.material.side,THREE.DoubleSide);assert.equal(shell.material.alphaTest,0);assert.equal(shell.material.opacity,1);assert.equal(shell.material.vertexColors,wallMaterial.vertexColors);assert.equal(shell.userData.backgroundCliffAdaptation.notNativeSourceAuthority,true);}
});

test('measured native112 soil donor and every new UV stay inside one rim-free native band',async()=>{
 const sourceMesh:THREE.SkinnedMesh[]=[];wallRoot.traverse(o=>{if(o instanceof THREE.SkinnedMesh&&!Array.isArray(o.material)&&o.material===wallMaterial)sourceMesh.push(o);});assert.equal(sourceMesh.length,1);const donor=sourceMesh[0],g=donor.geometry,attributes=Object.fromEntries(Object.entries(g.attributes).map(([k,v])=>[k,Array.from(v.array)])),index=Array.from(g.index!.array),map=wallMaterial.map!,image=map.image as{width:number;height:number;data:Uint8Array};
 assert.deepEqual(BACKGROUND_CLIFF_WALL_BAND,{height:.8984375,uPerWorld:.5,topV:.09765625,bottomV:.39453125});assert.equal(map.flipY,false);
 for(let y=3;y<=12;y++)for(let x=0;x<32;x++)assert.equal(image.data[(y*32+x)*4+3],255,'every interior texel of the repeated soil band is opaque');
 for(const cell of cells){const root=await placed(cell),shell=backgroundCliffShell(root,cell,matrix,land,forest,doors,terraces,wallRoot)!;assert.ok(shell);assert.equal(shell.material.map===map,true,'wall cladding must use measured native112 soil, not the top-surface stone mosaic');assert.notEqual(shell.material,wallMaterial);assert.equal(shell.material.fog,wallMaterial.fog);assert.ok(shell.material.color.equals(wallMaterial.color));const uv=shell.geometry.getAttribute('uv'),color=shell.geometry.getAttribute('color');
  for(let i=0;i<uv.count;i++){assert.ok(uv.getY(i)>=25/256&&uv.getY(i)<=101/256);const point=new THREE.Vector2(uv.getX(i),uv.getY(i));map.transformUv(point);const yy=Math.floor(point.y*image.height),xx=Math.min(image.width-1,Math.floor(point.x*image.width));assert.ok(yy>=3&&yy<=12,'never sample a horizontal rim row');assert.equal(image.data[(yy*image.width+xx)*4+3],255);assert.equal(color.getX(i),1);assert.equal(color.getY(i),1);assert.equal(color.getZ(i),1);}
 }
 assert.deepEqual(Object.fromEntries(Object.entries(g.attributes).map(([k,v])=>[k,Array.from(v.array)])),attributes);assert.deepEqual(Array.from(g.index!.array),index);assert.equal(wallMaterial.map,map);
 const subset=new THREE.Group(),copy=donor.clone(false);copy.geometry=g.clone();subset.add(copy);assert.equal(backgroundCliffWallMaterial(subset),wallMaterial);const uv=copy.geometry.getAttribute('uv'),i=copy.geometry.index!.getX(158*3),before=uv.getY(i);uv.setY(i,before+1/256);assert.equal(backgroundCliffWallMaterial(subset),null);uv.setY(i,before);assert.equal(backgroundCliffWallMaterial(subset),wallMaterial);subset.scale.x=2;assert.equal(backgroundCliffWallMaterial(subset),null);subset.scale.x=1;subset.add(donor.clone(false));assert.equal(backgroundCliffWallMaterial(subset),null);copy.geometry.dispose();
 assert.equal(backgroundCliffWallMaterial(await asset('land/210-0.glb')),null);
});

test('future exact-cut slope is declined without a wedge while constant-cut cap remains closed',async()=>{
 const cell=cells[1],h=BACKGROUND_CLIFF_WALL_BAND.height;
 for(const sloped of[true,false]){const root=await placed(cell),cap=meshes(root)[0],p=cap.geometry.getAttribute('position'),future=Object.create(terraces)as Terraces;future.sample=(_tx:number,_tz:number,x:number,_z:number)=>2*h-cell.altitude*.5+(sloped?(x-cell.x*32)/256:0);
  for(let i=0;i<p.count;i++)p.setY(i,Math.fround(future.sample(0,0,cell.x*32+16+p.getX(i),0)));const shell=currentBackgroundCliffShell(root,cell,matrix,land,forest,doors,future,wallRoot);
  if(sloped){if(shell){shell.geometry.dispose();shell.material.dispose();}assert.equal(shell===null,true,'a nonconstant cap ending exactly at a band cut must not leave a missing wedge');}
  else{assert.ok(shell);const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([...p.array,...shell.geometry.getAttribute('position').array],3));closedTreeGeometry(geometry);geometry.dispose();shell.geometry.dispose();shell.material.dispose();}
 }
});

test('foreign clamped sampler is declined rather than stretching the repeated wall',()=>{
 let donor:THREE.SkinnedMesh|undefined;wallRoot.traverse(o=>{if(o instanceof THREE.SkinnedMesh&&o.material===wallMaterial)donor=o;});assert.ok(donor);const root=new THREE.Group(),copy=donor.clone(false),material=wallMaterial.clone(),map=wallMaterial.map!.clone();material.map=map;copy.material=material;root.add(copy);assert.equal(backgroundCliffWallMaterial(root),material);map.wrapS=THREE.ClampToEdgeWrapping;assert.equal(backgroundCliffWallMaterial(root)===null,true,'UV repetition requires the native repeat sampler');map.dispose();material.dispose();
});

test('future below-datum cap is declined instead of emitting an inverted unclosed volume',async()=>{
 const cell=cells[1],root=await placed(cell),p=meshes(root)[0].geometry.getAttribute('position'),future=Object.create(terraces)as Terraces;future.sample=()=>-BACKGROUND_CLIFF_WALL_BAND.height/2-cell.altitude*.5;
 for(let i=0;i<p.count;i++)p.setY(i,Math.fround(future.sample(0,0,0,0)));const shell=currentBackgroundCliffShell(root,cell,matrix,land,forest,doors,future,wallRoot);if(shell){shell.geometry.dispose();shell.material.dispose();}assert.equal(shell===null,true,'designed datum0 must not sit above a future native cap');
});

test('guard-only followup preserves every982 native-placement position/UV/color/material result',async()=>{
 const before=await backgroundCliffPreviousShell('982');for(const cell of cells){const root=await placed(cell),a=before(root,cell,matrix,land,forest,doors,terraces,wallRoot)!,b=currentBackgroundCliffShell(root,cell,matrix,land,forest,doors,terraces,wallRoot)!;assert.ok(a&&b);assert.deepEqual(Object.keys(a.geometry.attributes),Object.keys(b.geometry.attributes));for(const k of Object.keys(a.geometry.attributes))assert.deepEqual(a.geometry.getAttribute(k).array,b.geometry.getAttribute(k).array);assert.equal(a.material.map,b.material.map);assert.equal(a.material.fog,b.material.fog);assert.equal(a.material.vertexColors,b.material.vertexColors);assert.equal(a.material.side,b.material.side);assert.ok(a.material.color.equals(b.material.color));a.geometry.dispose();b.geometry.dispose();a.material.dispose();b.material.dispose();}
});

test('bounded original opaque-geology screenshot rays hit backs; native plateau-top pixel stays identical',async()=>{
 const route=await json<SourceMap>('maps/47.json'),cliff=route.cells.find(c=>c.x===20&&c.z===10)!,reference=await backgroundCliffPixelReference(cliff,terraces);
 try{const roots=[reference.root,...await Promise.all(cells.map(placed))],old=roots.flatMap(meshes);
 const leftPixels=[[375,95],[400,110],[420,115],[450,110]],rightPixels=[[1000,240],[1100,250],[1200,260]],thirdPixels=[[1260,122],[1270,125]];
 for(const[x,y]of[...leftPixels,...rightPixels,...thirdPixels]){const ray=pixel(x,y);assert.equal(first(old,ray.origin,ray.direction),undefined,`old original opaque-geology subset witness ${x},${y}`);}
 const topRay=pixel(1000,140),oldTop=first(old,topRay.origin,topRay.direction)!;assert.ok(oldTop);assert.equal(oldTop.point.y,2);
 for(let i=0;i<cells.length;i++){const shell=backgroundCliffShell(roots[i+1],cells[i],matrix,land,forest,doors,terraces,wallRoot)!;assert.ok(shell);roots[i+1].add(shell);}
 const after=roots.flatMap(meshes);
 for(const[x,y]of[...leftPixels,...rightPixels,...thirdPixels]){const ray=pixel(x,y),hit=first(after,ray.origin,ray.direction)!;assert.ok(hit,`new opaque background at ${x},${y}`);assert.equal(hit.object.name,BACKGROUND_CLIFF_SHELL);assert.deepEqual(hit.object.userData.backgroundCliffAdaptation.cell,leftPixels.some(p=>p[0]===x&&p[1]===y)?[21,10]:thirdPixels.some(p=>p[0]===x&&p[1]===y)?[23,11]:[22,11]);assert.ok(hit.point.y>=0&&hit.point.y<=7);assert.equal((hit.object as THREE.Mesh).material instanceof THREE.MeshBasicMaterial,true);}
 const top=first(after,topRay.origin,topRay.direction)!;assert.equal(top.object,oldTop.object);assert.ok(top.point.equals(oldTop.point));assert.ok(top.uv?.equals(oldTop.uv!));
 const thirdTopRay=pixel(1260,117),oldThirdTop=first(old,thirdTopRay.origin,thirdTopRay.direction)!,thirdTop=first(after,thirdTopRay.origin,thirdTopRay.direction)!;assert.ok(oldThirdTop);assert.equal(thirdTop.object,oldThirdTop.object);assert.ok(thirdTop.point.equals(oldThirdTop.point));assert.ok(thirdTop.uv?.equals(oldThirdTop.uv!));
 const sourceLand=await json<Land>('lands/112.json'),approaches=[[27,4],[27,5],...Array.from({length:14},(_,i)=>[25+i%7,30+Math.floor(i/7)])],newBodies=after.filter(m=>m.name===BACKGROUND_CLIFF_SHELL),cameraChanges:any[]=[];let cameraRays=0;
 const orbitHit=(objects:THREE.Object3D[],origin:THREE.Vector3,direction:THREE.Vector3)=>new THREE.Raycaster(origin,direction,.5,28).intersectObjects(objects,false).find(h=>h.distance>1.2),describe=(h:THREE.Intersection|undefined)=>h?{mesh:h.object.name,distance:h.distance,point:h.point.toArray()}:null;
 for(const[column,row]of approaches){const permission=sourceLand.permissions[row*32+column],surf=(permission&255)===21;assert.ok(permissionWalkable(permission,surf));const x=cliff.x*32+column+.5,z=cliff.z*32+row+.5,ground=terrainHeight(sourceLand,cliff,x,z,surf?.5:3)+terraces.height(x,z),origin=new THREE.Vector3(x,ground+.9,z);
  for(const pitch of[.18,.2,.4,.9,.95])for(const yaw of[30,60,90,120,150]){const angle=yaw*Math.PI/180,direction=new THREE.Vector3(Math.sin(angle)*Math.cos(pitch),Math.sin(pitch),Math.cos(angle)*Math.cos(pitch)),oldHit=orbitHit(old,origin,direction),bodyHit=orbitHit(newBodies,origin,direction),nextHit=bodyHit&&(!oldHit||bodyHit.distance<oldHit.distance)?bodyHit:oldHit;
   for(const far of[5,13,28]){cameraRays++;const before=oldHit&&oldHit.distance<=far?oldHit:undefined,after=nextHit&&nextHit.distance<=far?nextHit:undefined;if(before===after)continue;assert.ok(after);assert.equal(after.object.name,BACKGROUND_CLIFF_SHELL);assert.deepEqual(after.object.userData.backgroundCliffAdaptation.cell,[21,10]);cameraChanges.push({origin:origin.toArray(),direction:direction.toArray(),far,before:describe(before),after:describe(after),classification:'literal newly solid background camera collision in opaque-geology subset; complete-scene/GPU behavior remains unqualified'});}
  }
 }assert.equal(cameraRays,1200);
 if(process.env.HG_BACKGROUND_CLIFF_PIXEL_REPORT)await writeFile(process.env.HG_BACKGROUND_CLIFF_PIXEL_REPORT,JSON.stringify({camera:camera.position.toArray(),target:[695.5,1.9,398.5],viewport:[1280,800],opaqueGeologyReference:reference.proof,leftPixels,rightPixels,thirdPixels,preservedTopPixels:[[1000,140],[1260,117]],native112Camera:{approaches,cameraRays,cameraChanges},completeSceneGPU:'pending; this bounded source-geology subset is not a substitute'},null,2));
 }finally{reference.dispose();}
});

test('real Route27 native walking and Surf approaches keep the production orbit clear',async()=>{
 const cell=cells[1],root=await placed(cell),shell=backgroundCliffShell(root,cell,matrix,land,forest,doors,terraces,wallRoot)!;assert.ok(shell);root.add(shell);root.updateMatrixWorld(true);const obstacles=fieldCameraObstacles(root);assert.ok(obstacles.includes(shell));
 const map=await json<SourceMap>('maps/'+matrix.headers![12*matrix.width+22]+'.json'),neighbor=map.cells.find(c=>c.x===22&&c.z===12)!;assert.ok(neighbor);const sourceLand=await json<Land>('lands/'+neighbor.land+'.json');let tiles=0,walkingTiles=0,rays=0;
 for(let dz=0;dz<32;dz++)for(let dx=0;dx<32;dx++){const permission=sourceLand.permissions[dz*32+dx];if(!permissionWalkable(permission,true))continue;if(permissionWalkable(permission))walkingTiles++;tiles++;const x=22*32+dx+.5,z=12*32+dz+.5,ground=terrainHeight(sourceLand,neighbor,x,z,neighbor.altitude*.5)+terraces.height(x,z),origin=new THREE.Vector3(x,ground+.9,z);
  for(const pitch of[.18,.2,.4,.9,.95])for(let yaw=0;yaw<360;yaw+=15)for(const far of[5,13,28]){const angle=yaw*Math.PI/180,direction=new THREE.Vector3(Math.sin(angle)*Math.cos(pitch),Math.sin(pitch),Math.cos(angle)*Math.cos(pitch));const hit=new THREE.Raycaster(origin,direction,.5,far).intersectObjects([shell],false).find(h=>h.distance>1.2);assert.equal(hit,undefined,`new shell cannot shorten native walkable Route27 orbit ${x},${z}/${pitch}/${yaw}/${far}`);rays++;}
 }assert.equal(walkingTiles,24);assert.equal(tiles,383);assert.equal(rays,383*5*24*3);
});

test('third23,11 fingerprint retains actual neighbor floors/portals and records literal camera collisions',async()=>{
 const cell=cells[2],root=await placed(cell),native=meshes(root),shell=backgroundCliffShell(root,cell,matrix,land,forest,doors,terraces,wallRoot)!;assert.ok(shell);root.add(shell);root.updateMatrixWorld(true);
 assert.deepEqual([cell.x,cell.z,cell.altitude,matrix.headers![cell.z*47+cell.x]],[23,11,6,0]);const neighbors=[[-1,0],[1,0],[0,-1],[0,1]].map(([dx,dz])=>{const i=(cell.z+dz)*47+cell.x+dx;return{cell:[cell.x+dx,cell.z+dz],land:matrix.models[i],altitude:matrix.altitudes[i],header:matrix.headers![i]};});
 assert.deepEqual(neighbors,[{cell:[22,11],land:210,altitude:4,header:0},{cell:[24,11],land:210,altitude:18,header:0},{cell:[23,10],land:65535,altitude:0,header:0},{cell:[23,12],land:12,altitude:0,header:31}]);assert.equal(shell.userData.backgroundCliffAdaptation.designedVoidDatum,0);
 assert.equal(doors.some((d:any)=>d.x>=736&&d.x<=768&&d.z>=352&&d.z<=384),false);for(const[x,z]of[[736,352],[750.5,360.5],[768,384]])assert.equal(backgroundCliffShell(await placed(cell),cell,matrix,land,forest,[{x,z,axis:2,sign:1}],terraces,wallRoot),null);
 const map=await json<SourceMap>('maps/31.json'),neighbor=map.cells.find(c=>c.x===23&&c.z===12)!,sourceLand=await json<Land>('lands/12.json');assert.equal(neighbor.land,12);const capMaxY=new THREE.Box3().setFromObject(native[0]).max.y,changes:any[]=[];let walkingTiles=0,surfTiles=0,rays=0;
 for(let dz=0;dz<32;dz++)for(let dx=0;dx<32;dx++){const permission=sourceLand.permissions[dz*32+dx];if(!permissionWalkable(permission,true))continue;const surf=!permissionWalkable(permission);if(surf)surfTiles++;else walkingTiles++;const x=23*32+dx+.5,z=12*32+dz+.5,ground=terrainHeight(sourceLand,neighbor,x,z,surf?.5:neighbor.altitude*.5)+terraces.height(x,z),origin=new THREE.Vector3(x,ground+.9,z);
  for(const pitch of[.18,.4,.95])for(let yaw=0;yaw<360;yaw+=30){const angle=yaw*Math.PI/180,direction=new THREE.Vector3(Math.sin(angle)*Math.cos(pitch),Math.sin(pitch),Math.cos(angle)*Math.cos(pitch)),hit=new THREE.Raycaster(origin,direction,.5,28).intersectObject(shell,false).find(h=>h.distance>1.2);
   for(const far of[5,13,28]){rays++;if(!hit||hit.distance>far)continue;assert.ok(hit.point.x>=736&&hit.point.x<=768&&hit.point.z>=352&&hit.point.z<=384&&hit.point.y>=0&&hit.point.y<=capMaxY);const before=new THREE.Raycaster(origin,direction,.5,far).intersectObjects(native,false).find(h=>h.distance>1.2);changes.push({origin:origin.toArray(),direction:direction.toArray(),far,permission,surf,beforeCapOnly:before?{point:before.point.toArray(),distance:before.distance}:null,solidWall:{point:hit.point.toArray(),distance:hit.distance},qualification:'native12 BDHC/permissions plus original210 cap reference; other complete-scene occluders not modelled; new physical camera collision is explicit, not an unaffected-camera claim'});}
  }
 }assert.equal(walkingTiles,150);assert.equal(surfTiles,205);assert.equal(rays,38340);assert.equal(changes.length,0,'the third body never intersects these source-defined walking/Surf camera approaches');
 if(process.env.HG_BACKGROUND_CLIFF_THIRD_REPORT)await writeFile(process.env.HG_BACKGROUND_CLIFF_THIRD_REPORT,JSON.stringify({cell,neighbors,designedVoidDatum:0,nativeVoidSupportClaimed:false,walkingTiles,surfTiles,rays,changes,completeSceneGPU:'parent required'},null,2));
});

test('all native cap edges meet the closed side/underside volume exactly and floors stay native',async()=>{
 for(const cell of cells){const root=await placed(cell),native=meshes(root),shell=backgroundCliffShell(root,cell,matrix,land,forest,doors,terraces,wallRoot)!;assert.ok(shell);
  const merged=new THREE.BufferGeometry(),positions:number[]=[];root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert();
  for(const m of native){const g=m.geometry,index=g.index;for(let j=0;j<(index?.count??g.getAttribute('position').count);j++)positions.push(...m.getVertexPosition(index?index.getX(j):j,new THREE.Vector3()).applyMatrix4(m.matrixWorld).applyMatrix4(inverse).toArray());}
  positions.push(...shell.geometry.getAttribute('position').array);merged.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));closedTreeGeometry(merged);
  root.add(shell);root.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(shell);assert.equal(b.min.y,0);assert.equal(b.max.y,new THREE.Box3().setFromObject(native[0]).max.y);assert.equal(b.min.x,cell.x*32);assert.equal(b.max.x,(cell.x+1)*32);assert.equal(b.min.z,cell.z*32);assert.equal(b.max.z,(cell.z+1)*32);
  for(let z=1;z<32;z+=2)for(let x=1;x<32;x+=2){const origin=new THREE.Vector3(cell.x*32+x,20,cell.z*32+z),direction=new THREE.Vector3(0,-1,0),a=first(native,origin,direction)!,b=first([...native,shell],origin,direction)!;assert.equal(b.object,a.object);assert.ok(b.point.equals(a.point));assert.ok(b.uv?.equals(a.uv!));}
  for(const y of[.125,.5,cell.altitude*.5-.125])for(const t of[-15.5,-8,0,8,15.5])for(const[origin,direction]of[[new THREE.Vector3(cell.x*32-1,y,cell.z*32+16+t),new THREE.Vector3(1,0,0)],[new THREE.Vector3(cell.x*32+33,y,cell.z*32+16+t),new THREE.Vector3(-1,0,0)],[new THREE.Vector3(cell.x*32+16+t,y,cell.z*32-1),new THREE.Vector3(0,0,1)],[new THREE.Vector3(cell.x*32+16+t,y,cell.z*32+33),new THREE.Vector3(0,0,-1)]]as const)assert.ok(first([shell],origin,direction,2));
 }
});

test('source identity, altered collision, transform, missing cap and real entry guards decline instead of filling',async()=>{
 const cell=cells[0],root=await placed(cell);
 for(const c of[{...cell,x:23},{...cell,altitude:12},{...cell,asset:'land/208-0.glb'},{...cell,props:[{}]}]as Cell[])assert.equal(backgroundCliffShell(root,c,matrix,land,forest,[],terraces,wallRoot),null);
 const walkable={...land,permissions:land.permissions.map((p,i)=>i===0?0:p)};assert.equal(backgroundCliffShell(root,cell,matrix,walkable,forest,[],terraces,wallRoot),null);
 assert.equal(backgroundCliffShell(root,cell,matrix,land,{...forest,plates:[]},[],terraces,wallRoot),null);
 for(const[x,z]of[[672,320],[680.5,330.5],[704,352]])assert.equal(backgroundCliffShell(root,cell,matrix,land,forest,[{x,z,axis:2,sign:1}],terraces,wallRoot),null);
 root.position.x+=.25;assert.equal(backgroundCliffShell(root,cell,matrix,land,forest,[],terraces,wallRoot),null);root.position.x-=.25;
 const cap=meshes(root)[0],p=cap.geometry.getAttribute('position'),before=p.getY(0);p.setY(0,before+.125);assert.equal(backgroundCliffShell(root,cell,matrix,land,forest,[],terraces,wallRoot),null);p.setY(0,before);
 const foreign=new THREE.Mesh(cap.geometry,cap.material);foreign.name='foreign-source';root.add(foreign);assert.equal(backgroundCliffShell(root,cell,matrix,land,forest,[],terraces,wallRoot),null);root.remove(foreign);
 const shell=backgroundCliffShell(root,cell,matrix,land,forest,[],terraces,wallRoot)!;assert.ok(shell);root.add(shell);assert.equal(backgroundCliffShell(root,cell,matrix,land,forest,[],terraces,wallRoot),null);
});

test('actual production stream defaults on for the three fingerprints; unload/reentry releases only owned resources',async()=>{
 const index=await json('index.json'),map47=await json<SourceMap>('maps/47.json'),maps=new Map<number,SourceMap>();
 for(const id of new Set(matrix.headers!)){const map=await json<SourceMap>(`maps/${id}.json`);maps.set(id,{...map,cells:map.cells.filter(c=>c.asset==='land/210-0.glb'&&cells.some(v=>v.x===c.x&&v.z===c.z))});}
 const WorldUnderTest=process.env.HG_BACKGROUND_CLIFF_BEFORE==='1'?await backgroundCliffBeforeWorld():OriginalWorld;
 const world=Object.create(WorldUnderTest.prototype)as any;Object.assign(world,{terrainSceneryEnabled:false,scene:new THREE.Scene(),index,matrix,activeMatrix:0,activeHeader:60,generation:1,pending:null,maps,cells:new Map(),landCache:new Map([[210,Promise.resolve(land)],[208,Promise.resolve(forest)],[112,Promise.resolve(await json('lands/112.json'))]]),entrances:Promise.resolve({'0':doors}),terraces,terraceFallback:new THREE.MeshBasicMaterial(),latestStream:{matrix:0,id:60,x:695.5,z:398.5},loading:false});world.asset=asset;
 await world.stream(60,695.5,398.5);assert.equal(world.cells.size,3);const sources=new Set<object>(),counts=new Map<object,number>();
 const template=await asset('land/210-0.glb');for(const source of[template,wallRoot])source.traverse(o=>{if(o instanceof THREE.Mesh){sources.add(o.geometry);sources.add(o.material);const m=o.material as THREE.MeshBasicMaterial;if(m.map)sources.add(m.map);}});
 for(const s of sources)(s as THREE.EventDispatcher).addEventListener('dispose',()=>counts.set(s,(counts.get(s)??0)+1));
 const oldShells:THREE.Mesh[]=[];
 for(const c of cells){const loaded=world.cells.get(`${c.x},${c.z}`),shell=loaded.group.getObjectByName(BACKGROUND_CLIFF_SHELL)as THREE.Mesh;assert.ok(shell,'real default production stream must call the repair');for(let z=0;z<32;z++)for(let x=0;x<32;x++){const wx=c.x*32+x+.5,wz=c.z*32+z+.5;assert.equal(world.permission(wx,wz),0x8000);assert.equal(world.walkable(wx,wz),false);assert.equal(world.height(wx,wz),terrainHeight(land,c,wx,wz)+terraces.height(wx,wz));}oldShells.push(shell);shell.geometry.addEventListener('dispose',()=>counts.set(shell.geometry,(counts.get(shell.geometry)??0)+1));(shell.material as THREE.Material).addEventListener('dispose',()=>counts.set(shell.material,(counts.get(shell.material)??0)+1));const duplicate=new THREE.Mesh(shell.geometry,shell.material);duplicate.name=BACKGROUND_CLIFF_SHELL;loaded.group.add(duplicate);}
 for(const loaded of world.cells.values())world.releaseCell(loaded);world.cells.clear();for(const s of oldShells){assert.equal(counts.get(s.geometry),1);assert.equal(counts.get(s.material),1);}for(const s of sources)assert.equal(counts.get(s),undefined);
 await world.stream(60,695.5,398.5);for(let i=0;i<cells.length;i++){const c=cells[i],shell=world.cells.get(`${c.x},${c.z}`).group.getObjectByName(BACKGROUND_CLIFF_SHELL)as THREE.Mesh;assert.ok(shell);assert.notEqual(shell.geometry,oldShells[i].geometry);assert.notEqual(shell.material,oldShells[i].material);assert.equal((shell.material as THREE.MeshBasicMaterial).map,(oldShells[i].material as THREE.MeshBasicMaterial).map);}
 assert.equal(world.terrainSceneryEnabled,false);assert.equal(map47.events.warps.length>0,true);
});

test('foreign210 placements do not fetch supporting forest or entrances before declining',async()=>{
 const cell=background.cells.find(c=>c.x===24&&c.z===11)!;assert.ok(cell);const index=await json('index.json'),i=cell.z*matrix.width+cell.x,world=Object.create(OriginalWorld.prototype)as any;
 Object.assign(world,{terrainSceneryEnabled:false,scene:new THREE.Scene(),index,matrix:{...matrix,models:matrix.models.map((n,at)=>at===i?n:65535)},activeMatrix:0,activeHeader:0,generation:1,pending:null,maps:new Map([[0,{...background,cells:[cell]}]]),cells:new Map(),landCache:new Map([[210,Promise.resolve(land)]]),terraces,terraceFallback:new THREE.MeshBasicMaterial(),latestStream:{matrix:0,id:0,x:cell.x*32+16,z:cell.z*32+16},loading:false});world.asset=asset;
 await world.stream(0,cell.x*32+16,cell.z*32+16);assert.equal(world.cells.size,1);assert.equal(world.landCache.has(208),false);assert.equal(world.entrances,undefined);assert.equal(world.cells.values().next().value.group.getObjectByName(BACKGROUND_CLIFF_SHELL),undefined);
});

test('all unrelated World bytes and the global default-off terrain policy stay unchanged',async()=>{
 const current=await readFile(new URL('world.ts',import.meta.url),'utf8'),before=await readFile(new URL('../../reviews/background-cliff-current-root/source/world-before-c2.ts.txt',import.meta.url),'utf8');
 assert.equal(createHash('sha256').update(before).digest('hex'),'2806f7ee08e1cc23be481d6d6fcd42fb2148e4cc5bfc7f9605752bea26f9894c','exact independently released C2 Azalea World baseline');
 assert.equal(withoutBackgroundCliffIntegration(current),before);assert.ok(current.includes('readonly terrainSceneryEnabled=false'));
});
