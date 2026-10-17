import * as THREE from 'three';
import type {BuildingEntrance} from './render-repair.ts';

/** Native exterior families with deliberately omitted DS-facing elevations.
 * These measurements belong to these six models, never to a material-name or
 * bounding-box heuristic. The two Pal Park and port texture contexts share
 * geometry, but their placed entrances are still considered separately. */
export const CIVIC_BUILDING_MODELS=new Set([10,218,240,256,293,295]);
export type CivicBuildingShell={family:string;triangles:number;passages:number};
type Face={p:THREE.Vector3[];uv:THREE.Vector2[];color:THREE.Color[];normal:THREE.Vector3;area:number;material:THREE.MeshBasicMaterial};
type Cut={left:number;right:number;top:number};
const generated=new Set(['3d-rear-facade','3d-solid-backing','entrance-rear-wall']);
const near=(a:number,b:number)=>Math.abs(a-b)<.045;
function sourceFaces(root:THREE.Object3D){
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),faces:Face[]=[];
 root.traverse(o=>{if(!(o instanceof THREE.Mesh)||o instanceof THREE.InstancedMesh||generated.has(o.name)||o.name.startsWith('civic-building-'))return;
  const g=o.geometry,p=g.getAttribute('position'),uv=g.getAttribute('uv'),colors=g.getAttribute('color'),idx=g.index,mats=Array.isArray(o.material)?o.material:[o.material];
  for(const group of g.groups.length?g.groups:[{start:0,count:idx?.count??p.count,materialIndex:0}]){const material=mats[group.materialIndex??0]as THREE.MeshBasicMaterial;if(!material.visible||material.opacity<.5||/kage|shadow|hikaru|hikari|h_mado|h_in/i.test(material.name))continue;
   for(let at=group.start;at<group.start+group.count;at+=3){const ids=[0,1,2].map(i=>idx?idx.getX(at+i):at+i),points=ids.map(i=>o.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(o.matrixWorld).applyMatrix4(inverse)),normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])),area=normal.length()/2;if(area<1e-6)continue;faces.push({p:points,uv:ids.map(i=>uv?new THREE.Vector2(uv.getX(i),uv.getY(i)):new THREE.Vector2()),color:ids.map(i=>colors?new THREE.Color(colors.getX(i),colors.getY(i),colors.getZ(i)):new THREE.Color(1,1,1)),normal:normal.normalize(),area,material});}
  }
 });return faces;
}
function plane(faces:Face[],name:string,axis:'x'|'z',at:number,bottom:number,top:number){return faces.find(f=>f.material.name===name&&f.p.every(p=>near(p[axis],at))&&near(Math.min(...f.p.map(p=>p.y)),bottom)&&near(Math.max(...f.p.map(p=>p.y)),top));}
function sample(face:Face,p:THREE.Vector3){const w=THREE.Triangle.getBarycoord(p,...face.p as [THREE.Vector3,THREE.Vector3,THREE.Vector3],new THREE.Vector3())!;return{uv:face.uv[0].clone().multiplyScalar(w.x).addScaledVector(face.uv[1],w.y).addScaledVector(face.uv[2],w.z),color:face.color[0].clone().multiplyScalar(w.x).add(face.color[1].clone().multiplyScalar(w.y)).add(face.color[2].clone().multiplyScalar(w.z))};}
class Builder{
 private batches=new Map<THREE.MeshBasicMaterial,{p:number[];uv:number[];color:number[]}>();
 constructor(readonly cuts:Cut[]){}
 face(points:THREE.Vector3[],source:Face,samples:THREE.Vector3[]){let batch=this.batches.get(source.material);if(!batch){batch={p:[],uv:[],color:[]};this.batches.set(source.material,batch);}for(let i=1;i<points.length-1;i++){const ids=[0,i,i+1];if(new THREE.Triangle(...ids.map(j=>points[j])as[THREE.Vector3,THREE.Vector3,THREE.Vector3]).getArea()<1e-6)continue;for(const j of ids){const s=sample(source,samples[j]);batch.p.push(...points[j].toArray());batch.uv.push(...s.uv.toArray());batch.color.push(...s.color.toArray());}}}
 /** A measured band repeated at its original horizontal scale. Source points
  * are restricted to a genuine side-wall strip, never the recessed front. */
 band(left:number,right:number,z:number,bottom:number,top:number,source:Face,axis:'x'|'z',at:number,low:number,high:number,cut=false){
  const splits=[left,right,...(cut?this.cuts.flatMap(c=>[c.left,c.right]).filter(x=>x>left&&x<right):[])].sort((a,b)=>a-b);
  for(let s=0;s<splits.length-1;s++){const l=splits[s],r=splits[s+1],middle=(l+r)/2,base=cut?Math.max(bottom,...this.cuts.filter(c=>middle>c.left&&middle<c.right).map(c=>c.top)):bottom;if(base>=top-.001)continue;
   const count=Math.max(1,Math.ceil((r-l)/Math.abs(high-low))),y0=Math.min(...source.p.map(p=>p.y)),y1=Math.max(...source.p.map(p=>p.y));
   for(let i=0;i<count;i++){const a=THREE.MathUtils.lerp(l,r,i/count),b=THREE.MathUtils.lerp(l,r,(i+1)/count),points=[new THREE.Vector3(a,base,z),new THREE.Vector3(b,base,z),new THREE.Vector3(b,top,z),new THREE.Vector3(a,top,z)],samples=points.map((_,j)=>{const p=new THREE.Vector3();p[axis]=at;p[axis==='x'?'z':'x']=j===0||j===3?low:high;p.y=j<2?THREE.MathUtils.lerp(y0,y1,(base-bottom)/(top-bottom)):y1;return p;});this.face(points,source,samples);}
  }
 }
 quad(points:number[][],source:Face,sourcePoints:number[][]){this.face(points.map(p=>new THREE.Vector3(...p as[number,number,number])),source,sourcePoints.map(p=>new THREE.Vector3(...p as[number,number,number])));}
 /** Close a roof underside with its own adjoining wall/beam pixel, rather
  * than filling an entire model box up to decorative signs or clock towers. */
 join(inner:number[][],outer:number[][],source:Face){const native=source.p[0].clone().add(source.p[1]).add(source.p[2]).multiplyScalar(1/3);for(let i=0;i<inner.length-1;i++)this.face([inner[i],inner[i+1],outer[i+1],outer[i]].map(p=>new THREE.Vector3(...p as[number,number,number])),source,Array.from({length:4},()=>native));}
 finish(root:THREE.Object3D,family:string){const group=new THREE.Group();group.name='civic-building-shell';let triangles=0;for(const[source,b]of this.batches){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(b.color,3));geometry.computeVertexNormals();const material=source.clone();material.side=THREE.DoubleSide;material.transparent=false;material.opacity=1;material.alphaTest=0;material.depthWrite=true;material.vertexColors=true;const mesh=new THREE.Mesh(geometry,material);mesh.name='civic-building-'+family+'-cladding';group.add(mesh);triangles+=b.p.length/9;}if(!triangles)return null;root.traverse(o=>{if(generated.has(o.name))o.visible=false;});root.add(group);return root.userData.civicBuildingShell={family,triangles,passages:this.cuts.length}as CivicBuildingShell;}
}
function theater(b:Builder,f:Face[]){
 const wall=plane(f,'en_kabu1','x',50,2,34),upper=plane(f,'en_kabu1','x',36,48,65);if(!wall||!upper)return false;
 b.band(-50,50,-28,2,34,wall,'x',50,-28,0,true);b.band(-36,36,-18,48,65,upper,'x',36,-18,0);
 b.join([[-50,34,-28],[50,34,-28]], [[-52,36,-35],[52,36,-35]],wall);
 b.join([[-36,65,-18],[36,65,-18]],[[-40,67,-26],[40,67,-26]],upper);
 // The native side eaves also have a two-unit open seam. Complete the short
 // corner returns, while retaining the original two sweeping roof levels.
 for(const sign of[-1,1]){b.join([[sign*50,34,-28],[sign*50,34,28]],[[sign*57,36,-30],[sign*57,36,30]],wall);b.join([[sign*36,65,-18],[sign*36,65,18]],[[sign*44,67,-22],[sign*44,67,23]],upper);}
 // The ornamental ridge has a top and a front lip, but no back lip. Repeat
 // only that native roof ornament, never the entrance facade underneath it.
 for(const ridge of f.filter(face=>face.material.name==='en_kabu1'&&face.p.every(p=>near(p.z,3)&&p.y>=88.99)))b.face(ridge.p.map(p=>p.clone().setZ(-3)),ridge,ridge.p);
 return true;
}
function gift(b:Builder,f:Face[]){
 const wall=plane(f,'lambert3','x',31.498046875,5.033203125,31.748046875),fascia=plane(f,'lambert3','x',34,35.3203125,50.6015625);if(!wall||!fascia)return false;
 b.band(-31.498046875,31.498046875,-12.630859375,3.953125,31.748046875,wall,'x',31.498046875,-12.630859375,20.615234375,true);
 const inner=[[-31.498046875,31.748046875,-12.630859375],[31.498046875,31.748046875,-12.630859375]],outer=[[-32,35.3203125,-12.484375],[34,35.3203125,-12.484375]];b.join(inner,outer,wall);
 // The prize shop has an octagonal raised parapet, not a rectangular roof.
 const rear=[[-32,-12.484375],[-23.0390625,-21.923828125],[25.0390625,-21.923828125],[34,-12.484375]];
 for(let i=0;i<rear.length-1;i++){const[a,c]=[rear[i],rear[i+1]];b.quad([[a[0],35.3203125,a[1]],[c[0],35.3203125,c[1]],[c[0],50.662109375,c[1]],[a[0],50.662109375,a[1]]],fascia,[[34,35.3203125,-12.484375],[34,35.3203125,4.41796875],[34,50.6015625,4.41796875],[34,50.6015625,-12.484375]]);}
 // The original long side walls stop 3.572265625 below the octagonal roof
 // skirt. Close the measured eave underside around the other three sides;
 // a taller rectangular wall would erase the native chamfered silhouette.
 b.join([[31.498046875,31.748046875,-12.630859375],[31.498046875,31.748046875,20.615234375]],[[34,35.3203125,-12.484375],[34,35.3203125,16.9375]],wall);
 b.join([[-31.498046875,31.748046875,-12.630859375],[-31.498046875,31.748046875,20.615234375]],[[-32,35.3203125,-12.484375],[-32,35.3203125,16.9375]],wall);
 b.join([[-31.498046875,31.748046875,20.615234375],[-23.0390625,31.748046875,20.369140625],[0,31.748046875,20.369140625],[25.0390625,31.748046875,20.369140625],[31.498046875,31.748046875,20.615234375]],[[-32,35.3203125,16.9375],[-23.0390625,35.380859375,25.92578125],[0,35.380859375,25.92578125],[25.0390625,35.380859375,25.92578125],[34,35.3203125,16.9375]],wall);
 return true;
}
function station(b:Builder,f:Face[]){
 const wall=plane(f,'ybc_ln04','x',36,2,40),trim=plane(f,'ybc_ln05','x',40,36,48),window=plane(f,'ybc_wd01','x',32,64,80);if(!wall||!trim||!window)return false;
 b.band(-52,36,-45.65625,2,40,wall,'x',36,-37.65625,26.34375,true);b.band(-56,40,-46,36,48,trim,'x',40,-40,40);b.band(-48,32,-40,48,64,window,'x',32,-32,32);b.band(-48,32,-40,64,80,window,'x',32,-32,32);
 // Follow the actual arched barrel roof, including every native segment.
 const arch=[[-51.7578125,80.49609375],[-44.48828125,89.44921875],[-35.42578125,96.58203125],[-25.015625,101.5390625],[-13.765625,104.08203125],[-2.234375,104.08203125],[9.015625,101.5390625],[19.42578125,96.58203125],[28.48828125,89.44921875],[35.7578125,80.49609375]];
 for(let i=0;i<arch.length-1;i++){const[x0,y0]=arch[i],[x1,y1]=arch[i+1];b.quad([[x0,80,-40],[x1,80,-40],[x1,y1,-40],[x0,y0,-40]],window,[[32,64,-32],[32,64,32],[32,80,32],[32,80,-32]]);}
 b.join([[-52,40,-45.65625],[36,40,-45.65625]],[[-56,48,-46],[40,48,-46]],wall);
 b.join([[-48,48,-40],[32,48,-40]],[[-56,48,-46],[40,48,-46]],trim);
 // The side annex is glazed, with native translucent reflection pixels. Its
 // original alpha card had no inner glass surface, exposing sky through the
 // entire building. Add its own opaque blue glazing immediately behind it;
 // all native mullions, reflection art and barrel shape remain in place.
 const center=new THREE.Vector3(-80,24,0);for(const glass of f.filter(face=>face.material.name==='ybc_wd02')){const middle=glass.p[0].clone().add(glass.p[1]).add(glass.p[2]).multiplyScalar(1/3),inward=center.clone().sub(middle).dot(glass.normal)>=0?1:-1;b.face(glass.p.map(p=>p.clone().addScaledVector(glass.normal,inward*.06)),glass,glass.p);}
 return true;
}
function museum(b:Builder,f:Face[]){
 const wall=plane(f,'nbc_mm09','x',-86,9.265625,48),base=plane(f,'nbc_mm09','x',-86,2,9.265625),upper=plane(f,'nbc_mm07','z',9.5546875,65.7109375,73.2109375),wing=plane(f,'nbc_mm09','x',149.4921875,9.265625,48);if(!wall||!base||!upper||!wing)return false;
 b.band(-86,86,-56,2,9.265625,base,'x',-86,-56,16,true);b.band(-86,86,-56,9.265625,48,wall,'x',-86,-56,16,true);
 b.band(86,149.4921875,-52,2,9.265625,base,'x',-86,-56,16,true);b.band(86,149.4921875,-52,9.265625,48,wing,'x',149.4921875,-52,-16,true);
 b.join([[-86,48,-56],[86,48,-56]],[[-91,55.1640625,-62.7890625],[91,55.1640625,-62.7890625]],wall);
 b.join([[86,48,-52],[149.4921875,48,-52]],[[86,50.296875,-55.4375],[152,50.296875,-55.4375]],wing);
 b.band(-77.625,77.625,-49.6015625,65.7109375,73.2109375,upper,'z',9.5546875,-69.625,0);
 b.join([[-77.625,73.2109375,-49.6015625],[77.625,73.2109375,-49.6015625]],[[-77.625,77.265625,-51.9453125],[77.625,77.265625,-51.9453125]],upper);
 const roof=f.filter(face=>/nbc_mm03|nbc_mm09/.test(face.material.name)&&face.normal.y>.03&&Math.max(...face.p.map(p=>p.y))>=48);for(const x of[-86,86])roofSkirt(b,roof,'x',x,-56,16,48,wall);roofSkirt(b,roof,'x',149.4921875,-52,-16,48,wing);return true;
}
function palpark(b:Builder,f:Face[]){
 const wall=plane(f,'lambert10','x',44,12,49),base=f.find(face=>face.material.name==='lambert10'&&face.p.every(p=>near(p.x,46))&&near(Math.min(...face.p.map(p=>p.y)),2)&&near(Math.max(...face.p.map(p=>p.y)),12)&&near(Math.min(...face.p.map(p=>p.z)),-46)&&near(Math.max(...face.p.map(p=>p.z)),-17)),glass=plane(f,'lambert13','x',41,49,63.44140625),trim=plane(f,'lambert10','x',44,63.44140625,67.25),awning=f.filter(face=>isDetachedPalparkAwning(face.material.name,face.p));if(!wall||!base||!glass||!trim||awning.length!==14)return false;
 // The side foundation is three separate 28/29-unit modules. Sampling the
 // first over the entire building depth extrapolated into orange roof art.
 // Repeat only the proven rear module's complete continuous grey strip.
 b.band(-46,46,-46,2,12,base,'x',46,-46,-17,true);b.band(-44,44,-44,12,49,wall,'x',44,-44,-17,true);b.band(-41,41,-40,49,63.44140625,glass,'x',41,-40,-14.66796875);b.band(-44,44,-44,63.44140625,67.25,trim,'x',44,-44,-14.66796875);
 b.join([[-44,49,-44],[44,49,-44]],[[-41,49,-40],[41,49,-40]],wall);
 // The original side glazing is missing its middle bay on both sides. Close
 // those two 24-unit bays with the neighboring native glass, and join the
 // chamfered rear corners instead of exposing the room behind their frames.
 for(const sign of[-1,1]){b.quad([[sign*41,49,-14.66796875],[sign*41,49,9.66796875],[sign*41,63.44140625,9.66796875],[sign*41,63.44140625,-14.66796875]],glass,[[41,49,-40],[41,49,-14.66796875],[41,63.44140625,-14.66796875],[41,63.44140625,-40]]);b.quad([[sign*44,49,-44],[sign*41,49,-40],[sign*41,63.44140625,-40],[sign*44,63.44140625,-44]],trim,[[44,63.44140625,-44],[44,63.44140625,-14.66796875],[44,67.25,-14.66796875],[44,67.25,-44]]);}
 const arch=[[-22.171875,66.17578125],[-16.96875,73.96875],[-9.18359375,79.171875],[0,81],[9.18359375,79.171875],[16.96875,73.96875],[22.171875,66.17578125]];
 for(let i=0;i<arch.length-1;i++){const[x0,y0]=arch[i],[x1,y1]=arch[i+1];b.quad([[x0,63.44140625,-44],[x1,63.44140625,-44],[x1,y1,-44],[x0,y0,-44]],trim,[[44,63.44140625,-44],[44,63.44140625,-14.66796875],[44,67.25,-14.66796875],[44,67.25,-44]]);}
 // Native geometry stores this doorway canopy entirely outside the rear,
 // with its nearest edge 8.28125 units away from the wall. Only the actual
 // north passage receives it, mounted flush; the closed context has no rear
 // doorway or floating fixture. Its exact native shape/paint are retained.
 if(b.cuts.length)for(const face of awning)b.face(face.p.map(p=>p.clone().add(new THREE.Vector3(0,0,8.28125))),face,face.p);
 return true;
}
function isDetachedPalparkAwning(material:string,points:THREE.Vector3[]){return material==='lambert10'&&points.every(p=>p.x>=-21.7774&&p.x<=21.7774&&p.y>=44.0663&&p.y<=48.0665&&p.z>=-73.2384&&p.z<=-52.2812);}
/** Filter only the fourteen proven disconnected awning triangles. Allocate
 * a fully owned geometry/material for this placed mesh; templates and sibling
 * primitive buffers retain their original indices, attributes and maps. */
