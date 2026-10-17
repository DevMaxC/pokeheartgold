import * as THREE from 'three';
import type {BuildingEntrance} from './render-repair.ts';

/** Native Route34 Day Care and Celadon department-store profiles. */
export const FACILITY_BUILDING_MODELS=new Set([165,242]);
export type FacilityBuildingShell={family:string;triangles:number};
type Face={p:THREE.Vector3[];uv:THREE.Vector2[];color:THREE.Color[];normal:THREE.Vector3;area:number;material:THREE.MeshBasicMaterial};
const generated=new Set(['3d-rear-facade','3d-solid-backing','entrance-rear-wall']);
const near=(a:number,b:number)=>Math.abs(a-b)<.045;
function sourceFaces(root:THREE.Object3D){
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),faces:Face[]=[];
 root.traverse(o=>{if(!(o instanceof THREE.Mesh)||o instanceof THREE.InstancedMesh||generated.has(o.name)||o.name.startsWith('facility-building-'))return;
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
 finish(root:THREE.Object3D,family:string){const group=new THREE.Group();group.name='facility-building-shell';let triangles=0;for(const[source,b]of this.batches){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(b.color,3));geometry.computeVertexNormals();const material=source.clone();material.side=THREE.DoubleSide;material.transparent=false;material.opacity=1;material.alphaTest=0;material.depthWrite=true;material.vertexColors=true;const mesh=new THREE.Mesh(geometry,material);mesh.name='facility-building-'+family+'-cladding';group.add(mesh);triangles+=b.p.length/9;}if(!triangles)return null;root.traverse(o=>{if(generated.has(o.name))o.visible=false;});root.add(group);return root.userData.facilityBuildingShell={family,triangles}as FacilityBuildingShell;}
}
function rearBand(b:Builder,left:number,right:number,z:number,bottom:number,top:number,source:Face,sourceX:number,sourceZ0:number,sourceZ1:number){const count=Math.ceil((right-left)/Math.abs(sourceZ1-sourceZ0));for(let i=0;i<count;i++){const x0=THREE.MathUtils.lerp(left,right,i/count),x1=THREE.MathUtils.lerp(left,right,(i+1)/count),y0=Math.min(...source.p.map(p=>p.y)),y1=Math.max(...source.p.map(p=>p.y));b.quad([[x0,bottom,z],[x1,bottom,z],[x1,top,z],[x0,top,z]],source,[[sourceX,y0,sourceZ0],[sourceX,y0,sourceZ1],[sourceX,y1,sourceZ1],[sourceX,y1,sourceZ0]]);}}
function clipHeight(poly:THREE.Vector3[],y:number,sign:number){const result:THREE.Vector3[]=[];for(let i=0;i<poly.length;i++){const a=poly[i],c=poly[(i+1)%poly.length],da=(a.y-y)*sign,dc=(c.y-y)*sign;if(da>=-1e-7)result.push(a);if(da*dc<0)result.push(a.clone().lerp(c,da/(da-dc)));}return result;}
function daycare(b:Builder,f:Face[]){
 const wall=plane(f,'r34_educate_lm1','x',-54,10,42),base=plane(f,'r34_educate_lm1','x',-54,2,10),roof=f.filter(face=>face.material.name==='r34_educate_lm1'&&face.normal.z>.6&&face.normal.y>.7),lower=roof.filter(face=>near(Math.min(...face.p.map(p=>p.y)),42.6953125)&&near(Math.max(...face.p.map(p=>p.y)),60.12890625)&&face.area>250).sort((a,c)=>c.area-a.area)[0],upper=roof.filter(face=>near(Math.min(...face.p.map(p=>p.y)),60.12890625)&&near(Math.max(...face.p.map(p=>p.y)),68.84765625)&&face.area>150).sort((a,c)=>c.area-a.area)[0];if(!wall||!base||!lower||!upper)return false;
 rearBand(b,-54,54,-36,2,10,base,-54,-36,-.16796875);rearBand(b,-54,54,-36,10,42,wall,-54,-36,-.16796875);
 // The original L-shaped roof ends in this curved, non-planar boundary. The
 // entire rear hip was omitted for the DS camera, leaving the generic repair
 // visible as a pink slab. Continue that exact boundary to its actual rear
 // eave, keeping the front gable, play-yard opening and footprint untouched.
 const edge=[[-60,42.6953125,-45.4765625],[-40.984375,60.125,-35.46875],[-32,68.84765625,-30.37109375],[-3.9453125,68.84765625,-30.37109375],[33.82421875,68.84765625,-30.37109375],[42.3671875,60.12890625,-35.46875],[60,42.6953125,-45.4765625]];
 for(let i=0;i<edge.length-1;i++){const a=new THREE.Vector3(...edge[i]as[number,number,number]),c=new THREE.Vector3(...edge[i+1]as[number,number,number]),poly=[new THREE.Vector3(a.x,42.6953125,-45.4765625),new THREE.Vector3(c.x,42.6953125,-45.4765625),c,a];for(const[lo,hi,source]of[[42.6953125,60.12890625,lower],[60.12890625,68.84765625,upper]]as const){const clipped=clipHeight(clipHeight(poly,lo,1),hi,-1);if(clipped.length<3)continue;const sourceLeft=Math.min(...source.p.map(p=>p.x)),samples=clipped.map(p=>{const x=sourceLeft+p.x-a.x,y=THREE.MathUtils.clamp(p.y,lo,hi),origin=source.p[0],z=origin.z-(source.normal.x*(x-origin.x)+source.normal.y*(y-origin.y))/source.normal.z;return new THREE.Vector3(x,y,z);});b.face(clipped,source,samples);}}
 b.join([[-54,42,-36],[54,42,-36]],[[-60,42.6953125,-45.4765625],[60,42.6953125,-45.4765625]],wall);return true;
}
function department(b:Builder,f:Face[]){
 const bands:[[number,number],...Array<[number,number]>]=[[3.69921875,21.3203125],[21.3203125,39.32421875],[39.32421875,55.7890625],[55.7890625,73.765625]],sources=bands.map(([lo,hi])=>f.find(face=>face.material.name==='de1'&&face.normal.x>.99&&near(Math.min(...face.p.map(p=>p.y)),lo)&&near(Math.max(...face.p.map(p=>p.y)),hi)&&face.p.some(p=>near(p.z,-31.96484375))&&face.area>200)),cornice=f.find(face=>face.material.name==='de1'&&Math.abs(face.normal.x)>.99&&near(Math.min(...face.p.map(p=>p.y)),74.32421875)&&near(Math.max(...face.p.map(p=>p.y)),82.32421875)&&face.p.some(p=>near(p.x,59.93359375))),deck=f.find(face=>face.material.name==='h_mado_lm6'&&face.normal.y>.99&&face.p.some(p=>near(p.z,16.8515625))&&face.p.every(p=>p.x>=-.001));if(sources.some(s=>!s)||!cornice||!deck)return false;
 for(let i=0;i<bands.length;i++){const[lo,hi]=bands[i],source=sources[i]!,bottom=lo,top=hi,left=i===0?-55.9375:i===1?-55.92578125:i===2?-55.91015625:-55.921875,right=-left;rearBand(b,left,right,-31.96484375,bottom,top,source,55.91,-31.96484375,24.8515625);}
 const rear=[[-59.93359375,-29.96484375],[-53.9921875,-38.7109375],[2.02734375,-38.7109375],[53.9921875,-38.7109375],[59.93359375,-29.96484375]];for(let i=0;i<rear.length-1;i++){const[a,c]=[rear[i],rear[i+1]];b.quad([[a[0],74.32421875,a[1]],[c[0],74.32421875,c[1]],[c[0],82.32421875,c[1]],[a[0],82.32421875,a[1]]],cornice,[[59.93359375,74.32421875,-29.96484375],[59.75,74.32421875,24.9296875],[59.75,82.32421875,24.9296875],[59.93359375,82.32421875,-29.96484375]]);}
 b.join([[-55.91015625,73.765625,-31.96484375],[55.91015625,73.765625,-31.96484375]],[[-53.9921875,74.32421875,-38.7109375],[53.9921875,74.32421875,-38.7109375]],sources[3]!);
 // This is a narrow missing strip of the actual glazed roof deck beside the
 // raised central facade, not a cap at the top of its 113-unit sign tower.
 const strip=[new THREE.Vector3(-30.953125,73.76953125,16.8515625),new THREE.Vector3(30.953125,73.76953125,16.8515625),new THREE.Vector3(30.953125,73.76953125,24.8515625),new THREE.Vector3(-30.953125,73.76953125,24.8515625)];b.face(strip,deck,strip.map(p=>{const q=p.clone(),a=deck.p[0];q.y=a.y-(deck.normal.x*(q.x-a.x)+deck.normal.z*(q.z-a.z))/deck.normal.y;return q;}));
 // Both front wings project beyond the rectangular glazed deck. Their
 // facade/column tops prove this seven-point continuation of the same roof;
 // the outer cornice alone otherwise leaves both rooms open to the sky.
 const wing=[[26.92578125,73.76953125,24.8515625],[55.65234375,73.76953125,24.8515625],[51.3984375,73.76953125,32.21484375],[48.15625,73.76953125,33.21484375],[36.68359375,73.765625,33.4375],[33.4375,73.765625,30.4375],[26.92578125,73.765625,25.13671875]];
 if(!f.some(face=>face.material.name==='de1'&&face.p.some(p=>near(p.x,36.68359375)&&near(p.y,73.765625)&&near(p.z,33.4375))))return false;
 for(const sign of[-1,1]){const points=wing.map(([x,y,z])=>new THREE.Vector3(sign*x,y,z));b.face(points,deck,points.map(p=>{const q=p.clone().setX(Math.abs(p.x)),a=deck.p[0];q.y=a.y-(deck.normal.x*(q.x-a.x)+deck.normal.z*(q.z-a.z))/deck.normal.y;return q;}));}
 // Add ordinary glazed rear windows using only the eight separate native
 // side-wing window cards, avoiding the front lobby, banners and clock sign.
 const windows=f.filter(face=>face.material.name==='garasu'&&face.normal.z>.99);if(windows.length!==16)return false;for(const window of windows)b.face(window.p.map(p=>p.clone().setZ(-32.125)),window,window.p);return true;
}
/** Source-specific closed back/roof repairs for these two facilities. New
 * buffers/materials are owned by this clone (facility-building-); atlas maps
 * and all original front/roof/fence geometry remain untouched and shared. */
export function closeFacilityBuildingShell(root:THREE.Object3D,asset:string,doors:BuildingEntrance[]=[]):FacilityBuildingShell|null{
 const match=asset.match(/(?:^|\/)1-(\d+)-\d+\.glb$/),model=Number(match?.[1]);if(!match||!FACILITY_BUILDING_MODELS.has(model))return null;const previous=root.userData.facilityBuildingShell as FacilityBuildingShell|undefined;if(previous)return previous;root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),rear=model===165?-36:-31.96484375,width=model===165?54:56;
 if(doors.some(door=>{const p=new THREE.Vector3(door.x,root.getWorldPosition(new THREE.Vector3()).y,door.z).applyMatrix4(inverse);if(Math.abs(p.z-rear)>12||Math.abs(p.x)>width+4)return false;if(door.axis===undefined||door.sign===undefined)return true;return new THREE.Vector3().setComponent(door.axis,door.sign).transformDirection(inverse).z<-.5;}))return null;
 const faces=sourceFaces(root),builder=new Builder();if(!(model===165?daycare(builder,faces):department(builder,faces)))return null;return builder.finish(root,model===165?'route34-daycare':'celadon-department-store');
}
