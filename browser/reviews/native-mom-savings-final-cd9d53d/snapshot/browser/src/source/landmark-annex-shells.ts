import * as THREE from 'three';
import type {BuildingEntrance} from './render-repair.ts';

type Face={p:THREE.Vector3[];uv:THREE.Vector2[];color:THREE.Color[];material:THREE.MeshBasicMaterial};
export type LandmarkAnnexShell={family:'league-arch'|'alph-research-center';triangles:number;removedHullFaces:number};
const generated=new Set(['3d-rear-facade','3d-solid-backing','entrance-rear-wall']);
const near=(a:number,b:number,tolerance=.025)=>Math.abs(a-b)<tolerance;
function nativeFaces(root:THREE.Object3D){
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),out:Face[]=[];
 root.traverse(o=>{
  if(!(o instanceof THREE.Mesh)||o instanceof THREE.InstancedMesh||generated.has(o.name)||o.name.startsWith('landmark-annex-'))return;
  const g=o.geometry,p=g.getAttribute('position'),uv=g.getAttribute('uv'),color=g.getAttribute('color'),index=g.index,materials=Array.isArray(o.material)?o.material:[o.material];
  for(const group of g.groups.length?g.groups:[{start:0,count:index?.count??p.count,materialIndex:0}]){const material=materials[group.materialIndex??0]as THREE.MeshBasicMaterial;if(!material.visible||material.opacity<.5||/kage|shadow|light/i.test(material.name))continue;for(let i=group.start;i<group.start+group.count;i+=3){const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),points=ids.map(id=>o.getVertexPosition(id,new THREE.Vector3()).applyMatrix4(o.matrixWorld).applyMatrix4(inverse));if(new THREE.Triangle(...points as[THREE.Vector3,THREE.Vector3,THREE.Vector3]).getArea()<1e-6)continue;out.push({p:points,uv:ids.map(id=>uv?new THREE.Vector2(uv.getX(id),uv.getY(id)):new THREE.Vector2()),color:ids.map(id=>color?new THREE.Color(color.getX(id),color.getY(id),color.getZ(id)):new THREE.Color(1,1,1)),material});}}
 });return out;
}
function arch(root:THREE.Object3D,source:Face[]):LandmarkAnnexShell|null{
 // PKE_GATE is a genuine open arch with a67-unit-high keystone opening.
 // Its native curved beam and two separate pillars already have depth. The
 // generic convex silhouette bridges those pillars with a solid green wall.
 if(![[8,67],[-36,8.5],[52,8.5]].every(([x,y])=>source.some(f=>f.material.name==='pke_gate_lm1'&&f.p.some(p=>near(p.x,x)&&near(p.y,y)&&near(p.z,7)))))return null;
 const inverse=root.matrixWorld.clone().invert(),replacements:{original:THREE.Mesh;replacement:THREE.Mesh;triangles:number;removed:number}[]=[];
 root.traverse(o=>{
  if(!(o instanceof THREE.Mesh)||o.name!=='3d-solid-backing')return;const g=o.geometry,p=g.getAttribute('position'),index=g.index,keep:number[]=[];let removed=0;
  for(let i=0;i<(index?.count??p.count);i+=3){const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),points=ids.map(id=>o.getVertexPosition(id,new THREE.Vector3()).applyMatrix4(o.matrixWorld).applyMatrix4(inverse));if(points.every(q=>near(q.z,-5.95,.003))){removed++;continue;}keep.push(...ids);}
  // The six measured hull facets span the whole opening. Preserve the
  // textured rear arch and all other backing on the individual pillars.
  if(removed!==6)return;const geometry=g.clone();geometry.setIndex(keep);geometry.computeVertexNormals();const material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone(),replacement=new THREE.Mesh(geometry,material);replacement.name='landmark-annex-open-arch-backing';replacement.position.copy(o.position);replacement.quaternion.copy(o.quaternion);replacement.scale.copy(o.scale);replacement.matrixAutoUpdate=o.matrixAutoUpdate;replacement.matrix.copy(o.matrix);replacements.push({original:o,replacement,triangles:keep.length/3,removed});
 });
 if(!replacements.length)return{family:'league-arch',triangles:0,removedHullFaces:0};let triangles=0,removedHullFaces=0;for(const r of replacements){r.original.visible=false;r.original.parent!.add(r.replacement);triangles+=r.triangles;removedHullFaces+=r.removed;}root.traverse(o=>{if(o.name==='entrance-rear-wall')o.visible=false;});return{family:'league-arch',triangles,removedHullFaces};
}
function band(source:Face[],bottom:number,top:number){return source.find(f=>f.material.name==='lambert2'&&f.p.every(p=>near(p.x,-48))&&near(Math.min(...f.p.map(p=>p.y)),bottom)&&near(Math.max(...f.p.map(p=>p.y)),top));}
function research(root:THREE.Object3D,source:Face[],doors:BuildingEntrance[]):LandmarkAnnexShell|null{
 const inverse=root.matrixWorld.clone().invert();if(doors.some(d=>{const p=new THREE.Vector3(d.x,root.getWorldPosition(new THREE.Vector3()).y,d.z).applyMatrix4(inverse),direction=d.axis===undefined?null:new THREE.Vector3(d.axis===0?d.sign??1:0,0,d.axis===2?d.sign??1:0).transformDirection(inverse);return Math.abs(p.x)<56&&Math.abs(p.z+20.1953125)<12&&(!direction||direction.z<-.6);}))return null;
 const bands=[[2,5.6953125],[5.6953125,34.01171875],[34.01171875,45.9375]]as const,faces=bands.map(([bottom,top])=>band(source,bottom,top)),fascia=source.find(f=>f.material.name==='lambert2'&&f.p.every(p=>near(p.x,-54))&&near(Math.min(...f.p.map(p=>p.y)),45.9375)&&near(Math.max(...f.p.map(p=>p.y)),54));if(faces.some(f=>!f)||!fascia)return null;
 const positions:number[]=[],uvs:number[]=[],colors:number[]=[];
 for(let k=0;k<bands.length;k++){const[bottom,top]=bands[k],face=faces[k]!,left=-20.1953125,right=19.9609375,width=right-left;
  // Repeat actual source stone bays at their original horizontal texel scale.
  // This is an uninterrupted rear wall, with no reflected front door frame.
  for(let x=-48.01;x<48.009;x+=width){const end=Math.min(x+width,48.01),nativeEnd=left+(end-x),p=[new THREE.Vector3(x,bottom,-20.2153125),new THREE.Vector3(end,bottom,-20.2153125),new THREE.Vector3(end,top,-20.2153125),new THREE.Vector3(x,top,-20.2153125)],samples=[new THREE.Vector3(-48,bottom,left),new THREE.Vector3(-48,bottom,nativeEnd),new THREE.Vector3(-48,top,nativeEnd),new THREE.Vector3(-48,top,left)];for(const i of[0,1,2,0,2,3]){const b=THREE.Triangle.getBarycoord(samples[i],...face.p as[THREE.Vector3,THREE.Vector3,THREE.Vector3],new THREE.Vector3())!,uv=face.uv[0].clone().multiplyScalar(b.x).addScaledVector(face.uv[1],b.y).addScaledVector(face.uv[2],b.z),color=face.color[0].clone().multiplyScalar(b.x).add(face.color[1].clone().multiplyScalar(b.y)).add(face.color[2].clone().multiplyScalar(b.z));positions.push(...p[i].toArray());uvs.push(...uv.toArray());colors.push(...color.toArray());}}
 }
 const append=(points:THREE.Vector3[],face:Face,samples:THREE.Vector3[])=>{for(let i=1;i<points.length-1;i++)for(const j of[0,i,i+1]){const b=THREE.Triangle.getBarycoord(samples[j],...face.p as[THREE.Vector3,THREE.Vector3,THREE.Vector3],new THREE.Vector3())!,uv=face.uv[0].clone().multiplyScalar(b.x).addScaledVector(face.uv[1],b.y).addScaledVector(face.uv[2],b.z),color=face.color[0].clone().multiplyScalar(b.x).add(face.color[1].clone().multiplyScalar(b.y)).add(face.color[2].clone().multiplyScalar(b.z));positions.push(...points[j].toArray());uvs.push(...uv.toArray());colors.push(...color.toArray());}};
 const sourceLeft=Math.min(...fascia.p.map(p=>p.z)),sourceRight=Math.max(...fascia.p.map(p=>p.z)),width=sourceRight-sourceLeft;
 for(let x=-54.01;x<54.009;x+=width){const end=Math.min(x+width,54.01),nativeEnd=sourceLeft+end-x,p=[new THREE.Vector3(x,45.9375,-24),new THREE.Vector3(end,45.9375,-24),new THREE.Vector3(end,54,-24),new THREE.Vector3(x,54,-24)],samples=[new THREE.Vector3(-54,45.9375,sourceLeft),new THREE.Vector3(-54,45.9375,nativeEnd),new THREE.Vector3(-54,54,nativeEnd),new THREE.Vector3(-54,54,sourceLeft)];append(p,fascia,samples);}
 // The native rounded stone roof really ends at z=-24 with this section.
 // Join the omitted rear eaves and curved cap; a body-only door patch leaves
 // a second, wider escape above45.9375 beneath the planted roof.
 const profile=[[-54.01,54],[-48,58],[-28,64],[0,66],[28,64],[48,58],[54.01,54]];
 for(let i=0;i<profile.length-1;i++){const[x0,y0]=profile[i],[x1,y1]=profile[i+1],p=[new THREE.Vector3(x0,54,-24),new THREE.Vector3(x1,54,-24),new THREE.Vector3(x1,y1,-24),new THREE.Vector3(x0,y0,-24)],samples=p.map((q,j)=>new THREE.Vector3(-54,THREE.MathUtils.lerp(45.9375,54,(q.y-54)/12),j===0||j===3?sourceLeft:sourceRight));for(let k=1;k<p.length-1;k++){const ids=[0,k,k+1];if(new THREE.Triangle(...ids.map(j=>p[j])as[THREE.Vector3,THREE.Vector3,THREE.Vector3]).getArea()>1e-6)append(ids.map(j=>p[j]),fascia,ids.map(j=>samples[j]));}}
 const soffit=[new THREE.Vector3(-48.01,45.9375,-20.2153125),new THREE.Vector3(48.01,45.9375,-20.2153125),new THREE.Vector3(54.01,45.9375,-24),new THREE.Vector3(-54.01,45.9375,-24)];append(soffit,fascia,soffit.map(()=>new THREE.Vector3(-54,45.9375,sourceLeft)));
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();const material=faces[0]!.material.clone();material.side=THREE.DoubleSide;material.transparent=false;material.opacity=1;material.alphaTest=0;material.depthWrite=true;material.vertexColors=true;const mesh=new THREE.Mesh(geometry,material);mesh.name='landmark-annex-alph-research-stone';root.add(mesh);root.traverse(o=>{if(o.name==='entrance-rear-wall')o.visible=false;});return{family:'alph-research-center',triangles:positions.length/9,removedHullFaces:0};
}
/** Small landmark profiles with different passage semantics: preserve the
 * freestanding League arch opening; close the research center's omitted rear
 * using its own rough stone. Cached buffers, maps and front art stay shared. */
export function closeLandmarkAnnexShell(root:THREE.Object3D,asset:string,doors:BuildingEntrance[]=[]):LandmarkAnnexShell|null{
 const match=asset.match(/(?:^|\/)1-(147|154)-\d+\.glb$/);if(!match)return null;const previous=root.userData.landmarkAnnexShell as LandmarkAnnexShell|undefined;if(previous)return previous;const source=nativeFaces(root),summary=Number(match[1])===147?arch(root,source):research(root,source,doors);if(summary)root.userData.landmarkAnnexShell=summary;return summary;
}