function preparePalparkAwningRemoval(root:THREE.Object3D){
 const inverse=root.matrixWorld.clone().invert(),matches:{mesh:THREE.Mesh;keep:number[]}[]=[];let removed=0;
 root.traverse(o=>{if(!(o instanceof THREE.Mesh)||Array.isArray(o.material)||o.material.name!=='lambert10'||generated.has(o.name)||o.name.startsWith('civic-building-'))return;const g=o.geometry,p=g.getAttribute('position'),idx=g.index,keep:number[]=[];let count=0;for(let at=0;at<(idx?.count??p.count);at+=3){const ids=[0,1,2].map(i=>idx?idx.getX(at+i):at+i),points=ids.map(i=>o.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(o.matrixWorld).applyMatrix4(inverse));if(isDetachedPalparkAwning(o.material.name,points))count++;else keep.push(...ids);}if(count){matches.push({mesh:o,keep});removed+=count;}});
 if(removed!==14||matches.length!==1)return null;const{mesh,keep}=matches[0],geometry=mesh.geometry.clone(),material=(mesh.material as THREE.Material).clone();geometry.setIndex(keep);geometry.clearGroups();geometry.setDrawRange(0,keep.length);return()=>{mesh.geometry=geometry;mesh.material=material;mesh.name='civic-building-pal-park-native-body';mesh.userData.civicRemovedDetachedAwningTriangles=removed;};
}
/** Highest physical roof surface at a measured body perimeter. This is used
 * solely for the port's curved colonnade roof; tower and front signs are not
 * candidates. Its piecewise-linear native roof stays the exact silhouette. */
