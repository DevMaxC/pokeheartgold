import * as THREE from 'three';
import type {BuildingEntrance} from './render-repair.ts';

/** Native Olivine port-gate upper window and roof joins. */
export const AQUATIC_GATE_BUILDING_MODELS=new Set([167]);
export type AquaticGateBuildingShell={family:string;triangles:number};
type Face={p:THREE.Vector3[];uv:THREE.Vector2[];color:THREE.Color[];normal:THREE.Vector3;area:number;material:THREE.MeshBasicMaterial};
const generated=new Set(['3d-rear-facade','3d-solid-backing','entrance-rear-wall']);
const near=(a:number,b:number)=>Math.abs(a-b)<.045;
function sourceFaces(root:THREE.Object3D){
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),faces:Face[]=[];
 root.traverse(o=>{if(!(o instanceof THREE.Mesh)||o instanceof THREE.InstancedMesh||generated.has(o.name)||o.name.startsWith('aquatic-gate-building-'))return;
  const g=o.geometry,p=g.getAttribute('position'),uv=g.getAttribute('uv'),colors=g.getAttribute('color'),idx=g.index,mats=Array.isArray(o.material)?o.material:[o.material];
  for(const group of g.groups.length?g.groups:[{start:0,count:idx?.count??p.count,materialIndex:0}]){const material=mats[group.materialIndex??0]as THREE.MeshBasicMaterial;if(!material.visible||material.opacity<.5||/kage|shadow|hikaru|hikari|h_in|light_ani/i.test(material.name))continue;
   for(let at=group.start;at<group.start+group.count;at+=3){const ids=[0,1,2].map(i=>idx?idx.getX(at+i):at+i),points=ids.map(i=>o.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(o.matrixWorld).applyMatrix4(inverse)),normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])),area=normal.length()/2;if(area<1e-6)continue;faces.push({p:points,uv:ids.map(i=>uv?new THREE.Vector2(uv.getX(i),uv.getY(i)):new THREE.Vector2()),color:ids.map(i=>colors?new THREE.Color(colors.getX(i),colors.getY(i),colors.getZ(i)):new THREE.Color(1,1,1)),normal:normal.normalize(),area,material});}
  }
 });return faces;
}
function plane(faces:Face[],name:string,axis:'x'|'z',at:number,bottom:number,top:number){return faces.find(f=>f.material.name===name&&f.p.every(p=>near(p[axis],at))&&near(Math.min(...f.p.map(p=>p.y)),bottom)&&near(Math.max(...f.p.map(p=>p.y)),top));}
function sample(face:Face,p:THREE.Vector3){const w=THREE.Triangle.getBarycoord(p,...face.p as [THREE.Vector3,THREE.Vector3,THREE.Vector3],new THREE.Vector3())!;return{uv:face.uv[0].clone().multiplyScalar(w.x).addScaledVector(face.uv[1],w.y).addScaledVector(face.uv[2],w.z),color:face.color[0].clone().multiplyScalar(w.x).add(face.color[1].clone().multiplyScalar(w.y)).add(face.color[2].clone().multiplyScalar(w.z))};}
class Builder{
 private batches=new Map<THREE.MeshBasicMaterial,{p:number[];uv:number[];color:number[]}>();
 face(points:THREE.Vector3[],source:Face,samples:THREE.Vector3[]){let batch=this.batches.get(source.material);if(!batch){batch={p:[],uv:[],color:[]};this.batches.set(source.material,batch);}for(let i=1;i<points.length-1;i++){const ids=[0,i,i+1];if(new THREE.Triangle(...ids.map(j=>points[j])as[THREE.Vector3,THREE.Vector3,THREE.Vector3]).getArea()<1e-6)continue;for(const j of ids){const s=sample(source,samples[j]);batch.p.push(...points[j].toArray());batch.uv.push(...s.uv.toArray());batch.color.push(...s.color.toArray());}}}
 quad(points:number[][],source:Face,sourcePoints:number[][]){this.face(points.map(p=>new THREE.Vector3(...p as[number,number,number])),source,sourcePoints.map(p=>new THREE.Vector3(...p as[number,number,number])));}
 /** Close a roof underside with its own adjoining wall/beam pixel, rather
  * than filling an entire model box up to decorative signs or clock towers. */
 join(inner:number[][],outer:number[][],source:Face){const native=source.p[0].clone().add(source.p[1]).add(source.p[2]).multiplyScalar(1/3);for(let i=0;i<inner.length-1;i++)this.face([inner[i],inner[i+1],outer[i+1],outer[i]].map(p=>new THREE.Vector3(...p as[number,number,number])),source,Array.from({length:4},()=>native));}
 finish(root:THREE.Object3D,family:string){const group=new THREE.Group();group.name='aquatic-gate-building-shell';let triangles=0;for(const[source,b]of this.batches){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(b.color,3));geometry.computeVertexNormals();const material=source.clone();material.side=THREE.DoubleSide;material.transparent=false;material.opacity=1;material.alphaTest=0;material.depthWrite=true;material.vertexColors=true;const mesh=new THREE.Mesh(geometry,material);mesh.name='aquatic-gate-building-'+family+'-cladding';group.add(mesh);triangles+=b.p.length/9;}if(!triangles)return null;root.add(group);return root.userData.aquaticGateBuildingShell={family,triangles}as AquaticGateBuildingShell;}
}
/** Close only the omitted upper dormer/window return. Existing source and
 * shared rear/side gate repairs remain in place, including real approaches. */
