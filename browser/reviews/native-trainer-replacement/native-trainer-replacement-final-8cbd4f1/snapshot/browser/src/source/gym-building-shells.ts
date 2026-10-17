import * as THREE from 'three';
import type {BuildingEntrance} from './render-repair.ts';

type Face={points:THREE.Vector3[];uv:THREE.Vector2[];colors:THREE.Color[];material:THREE.MeshBasicMaterial};
const johto=new Set([5,44,45,80,108,111,138,139]);
const kanto=new Set([219,245,250,284,294,300,318]);
export const GYM_BUILDING_MODELS=new Set([...johto,...kanto]);
const generated=new Set(['3d-rear-facade','3d-solid-backing','entrance-rear-wall']);
const near=(a:number,b:number)=>Math.abs(a-b)<.025;
function faces(root:THREE.Object3D){
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),out:Face[]=[];
 root.traverse(object=>{
  if(!(object instanceof THREE.Mesh)||object instanceof THREE.InstancedMesh||generated.has(object.name)||object.name.startsWith('gym-building-'))return;
  const g=object.geometry,p=g.getAttribute('position'),uv=g.getAttribute('uv'),color=g.getAttribute('color'),index=g.index,materials=Array.isArray(object.material)?object.material:[object.material];
  for(const group of g.groups.length?g.groups:[{start:0,count:index?.count??p.count,materialIndex:0}]){
   const material=materials[group.materialIndex??0] as THREE.MeshBasicMaterial;if(!material.visible||material.opacity<.5||/kage|shadow/i.test(material.name))continue;
   for(let i=group.start;i<group.start+group.count;i+=3){const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),points=ids.map(id=>object.getVertexPosition(id,new THREE.Vector3()).applyMatrix4(object.matrixWorld).applyMatrix4(inverse));if(new THREE.Triangle(...points as [THREE.Vector3,THREE.Vector3,THREE.Vector3]).getArea()<1e-6)continue;out.push({points,uv:ids.map(id=>uv?new THREE.Vector2(uv.getX(id),uv.getY(id)):new THREE.Vector2()),colors:ids.map(id=>color?new THREE.Color(color.getX(id),color.getY(id),color.getZ(id)):new THREE.Color(1,1,1)),material});}
  }
 });return out;
}
function plane(source:Face[],name:RegExp,axis:'x'|'z',at:number,bottom:number,top:number){return source.find(f=>name.test(f.material.name)&&f.points.every(p=>near(p[axis],at))&&near(Math.min(...f.points.map(p=>p.y)),bottom)&&near(Math.max(...f.points.map(p=>p.y)),top));}
class Builder{
 private batches=new Map<THREE.MeshBasicMaterial,{p:number[];uv:number[];color:number[]}>();
 face(points:THREE.Vector3[],source:Face,samples:THREE.Vector3[]){
  let batch=this.batches.get(source.material);if(!batch){batch={p:[],uv:[],color:[]};this.batches.set(source.material,batch);}
  for(const ids of [[0,1,2],[0,2,3]]){if(new THREE.Triangle(...ids.map(i=>points[i]) as [THREE.Vector3,THREE.Vector3,THREE.Vector3]).getArea()<1e-6)continue;for(const i of ids){const b=THREE.Triangle.getBarycoord(samples[i],...source.points as [THREE.Vector3,THREE.Vector3,THREE.Vector3],new THREE.Vector3())!;const uv=source.uv[0].clone().multiplyScalar(b.x).addScaledVector(source.uv[1],b.y).addScaledVector(source.uv[2],b.z),color=source.colors[0].clone().multiplyScalar(b.x).add(source.colors[1].clone().multiplyScalar(b.y)).add(source.colors[2].clone().multiplyScalar(b.z));batch.p.push(...points[i].toArray());batch.uv.push(...uv.toArray());batch.color.push(...color.toArray());}}
 }
 /** The trim has its native projection, with closed returns to the wall.
  * It bridges only the missing rear entrance-width segment. */
 panel(left:number,right:number,rear:number,back:number,bottom:number,top:number,source:Face,axis:'x'|'z',at:number,sourceLeft:number,sourceRight:number){
  const lo=Math.min(...source.points.map(p=>p.y)),hi=Math.max(...source.points.map(p=>p.y)),p=[new THREE.Vector3(left,bottom,rear),new THREE.Vector3(right,bottom,rear),new THREE.Vector3(right,top,rear),new THREE.Vector3(left,top,rear)],s=p.map((q,i)=>{const r=new THREE.Vector3();r[axis]=at;r[axis==='x'?'z':'x']=i===0||i===3?sourceLeft:sourceRight;r.y=i<2?lo:hi;return r;});
  this.face(p,source,s);const q=p.map(v=>new THREE.Vector3(v.x,v.y,back));this.face(q,source,s);for(let i=0;i<4;i++){const j=(i+1)%4;this.face([p[i],q[i],q[j],p[j]],source,[s[i],s[i],s[j],s[j]]);}
 }
 finish(root:THREE.Object3D){
  const group=new THREE.Group();group.name='gym-building-shell';let triangles=0;
  for(const [source,b]of this.batches){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(b.color,3));g.computeVertexNormals();const m=source.clone();m.side=THREE.DoubleSide;m.transparent=false;m.opacity=1;m.alphaTest=0;m.depthWrite=true;m.vertexColors=true;const mesh=new THREE.Mesh(g,m);mesh.name='gym-building-rear-cladding';group.add(mesh);triangles+=b.p.length/9;}
  if(!triangles)return 0;root.add(group);root.userData.gymBuildingShell=triangles;return triangles;
 }
}
function johtoShell(b:Builder,source:Face[]){
 const wall=plane(source.filter(f=>f.points.every(p=>p.x>12)),/en_gyma$/,'z',17.21875,2.8984375,36.359375),lower=plane(source,/en_gym_w_$/,'z',20,2.8984375,9.359375),upper=plane(source,/en_gym_w_$/,'z',20,18.37890625,24.3359375);
 // The trim fronts are slightly tapered, so use their measured triangle
 // rather than requiring an axis-aligned plane at every vertex.
 const band=(bottom:number,top:number)=>source.find(f=>/en_gym_w_$/.test(f.material.name)&&f.points.every(p=>p.z>19.8&&p.z<20.1&&p.x>13)&&near(Math.min(...f.points.map(p=>p.y)),bottom)&&near(Math.max(...f.points.map(p=>p.y)),top));
 const low=lower??band(2.8984375,9.359375),high=upper??band(18.37890625,24.3359375);if(!wall||!low||!high)return false;
 b.panel(-13.48,13.48,-27.205,-27.18,2.8984375,37.640625,wall,'z',17.21875,12.6015625,36.5625);
 for(const [bottom,top,f]of [[2.8984375,9.359375,low],[18.37890625,24.3359375,high]]as const){const left=Math.min(...f.points.map(p=>p.x)),right=Math.max(...f.points.map(p=>p.x));b.panel(-13.48,13.48,-32.81,-27.18,bottom,top,f,'z',20,left,right);}
 return true;
}
function kantoShell(b:Builder,source:Face[]){
 const wall=plane(source,/^lambert5$/,'x',52.451171875,2.2265625,33.091796875),stripe=plane(source,/^lambert11$/,'z',-30.265625,13.888671875,21.138671875),fascia=plane(source,/^lambert12$/,'x',56.048828125,38.390625,46.982421875);
 if(!wall||!stripe||!fascia)return false;
 b.panel(-13.94,13.94,-27.96,-27.94,2.2265625,40.109375,wall,'x',52.451171875,-21.025390625,12.044921875);
 b.panel(-13.94,13.94,-30.285,-27.94,13.888671875,21.138671875,stripe,'z',-30.265625,13.921875,46.66015625);
 // The central rear roof fascia originally spans the complete atlas: that
 // repeats door/sign colors as vertical streaks below the canopy. Continue
 // the native outer roof's brown horizontal fascia, on the exact sloping
 // native polygon, without replacing the roof or the front Gym insignia.
 const p=[new THREE.Vector3(-16,35.4375,-41.035625),new THREE.Vector3(16,35.4375,-41.035625),new THREE.Vector3(15.421875,44.12109375,-41.412578125),new THREE.Vector3(-15.421875,44.12109375,-41.412578125)],s=p.map((_,i)=>new THREE.Vector3(56.048828125,i<2?38.390625:46.982421875,i===0||i===3?-27.841796875:14.86328125));b.face(p,fascia,s);
 for(const sign of[-1,1]){const corner=[new THREE.Vector3(sign*16,35.4375,-41.015625),new THREE.Vector3(sign*20.98046875,35.4375,-30.44921875),new THREE.Vector3(sign*20.22265625,44.12109375,-30.44921875),new THREE.Vector3(sign*15.421875,44.12109375,-41.392578125)].map(q=>q.add(new THREE.Vector3(sign*.018,0,-.008)));b.face(corner,fascia,s);}
 return true;
}
function dojoRoof(root:THREE.Object3D){
 // YBC_FGM has a fully authored, tiled hip/cross-gable roof. The generic
 // silhouette projected its complete67.5-unit ridge to z=-23.96, raising a
 // broad untextured vertical slab through both native rear roof slopes.
 // Remove just that measured pair of generated hull facets. All native roof
 // triangles, lower backing, gable closures and the front recess remain.
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),replacements:{original:THREE.Mesh;replacement:THREE.Mesh;triangles:number}[]=[],gable=faces(root).find(f=>f.material.name==='ybcfg_06'&&near(Math.min(...f.points.map(p=>p.y)),51.98046875)&&near(Math.max(...f.points.map(p=>p.y)),63.25390625));if(!gable)return 0;
 root.traverse(object=>{
  if(!(object instanceof THREE.Mesh)||object.name!=='3d-solid-backing')return;
  const g=object.geometry,p=g.getAttribute('position'),index=g.index,kept:number[]=[];let removed=0;
  for(let i=0;i<(index?.count??p.count);i+=3){const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),points=ids.map(id=>object.getVertexPosition(id,new THREE.Vector3()).applyMatrix4(object.matrixWorld).applyMatrix4(inverse));
   if(points.every(q=>near(q.z,-23.957813262939453)&&q.y>=47.43)&&near(Math.max(...points.map(q=>q.y)),67.52734375)&&Math.max(...points.map(q=>q.x))-Math.min(...points.map(q=>q.x))>90){removed++;continue;}kept.push(...ids);
  }
  if(removed!==2)return;
  const geometry=g.clone();geometry.setIndex(kept);geometry.computeVertexNormals();const materials=Array.isArray(object.material)?object.material.map(m=>m.clone()):object.material.clone(),replacement=new THREE.Mesh(geometry,materials);replacement.name='gym-building-dojo-roof-backing';replacement.position.copy(object.position);replacement.quaternion.copy(object.quaternion);replacement.scale.copy(object.scale);replacement.matrixAutoUpdate=object.matrixAutoUpdate;replacement.matrix.copy(object.matrix);replacements.push({original:object,replacement,triangles:kept.length/3});
 });
 if(!replacements.length)return 0;let triangles=0;for(const {original,replacement,triangles:count}of replacements){original.visible=false;original.parent!.add(replacement);triangles+=count;}
 {const b=new Builder();
  // The mirrored front gable repeats its recessed sign aperture at the
  // rear. Close that measured small triangle beneath the rear cross-gable,
  // using its plain native gable material, not the broad roof hull.
  const p=[new THREE.Vector3(-17.81078125,51.81421875,-27.90),new THREE.Vector3(17.81078125,51.81421875,-27.90),new THREE.Vector3(0,67.53734375,-27.90)],samples=p.map(q=>new THREE.Vector3(q.x*12.59375/17.81078125,51.98046875+(q.y-51.81421875)*(63.25390625-51.98046875)/(67.53734375-51.81421875),12.0546875));b.face([...p,p[2]],gable,[...samples,samples[2]]);triangles+=b.finish(root);}
 root.userData.gymBuildingShell=triangles;return triangles;
}
/** The native rounded gyms are already roofed and closed by their original
 * shell repair. Their missing rear trim is a separate problem: a door-width
 * brown/gray insert breaks the horizontal stripes. Keep those valid roofs
 * and side walls; extend the actual native wall and stripe bands across the
 * missing segment, with solid returns, on each placed clone. */
export function closeGymBuildingShell(root:THREE.Object3D,asset:string,doors:BuildingEntrance[]=[]):number{
 const match=asset.match(/(?:^|\/)1-(\d+)-\d+\.glb$/),model=Number(match?.[1]);if(!match||(!GYM_BUILDING_MODELS.has(model)&&model!==255))return 0;if(root.userData.gymBuildingShell)return root.userData.gymBuildingShell as number;if(model===255)return dojoRoof(root);
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),rear=johto.has(model)?-25.73:-30.27;
 if(doors.some(d=>{const p=new THREE.Vector3(d.x,root.getWorldPosition(new THREE.Vector3()).y,d.z).applyMatrix4(inverse),direction=d.axis===undefined?null:new THREE.Vector3(d.axis===0?d.sign??1:0,0,d.axis===2?d.sign??1:0).transformDirection(inverse);return Math.abs(p.x)<62&&Math.abs(p.z-rear)<12&&(!direction||direction.z<-.6);}))return 0;
 const b=new Builder();if(!(johto.has(model)?johtoShell(b,faces(root)):kantoShell(b,faces(root))))return 0;return b.finish(root);
}
