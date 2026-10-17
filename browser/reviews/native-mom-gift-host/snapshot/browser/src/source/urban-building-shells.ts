import * as THREE from 'three';
import type {BuildingEntrance} from './render-repair.ts';

/** Exact native Goldenrod department store and Silph Co. models. Their back
 * elevations use measured side cladding and window-only native modules. */
export const URBAN_BUILDING_MODELS=new Set([76,257]);
export type UrbanBuildingShell={family:string;triangles:number};
type Face={p:THREE.Vector3[];uv:THREE.Vector2[];color:THREE.Color[];normal:THREE.Vector3;area:number;material:THREE.MeshBasicMaterial};
const generated=new Set(['3d-rear-facade','3d-solid-backing','entrance-rear-wall']);
const near=(a:number,b:number)=>Math.abs(a-b)<.045;
function sourceFaces(root:THREE.Object3D){
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),faces:Face[]=[];
 root.traverse(o=>{if(!(o instanceof THREE.Mesh)||o instanceof THREE.InstancedMesh||generated.has(o.name)||o.name.startsWith('urban-building-'))return;
  const g=o.geometry,p=g.getAttribute('position'),uv=g.getAttribute('uv'),colors=g.getAttribute('color'),idx=g.index,mats=Array.isArray(o.material)?o.material:[o.material];
  for(const group of g.groups.length?g.groups:[{start:0,count:idx?.count??p.count,materialIndex:0}]){const material=mats[group.materialIndex??0]as THREE.MeshBasicMaterial;if(!material.visible||material.opacity<.5||/kage|shadow|hikaru|hikari|h_in/i.test(material.name))continue;
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
 finish(root:THREE.Object3D,family:string){const group=new THREE.Group();group.name='urban-building-shell';let triangles=0;for(const[source,b]of this.batches){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(b.color,3));geometry.computeVertexNormals();const material=source.clone();material.side=THREE.DoubleSide;material.transparent=false;material.opacity=1;material.alphaTest=0;material.depthWrite=true;material.vertexColors=true;const mesh=new THREE.Mesh(geometry,material);mesh.name='urban-building-'+family+'-cladding';group.add(mesh);triangles+=b.p.length/9;}if(!triangles)return null;root.traverse(o=>{if(generated.has(o.name))o.visible=false;});root.add(group);return root.userData.urbanBuildingShell={family,triangles}as UrbanBuildingShell;}
}
function department(b:Builder,f:Face[]){
 const lower=f.find(face=>face.material.name==='ko_maku_lm1'&&face.normal.x<-.99&&near(Math.min(...face.p.map(p=>p.y)),2)&&near(Math.max(...face.p.map(p=>p.y)),47.36328125)&&face.p.some(p=>near(p.x,-39.9921875))),upper=f.find(face=>face.material.name==='ko_maku_lm1'&&face.normal.x>.99&&near(Math.min(...face.p.map(p=>p.y)),47.35546875)&&near(Math.max(...face.p.map(p=>p.y)),90.32421875)&&face.p.some(p=>near(p.z,-31.12890625))),cornice=f.find(face=>face.material.name==='ko_maku_lm1'&&face.normal.x>.99&&near(Math.min(...face.p.map(p=>p.y)),90.41015625)&&near(Math.max(...face.p.map(p=>p.y)),97.47265625)),machine=plane(f,'ko_depart_lm1','x',3.71875,97.984375,114.24609375);
 if(!lower||!upper||!cornice||!machine)return false;
 // The lower/upper rear edges are slightly tapered in the original model.
 // Join those exact side endpoints instead of extruding the blue front stair
 // well (and its door-shaped dark inset) over the back of the entire store.
 b.quad([[-39.9921875,2,-30.7109375],[39.9921875,2,-30.6484375],[39.9921875,47.35546875,-30.6484375],[-39.9921875,47.35546875,-30.7109375]],lower,[[-39.9921875,2,-30.7109375],[-39.7734375,2,16.94921875],[-39.65234375,47.36328125,16.8515625],[-39.9921875,47.35546875,-30.7109375]]);
 b.quad([[-39.9921875,47.35546875,-30.7109375],[39.9921875,47.35546875,-30.6484375],[39.9921875,90.32421875,-31.12890625],[-39.9921875,90.32421875,-30.7109375]],upper,[[39.9921875,47.35546875,-30.6484375],[39.65234375,47.36328125,16.8515625],[39.75,90.32421875,16.9296875],[39.9921875,90.32421875,-31.12890625]]);
 // Continue the orange roof's real chamfered fascia, including the short
 // underside return; the rooftop machine does not define building height.
 const rear=[[-41.375,-31.04296875],[-35.2734375,-37.61328125],[0,-37.640625],[35.4375,-37.61328125],[41.375,-31.04296875]];
 for(let i=0;i<rear.length-1;i++){const[a,c]=[rear[i],rear[i+1]];b.quad([[a[0],90.4140625,a[1]],[c[0],90.4140625,c[1]],[c[0],97.4765625,c[1]],[a[0],97.4765625,a[1]]],cornice,[[41.375,90.4140625,-31.04296875],[41.5390625,90.41015625,23.5546875],[41.5625,97.47265625,23.5625],[41.375,97.47265625,-31.04296875]]);}
 b.join([[-39.9921875,90.32421875,-30.7109375],[39.9921875,90.32421875,-31.12890625]],[[-35.2734375,90.4140625,-37.61328125],[35.4375,90.4140625,-37.61328125]],upper);
 // The shallow native roof deck starts at Y92.0859; the side cladding
 // stops at90.3242. Close the short rear return between them, below the
 // existing cornice, rather than leaving an open slot above the rear wall.
 b.quad([[-39.9921875,90.32421875,-30.7109375],[39.9921875,90.32421875,-31.12890625],[39.9921875,92.0859375,-31.12890625],[-39.9921875,92.0859375,-30.7109375]],upper,[[39.9921875,88.5625,-31.12890625],[39.75,88.5625,16.9296875],[39.75,90.32421875,16.9296875],[39.9921875,90.32421875,-31.12890625]]);
 b.quad([[3.71875,97.984375,-14.37109375],[28.421875,97.984375,-14.37109375],[28.421875,114.24609375,-13.55078125],[3.71875,114.24609375,-13.55078125]],machine,[[3.71875,97.984375,-14.37109375],[3.71875,97.984375,11.125],[3.71875,114.24609375,11.078125],[3.71875,114.24609375,-13.55078125]]);
 // Reuse the twelve isolated native window modules, including their frames.
 // They are separate from the front's blue shaft, signage, banners and door.
 const windows=f.filter(face=>(face.material.name==='ko_maku_lm1'||face.material.name==='h_mado_lm5')&&face.p.every(p=>near(p.z,35.1796875)&&p.y>=36&&p.y<=83&&Math.abs(p.x)<18));
 if(windows.length<100)return false;
 for(const window of windows)b.face(window.p.map(p=>p.clone().setZ(-31.5)),window,window.p);return true;
}
function silph(b:Builder,f:Face[]){
 const base=plane(f,'ybc_sl02','x',-80,2,10),wall=plane(f,'ybc_sl02','x',78,38,52),trim=plane(f,'ybc_sl02','x',80,48,52),window=plane(f,'ybc_wd01','z',46,38,52),roof=plane(f,'ybc_sl02','x',80,146,150),gable=f.filter(face=>face.material.name==='ybc_sl07'&&face.p.every(p=>near(p.z,40)&&p.y>=150));if(!base||!wall||!trim||!window||!roof||gable.length!==6)return false;
 const body=[[-78,-44.3984375],[-67.203125,-55.203125],[67.203125,-55.203125],[78,-44.3984375]],ribs=[[-80,-46.3984375],[-69.203125,-57.203125],[69.203125,-57.203125],[80,-46.3984375]],roofRear=[[-80,-45.6015625],[-69.6015625,-56],[69.6015625,-56],[80,-45.6015625]];
 const perimeter=(points:number[][],bottom:number,top:number,source:Face,sourceAt:number,sourceLow:number,sourceHigh:number)=>{for(let i=0;i<points.length-1;i++){const[a,c]=[points[i],points[i+1]],lo=Math.min(...source.p.map(p=>p.y)),hi=Math.max(...source.p.map(p=>p.y));b.quad([[a[0],bottom,a[1]],[c[0],bottom,c[1]],[c[0],top,c[1]],[a[0],top,a[1]]],source,[[sourceAt,lo,sourceLow],[sourceAt,lo,sourceHigh],[sourceAt,hi,sourceHigh],[sourceAt,hi,sourceLow]]);}};
 perimeter(body,2,10,base,-80,-46.3984375,37.203125);
 for(let bottom=10;bottom<147.66;bottom+=14){const top=Math.min(bottom+14,147.6640625);perimeter(body,bottom,top,wall,78,-44.3984375,35.203125);
  // The rear's full-height windows continue the authored blue glazing grid;
  // the two front entrance floors deliberately use an ordinary upper window
  // row here, so no reflected lobby or second door can reappear at the back.
  const z=-55.265625;b.quad([[-56,bottom,z],[56,bottom,z],[56,top,z],[-56,top,z]],window,[[-56,38,46],[56,38,46],[56,52,46],[-56,52,46]]);
 }
 for(let top=24;top<=136;top+=14)perimeter(ribs,top-4,top,trim,80,-46.3984375,37.203125);
 perimeter(roofRear,146,150,roof,80,-45.6015625,37.6015625);
 // Original flat deck and blue barrel roof stay untouched. Only the omitted
 // rear end of that measured barrel is closed with its native gable art.
 for(const face of gable)b.face(face.p.map(p=>p.clone().setZ(-48)),face,face.p);return true;
}
/** Complete these two high-rise rear elevations on each placed clone. A real
 * opposite entrance always wins. The native front, outer footprint, original
 * shared buffers and source atlas textures remain untouched. */
export function closeUrbanBuildingShell(root:THREE.Object3D,asset:string,doors:BuildingEntrance[]=[]):UrbanBuildingShell|null{
 const match=asset.match(/(?:^|\/)1-(\d+)-\d+\.glb$/),model=Number(match?.[1]);if(!match||!URBAN_BUILDING_MODELS.has(model))return null;const previous=root.userData.urbanBuildingShell as UrbanBuildingShell|undefined;if(previous)return previous;
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),rear=model===76?-31:-55.203125,width=model===76?40:78;
 if(doors.some(door=>{const local=new THREE.Vector3(door.x,root.getWorldPosition(new THREE.Vector3()).y,door.z).applyMatrix4(inverse);if(Math.abs(local.z-rear)>12||Math.abs(local.x)>width+4)return false;if(door.axis===undefined||door.sign===undefined)return true;return new THREE.Vector3().setComponent(door.axis,door.sign).transformDirection(inverse).z<-.5;}))return null;
 const builder=new Builder(),faces=sourceFaces(root);if(!(model===76?department(builder,faces):silph(builder,faces)))return null;return builder.finish(root,model===76?'goldenrod-department-store':'silph-company');
}
