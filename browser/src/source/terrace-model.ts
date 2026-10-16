import * as THREE from 'three';
import {terrainPause} from './terrain-work.ts';
import {Terraces} from './ledges.ts';
import {terrainHeight} from './terrain.ts';
import type {Cell,Land} from './types.ts';

type Vertex={p:THREE.Vector3;uv:THREE.Vector2;color:THREE.Color;root?:THREE.Vector3};
function clip(vertices:Vertex[],distance:(v:Vertex)=>number){
 const out:Vertex[]=[];for(let i=0;i<vertices.length;i++){const a=vertices[i],b=vertices[(i+1)%vertices.length],da=distance(a),db=distance(b),inside=da>=-1e-8;if(inside)out.push(a);if((da>1e-8&&db< -1e-8)||(da< -1e-8&&db>1e-8)){const t=da/(da-db);out.push({p:a.p.clone().lerp(b.p,t),uv:a.uv.clone().lerp(b.uv,t),color:a.color.clone().lerp(b.color,t)});}}return out;
}

/** Bake cell-local copies of the visible ground. Split at original tile edges
 * and the height field's diagonal so actors and rendered surfaces agree. Shared
 * imported geometry, UVs, materials and native X/Z coordinates stay intact. */
export async function terraceModel(root:THREE.Group,terraces:Terraces,isCurrent:()=>boolean=()=>true){
 const pause=async()=>{let pending:Promise<void>|null;while((pending=terrainPause())){await pending;if(!isCurrent())return false;}return isCurrent();};
 let work=0;
 root.updateWorldMatrix(true,false);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),meshes:THREE.Mesh[]=[];root.traverseVisible(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});
 for(const mesh of meshes){
  if(!await pause())return false;
  if(mesh instanceof THREE.InstancedMesh){const matrix=new THREE.Matrix4();for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);const point=new THREE.Vector3().setFromMatrixPosition(matrix).applyMatrix4(mesh.matrixWorld),authored=mesh.userData.sceneryRoots?.[i] as number[]|undefined,anchor=authored?new THREE.Vector3().fromArray(authored).applyMatrix4(mesh.matrixWorld):point,offset=terraces.height(anchor.x,anchor.z);point.y+=offset;point.applyMatrix4(mesh.matrixWorld.clone().invert());matrix.setPosition(point);mesh.setMatrixAt(i,matrix);}mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();continue;}
  const geometry=mesh.geometry,position=geometry.getAttribute('position'),uv=geometry.getAttribute('uv'),color=geometry.getAttribute('color'),roots=geometry.getAttribute('sceneryRoot'),index=geometry.index,materials=Array.isArray(mesh.material)?mesh.material:[mesh.material],attributes=materials.map(()=>({positions:[] as number[],uvs:[] as number[],colors:[] as number[]}));
  const vertex=(i:number):Vertex=>({root:roots?.getW(i)?new THREE.Vector3(roots.getX(i),roots.getY(i),roots.getZ(i)).applyMatrix4(mesh.matrixWorld):undefined,p:mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld),uv:uv?new THREE.Vector2(uv.getX(i),uv.getY(i)):new THREE.Vector2(),color:color?new THREE.Color(color.getX(i),color.getY(i),color.getZ(i)):new THREE.Color(1,1,1)});
  const rigid=new Map<string,number>(),pointKey=(p:THREE.Vector3)=>p.toArray().map(n=>Math.round(n*1e5)).join(',');
  if(mesh.name==='solid-original-rocks'&&!roots){
   const parent=Array.from({length:position.count},(_,i)=>i),find=(i:number):number=>parent[i]===i?i:parent[i]=find(parent[i]),points=Array.from({length:position.count},(_,i)=>vertex(i).p),seen=new Map<string,number>();
   const join=(a:number,b:number)=>{parent[find(a)]=find(b);};points.forEach((p,i)=>{const key=pointKey(p),prior=seen.get(key);if(prior!==undefined)join(i,prior);seen.set(key,i);});for(let i=0;i<(index?.count??position.count);i+=3){const a=index?index.getX(i):i;join(a,index?index.getX(i+1):i+1);join(a,index?index.getX(i+2):i+2);}
   const bounds=new Map<number,THREE.Box3>();points.forEach((p,i)=>{const id=find(i),box=bounds.get(id)??new THREE.Box3();box.expandByPoint(p);bounds.set(id,box);});points.forEach((p,i)=>{const centre=bounds.get(find(i))!.getCenter(new THREE.Vector3());rigid.set(pointKey(p),terraces.height(centre.x,centre.z));});
  }
  const add=(polygon:Vertex[],slot:number,tx?:number,tz?:number,override?:number)=>{const data=attributes[slot];for(let i=1;i<polygon.length-1;i++){const triangle=[polygon[0],polygon[i],polygon[i+1]];if(new THREE.Vector3().subVectors(triangle[1].p,triangle[0].p).cross(new THREE.Vector3().subVectors(triangle[2].p,triangle[0].p)).lengthSq()<1e-14)continue;for(const v of triangle){const p=v.p.clone();let offset:number;if(override!==undefined)offset=override;else if(v.root)offset=terraces.height(v.root.x,v.root.z);else if(rigid.size)offset=rigid.get(pointKey(p))!;else if(tx===undefined||tz===undefined)offset=terraces.height(p.x,p.z);else offset=terraces.sample(Math.floor(tx),Math.floor(tz),p.x,p.z);p.y+=offset;p.applyMatrix4(inverse);data.positions.push(...p.toArray());data.uvs.push(...v.uv.toArray());data.colors.push(...v.color.toArray());}}};
  const start=geometry.drawRange.start,end=Math.min(index?.count??position.count,start+geometry.drawRange.count);
  for(let i=start;i+2<end;i+=3){if((++work&31)===0&&!await pause())return false;const slot=geometry.groups.find(g=>i>=g.start&&i<g.start+g.count)?.materialIndex??0,triangle=[0,1,2].map(j=>vertex(index?index.getX(i+j):i+j));
   const minX=Math.min(...triangle.map(v=>v.p.x)),maxX=Math.max(...triangle.map(v=>v.p.x)),minZ=Math.min(...triangle.map(v=>v.p.z)),maxZ=Math.max(...triangle.map(v=>v.p.z));
   // Water artwork can overhang its collision tile. Keep the native waterline
   // fixed even where that overhang reaches displaced land.
   if(/^(?:sea|water|pond|river)(?:\d|_|$)/i.test(materials[slot].name)){add(triangle,slot,undefined,undefined,0);continue;}
   // Vertical faces have no ground area to subdivide. Their edge offsets still
   // follow the terrain; explicit ledge walls below close the discontinuities.
   if(triangle.every(v=>v.root)||rigid.size||(maxX-minX)*(maxZ-minZ)<1e-10){add(triangle,slot);continue;}
   const flat=terraces.uniform(minX,minZ,maxX,maxZ);if(flat!==undefined){add(triangle,slot,undefined,undefined,flat);continue;}
   for(let z=Math.floor(minZ*2+1e-8)/2;z<Math.ceil(maxZ*2-1e-8)/2;z+=.5)for(let x=Math.floor(minX*2+1e-8)/2;x<Math.ceil(maxX*2-1e-8)/2;x+=.5){
    if((++work&31)===0&&!await pause())return false;
    let polygon=triangle;for(const distance of [(v:Vertex)=>v.p.x-x,(v:Vertex)=>x+.5-v.p.x,(v:Vertex)=>v.p.z-z,(v:Vertex)=>z+.5-v.p.z])polygon=clip(polygon,distance);if(polygon.length<3)continue;
    add(clip(polygon,v=>(v.p.x-x)-(v.p.z-z)),slot,x,z);add(clip(polygon,v=>(v.p.z-z)-(v.p.x-x)),slot,x,z);
   }
  }
  if(!await pause())return false;
  const output=new THREE.BufferGeometry(),positions:number[]=[],uvs:number[]=[],colors:number[]=[];attributes.forEach((data,slot)=>{output.addGroup(positions.length/3,data.positions.length/3,slot);for(const n of data.positions)positions.push(n);for(const n of data.uvs)uvs.push(n);for(const n of data.colors)colors.push(n);});output.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));if(uv)output.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));if(color)output.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));output.computeVertexNormals();output.computeBoundingSphere();
  const replacement=new THREE.Mesh(output,mesh.material);replacement.name='source-terrace-surface';root.add(replacement);mesh.visible=false;
 }return true;
}

