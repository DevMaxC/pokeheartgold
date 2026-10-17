import * as THREE from 'three';
import type {BuildingEntrance} from './render-repair.ts';

/** Native wall and roof-edge profiles for four small civic/shop families. */
export const SMALL_BUILDING_MODELS=new Set([58,75,241,317]);
export type SmallBuildingShell={family:string;triangles:number;passages:number};
type Face={p:THREE.Vector3[];uv:THREE.Vector2[];color:THREE.Color[];normal:THREE.Vector3;material:THREE.MeshBasicMaterial};
type Vertex={p:THREE.Vector3;uv:THREE.Vector2;color:THREE.Color};
type Cut={axis:'x'|'z';at:number;left:number;right:number;top:number;depth?:number};
const generated=new Set(['3d-rear-facade','3d-solid-backing','entrance-rear-wall']);
const near=(a:number,b:number)=>Math.abs(a-b)<.045;
function sourceFaces(root:THREE.Object3D){
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),faces:Face[]=[];
 root.traverse(o=>{
  if(!(o instanceof THREE.Mesh)||o instanceof THREE.InstancedMesh||generated.has(o.name)||o.name.startsWith('small-building-'))return;
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
function school(b:Builder,f:Face[]){
 const bands=[['kk_school_b',2,14.125],['kk_school_a',14.125,18],['kk_school_a',18,30],['kk_school_a',30,42]] as const;
 for(const[name,bottom,top]of bands){const source=plane(f,name,'x',-68,bottom,top);if(!source)return false;b.wall(-68,68,-32,bottom,top,source,'x',-68,-32,24);}
 // The native tiled roof already covers the entire rear slope. Stop the
 // wall at that slope; its bell tower must not set a giant triangular cap.
 const upper=plane(f,'kk_school_a','x',-68,30,42);if(!upper)return false;
 const y=43+(52.8203125-43)*4/(36-24.30078125),points=[new THREE.Vector3(-68,42,-32),new THREE.Vector3(68,42,-32),new THREE.Vector3(68,y,-32),new THREE.Vector3(-68,y,-32)],native=upper.p[0].clone().add(upper.p[1]).add(upper.p[2]).multiplyScalar(1/3);b.face(points,upper,points.map(()=>native));
 // The short timber shaft below the open bell chamber also omitted its
 // rear elevation. Keep the chamber itself (Y66..80) exactly as authored.
 for(const[name,bottom,top]of [['kk_school_b',52.8203125,61.94140625],['kk_school_a',61.94140625,66]]as const){const source=f.find(t=>t.material.name===name&&t.p.every(p=>near(p.x,-40)&&p.z>=-21.01&&p.z<=13.01)&&near(Math.min(...t.p.map(p=>p.y)),bottom)&&near(Math.max(...t.p.map(p=>p.y)),top));if(!source)return false;b.wall(-40,0,-21,bottom,top,source,'x',-40,-21,13);}return true;
}
function cycle(b:Builder,f:Face[]){
 for(const[bottom,top]of [[1.80078125,28.80078125],[28.80078125,36],[36,41.3984375]]){const source=plane(f,'ko_cycle','x',-36,bottom,top);if(!source)return false;b.wall(-36,36,-16,bottom,top,source,'x',-36,-16,24);}
 // The five straight panels of the native barrel roof end at Z-16. Copy
 // only its blue border; the wheel and striped awning remain at the front.
 const border=f.filter(t=>t.material.name==='ko_cycle'&&t.p.every(p=>near(p.z,24)&&p.y>=41.39));
 const fill=plane(f,'ko_cycle','z',21,41.3984375,62.703125);if(border.length!==10||!fill)return false;
 for(const face of border)b.face(face.p.map(p=>p.clone().setZ(-16)),face,face.p);
 const profile=[[-30.234375,41.3984375],[30.234375,41.3984375],[24.4609375,54.0234375],[9.34375,62.703125],[-9.34375,62.703125],[-24.4609375,54.0234375]],native=fill.p[0].clone().add(fill.p[1]).add(fill.p[2]).multiplyScalar(1/3);b.face(profile.map(([x,y])=>new THREE.Vector3(x,y,-16)),fill,profile.map(()=>native));return true;
}
function game(b:Builder,f:Face[]){
 const lower=plane(f,'lambert2','x',-54.52734375,4.953125,47.74609375),upper=plane(f,'lambert2','x',56,47.79296875,66.6015625);if(!lower||!upper)return false;
 b.wall(-54.52734375,54.52734375,-21.16015625,4.953125,47.8,lower,'x',-54.52734375,-21.16015625,19.82421875);
 const rim=[[-56,-20.484375,66.6015625],[-47.0390625,-29.92578125,66.66015625],[47.0390625,-29.92578125,66.66015625],[56,-20.484375,66.6015625]],native=upper.p[0].clone().add(upper.p[1]).add(upper.p[2]).multiplyScalar(1/3);
 // The housing has clipped rear corners. A flat facade at its farthest Z
 // leaves two diagonal side slots beneath the existing glazed roof deck.
 for(let i=0;i<rim.length-1;i++){const a=rim[i],c=rim[i+1],points=[new THREE.Vector3(a[0],47.79296875,a[1]),new THREE.Vector3(c[0],47.79296875,c[1]),new THREE.Vector3(c[0],c[2],c[1]),new THREE.Vector3(a[0],a[2],a[1])];b.face(points,upper,points.map(p=>new THREE.Vector3(56,p.y,0)));}
 const inner=[[-54.52734375,-20.484375],[-47.0390625,-21.16015625],[47.0390625,-21.16015625],[54.52734375,-20.484375]];
 for(let i=0;i<3;i++){const strip=[new THREE.Vector3(rim[i][0],47.79296875,rim[i][1]),new THREE.Vector3(rim[i+1][0],47.79296875,rim[i+1][1]),new THREE.Vector3(inner[i+1][0],47.79296875,inner[i+1][1]),new THREE.Vector3(inner[i][0],47.79296875,inner[i][1])];b.face(strip,upper,strip.map(()=>native));}return true;
}
function trainer(b:Builder,f:Face[]){
 const wall=plane(f,'lambert3','x',-56,2,44);if(!wall)return false;
 const left=43.8984375+(69.734375-43.8984375)*6/58,right=53.8984375+(70-53.8984375)*6/17,profile=[[-56,2],[56,2],[56,right],[45,70],[41,70],[19.76953125,69.94921875],[0,69.8984375],[-4,69.734375],[-56,left]],native=wall.p[0].clone().add(wall.p[1]).add(wall.p[2]).multiplyScalar(1/3);
 // Its two uneven slopes and low central deck are authored geometry. Keep
 // the rear below those slopes, sampling the blue-gray wall, not roof green.
 b.face(profile.map(([x,y])=>new THREE.Vector3(x,y,-40)),wall,profile.map(()=>native));
 // Reuse the native window bays without copying the central open doorway.
 const windows=f.filter(t=>t.p.every(p=>near(p.z,9.5))&&(t.material.name==='mado'||t.material.name==='lambert3'&&t.p.every(p=>p.y>=12.99&&p.y<=37.01&&Math.abs(p.x)>=27.99&&Math.abs(p.x)<=48.01)));
 for(const face of windows)b.face(face.p.map(p=>p.clone().setZ(-40.03)),face,face.p);return true;
}
export function closeSmallBuildingShell(root:THREE.Object3D,asset:string,doors:BuildingEntrance[]=[]):SmallBuildingShell|null{
 const match=asset.match(/(?:^|\/)1-(\d+)-\d+\.glb$/),model=Number(match?.[1]);if(!match||!SMALL_BUILDING_MODELS.has(model))return null;const previous=root.userData.smallBuildingShell as SmallBuildingShell|undefined;if(previous)return previous;
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),cuts:Cut[]=[],rear=model===58?-32:model===75?-16:model===241?-21.16015625:-40,width=model===58?68:model===75?36:model===241?54.52734375:56;
 for(const door of doors){const p=new THREE.Vector3(door.x,root.getWorldPosition(new THREE.Vector3()).y,door.z).applyMatrix4(inverse),d=door.axis===undefined?null:new THREE.Vector3().setComponent(door.axis,door.sign??1).transformDirection(inverse);if(Math.abs(p.z-rear)<=12&&Math.abs(p.x)<=width+4&&(!d||d.z<-.5))cuts.push({axis:'z',at:p.z,left:p.x-8.1,right:p.x+8.1,top:34});}
 const faces=sourceFaces(root),builder=new Builder(cuts),ok=model===58?school(builder,faces):model===75?cycle(builder,faces):model===241?game(builder,faces):trainer(builder,faces);if(!ok)return null;return builder.finish(root,model===58?'violet-school':model===75?'goldenrod-cycle':model===241?'celadon-game-corner':'viridian-trainer-house');
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
 finish(root:THREE.Object3D,family:string){
  const group=new THREE.Group();group.name='small-building-shell';let triangles=0;
  for(const[source,b]of this.batches){if(!b.position.length)continue;const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(b.position,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(b.color,3));geometry.computeVertexNormals();const material=source.clone();material.side=THREE.DoubleSide;material.transparent=false;material.opacity=1;material.alphaTest=0;material.depthWrite=true;material.vertexColors=true;const mesh=new THREE.Mesh(geometry,material);mesh.name='small-building-'+family+'-cladding';group.add(mesh);triangles+=b.position.length/9;}
  root.traverse(o=>{if(generated.has(o.name))o.visible=false;});root.add(group);
  return root.userData.smallBuildingShell={family,triangles,passages:this.cuts.length} as SmallBuildingShell;
 }
}
