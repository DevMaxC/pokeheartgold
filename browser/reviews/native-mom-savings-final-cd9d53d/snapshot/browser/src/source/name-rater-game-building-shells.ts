import * as THREE from 'three';
import type {BuildingEntrance} from './render-repair.ts';

/** Native Goldenrod Game Corner and Name Rater tent exteriors. */
export const NAME_RATER_GAME_BUILDING_MODELS=new Set([79,87]);
export type NameRaterGameBuildingShell={family:string;triangles:number};
type Face={p:THREE.Vector3[];uv:THREE.Vector2[];color:THREE.Color[];normal:THREE.Vector3;area:number;material:THREE.MeshBasicMaterial};
const generated=new Set(['3d-rear-facade','3d-solid-backing','entrance-rear-wall']);
const near=(a:number,b:number)=>Math.abs(a-b)<.045;
function sourceFaces(root:THREE.Object3D){
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),faces:Face[]=[];
 root.traverse(o=>{if(!(o instanceof THREE.Mesh)||o instanceof THREE.InstancedMesh||generated.has(o.name)||o.name.startsWith('name-rater-game-building-'))return;
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
 finish(root:THREE.Object3D,family:string){const group=new THREE.Group();group.name='name-rater-game-building-shell';let triangles=0;for(const[source,b]of this.batches){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(b.color,3));geometry.computeVertexNormals();const material=source.clone();material.side=THREE.DoubleSide;material.transparent=false;material.opacity=1;material.alphaTest=0;material.depthWrite=true;material.vertexColors=true;const mesh=new THREE.Mesh(geometry,material);mesh.name='name-rater-game-building-'+family+'-cladding';group.add(mesh);triangles+=b.p.length/9;}if(!triangles)return null;root.traverse(o=>{if(generated.has(o.name))o.visible=false;});root.add(group);return root.userData.nameRaterGameBuildingShell={family,triangles}as NameRaterGameBuildingShell;}
}
function band(b:Builder,left:number,right:number,z:number,bottom:number,top:number,source:Face,x:number,z0:number,z1:number){const n=Math.max(1,Math.ceil((right-left)/Math.abs(z1-z0)));for(let i=0;i<n;i++){const a=THREE.MathUtils.lerp(left,right,i/n),c=THREE.MathUtils.lerp(left,right,(i+1)/n);b.quad([[a,bottom,z],[c,bottom,z],[c,top,z],[a,top,z]],source,[[x,bottom,z0],[x,bottom,z1],[x,top,z1],[x,top,z0]]);}}
function game(b:Builder,f:Face[]){
 const bands=[[2,9],[9,23.73046875],[23.73046875,40]],donors=bands.map(([lo,hi])=>plane(f,'ko_game_a','x',-51,lo,hi)),rim=plane(f,'ko_game_a','x',53,37,48),chamfers=f.filter(face=>face.material.name==='ko_game_a'&&Math.abs(face.normal.x)>.7&&face.normal.z>.7&&near(Math.min(...face.p.map(p=>p.y)),37)&&near(Math.max(...face.p.map(p=>p.y)),48));if(donors.some(s=>!s)||!rim||chamfers.length!==4||!f.some(face=>face.material.name==='ko_game_a'&&face.p.some(p=>near(p.y,64.671875)&&near(p.z,-20.41796875))))return false;
 for(let i=0;i<bands.length;i++)band(b,-51,51,-22,...bands[i]as[number,number],donors[i]!,-51,-22,17);
 // The roof already has its genuine horizontal glazing and central arch.
 // Only its omitted rear fascia/chamfers need a return; never use the front
 // neon sign or animated light cards as a roof envelope.
 for(const face of chamfers)b.face(face.p.map(p=>p.clone().setZ(-5-p.z)),face,face.p);
 band(b,-45,45,-32,37,48,rim,53,-24,19);
 // Measured body-to-fascia underside, below the original 48-unit deck.
 b.join([[-51,40,-22],[51,40,-22]],[[-45,37,-32],[45,37,-32]],donors[2]!);
 for(const sign of[-1,1])b.join([[sign*51,40,-22],[sign*51,40,17]],[[sign*53,37,-24],[sign*53,37,19]],donors[2]!);
 // The four corner returns meet the native fascia, without a box across the
 // entrance or an invented slab at the height of its neon sign.
 for(const sign of[-1,1])b.quad([[sign*51,40,-22],[sign*53,37,-24],[sign*45,37,-32]],donors[2]!,Array.from({length:3},()=>[-51,35,-2]));return true;
}
function tent(b:Builder,f:Face[]){
 const cloth=f.filter(face=>face.material.name==='ko_seimei_lm4'),lower=cloth.find(face=>face.normal.x<-.89&&face.p.some(p=>near(p.y,2.234375))&&face.p.some(p=>near(p.y,11.59375))&&face.p.every(p=>p.x<-29)),upper=cloth.find(face=>face.normal.x<-.99&&face.p.some(p=>near(p.y,31.14453125))&&face.p.some(p=>near(p.y,11.59375))),roof=cloth.filter(face=>face.normal.z>.8&&face.normal.y>.3&&face.p.every(p=>p.y>=32.2812&&p.y<=76.376)),trim=cloth.filter(face=>face.normal.z>.69&&face.normal.y>.7&&near(Math.min(...face.p.map(p=>p.y)),30.84375)&&near(Math.max(...face.p.map(p=>p.y)),32.28125));if(!lower||!upper||roof.length!==10||trim.length!==10)return false;
 const edge=[[[ -34.765625,2.234375,-23.82421875],[34.765625,2.234375,-23.921875]], [[-30.09375,11.59375,-22.53515625],[30.09765625,11.59375,-22.625]], [[-28.00390625,31.14453125,-19.3515625],[28.015625,31.140625,-19.4296875]]];
 for(let i=0;i<2;i++){const donor=i?upper:lower,ps=[edge[i][0],edge[i][1],edge[i+1][1],edge[i+1][0]],x=donor.p[0].x,z=donor.p[0].z;b.quad(ps,donor,ps.map(p=>[x,p[1],z]));}
 // Native tent hip edges have three different depth offsets, so a single
 // mirror plane would leave seams. Continue each measured level exactly.
 const backZ=(y:number)=>near(y,32.28125)?-21.5078125:near(y,46.89453125)?-15.625:near(y,59.62109375)?-12.5:-9.47265625;
 for(const face of roof)b.face(face.p.map(p=>p.clone().setZ(backZ(p.y))),face,face.p);
 for(const face of trim)b.face(face.p.map(p=>p.clone().setZ(p.y>32?-21.5078125:-22.98046875)),face,face.p);
 b.join(edge[2],[[-32.19140625,32.28125,-21.5078125],[32.19140625,32.28125,-21.5078125]],upper);
 // Join each rear hip eave to its existing long side roll. Keep the front
 // curtains/windows/entry recess and all native pinnacle facets untouched.
 for(const sign of[-1,1])b.quad([[sign*32.19140625,32.28125,-21.5078125],[sign*32.19140625,32.28125,-19.80078125],[sign*(sign<0?34.01953125:33.90234375),30.9140625,-19.80078125],[sign*32.19140625,30.84375,-22.98046875]],trim[0],Array.from({length:4},()=>trim[0].p[0].toArray()));return true;
}
/** Measured native cladding/roof continuations. All additions are owned by
 * this placed clone; native fronts, buffers and atlas textures stay shared. */
export function closeNameRaterGameBuildingShell(root:THREE.Object3D,asset:string,doors:BuildingEntrance[]=[]):NameRaterGameBuildingShell|null{
 const match=asset.match(/(?:^|\/)1-(\d+)-\d+\.glb$/),model=Number(match?.[1]);if(!match||!NAME_RATER_GAME_BUILDING_MODELS.has(model))return null;const previous=root.userData.nameRaterGameBuildingShell as NameRaterGameBuildingShell|undefined;if(previous)return previous;root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),rear=model===79?-22:-22.6,width=model===79?51:35;
 if(doors.some(door=>{const p=new THREE.Vector3(door.x,root.getWorldPosition(new THREE.Vector3()).y,door.z).applyMatrix4(inverse);if(Math.abs(p.z-rear)>8||Math.abs(p.x)>width+4)return false;if(door.axis===undefined||door.sign===undefined)return true;return new THREE.Vector3().setComponent(door.axis,door.sign).transformDirection(inverse).z<-.5;}))return null;
 const faces=sourceFaces(root),builder=new Builder();if(!(model===79?game(builder,faces):tent(builder,faces)))return null;return builder.finish(root,model===79?'goldenrod-game-corner':'name-rater-tent');
}