/** Opaque, two-sided native-textured cliff faces between the split ground edges. */
export function terraceWalls(terraces:Terraces,cell:Cell,land:Land,material:THREE.MeshBasicMaterial){
 const positions:number[]=[],uvs:number[]=[];
 for(const[x,z,b]of terraces.data.ledges){
  if(Math.floor(x/32)!==cell.x||Math.floor(z/32)!==cell.z)continue;
  const profile=terraces.data.nativeEdges?.[x+','+z];
  const[dx,dz]=({56:[1,0],57:[-1,0],58:[0,-1],59:[0,1]} as Record<number,number[]>)[b],upper=terraces.points(x,z),lower=terraces.points(x+dx,z+dz);
  const edge:{points:number[][];upper:number[];lower:number[]}=dx===1?{points:[[x+1,z],[x+1,z+.5],[x+1,z+1]],upper:[2,5,8],lower:[0,3,6]}:dx===-1?{points:[[x,z+1],[x,z+.5],[x,z]],upper:[6,3,0],lower:[8,5,2]}:dz===1?{points:[[x+1,z+1],[x+.5,z+1],[x,z+1]],upper:[8,7,6],lower:[2,1,0]}:{points:[[x,z],[x+.5,z],[x+1,z]],upper:[0,1,2],lower:[6,7,8]};
  for(let part=0;part<2;part++){
   const a=edge.points[part],c=edge.points[part+1],baseA=terrainHeight(land,cell,a[0],a[1],cell.altitude*.5),baseC=terrainHeight(land,cell,c[0],c[1],cell.altitude*.5),ua=upper[edge.upper[part]],uc=upper[edge.upper[part+1]],la=lower[edge.lower[part]],lc=lower[edge.lower[part+1]],points=[[a[0],(profile?.[part]??baseA)+ua,a[1]],[c[0],(profile?.[part+1]??baseC)+uc,c[1]],[c[0],(profile?.[part+4]??baseC)+lc,c[1]],[a[0],(profile?.[part+3]??baseA)+la,a[1]]];
   for(const i of [0,1,2,0,2,3]){const p=points[i];positions.push(p[0]-cell.x*32-16,p[1]-cell.altitude*.5,p[2]-cell.z*32-16);uvs.push((part+(i===0||i===3?0:1))*.5,i<2?0:Math.max(.1,i===2?points[1][1]-points[2][1]:points[0][1]-points[3][1]));}
  }
 }
 if(!positions.length)return null;const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.computeVertexNormals();const surface=material.clone();surface.vertexColors=false;surface.transparent=false;surface.opacity=1;surface.alphaTest=0;surface.side=THREE.DoubleSide;surface.polygonOffset=true;surface.polygonOffsetFactor=1;surface.polygonOffsetUnits=1;const mesh=new THREE.Mesh(geometry,surface);mesh.name='source-terrace-wall';return mesh;
}
