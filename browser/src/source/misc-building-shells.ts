import * as THREE from 'three';
import type {BuildingEntrance} from './render-repair.ts';

/** Exact native families with omitted elevations or inappropriate old DS
 * billboard projections. The produce stall deliberately remains open. */
export const MISC_BUILDING_MODELS=new Set([89,174,264,275,290,314,339]);
export type MiscBuildingShell={family:string;triangles:number;passages:number};
type Face={p:THREE.Vector3[];uv:THREE.Vector2[];color:THREE.Color[];normal:THREE.Vector3;material:THREE.MeshBasicMaterial};
type Vertex={p:THREE.Vector3;uv:THREE.Vector2;color:THREE.Color};
type Cut={axis:'x'|'z';at:number;left:number;right:number;top:number;depth?:number};
const generated=new Set(['3d-rear-facade','3d-solid-backing','entrance-rear-wall']);
const near=(a:number,b:number)=>Math.abs(a-b)<.045;
function sourceFaces(root:THREE.Object3D){
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),faces:Face[]=[];
 root.traverse(o=>{
  if(!(o instanceof THREE.Mesh)||o instanceof THREE.InstancedMesh||generated.has(o.name)||o.name.startsWith('misc-building-'))return;
  const g=o.geometry,p=g.getAttribute('position'),uv=g.getAttribute('uv'),color=g.getAttribute('color'),index=g.index,materials=Array.isArray(o.material)?o.material:[o.material];
  for(const group of g.groups.length?g.groups:[{start:0,count:index?.count??p.count,materialIndex:0}]){
   const material=materials[group.materialIndex??0] as THREE.MeshBasicMaterial;if(!material.visible||material.opacity<.5||/kage|shadow|h_in/i.test(material.name))continue;
   for(let at=group.start;at<group.start+group.count;at+=3){
    const ids=[0,1,2].map(i=>index?index.getX(at+i):at+i),points=ids.map(i=>o.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(o.matrixWorld).applyMatrix4(inverse)),normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));if(normal.lengthSq()<1e-10)continue;
    faces.push({p:points,uv:ids.map(i=>uv?new THREE.Vector2(uv.getX(i),uv.getY(i)):new THREE.Vector2()),color:ids.map(i=>color?new THREE.Color(color.getX(i),color.getY(i),color.getZ(i)):new THREE.Color(1,1,1)),normal:normal.normalize(),material});
   }
  }
 });return faces;
}
function plane(faces:Face[],name:string,axis:'x'|'z',at:number,bottom:number,top:number){return faces.find(f=>f.material.name===name&&f.p.every(p=>near(p[axis],at))&&near(Math.min(...f.p.map(p=>p.y)),bottom)&&near(Math.max(...f.p.map(p=>p.y)),top));}
function sample(face:Face,p:THREE.Vector3):Vertex{
 const w=THREE.Triangle.getBarycoord(p,...face.p as[THREE.Vector3,THREE.Vector3,THREE.Vector3],new THREE.Vector3())!;
 return{p:p.clone(),uv:face.uv[0].clone().multiplyScalar(w.x).addScaledVector(face.uv[1],w.y).addScaledVector(face.uv[2],w.z),color:face.color[0].clone().multiplyScalar(w.x).add(face.color[1].clone().multiplyScalar(w.y)).add(face.color[2].clone().multiplyScalar(w.z))};
}
function clip(poly:Vertex[],axis:'x'|'y'|'z',at:number,positive:boolean){
 const result:Vertex[]=[];
 for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=(a.p[axis]-at)*(positive?1:-1),db=(b.p[axis]-at)*(positive?1:-1);if(da>=-1e-7)result.push(a);if(da*db< -1e-14){const t=da/(da-db);result.push({p:a.p.clone().lerp(b.p,t),uv:a.uv.clone().lerp(b.uv,t),color:a.color.clone().lerp(b.color,t)});}}
 return result;
}
class Builder{
 private batches=new Map<THREE.MeshBasicMaterial,{position:number[];uv:number[];color:number[]}>();
 constructor(readonly cuts:Cut[]){}
 face(points:THREE.Vector3[],source:Face,samples=points){
  let pieces=[points.map((p,i)=>({...sample(source,samples[i]),p:p.clone()}))];
  for(const cut of this.cuts){
   if(!points.every(p=>Math.abs(p[cut.axis]-cut.at)<(cut.depth??12)))continue;const tangent=cut.axis==='z'?'x':'z';
   pieces=pieces.flatMap(poly=>[clip(poly,tangent,cut.left,false),clip(poly,tangent,cut.right,true),clip(clip(clip(poly,tangent,cut.left,true),tangent,cut.right,false),'y',cut.top,true)].filter(p=>p.length>=3));
  }
  let batch=this.batches.get(source.material);if(!batch){batch={position:[],uv:[],color:[]};this.batches.set(source.material,batch);}
  for(const poly of pieces)for(let i=1;i<poly.length-1;i++){const triangle=[poly[0],poly[i],poly[i+1]];if(new THREE.Triangle(...triangle.map(v=>v.p) as[THREE.Vector3,THREE.Vector3,THREE.Vector3]).getArea()<1e-6)continue;for(const v of triangle){batch.position.push(...v.p.toArray());batch.uv.push(...v.uv.toArray());batch.color.push(...v.color.toArray());}}
 }
 wall(left:number,right:number,z:number,bottom:number,top:number,source:Face,axis:'x'|'z',at:number,low:number,high:number){
  const count=Math.max(1,Math.ceil((right-left)/Math.max(1,Math.abs(high-low)))),y0=Math.min(...source.p.map(p=>p.y)),y1=Math.max(...source.p.map(p=>p.y));
  for(let i=0;i<count;i++){const a=THREE.MathUtils.lerp(left,right,i/count),b=THREE.MathUtils.lerp(left,right,(i+1)/count),points=[new THREE.Vector3(a,bottom,z),new THREE.Vector3(b,bottom,z),new THREE.Vector3(b,top,z),new THREE.Vector3(a,top,z)],samples=points.map((_,j)=>{const p=new THREE.Vector3();p[axis]=at;p[axis==='x'?'z':'x']=j===0||j===3?low:high;p.y=j<2?y0:y1;return p;});this.face(points,source,samples);}
 }
 finish(root:THREE.Object3D,family:string,hideAll=true){
  const group=new THREE.Group();group.name='misc-building-shell';let triangles=0;
  for(const[source,b]of this.batches){if(!b.position.length)continue;const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(b.position,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(b.color,3));geometry.computeVertexNormals();const material=source.clone();material.side=THREE.DoubleSide;material.transparent=false;material.opacity=1;material.alphaTest=0;material.depthWrite=true;material.vertexColors=true;const mesh=new THREE.Mesh(geometry,material);mesh.name='misc-building-'+family+'-cladding';group.add(mesh);triangles+=b.position.length/9;}
  root.traverse(o=>{if(!generated.has(o.name))return;if(hideAll)o.visible=false;else if(o instanceof THREE.Mesh){const materials=Array.isArray(o.material)?o.material:[o.material];if(materials.some(m=>m.name==='h_in'))o.visible=false;}});root.add(group);
  return root.userData.miscBuildingShell={family,triangles,passages:this.cuts.length} as MiscBuildingShell;
 }
}
function underground(b:Builder,f:Face[]){
 const lower=f.find(t=>t.material.name==='ko_chika_a'&&t.p.every(p=>near(p.z,16)&&p.x>=9.99&&p.x<=24.01)&&near(Math.min(...t.p.map(p=>p.y)),2)&&near(Math.max(...t.p.map(p=>p.y)),15)),upper=plane(f,'ko_chika_a','x',-30,15,32);if(!lower||!upper)return false;
 b.wall(-30,24,-16,2,15,lower,'z',16,10,24);
 const points=[new THREE.Vector3(-30,15,-16),new THREE.Vector3(24,15,-16),new THREE.Vector3(10,32,-16),new THREE.Vector3(-30,32,-16)],samples=points.map((p,i)=>new THREE.Vector3(-30,p.y,i===0||i===3?-24:-16));b.face(points,upper,samples);return true;
}
function penthouse(b:Builder,f:Face[]){
 const lower=plane(f,'wall_1','x',-40,8,32),upper=plane(f,'wall_1','x',-40,32,50),base=plane(f,'wall_2','x',-41.6484375,2,8);if(!lower||!upper||!base)return false;
 b.wall(-41.6484375,41.6484375,-32,2,8,base,'x',-41.6484375,-32,25.154296875);b.wall(-40,40,-32,8,32,lower,'x',-40,-32,24);
 const points=[new THREE.Vector3(-40,32,-32),new THREE.Vector3(40,32,-32),new THREE.Vector3(40,38,-32),new THREE.Vector3(11,50,-32),new THREE.Vector3(-40,50,-32)];b.face(points,upper,points.map(p=>new THREE.Vector3(-40,p.y,THREE.MathUtils.lerp(-32,24,(p.x+40)/80))));
 for(const face of f.filter(t=>(t.material.name==='yane_5'&&t.p.every(p=>near(p.z,26.599609375)))||(t.material.name==='yane_1'&&t.p.every(p=>near(p.z,28)))))b.face(face.p.map(p=>p.clone().setZ(face.material.name==='yane_5'?-34.19921875:-36)),face,face.p);
 const fascia=plane(f,'yane_5','z',26.599609375,45.5625,53.5625);if(!fascia)return false;
 const inner=[[-42.044921875,53.5625],[7.64453125,53.5625],[42.044921875,37.5625]],outer=[[-44,54.671875],[8,54.671875],[44,38.671875]],native=fascia.p[0].clone().add(fascia.p[1]).add(fascia.p[2]).multiplyScalar(1/3);
 // The white fascia is recessed from the red roof edge. Join its two actual
 // sloping top bands, rather than leaving a two-unit air slot behind the eave.
 for(let i=0;i<2;i++)b.face([new THREE.Vector3(inner[i][0],inner[i][1],-34.19921875),new THREE.Vector3(inner[i+1][0],inner[i+1][1],-34.19921875),new THREE.Vector3(outer[i+1][0],outer[i+1][1],-36),new THREE.Vector3(outer[i][0],outer[i][1],-36)],fascia,Array.from({length:4},()=>native));return true;
}
function wifi(b:Builder,f:Face[]){
 const bands=[
  ['c1_s03_b_lm5',64.59375,1,12.5,-61.328125,64.59375,-61.328125,23.859375],
  ['lambert7',60.59375,12.5,51.34375,-57.328125,60.59375,-57.328125,18.671875],
  ['lambert7',60.59375,51.34375,66,-57.328125,60.59375,-57.328125,18.671875],
  ['c1_s03_b_lm5',61.59375,60,72.5,-61.328125,61.59375,-61.328125,20.859375],
  ['c1_s03_b_lm5',48.59375,70,86,-52.140625,48.59375,-52.140625,28.671875],
  ['c1_s03_b_lm5',48.59375,86,118,-52.140625,48.59375,-52.140625,16.671875],
  ['lambert7',50.78125,87,105.296875,-57.328125,50.78125,-57.328125,18.671875],
  ['lambert7',50.78125,105.296875,118,-57.328125,50.78125,-57.328125,18.671875],
  ['c1_s03_b_lm5',52.59375,116,128.5,-60.140625,48.59375,-52.140625,16.671875],
  ['lambert7',44.59375,128.5,149.34375,-57.328125,44.59375,-57.328125,18.671875],
  ['lambert7',44.59375,149.34375,158,-57.328125,44.59375,-57.328125,18.671875],
  ['c1_s03_b_lm5',46.59375,158,170.8125,-60.140625,39.59375,-52.140625,13.671875],
 ] as const;
 for(const[name,width,bottom,top,z,x,low,high]of bands){
  let source=plane(f,name,'x',x,bottom,top),axis:'x'|'z'='x';let at:number=x,s0:number=low,s1:number=high;
  if(!source&&name==='c1_s03_b_lm5'&&bottom>=116){axis='z';at=bottom===116?21.671875:20;source=plane(f,name,'z',at,bottom,top);if(source){s0=Math.min(...source.p.map(p=>p.x));s1=Math.max(...source.p.map(p=>p.x));}}
  if(!source)return false;b.wall(-width,width,z,bottom,top,source,axis,at,s0,s1);
 }
 // The west annex is shallower than the main tower. Its rear is bounded by
 // its own native 42-unit foundation and 38.359-unit glass edge.
 const base=plane(f,'c1_s03_b_lm5','x',-85,1,12.5),glass=plane(f,'lambert7','x',-81.59375,12.5,50.859375),glassUpper=plane(f,'lambert7','x',-81.59375,50.859375,66),rib=plane(f,'c1_s03_b_lm5','x',-83,60,72.5);if(!base||!glass||!glassUpper||!rib)return false;
 b.wall(-85,-60.59375,-42,1,12.5,base,'x',-85,-42,-16.5);b.wall(-81.59375,-60.59375,-38.359375,12.5,50.859375,glass,'x',-81.59375,-38.359375,-19.6875);b.wall(-81.59375,-60.59375,-38.359375,50.859375,66,glassUpper,'x',-81.59375,-38.359375,-19.6875);b.wall(-83,-60.59375,-42,60,72.5,rib,'x',-83,-38,-17.5);
 const deck=f.find(t=>t.material.name==='c1_s03_a_lm5'&&t.normal.y>.99&&t.p.every(p=>near(p.y,72.5)&&p.x>=20.4&&p.x<=54.41)&&t.p.some(p=>near(p.z,-61)));if(!deck)return false;
 const strip=[new THREE.Vector3(-20.40625,72.5,-61.328125),new THREE.Vector3(20.40625,72.5,-61.328125),new THREE.Vector3(20.40625,72.5,-52.140625),new THREE.Vector3(-20.40625,72.5,-52.140625)],native=deck.p[0].clone().add(deck.p[1]).add(deck.p[2]).multiplyScalar(1/3);b.face(strip,deck,strip.map(()=>native));return true;
}
function tent(b:Builder,f:Face[]){
 const trim=f.find(t=>t.material.name==='d32_s02b_lm2'&&near(Math.min(...t.p.map(p=>p.y)),3)&&near(Math.max(...t.p.map(p=>p.y)),14.453125)),glass=f.find(t=>t.material.name==='h_mado_lm3'&&near(Math.min(...t.p.map(p=>p.y)),11.5)),upperGlass=f.find(t=>t.material.name==='h_mado_lm3'&&near(Math.min(...t.p.map(p=>p.y)),45.0390625)),roof=f.find(t=>t.material.name==='lambert8'&&t.p.some(p=>near(p.z,-132.8125)));if(!trim||!glass||!upperGlass||!roof)return false;
 // These five edges are the missing half of the native ten-sided tent rim.
 // Their varying heights follow the original leaning cone, not a flat cap.
 const rim=[[-84.0390625,85.515625,-54.109375],[-42.90625,91.5,-111.1171875],[23.53125,101.203125,-132.8125],[89.890625,110.9140625,-110.890625],[130.828125,107.3828125,-53.7421875],[130.7109375,107.390625,16.8125]],center=new THREE.Vector3(22,0,-10),point=(p:number[],y:number,scale:number)=>new THREE.Vector3(center.x+(p[0]-center.x)*scale,y,center.z+(p[2]-center.z)*scale);
 const segment=(a:number[],c:number[],bottom:number,top:number,lo:number,hi:number,source:Face)=>{
  const points=[point(a,bottom,lo),point(c,bottom,lo),point(c,top,hi),point(a,top,hi)],ys=source.p.map(p=>p.y),sourceBottom=Math.min(...ys),sourceTop=Math.max(...ys);
  // Source polygons are planar quads triangulated into two faces. Their
  // barycentric atlas mapping remains affine across the complete native bay.
  const tangent=new THREE.Vector3(source.normal.z,0,-source.normal.x).normalize(),sorted=[...source.p].sort((p,q)=>p.dot(tangent)-q.dot(tangent)),p0=sorted[0],p1=sorted.at(-1)!,samples=points.map((_,j)=>{const value=(j===0||j===3?p0:p1).clone();value.y=j<2?sourceBottom:sourceTop;const n=source.normal,o=source.p[0];if(Math.abs(n.z)>.2)value.z=o.z-(n.x*(value.x-o.x)+n.y*(value.y-o.y))/n.z;else value.x=o.x-(n.z*(value.z-o.z)+n.y*(value.y-o.y))/n.x;return value;});
  b.face(points,source,samples);
 };
 for(let i=0;i<rim.length-1;i++){
  const a=rim[i],c=rim[i+1];segment(a,c,3,14.453125,1,1,trim);segment(a,c,14.453125,40.109375,.9506,.896,glass);segment(a,c,40.109375,40.109375,.896,.9529,trim);segment(a,c,40.109375,47.25,.9529,.9327,trim);segment(a,c,47.25,47.25,.9327,.90,trim);segment(a,c,47.25,78,.90,.84,upperGlass);segment(a,c,78,78,.84,1,trim);segment(a,c,78,85.515625,1,1,trim);
  const points=[point(a,85.515625,1),point(c,85.515625,1),new THREE.Vector3(c[0],c[1],c[2]),new THREE.Vector3(a[0],a[1],a[2])],native=roof.p[0].clone().add(roof.p[1]).add(roof.p[2]).multiplyScalar(1/3);b.face(points,roof,points.map(()=>native));
 }
 // The native porch roof is at Y81. Close the main cone above that
 // opening along its actual east rim; the cone's edge leans inward in X
 // toward the front, so a rectangular header plane would miss that wedge.
 const a=new THREE.Vector3(130.7109375,107.390625,16.8125),end=new THREE.Vector3(89.5703125,101.3984375,73.828125),c=a.clone().lerp(end,(45.1640625-a.z)/(end.z-a.z)),native=roof.p[0].clone().add(roof.p[1]).add(roof.p[2]).multiplyScalar(1/3);
 b.face([a.clone().setY(81),c.clone().setY(81),c,a],roof,Array.from({length:4},()=>native));

 // The authored front glazing ends at its sloping window frame, before the
 // outward pink cornice begins. Join those two measured edges; extending a
 // rectangular wall to Y78 would either miss the leaning bays or cover glass.
 const frame=[[108.8046875,73.078125,29.6328125],[75.6796875,73.078125,75.609375],[22.109375,73.078125,93.1015625]],cornice=[[122.6484375,78,51.5546875],[89.5703125,78,91.4609375],[23.140625,78,113.1484375]];
 for(let i=0;i<2;i++){
  const edge=cornice.slice(i,i+2).map(p=>new THREE.Vector3(...p as[number,number,number])),source=f.find(t=>t.material.name==='d32_s02b_lm2'&&t.p.every(p=>p.y>=77.99&&p.y<=85.52)&&edge.every(e=>t.p.some(p=>near(p.x,e.x)&&near(p.z,e.z))));if(!source)return false;
  const points=[new THREE.Vector3(...frame[i] as[number,number,number]),new THREE.Vector3(...frame[i+1] as[number,number,number]),edge[1],edge[0]],samples=[edge[0].clone(),edge[1].clone(),edge[1].clone().setY(85.515625),edge[0].clone().setY(85.515625)];b.face(points,source,samples);
 }

 return true;
}
function lab(b:Builder,f:Face[]){
 const base=plane(f,'mt_okl04','x',-52,2,8)??f.find(t=>t.material.name==='mt_okl04'&&near(Math.min(...t.p.map(p=>p.y)),2)&&near(Math.max(...t.p.map(p=>p.y)),8)),wall=plane(f,'mt_okl03','z',23,8,40);if(!base||!wall)return false;
 const baseAxis=Math.abs(base.normal.x)>.8?'x':'z',tangent=baseAxis==='x'?'z':'x',low=Math.min(...base.p.map(p=>p[tangent])),high=Math.max(...base.p.map(p=>p[tangent]));b.wall(-10.05,10.05,-28.03,2,8,base,baseAxis,base.p[0][baseAxis],low,high);
 // Continue the neighboring rear brick facade at its authored texel scale.
 // Sampling the full 48-unit side bay into this 20-unit repair compresses its
 // bricks into another door-shaped rectangle, even though it is opaque.
 const points=[new THREE.Vector3(-10.05,8,-28.03),new THREE.Vector3(10.05,8,-28.03),new THREE.Vector3(10.05,28,-28.03),new THREE.Vector3(-10.05,28,-28.03)];b.face(points,wall,points.map(p=>p.clone().setZ(23)));
 // The raised roof's native rear top and inner lip exist, but its outer
 // vertical fascia and the two bevel returns were omitted. Match the actual
 // Y52..64 side fascia and eight-sided roof rim, below its original skyline.
 const fascia=plane(f,'mt_okl04','x',54,52,64);if(!fascia)return false;
 b.wall(-52,52,-32,52,64,fascia,'x',54,-30,22);
 for(const sign of[-1,1]){
  const rim=[new THREE.Vector3(sign*52,52,-32),new THREE.Vector3(sign*54,52,-30),new THREE.Vector3(sign*54,64,-30),new THREE.Vector3(sign*52,64,-32)],samples=rim.map((p,i)=>new THREE.Vector3(54,p.y,i===0||i===3?-30:-30+Math.SQRT2*2));b.face(rim,fascia,samples);
 }
 return true;
}
export function closeMiscBuildingShell(root:THREE.Object3D,asset:string,doors:BuildingEntrance[]=[]):MiscBuildingShell|null{
 const match=asset.match(/(?:^|\/)1-(\d+)-\d+\.glb$/),model=Number(match?.[1]);if(!match||!MISC_BUILDING_MODELS.has(model))return null;const previous=root.userData.miscBuildingShell as MiscBuildingShell|undefined;if(previous)return previous;
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),cuts:Cut[]=[];
 // Native Pokeathlon tent approach is two east-facing warp tiles, with a
 // clear 64-to-128-unit approach. Preserve it even without map warp metadata.
 if(model===264)cuts.push({axis:'x',at:130.8,left:7.9,right:40.1,top:81,depth:78});
 const rear=(model===290||model===339)?-16:model===275?-32:model===314?-28:-57.328125,width=(model===290||model===339)?30:model===275?42:model===314?52:65;
 for(const door of doors){const p=new THREE.Vector3(door.x,root.getWorldPosition(new THREE.Vector3()).y,door.z).applyMatrix4(inverse),d=door.axis===undefined?null:new THREE.Vector3().setComponent(door.axis,door.sign??1).transformDirection(inverse);
  if(model===264){if(p.x>=52&&p.x<=144&&p.z>=-1&&p.z<=49&&(!d||d.x>.5))cuts.push({axis:'x',at:130.8,left:p.z-8.1,right:p.z+8.1,top:81,depth:78});}
  else if(model!==174&&Math.abs(p.z-rear)<=12&&Math.abs(p.x)<=width+4&&(!d||d.z<-.5))cuts.push({axis:'z',at:p.z,left:p.x-8.1,right:p.x+8.1,top:(model===290||model===339)?27:34});
 }
 const faces=sourceFaces(root),builder=new Builder(cuts),ok=model===174?true:(model===290||model===339)?underground(builder,faces):model===275?penthouse(builder,faces):model===89?wifi(builder,faces):model===264?tent(builder,faces):lab(builder,faces);if(!ok)return null;
 return builder.finish(root,model===174?'open-produce-stall':(model===290||model===339)?'underground-stairhead':model===275?'rooftop-penthouse':model===89?'goldenrod-wifi-tower':model===264?'pokeathlon-tent':'oak-laboratory',model!==314);
}
