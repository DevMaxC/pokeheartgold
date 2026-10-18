import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {nativeTreeAsset} from '../src/source/tree-fixture.test.ts';
import {terraceModel} from '../src/source/terrace-model.ts';
import {nativeWallPlans} from '../src/source/native-terrain-joints.ts';
import type {Terraces} from '../src/source/ledges.ts';
import type {Cell} from '../src/source/types.ts';

/** A bounded ORIGINAL opaque-geology reference for the supplied camera rays.
 * Deliberately never calls repairOriginalAsset, builds foliage volumes, clones
 * the whole source asset, or retains a full-world snapshot. This is not a claim
 * that omitted decorative/MASK/BLEND surfaces cannot occlude the same pixels;
 * the actual complete-scene GPU comparison remains a separate release check.
 */
export async function backgroundCliffPixelReference(cell:Cell,terraces:Terraces){
 assert.deepEqual([cell.x,cell.z,cell.land,cell.altitude,cell.asset],[20,10,112,0,'land/112-9.glb']);
 const bytes=await readFile(new URL('../public/source/'+cell.asset,import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'50673afa299f8e4c838fd1174fb873a2d19d37690701a2c3786bbba10719e93a');
 assert.ok(bytes.length<=512*1024,'raw input budget, checked before parsing');
 const start=process.memoryUsage(),root=new THREE.Group(),model=await nativeTreeAsset(cell.asset),excluded:THREE.Mesh[]=[];
 model.scale.setScalar(1/16);root.position.set(cell.x*32+16,cell.altitude*.5,cell.z*32+16);root.add(model);
 model.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const materials=Array.isArray(o.material)?o.material:[o.material];
  if(!materials.every(m=>/cliff|wall|peak|mount|slope|grass|ground|soil|earth/i.test(m.name)&&!/water|sea|river|pond|bridge|hashi|flower|tree|bush|shadow|kage|egrass/i.test(m.name)&&!m.transparent&&m.opacity===1&&m.alphaTest===0))excluded.push(o);
 });
 for(const mesh of excluded)mesh.removeFromParent();root.updateMatrixWorld(true);
 const native:THREE.Mesh[]=[];root.traverseVisible(o=>{if(o instanceof THREE.Mesh)native.push(o);});
 let inputTriangles=0,clippingTriangleUpperBound=0;const materialTriangles:Record<string,number>={};
 for(const mesh of native){const g=mesh.geometry,p=g.getAttribute('position'),index=g.index,total=index?.count??p.count;
  assert.ok(p.count<=20000,'native accessor budget');inputTriangles+=total/3;const m=mesh.material as THREE.Material;materialTriangles[m.name]=(materialTriangles[m.name]??0)+total/3;
  for(let at=0;at<total;at+=3){const points=[0,1,2].map(j=>mesh.getVertexPosition(index?index.getX(at+j):at+j,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
   assert.ok(points.every(p=>Number.isFinite(p.y)&&p.y>=-1&&p.y<=20&&p.x>=cell.x*32&&p.x<=(cell.x+1)*32&&p.z>=cell.z*32&&p.z<=(cell.z+1)*32+4),'literal source-cell plus authored four-unit south overhang budget: '+JSON.stringify({material:m.name,at,points:points.map(p=>p.toArray())}));
   const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minZ=Math.min(...points.map(p=>p.z)),maxZ=Math.max(...points.map(p=>p.z));
   // A triangle clipped against four box planes and one diagonal has at most
   // eight vertices: <=6 fan triangles on each of the two half-cell sides.
   const uniform=terraces.uniform(minX,minZ,maxX,maxZ),nx=Math.ceil(maxX*2)-Math.floor(minX*2),nz=Math.ceil(maxZ*2)-Math.floor(minZ*2);
   clippingTriangleUpperBound+=uniform!==undefined||(maxX-minX)*(maxZ-minZ)<1e-10?1:nx*nz*12;
  }
 }
 assert.deepEqual(materialTriangles,{grass01:49,slope:72,cliff01:75,wall01_g:248,wall01_d:744});assert.equal(inputTriangles,1188);assert.ok(clippingTriangleUpperBound<=150000,'reject before the native-joint prepass if the half-grid budget is exceeded');
 const withinBudget=()=>{const usage=process.memoryUsage();assert.ok(usage.arrayBuffers-start.arrayBuffers<=64*1024*1024,'64MiB external-buffer growth budget');assert.ok(usage.rss-start.rss<=256*1024*1024,'256MiB resident growth budget');return true;};
 let plannedWallFaces=0,jointAdditionalUpperBound=0;
 {const shared=await nativeWallPlans(native,root.matrixWorld.clone().invert(),terraces,async()=>withinBudget());assert.ok(shared);
  // The main deformer handles a planned vertical face before its one-face
  // degenerate-XZ path. Account for every literal parallel cut: each slab is
  // a triangle clipped by two planes (<=5 vertices, hence <=3 fan triangles).
  for(const plans of shared.plans.values())for(const plan of plans.values()){plannedWallFaces++;jointAdditionalUpperBound+=3*(plan.cuts.length+1)-1;}
  jointAdditionalUpperBound+=shared.reliefStrips.length;
 }
 clippingTriangleUpperBound+=jointAdditionalUpperBound;assert.ok(clippingTriangleUpperBound<=150000,'reject before output allocation if the joint-aware upper bound exceeds the budget');
 await terraceModel(root,terraces,withinBudget);withinBudget();root.updateMatrixWorld(true);
 let outputTriangles=0;root.traverseVisible(o=>{if(o instanceof THREE.Mesh)outputTriangles+=(o.geometry.index?.count??o.geometry.getAttribute('position').count)/3;});assert.ok(outputTriangles<=clippingTriangleUpperBound);
 const end=process.memoryUsage(),proof={scope:'original opaque source geology only; full-scene GPU check separate',rawBytes:bytes.length,inputTriangles,materialTriangles,plannedWallFaces,jointAdditionalUpperBound,clippingTriangleUpperBound,outputTriangles,arrayBufferGrowth:end.arrayBuffers-start.arrayBuffers,residentGrowth:end.rss-start.rss};
 return{root,proof,dispose(){const geometry=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),maps=new Set<THREE.Texture>(),skeletons=new Set<THREE.Skeleton>();for(const object of[root,...excluded])object.traverse(o=>{if(!(o instanceof THREE.Mesh))return;if(o instanceof THREE.SkinnedMesh)skeletons.add(o.skeleton);geometry.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);const map=(m as THREE.MeshBasicMaterial).map;if(map)maps.add(map);}});for(const g of geometry)g.dispose();for(const m of materials)m.dispose();for(const map of maps)map.dispose();for(const s of skeletons)s.dispose();root.clear();}};
}
