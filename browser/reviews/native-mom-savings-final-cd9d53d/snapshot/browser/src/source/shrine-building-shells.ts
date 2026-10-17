import * as THREE from 'three';
import type {BuildingEntrance} from './render-repair.ts';

type Face={p:THREE.Vector3[];uv:THREE.Vector2[];color:THREE.Color[];material:THREE.MeshBasicMaterial};
const generated=new Set(['3d-rear-facade','3d-solid-backing','entrance-rear-wall']);
const near=(a:number,b:number)=>Math.abs(a-b)<.025;
function nativeFaces(root:THREE.Object3D){
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),out:Face[]=[];
 root.traverse(o=>{
  if(!(o instanceof THREE.Mesh)||o instanceof THREE.InstancedMesh||generated.has(o.name)||o.name.startsWith('shrine-building-'))return;
  const g=o.geometry,p=g.getAttribute('position'),uv=g.getAttribute('uv'),color=g.getAttribute('color'),index=g.index,materials=Array.isArray(o.material)?o.material:[o.material];
  for(const group of g.groups.length?g.groups:[{start:0,count:index?.count??p.count,materialIndex:0}]){const material=materials[group.materialIndex??0]as THREE.MeshBasicMaterial;if(material.name!=='t5_s02_lm'||!material.visible||material.opacity<.5)continue;
   for(let i=group.start;i<group.start+group.count;i+=3){const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),points=ids.map(id=>o.getVertexPosition(id,new THREE.Vector3()).applyMatrix4(o.matrixWorld).applyMatrix4(inverse));if(new THREE.Triangle(...points as[THREE.Vector3,THREE.Vector3,THREE.Vector3]).getArea()<1e-6)continue;out.push({p:points,uv:ids.map(id=>uv?new THREE.Vector2(uv.getX(id),uv.getY(id)):new THREE.Vector2()),color:ids.map(id=>color?new THREE.Color(color.getX(id),color.getY(id),color.getZ(id)):new THREE.Color(1,1,1)),material});}
  }
 });return out;
}
class Builder{
 private data=new Map<THREE.MeshBasicMaterial,{p:number[];uv:number[];color:number[]}>();
 face(points:THREE.Vector3[],source:Face,samples:THREE.Vector3[]){let data=this.data.get(source.material);if(!data){data={p:[],uv:[],color:[]};this.data.set(source.material,data);}for(let j=1;j<points.length-1;j++){const ids=[0,j,j+1];if(new THREE.Triangle(...ids.map(i=>points[i])as[THREE.Vector3,THREE.Vector3,THREE.Vector3]).getArea()<1e-6)continue;for(const i of ids){const b=THREE.Triangle.getBarycoord(samples[i],...source.p as[THREE.Vector3,THREE.Vector3,THREE.Vector3],new THREE.Vector3())!,uv=source.uv[0].clone().multiplyScalar(b.x).addScaledVector(source.uv[1],b.y).addScaledVector(source.uv[2],b.z),color=source.color[0].clone().multiplyScalar(b.x).add(source.color[1].clone().multiplyScalar(b.y)).add(source.color[2].clone().multiplyScalar(b.z));data.p.push(...points[i].toArray());data.uv.push(...uv.toArray());data.color.push(...color.toArray());}}}
 rear(bottom:number,top:number,source:Face,axis:'x'|'z',at:number,left:number,right:number){
  const pieces=Math.ceil(28.02/(right-left)),lo=Math.min(...source.p.map(p=>p.y)),hi=Math.max(...source.p.map(p=>p.y));for(let i=0;i<pieces;i++){const x0=-14.01+28.02*i/pieces,x1=-14.01+28.02*(i+1)/pieces,p=[new THREE.Vector3(x0,bottom,-12.58),new THREE.Vector3(x1,bottom,-12.58),new THREE.Vector3(x1,top,-12.58),new THREE.Vector3(x0,top,-12.58)],samples=p.map((_,j)=>{const q=new THREE.Vector3();q[axis]=at;q[axis==='x'?'z':'x']=j===0||j===3?left:right;q.y=j<2?lo:hi;return q;});this.face(p,source,samples);}
 }
 finish(root:THREE.Object3D){const group=new THREE.Group();group.name='shrine-building-shell';let triangles=0;for(const[source,data]of this.data){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(data.p,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(data.uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(data.color,3));geometry.computeVertexNormals();const material=source.clone();material.side=THREE.DoubleSide;material.transparent=false;material.opacity=1;material.alphaTest=0;material.depthWrite=true;material.vertexColors=true;const mesh=new THREE.Mesh(geometry,material);mesh.name='shrine-building-ilex-rear-cladding';group.add(mesh);triangles+=data.p.length/9;}if(!triangles)return 0;root.add(group);root.traverse(o=>{if(o.name==='entrance-rear-wall')o.visible=false;});root.userData.shrineBuildingShell=triangles;return triangles;}
}
/** UBA_HOKORA is raised on four open stilts. Its native rear is omitted, so
 * reflected front artwork becomes a second set of doors and a shrine emblem.
 * Continue the side's wooden boards across the actual rear, retain the white
 * corner frame/base rail, and close the gable to its measured sloping roof.
 * Native front, roof, finials, leg caps and the space under the shrine stay. */
export function closeShrineBuildingShell(root:THREE.Object3D,asset:string,doors:BuildingEntrance[]=[]):number{
 if(!/(?:^|\/)1-71-\d+\.glb$/.test(asset))return 0;if(root.userData.shrineBuildingShell)return root.userData.shrineBuildingShell as number;
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert();if(doors.some(d=>{const p=new THREE.Vector3(d.x,root.getWorldPosition(new THREE.Vector3()).y,d.z).applyMatrix4(inverse),direction=d.axis===undefined?null:new THREE.Vector3(d.axis===0?d.sign??1:0,0,d.axis===2?d.sign??1:0).transformDirection(inverse);return Math.abs(p.x)<22&&Math.abs(p.z+12.599609375)<8&&(!direction||direction.z<-.6);}))return 0;
 const source=nativeFaces(root),wall=source.find(f=>f.p.every(p=>near(p.x,14)&&p.z>=-7.81&&p.z<=2.41)&&near(Math.min(...f.p.map(p=>p.y)),19.19921875)&&near(Math.max(...f.p.map(p=>p.y)),36)),base=source.find(f=>f.p.every(p=>near(p.z,16.599609375)&&p.x>=0)&&near(Math.min(...f.p.map(p=>p.y)),13.599609375)&&near(Math.max(...f.p.map(p=>p.y)),19.19921875)),ridge=source.find(f=>f.p.every(p=>Math.abs(p.x)<2.11)&&near(Math.min(...f.p.map(p=>p.y)),52.099609375)&&near(Math.max(...f.p.map(p=>p.y)),54.19921875));if(!wall||!base||!ridge)return 0;
 const b=new Builder();b.rear(13.599609375,19.19921875,base,'z',16.599609375,0,14);b.rear(19.19921875,36,wall,'x',14,-7.80078125,2.400390625);
 // The side planks stop at36 while the sloping roof reaches40.199 at
 // their X=14 top edge. Shallow outward rays can pass above the boards
 // and below the overhanging eave. Continue only that measured side join,
 // with its own painted upper edge; the raised platform remains open below.
 for(const sign of[-1,1]){
  const donor=source.find(f=>f.p.every(p=>near(p.x,sign*14)&&p.z>=-7.81&&p.z<=2.41)&&near(Math.min(...f.p.map(p=>p.y)),19.19921875)&&near(Math.max(...f.p.map(p=>p.y)),36)),roof=source.find(f=>f.p.every(p=>p.x*sign>=2&&near(p.y+Math.abs(p.x),54.19921875))&&f.p.some(p=>near(Math.abs(p.x),17.5)));if(!donor||!roof)return 0;
  const at=sign*13.99,normal=roof.p[1].clone().sub(roof.p[0]).cross(roof.p[2].clone().sub(roof.p[0])),top=roof.p[0].y-normal.x*(at-roof.p[0].x)/normal.y+.005,z0=-12.599609375,z1=16.599609375,width=2.400390625+7.80078125;
  for(let z=z0;z<z1-1e-6;z+=width){const end=Math.min(z1,z+width),sample0=new THREE.Vector3(sign*14,36,-7.80078125),sample1=new THREE.Vector3(sign*14,36,-7.80078125+end-z);b.face([new THREE.Vector3(at,36,z),new THREE.Vector3(at,36,end),new THREE.Vector3(at,top,end),new THREE.Vector3(at,top,z)],donor,[sample0,sample1,sample1,sample0]);}
 }
 // The gable sits behind the existing red roof trim and white corner posts.
 // Follow the source roof section y=54.199-|x|, including its overhangs;
 // never project the front emblem or seal the open space between the stilts.
 const p=[new THREE.Vector3(-17.505,36.70421875,-12.58),new THREE.Vector3(-14.01,36,-12.58),new THREE.Vector3(14.01,36,-12.58),new THREE.Vector3(17.505,36.70421875,-12.58),new THREE.Vector3(0,54.20421875,-12.58)],samples=p.map(q=>new THREE.Vector3(14,THREE.MathUtils.lerp(19.19921875,36,(q.y-36)/(54.20421875-36)),THREE.MathUtils.lerp(-7.80078125,2.400390625,(q.x+17.505)/35.01)));b.face(p,wall,samples);
 // Four exact x=0 upward runtime rays miss the shared native ridge edge,
 // while x=±1e-6 rays hit its red roof. Give just that existing ridge a
 // continuous .02-unit-wide underside, below the unchanged roof artwork.
 const peak=ridge.p.find(q=>near(q.y,54.19921875))!;b.face([new THREE.Vector3(-.01,54.18421875,-9.525625),new THREE.Vector3(.01,54.18421875,-9.525625),new THREE.Vector3(.01,54.18421875,14.410390625),new THREE.Vector3(-.01,54.18421875,14.410390625)],ridge,[peak,peak,peak,peak]);return b.finish(root);
}
