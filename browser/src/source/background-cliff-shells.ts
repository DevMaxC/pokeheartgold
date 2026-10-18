import * as THREE from 'three';
import type {Cell,Land,Matrix} from './types.ts';
import type {BuildingEntrance} from './render-repair.ts';
import type {Terraces} from './ledges.ts';

export const BACKGROUND_CLIFF_SHELL='source-background-cliff-shell';
export const BACKGROUND_CLIFF_WALL_BAND={height:115/128,uPerWorld:.5,topV:25/256,bottomV:101/256} as const;
/** Actual112 donor pair visible in the old hillside pixel. This single soil
 * band excludes the atlas' repeated rim rows; native buffers/maps stay shared. */
export function backgroundCliffWallMaterial(root:THREE.Group):THREE.MeshBasicMaterial|null{
 if(root.parent||!root.position.equals(new THREE.Vector3())||!root.scale.equals(new THREE.Vector3(1,1,1))||!root.quaternion.equals(new THREE.Quaternion()))return null;
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),matches:THREE.MeshBasicMaterial[]=[];
 const expected=[[[227.375,81.578125,-80],[227.375,81.578125,48],[234.71875,95.953125,48]],[[227.375,81.578125,-80],[234.71875,95.953125,48],[234.71875,95.953125,-80]]],texture=[[[-2,101/256],[2,101/256],[2,25/256]],[[-2,101/256],[2,25/256],[-2,25/256]]];
 root.traverse(o=>{
  if(!(o instanceof THREE.SkinnedMesh)||Array.isArray(o.material)||!(o.material instanceof THREE.MeshBasicMaterial)||o.material.name!=='wall01_d')return;
  const g=o.geometry,p=g.getAttribute('position'),uv=g.getAttribute('uv'),color=g.getAttribute('color'),index=g.index,m=o.material;
  if(p.count!==4263||index?.count!==2232||!uv||!color||!g.hasAttribute('skinIndex')||!g.hasAttribute('skinWeight')||!m.map||m.map.image.width!==32||m.map.image.height!==32||m.map.wrapS!==THREE.RepeatWrapping||!m.visible||m.transparent||m.opacity!==1||m.alphaTest)return;
  for(let face=0;face<2;face++)for(let j=0;j<3;j++){const i=index.getX((158+face)*3+j),point=o.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(o.matrixWorld).applyMatrix4(inverse);if(!point.equals(new THREE.Vector3(...expected[face][j] as[number,number,number]))||uv.getX(i)!==texture[face][j][0]||uv.getY(i)!==texture[face][j][1]||color.getX(i)!==1||color.getY(i)!==1||color.getZ(i)!==1)return;}
  matches.push(m);
 });return matches.length===1?matches[0]:null;
}
const cuts=[-16,-8,0,8,16] as const;
const triangleKey=(p:THREE.Vector3[])=>p.map(v=>v.toArray().join(',')).sort().join('|');
const expectedCap=new Set<string>();
for(let z=0;z<4;z++)for(let x=0;x<4;x++){
 const a=new THREE.Vector3(cuts[x],0,cuts[z+1]),b=new THREE.Vector3(cuts[x+1],0,cuts[z+1]),c=new THREE.Vector3(cuts[x+1],0,cuts[z]),d=new THREE.Vector3(cuts[x],0,cuts[z]);
 expectedCap.add(triangleKey([a,b,c]));expectedCap.add(triangleKey([a,c,d]));
}
function nativeBlockedFloor(land:Land){
 const p=land.plates[0];return land.permissions.length===1024&&land.permissions.every(v=>v===0x8000)&&land.plates.length===1&&p.constant===0&&p.normal.join(',')==='0,1,0'&&p.bounds.join(',')==='-16,-16,16,16';
}

/** Explicit 3D backs for the three background sheets exposed in the New Bark
 * camera witness. This is a designed rock volume, not inferred native geometry
 * or permission to fill other terrain. The original cap and collision stay put.
 * Datum zero closes their matrix-void edges using the released forestFoundation
 * convention. This is explicitly designed scenery, not native void support. */