function roofAt(faces:Face[],x:number,z:number){let y=-Infinity;for(const f of faces){const [a,b,c]=f.p,den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(Math.abs(den)<1e-7)continue;const u=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/den,v=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/den,w=1-u-v;if(u>=-1e-5&&v>=-1e-5&&w>=-1e-5)y=Math.max(y,u*a.y+v*b.y+w*c.y);}return y;}
function roofSkirt(b:Builder,roof:Face[],axis:'x'|'z',at:number,low:number,high:number,base:number,source:Face){
 const tangent=axis==='x'?'z':'x',breaks:number[]=[low,high];for(const face of roof)for(let i=0;i<3;i++){const a=face.p[i],c=face.p[(i+1)%3];if((a[axis]-at)*(c[axis]-at)<0){const p=a.clone().lerp(c,(at-a[axis])/(c[axis]-a[axis]));if(p[tangent]>low&&p[tangent]<high)breaks.push(p[tangent]);}if(near(a[axis],at)&&a[tangent]>low&&a[tangent]<high)breaks.push(a[tangent]);}
 const qs=breaks.sort((a,c)=>a-c).filter((a,i,s)=>!i||a-s[i-1]>.001),sourceAxis=Math.abs(source.normal.x)>.5?'x':'z',sourceTangent=sourceAxis==='x'?'z':'x',s0=Math.min(...source.p.map(p=>p[sourceTangent])),s1=Math.max(...source.p.map(p=>p[sourceTangent])),bottom=Math.min(...source.p.map(p=>p.y)),top=Math.max(...source.p.map(p=>p.y));
 for(let i=0;i<qs.length-1;i++){let a=qs[i],c=qs[i+1];const p0=new THREE.Vector3(),p1=new THREE.Vector3();p0[axis]=p1[axis]=at;p0[tangent]=a;p1[tangent]=c;let y0=roofAt(roof,p0.x,p0.z),y1=roofAt(roof,p1.x,p1.z);if(!Number.isFinite(y0)||!Number.isFinite(y1)||Math.max(y0,y1)<=base+.001)continue;if(y0<base){a=THREE.MathUtils.lerp(a,c,(base-y0)/(y1-y0));p0[tangent]=a;y0=base;}if(y1<base){c=THREE.MathUtils.lerp(a,c,(base-y0)/(y1-y0));p1[tangent]=c;y1=base;}
  const points=[p0.clone().setY(base),p1.clone().setY(base),p1.clone().setY(y1),p0.clone().setY(y0)],samples=points.map((_,j)=>{const p=new THREE.Vector3();p[sourceAxis]=source.p[0][sourceAxis];p[sourceTangent]=j===0||j===3?s0:s1;p.y=j<2?bottom:top;return p;});b.face(points,source,samples);
 }
}
function port(b:Builder,f:Face[]){
 const wall=plane(f,'kbc_pr03','x',50,6.33984375,48),base=plane(f,'kbc_pr02','x',60,2,6.33984375);if(!wall||!base)return false;
 b.band(-60,60,-48,2,6.33984375,base,'x',60,-48,48,true);b.band(-50,50,-38,6.33984375,48,wall,'x',50,-38,38,true);
 const roof=f.filter(face=>face.material.name==='kbc_pr02'&&face.normal.y>.03&&Math.max(...face.p.map(p=>p.y))>=48);
 // Inset infill follows the arch behind its original stone columns. It does
 // not square off the outer cornice, clock tower or decorative front arches.
 for(const[axis,at,low,high]of[['z',-38,-50,50],['x',-50,-38,38],['x',50,-38,38]]as const)roofSkirt(b,roof,axis,at,low,high,48,wall);return true;
}
/** Invoke on each placed native clone after the gate-aware entrance repair.
 * New geometries/material clones use the civic-building- disposal prefix;
 * native geometry, map textures, front facades and animation stay shared. */