export function closeAquaticGateBuildingShell(root:THREE.Object3D,asset:string,_doors:BuildingEntrance[]=[]):AquaticGateBuildingShell|null{
 if(!/(?:^|\/)1-167-\d+\.glb$/.test(asset))return null;const previous=root.userData.aquaticGateBuildingShell as AquaticGateBuildingShell|undefined;if(previous)return previous;const faces=sourceFaces(root),glass=faces.filter(f=>f.material.name==='asg_wall03'&&f.normal.z>.86&&f.normal.y>.49&&f.p.every(p=>p.y>=45.99&&p.y<=57.26)&&f.p.some(p=>near(p.z,34.5))),frame=faces.find(f=>f.material.name==='asg_wall01'&&f.normal.z>.99&&f.p.some(p=>near(p.x,21)&&near(p.y,64))&&f.p.some(p=>near(p.x,28)&&near(p.y,45))),rim=faces.find(f=>f.material.name==='asg_yane01'&&f.normal.z>.99&&f.p.every(p=>near(p.z,44))&&near(Math.min(...f.p.map(p=>p.y)),67)&&near(Math.max(...f.p.map(p=>p.y)),75));
 if(glass.length!==4||!frame||!rim||!plane(faces,'asg_wall02','x',28,45,62)||!faces.some(f=>f.material.name==='asg_yane01'&&f.p.some(p=>near(p.x,37.32421875)&&near(p.y,60)&&near(p.z,44))))return null;
 const b=new Builder();
 // The native window atlas intentionally masks its upper padding and vent
 // cutouts. Keep that artwork, with a solid recessed dark-glass backboard
 // using an actual opaque interior-window texel; never force transparent
 // atlas pixels into opaque black rectangles or move the inclined card.
 const right=glass.find(f=>f.p.every(p=>p.x>=0))!,paintY=57.2578125-(.203125-.046875)/(.46875-.046875)*(57.2578125-46),paint=new THREE.Vector3(14,paintY,41-(paintY-46)*6.5/(57.2578125-46));
 b.quad([[-21,45,34.5],[21,45,34.5],[21,57.2578125,34.5],[-21,57.2578125,34.5]],right,Array.from({length:4},()=>paint.toArray()));
 const head=[[-21,57.2578125,34.5],[21,57.2578125,34.5],[21,64,40],[-21,64,40]];
 // Join the original inclined glazing's exact top edge to the existing
 // 64-unit white frame. The glazing itself stays untouched and exposed;
 // only the missing head above it receives the frame's native paint band.
 b.quad(head,frame,head.map(p=>[21,p[1],40]));
 const xs=[-28,-21,-12.26171875,0,12.26171875,21,28],top=(x:number)=>Math.abs(x)<=21?64:64-(Math.abs(x)-21)*2/7,roof=(x:number)=>67-Math.max(0,Math.abs(x)-12.26171875)*7/(37.32421875-12.26171875),sample=rim.p[0].clone().add(rim.p[1]).add(rim.p[2]).multiplyScalar(1/3);
 // A narrow underside follows the measured central fascia, including its
 // two falls. It does not cap the whole model at the canopy or roof height.
 for(let i=0;i<xs.length-1;i++){const a=xs[i],c=xs[i+1];b.face([new THREE.Vector3(a,top(a),40),new THREE.Vector3(c,top(c),40),new THREE.Vector3(c,roof(c),44),new THREE.Vector3(a,roof(a),44)],rim,Array.from({length:4},()=>sample));}
 return b.finish(root,'olivine-aquatic-gate');
}