export function backgroundCliffShell(root:THREE.Group,cell:Cell,matrix:Matrix,land:Land,forest:Land,entrances:BuildingEntrance[]=[],terraces?:Terraces,wallRoot?:THREE.Group):THREE.Mesh<THREE.BufferGeometry,THREE.MeshBasicMaterial>|null{
 if(root.getObjectByName(BACKGROUND_CLIFF_SHELL)||cell.asset!=='land/210-0.glb'||cell.land!==210||matrix.width!==47||matrix.height!==17)return null;
 const altitude=cell.x===21&&cell.z===10?14:cell.x===22&&cell.z===11?4:cell.x===23&&cell.z===11?6:null;
 if(altitude===null||cell.altitude!==altitude||cell.props.length||!nativeBlockedFloor(land)||!nativeBlockedFloor(forest))return null;
 const index=cell.z*matrix.width+cell.x,forestIndex=11*matrix.width+21;
 if(matrix.models[index]!==210||matrix.altitudes[index]!==altitude||matrix.headers?.[index]!==0||matrix.models[forestIndex]!==208||matrix.altitudes[forestIndex]!==2||matrix.headers?.[forestIndex]!==0)return null;
 const minX=cell.x*32,minZ=cell.z*32;
 if(entrances.some(e=>e.x>=minX&&e.x<=minX+32&&e.z>=minZ&&e.z<=minZ+32))return null;
 const cladding=wallRoot&&backgroundCliffWallMaterial(wallRoot);if(!cladding)return null;
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);
 const worldPosition=root.getWorldPosition(new THREE.Vector3()),worldScale=root.getWorldScale(new THREE.Vector3()),worldRotation=root.getWorldQuaternion(new THREE.Quaternion());
 if(!worldPosition.equals(new THREE.Vector3(minX+16,altitude*.5,minZ+16))||!worldScale.equals(new THREE.Vector3(1,1,1))||!worldRotation.equals(new THREE.Quaternion()))return null;
 const inverse=root.matrixWorld.clone().invert(),rawCap:{p:THREE.Vector3[];uv:THREE.Vector2[]}[]=[],cap:{p:THREE.Vector3[];uv:THREE.Vector2[]}[]=[],seen=new Set<string>();let source:THREE.MeshBasicMaterial|undefined,invalid=false,nativeCount=0;
 const faces=(object:THREE.Mesh,visit:(points:THREE.Vector3[],texture:THREE.Vector2[],material:THREE.Material)=>void)=>{
  const materials=Array.isArray(object.material)?object.material:[object.material],g=object.geometry,p=g.getAttribute('position'),uv=g.getAttribute('uv'),indices=g.index;
  if(!uv){invalid=true;return;}
  for(const group of g.groups.length?g.groups:[{start:0,count:indices?.count??p.count,materialIndex:0}])for(let at=group.start;at<group.start+group.count;at+=3){
   const ids=[0,1,2].map(j=>indices?indices.getX(at+j):at+j);visit(ids.map(i=>object.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(object.matrixWorld).applyMatrix4(inverse)),ids.map(i=>new THREE.Vector2(uv.getX(i),uv.getY(i))),materials[group.materialIndex??0]);
  }
 };
 // The hidden native primitive proves identity even when the released deformer
 // subdivides it. The current visible cap proves the exact shared boundary.
 root.traverse(object=>{
  if(!(object instanceof THREE.Mesh)||!['ro_mountc','ro_mountc_1'].includes(object.name))return;nativeCount++;
  faces(object,(points,texture,m)=>{
   if(!(m instanceof THREE.MeshBasicMaterial)||m.name!=='cliff01'||m.transparent||m.opacity!==1||m.alphaTest!==0||source&&source!==m){invalid=true;return;}source=m;
   const key=triangleKey(points);if(!expectedCap.has(key)||seen.has(key)||points.some((p,i)=>texture[i].x!==p.x/2||texture[i].y!==p.z/2+1)){invalid=true;return;}
   seen.add(key);rawCap.push({p:points,uv:texture});
  });
 });
 if(invalid||nativeCount!==1||!source||rawCap.length!==32||seen.size!==expectedCap.size)return null;
 let area=0,visibleCount=0;
 root.traverseVisible(object=>{
  if(!(object instanceof THREE.Mesh))return;
  if(object instanceof THREE.InstancedMesh||!['ro_mountc','ro_mountc_1','source-terrace-surface'].includes(object.name)){invalid=true;return;}visibleCount++;
  faces(object,(points,texture,m)=>{
   if(m!==source){invalid=true;return;}
   const centre=points.reduce((v,p)=>v.add(p),new THREE.Vector3()).multiplyScalar(1/3),tx=Math.floor(worldPosition.x+centre.x),tz=Math.floor(worldPosition.z+centre.z);
   if(points.some((p,i)=>p.x < -16||p.x>16||p.z < -16||p.z>16||texture[i].x!==p.x/2||texture[i].y!==p.z/2+1||p.y!==Math.fround(terraces?.sample(tx,tz,worldPosition.x+p.x,worldPosition.z+p.z)??0))){invalid=true;return;}
   const a=points[0],b=points[1],c=points[2],projected=((b.z-a.z)*(c.x-a.x)-(b.x-a.x)*(c.z-a.z))/2;
   if(!(projected>0)){invalid=true;return;}area+=projected;cap.push({p:points,uv:texture});
  });
 });
 if(invalid||visibleCount!==1||area!==1024||!cap.length)return null;
 const boundary=Array.from({length:4},()=>[]as{a:THREE.Vector3;b:THREE.Vector3;ta:number;tb:number}[]),parameter=(side:number,p:THREE.Vector3)=>[p.z,p.x,-p.z,-p.x][side];
 for(const face of cap)for(let i=0;i<3;i++){
  const a=face.p[i],b=face.p[(i+1)%3],side=a.x===-16&&b.x===-16?0:a.z===16&&b.z===16?1:a.x===16&&b.x===16?2:a.z===-16&&b.z===-16?3:-1;
  if(side<0)continue;const ta=parameter(side,a),tb=parameter(side,b);if(ta!==tb)boundary[side].push({a,b,ta,tb});
 }
 const profiles:THREE.Vector3[][]=[];
 for(let side=0;side<4;side++){
  const points=new Map<number,THREE.Vector3>();for(const edge of boundary[side])for(const p of[edge.a,edge.b]){const t=parameter(side,p),prior=points.get(t);if(prior&&!prior.equals(p))return null;points.set(t,p);}
  const sorted=[...points].sort((a,b)=>a[0]-b[0]);if(sorted[0]?.[0]!==-16||sorted.at(-1)?.[0]!==16)return null;
  for(let i=0;i<sorted.length-1;i++){
   const[a,p]=sorted[i],[b,q]=sorted[i+1];if(!boundary[side].some(e=>Math.min(e.ta,e.tb)<=a&&Math.max(e.ta,e.tb)>=b&&e.a.y+(e.b.y-e.a.y)*(a-e.ta)/(e.tb-e.ta)===p.y&&e.a.y+(e.b.y-e.a.y)*(b-e.ta)/(e.tb-e.ta)===q.y))return null;
  }
  profiles.push(sorted.map(([,p])=>p));
 }
 const bottom=-altitude*.5,positions:number[]=[],uvs:number[]=[];
 const triangle=(p:THREE.Vector3[],uv:THREE.Vector2[])=>{for(let i=0;i<3;i++){positions.push(...p[i].toArray());uvs.push(...uv[i].toArray());}};
 for(const profile of profiles)for(let i=0;i<profile.length-1;i++){
  const a=profile[i],b=profile[i+1],worldA=a.y-bottom,worldB=b.y-bottom,band=BACKGROUND_CLIFF_WALL_BAND,u=(Math.abs(a.x-profile[0].x)+Math.abs(a.z-profile[0].z))*band.uPerWorld,v=(Math.abs(b.x-profile[0].x)+Math.abs(b.z-profile[0].z))*band.uPerWorld;
  // The three literal cap profiles never cross a donor-band cut. Decline a
  // future changed field instead of rounding a new cut into the native cap.
  // A nonconstant edge starting exactly on a cut also has an upper wedge
  // that the common full-band loop cannot represent. Constant-cut edges close.
  // The designed bottom must never sit above a future changed cap profile.
  if(Math.min(worldA,worldB)<0||Math.floor(worldA/band.height)!==Math.floor(worldB/band.height)||worldA!==worldB&&Math.min(worldA,worldB)%band.height===0)return null;
  for(let low=0;low<Math.min(worldA,worldB);low+=band.height){
   const high=low+band.height,topA=Math.min(high,worldA),topB=Math.min(high,worldB),aa=a.clone().setY(topA===worldA?a.y:topA+bottom),bb=b.clone().setY(topB===worldB?b.y:topB+bottom),cc=b.clone().setY(low+bottom),dd=a.clone().setY(low+bottom),span=band.bottomV-band.topV;
   const at=(u:number,y:number)=>new THREE.Vector2(u,band.bottomV-(y-low)/band.height*span);
   triangle([aa,bb,cc],[at(u,topA),at(v,topB),at(v,low)]);triangle([aa,cc,dd],[at(u,topA),at(v,low),at(u,low)]);
  }
 }
 for(const face of rawCap)triangle([face.p[0].clone().setY(bottom),face.p[2].clone().setY(bottom),face.p[1].clone().setY(bottom)],[face.uv[0],face.uv[2],face.uv[1]].map(uv=>new THREE.Vector2(uv.x,(BACKGROUND_CLIFF_WALL_BAND.topV+BACKGROUND_CLIFF_WALL_BAND.bottomV)/2)));
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
 geometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(positions.length).fill(1),3));
 const material=cladding.clone();material.name='background-cliff-native-cladding';material.transparent=false;material.opacity=1;material.alphaTest=0;material.side=THREE.DoubleSide;
 const mesh=new THREE.Mesh(geometry,material);mesh.name=BACKGROUND_CLIFF_SHELL;mesh.userData.terrainSceneryCoverageOnly=true;mesh.userData.backgroundCliffAdaptation={cell:[cell.x,cell.z],nativeCapTriangles:32,deformedCapTriangles:cap.length,designedVoidDatum:0,notNativeSourceAuthority:true,wallDonor:'land/112-9.glb:wall01_d:158,159',wallBand:BACKGROUND_CLIFF_WALL_BAND};return mesh;
}