export function closeCivicBuildingShell(root:THREE.Object3D,asset:string,doors:BuildingEntrance[]=[]):CivicBuildingShell|null{
 const match=asset.match(/(?:^|\/)1-(\d+)-\d+\.glb$/),model=Number(match?.[1]);if(!match||!CIVIC_BUILDING_MODELS.has(model))return null;const previous=root.userData.civicBuildingShell as CivicBuildingShell|undefined;if(previous)return previous;
 // updateWorldMatrix refreshes parents; updateMatrixWorld also refreshes the
 // SkinnedMesh bindMatrixInverse used by getVertexPosition. Placed clones may
 // reach this helper before the renderer has refreshed either matrix path.
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),rear=model===10?-28:model===218?-38:model===240?-12.630859375:model===256?-45.65625:model===293?-56:-44,width=model===293?86:model===256?56:model===218?60:model===10?50:model===240?34:46;
 const cuts:Cut[]=[];for(const door of doors){const p=new THREE.Vector3(door.x,root.getWorldPosition(new THREE.Vector3()).y,door.z).applyMatrix4(inverse);if(Math.abs(p.z-rear)>12||Math.abs(p.x)>width+4)continue;if(door.axis!==undefined&&door.sign!==undefined){const d=new THREE.Vector3().setComponent(door.axis,door.sign).transformDirection(inverse);if(d.z>-.5)continue;}cuts.push({left:p.x-8.1,right:p.x+8.1,top:model===295?44.1:34});}
 const faces=sourceFaces(root),builder=new Builder(cuts),ok=model===10?theater(builder,faces):model===218?port(builder,faces):model===240?gift(builder,faces):model===256?station(builder,faces):model===293?museum(builder,faces):palpark(builder,faces);if(!ok)return null;
 const removeAwning=model===295?preparePalparkAwningRemoval(root):null;if(model===295&&!removeAwning)return null;
 const result=builder.finish(root,model===10?'dance-theater':model===218?'vermilion-port':model===240?'celadon-prize-shop':model===256?'saffron-station':model===293?'pewter-museum':'pal-park');if(result)removeAwning?.();return result;
}
