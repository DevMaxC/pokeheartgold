import * as THREE from 'three';
import type {BuildingEntrance} from './render-repair.ts';

type Face={points:THREE.Vector3[];uv:THREE.Vector2[];colors:THREE.Color[];normal:THREE.Vector3;material:THREE.MeshBasicMaterial};
type Cut={axis:'x'|'z';at:number;left:number;right:number;top:number};
export type StationBuildingShell={family:'goldenrod-magnet-station';triangles:number;passages:number;roofBoundaryEdges:number};
const generated=new Set(['3d-rear-facade','3d-solid-backing','entrance-rear-wall']);
const near=(a:number,b:number)=>Math.abs(a-b)<.035;

function sourceFaces(root:THREE.Object3D){
 // SkinnedMesh.updateMatrixWorld also refreshes bindMatrixInverse. Calling
 // updateWorldMatrix alone leaves placed, scaled native vertices displaced.
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);
 const inverse=root.matrixWorld.clone().invert(),faces:Face[]=[];
 root.traverse(object=>{
  if(!(object instanceof THREE.Mesh)||object instanceof THREE.InstancedMesh||generated.has(object.name)||object.name.startsWith('station-building-'))return;
  const geometry=object.geometry,position=geometry.getAttribute('position'),uv=geometry.getAttribute('uv'),color=geometry.getAttribute('color'),index=geometry.index,materials=Array.isArray(object.material)?object.material:[object.material];
  for(const group of geometry.groups.length?geometry.groups:[{start:0,count:index?.count??position.count,materialIndex:0}]){
   const material=materials[group.materialIndex??0] as THREE.MeshBasicMaterial;
   if(!material.visible||material.opacity<.5||!/^station_[ab]$/.test(material.name))continue;
   for(let at=group.start;at<group.start+group.count;at+=3){
    const ids=[0,1,2].map(i=>index?index.getX(at+i):at+i),points=ids.map(i=>object.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(object.matrixWorld).applyMatrix4(inverse)),normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
    if(normal.lengthSq()<1e-10)continue;
    faces.push({points,uv:ids.map(i=>uv?new THREE.Vector2(uv.getX(i),uv.getY(i)):new THREE.Vector2()),colors:ids.map(i=>color?new THREE.Color(color.getX(i),color.getY(i),color.getZ(i)):new THREE.Color(1,1,1)),normal:normal.normalize(),material});
   }
  }
 });return faces;
}
function sample(face:Face,point:THREE.Vector3){
 const weight=THREE.Triangle.getBarycoord(point,...face.points as[THREE.Vector3,THREE.Vector3,THREE.Vector3],new THREE.Vector3())!;
 return{uv:face.uv[0].clone().multiplyScalar(weight.x).addScaledVector(face.uv[1],weight.y).addScaledVector(face.uv[2],weight.z),color:face.colors[0].clone().multiplyScalar(weight.x).add(face.colors[1].clone().multiplyScalar(weight.y)).add(face.colors[2].clone().multiplyScalar(weight.z))};
}
class Builder{
 private batches=new Map<THREE.MeshBasicMaterial,{position:number[];uv:number[];color:number[]}>();
 constructor(readonly cuts:Cut[]){}
 face(points:THREE.Vector3[],source:Face,samples=points){
  let batch=this.batches.get(source.material);if(!batch){batch={position:[],uv:[],color:[]};this.batches.set(source.material,batch);}
  for(let i=1;i<points.length-1;i++)for(const ids of [[0,i,i+1]]){
   if(new THREE.Triangle(...ids.map(j=>points[j]) as[THREE.Vector3,THREE.Vector3,THREE.Vector3]).getArea()<1e-6)continue;
   for(const j of ids){const value=sample(source,samples[j]);batch.position.push(...points[j].toArray());batch.uv.push(...value.uv.toArray());batch.color.push(...value.color.toArray());}
  }
 }
 /** Repeat a genuine wall bay at its original texel scale. The rear never
  * receives the original front door, sign, ticket windows, or clock cards. */
 rear(bottom:number,top:number,source:Face){
  const left=-48,right=72,z=-32,sourceLeft=50,sourceRight=64,sourceBottom=Math.min(...source.points.map(p=>p.y)),sourceTop=Math.max(...source.points.map(p=>p.y));
  const cuts=this.cuts.filter(c=>c.axis==='z'&&near(c.at,z)),splits=[left,right,...cuts.flatMap(c=>[c.left,c.right]).filter(x=>x>left&&x<right)].sort((a,b)=>a-b);
  for(let k=0;k<splits.length-1;k++){
   const a=splits[k],b=splits[k+1],middle=(a+b)/2,base=Math.max(bottom,...cuts.filter(c=>middle>c.left&&middle<c.right).map(c=>c.top));if(base>=top-.001)continue;
   const count=Math.ceil((b-a)/(sourceRight-sourceLeft));
   for(let i=0;i<count;i++){
    const x0=THREE.MathUtils.lerp(a,b,i/count),x1=THREE.MathUtils.lerp(a,b,(i+1)/count),points=[new THREE.Vector3(x0,base,z),new THREE.Vector3(x1,base,z),new THREE.Vector3(x1,top,z),new THREE.Vector3(x0,top,z)],samples=points.map((_,j)=>new THREE.Vector3(j===0||j===3?sourceLeft:sourceRight,j<2?THREE.MathUtils.lerp(sourceBottom,sourceTop,(base-bottom)/(top-bottom)):sourceTop,40));
    this.face(points,source,samples);
   }
  }
 }
 finish(root:THREE.Object3D,roofBoundaryEdges:number){
  const group=new THREE.Group();group.name='station-building-shell';let triangles=0;
  for(const[source,batch]of this.batches){
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(batch.position,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(batch.uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(batch.color,3));geometry.computeVertexNormals();
   const material=source.clone();material.side=THREE.DoubleSide;material.transparent=false;material.opacity=1;material.alphaTest=0;material.depthWrite=true;material.vertexColors=true;
   const mesh=new THREE.Mesh(geometry,material);mesh.name='station-building-goldenrod-cladding';group.add(mesh);triangles+=batch.position.length/9;
  }
  if(!triangles)return null;
  root.traverse(object=>{if(generated.has(object.name))object.visible=false;});root.add(group);
  return root.userData.stationBuildingShell={family:'goldenrod-magnet-station',triangles,passages:this.cuts.length,roofBoundaryEdges} as StationBuildingShell;
 }
}
function wall(faces:Face[],bottom:number,top:number){return faces.find(f=>f.material.name==='station_a'&&f.points.every(p=>near(p.z,40)&&p.x>=49.99&&p.x<=64.01)&&near(Math.min(...f.points.map(p=>p.y)),bottom)&&near(Math.max(...f.points.map(p=>p.y)),top));}
function key(point:THREE.Vector3){return point.toArray().map(n=>Math.round(n*1e4)).join(',');}
/** The native roof consists of three intersecting curved patches, not a flat
 * slab or an ordinary barrel. Keep all 192 top triangles and their painted
 * ribs. Close only their open perimeter edges down to the measured spring
 * plane. Outer front/side closures sit behind the existing navy arch art. */
function roof(builder:Builder,faces:Face[]){
 const tops=faces.filter(f=>f.material.name==='station_a'&&f.normal.y>.05&&f.points.every(p=>p.y>73.9));
 if(tops.length!==192)return 0;
 const edges=new Map<string,{a:THREE.Vector3;b:THREE.Vector3;face:Face;count:number}>();
 for(const face of tops)for(let i=0;i<3;i++){
  const a=face.points[i],b=face.points[(i+1)%3],id=[key(a),key(b)].sort().join('|'),previous=edges.get(id);
  if(previous)previous.count++;else edges.set(id,{a,b,face,count:1});
 }
 const boundary=[...edges.values()].filter(e=>e.count===1);
 for(const{a,b,face}of boundary){
  if(Math.max(a.y,b.y)<=74.001)continue;
  const innerA=a.clone(),innerB=b.clone();let sideBase:number|undefined;
  // The authored front navy arch is recessed 3.344 units behind its white
  // rim; the side arches follow a sloped plane two units inside their rims.
  // New white inner walls must therefore remain behind that original art.
  if(near(a.z,45.55078125)&&near(b.z,45.55078125)){innerA.z=innerB.z=42.1;}
  else if(near(a.z,-37.55078125)&&near(b.z,-37.55078125)){innerA.z=innerB.z=-34.1;}
  else if(Math.min(a.x,b.x)>=75.99){innerA.x-=2;innerB.x-=2;sideBase=74;}
  else if(Math.max(a.x,b.x)<=-51.99){innerA.x+=2;innerB.x+=2;sideBase=-50;}
  const baseA=innerA.clone().setY(74),baseB=innerB.clone().setY(74);
  if(sideBase!==undefined)baseA.x=baseB.x=sideBase;
  builder.face([innerA,innerB,baseB,baseA],face,[a,b,b,a]);
  if(!innerA.equals(a)||!innerB.equals(b))builder.face([a,b,innerB,innerA],face,[a,b,b,a]);
 }
 // The rear has no native arch cap. Reflect the front's actual white rim
 // and navy glass, excluding its separately authored clock cards. The cap
 // remains inset by the same distance on the rear, without duplicating a door.
 for(const face of faces.filter(f=>f.points.every(p=>p.y>=74)&&(f.material.name==='station_a'&&f.points.every(p=>near(p.z,45.55078125))||f.material.name==='station_b'&&f.points.every(p=>near(p.z,42.20703125))))){
  builder.face(face.points.map(p=>p.clone().setZ(8-p.z)),face,face.points);
 }
 return boundary.length;
}
/** Exact bank-one BUILD_MODEL_KO_STATION. All new geometry/materials belong
 * to this placed clone and use the station-building- disposal prefix. Source
 * geometries, material state, shared atlas textures and front art stay native. */
export function closeStationBuildingShell(root:THREE.Object3D,asset:string,doors:BuildingEntrance[]=[]):StationBuildingShell|null{
 if(!/(?:^|\/)1-88-\d+\.glb$/.test(asset))return null;
 const previous=root.userData.stationBuildingShell as StationBuildingShell|undefined;if(previous)return previous;
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),cuts:Cut[]=[];
 for(const entrance of doors){
  const point=new THREE.Vector3(entrance.x,root.getWorldPosition(new THREE.Vector3()).y,entrance.z).applyMatrix4(inverse),direction=entrance.axis===undefined?null:new THREE.Vector3().setComponent(entrance.axis,entrance.sign??1).transformDirection(inverse);
  // Only an entrance actually bounded by the rear elevation can cut it.
  if(point.z<-44||point.z>-24||point.x<-56||point.x>80||direction&&direction.z>-.6)continue;
  cuts.push({axis:'z',at:-32,left:point.x-8.1,right:point.x+8.1,top:34});
 }
 const faces=sourceFaces(root),lower=wall(faces,2,36),upper=wall(faces,44,70.62109375),trim=wall(faces,36,44),cornice=wall(faces,70.62109375,78);
 if(!lower||!upper||!trim||!cornice)return null;
 const builder=new Builder(cuts);for(const[bottom,top,source]of [[2,36,lower],[36,44,trim],[44,70.62109375,upper],[70.62109375,78,cornice]] as const)builder.rear(bottom,top,source);
 const boundary=roof(builder,faces);if(boundary!==72)return null;
 return builder.finish(root,boundary);
}
