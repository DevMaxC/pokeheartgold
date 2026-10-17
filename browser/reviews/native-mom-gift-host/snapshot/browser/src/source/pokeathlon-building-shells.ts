import * as THREE from 'three';
import type {BuildingEntrance} from './render-repair.ts';

export const POKEATHLON_BUILDING_MODELS=new Set([179,181,182,226]);
export type PokeathlonBuildingShell={family:'dome-apron'|'dome-arena'|'three-way-gate'|'field-light';triangles:number;passages:number};
type Face={p:THREE.Vector3[];uv:THREE.Vector2[];color:THREE.Color[];material:THREE.MeshBasicMaterial};
const generated=new Set(['3d-rear-facade','3d-solid-backing','entrance-rear-wall']);
const near=(a:number,b:number)=>Math.abs(a-b)<.035;
function sourceFaces(root:THREE.Object3D){
  // updateWorldMatrix alone does not refresh a SkinnedMesh bind inverse.
  root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),faces:Face[]=[];
  root.traverse(o=>{if(!(o instanceof THREE.Mesh)||generated.has(o.name)||o.name.startsWith('pokeathlon-building-'))return;
    const g=o.geometry,p=g.getAttribute('position'),uv=g.getAttribute('uv'),color=g.getAttribute('color'),idx=g.index,materials=Array.isArray(o.material)?o.material:[o.material];
    for(const group of g.groups.length?g.groups:[{start:0,count:idx?.count??p.count,materialIndex:0}]){const material=materials[group.materialIndex??0] as THREE.MeshBasicMaterial;if(/kage|shadow/i.test(material.name)||material.opacity<.5)continue;
      for(let at=group.start;at<group.start+group.count;at+=3){const ids=[0,1,2].map(i=>idx?idx.getX(at+i):at+i),points=ids.map(i=>o.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(o.matrixWorld).applyMatrix4(inverse));if(new THREE.Triangle(...points as[THREE.Vector3,THREE.Vector3,THREE.Vector3]).getArea()<1e-7)continue;faces.push({p:points,uv:ids.map(i=>uv?new THREE.Vector2(uv.getX(i),uv.getY(i)):new THREE.Vector2()),color:ids.map(i=>color?new THREE.Color(color.getX(i),color.getY(i),color.getZ(i)):new THREE.Color(1,1,1)),material});}
    }
  });return faces;
}
function plane(faces:Face[],name:string,axis:'x'|'z',at:number,bottom:number,top:number){return faces.find(f=>f.material.name===name&&f.p.every(p=>near(p[axis],at))&&near(Math.min(...f.p.map(p=>p.y)),bottom)&&near(Math.max(...f.p.map(p=>p.y)),top));}
function sample(face:Face,p:THREE.Vector3){const w=THREE.Triangle.getBarycoord(p,...face.p as[THREE.Vector3,THREE.Vector3,THREE.Vector3],new THREE.Vector3())!;return{uv:face.uv[0].clone().multiplyScalar(w.x).addScaledVector(face.uv[1],w.y).addScaledVector(face.uv[2],w.z),color:face.color[0].clone().multiplyScalar(w.x).add(face.color[1].clone().multiplyScalar(w.y)).add(face.color[2].clone().multiplyScalar(w.z))};}
class Builder{
  private batches=new Map<THREE.MeshBasicMaterial,{p:number[];uv:number[];color:number[]}>();
  face(points:THREE.Vector3[],source:Face,samples:THREE.Vector3[]){let b=this.batches.get(source.material);if(!b){b={p:[],uv:[],color:[]};this.batches.set(source.material,b);}for(let i=1;i<points.length-1;i++){const ids=[0,i,i+1];if(new THREE.Triangle(...ids.map(j=>points[j])as[THREE.Vector3,THREE.Vector3,THREE.Vector3]).getArea()<1e-7)continue;for(const j of ids){const s=sample(source,samples[j]);b.p.push(...points[j].toArray());b.uv.push(...s.uv.toArray());b.color.push(...s.color.toArray());}}}
  /** Map each wall segment to the complete, measured side-wall band. Atlas
   * coordinates stay within that source patch, including at corner joins. */
  band(a:THREE.Vector2,c:THREE.Vector2,bottom:number,top:number,source:Face,axis:'x'|'z'){
    const along=axis==='x'?'z':'x',at=source.p[0][axis],lo=Math.min(...source.p.map(p=>p[along])),hi=Math.max(...source.p.map(p=>p[along])),y0=Math.min(...source.p.map(p=>p.y)),y1=Math.max(...source.p.map(p=>p.y)),parts=Math.max(1,Math.ceil(a.distanceTo(c)/Math.abs(hi-lo)));
    for(let part=0;part<parts;part++){const left=a.clone().lerp(c,part/parts),right=a.clone().lerp(c,(part+1)/parts),points=[new THREE.Vector3(left.x,bottom,left.y),new THREE.Vector3(right.x,bottom,right.y),new THREE.Vector3(right.x,top,right.y),new THREE.Vector3(left.x,top,left.y)],samples=[[lo,y0],[hi,y0],[hi,y1],[lo,y1]].map(([u,y])=>{const p=new THREE.Vector3();p[axis]=at;p[along]=u;p.y=y;return p;});this.face(points,source,samples);}
  }
  finish(root:THREE.Object3D,family:PokeathlonBuildingShell['family'],passages:number){const group=new THREE.Group();group.name='pokeathlon-building-shell';let triangles=0;
    for(const[source,b]of this.batches){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(b.color,3));geometry.computeVertexNormals();const material=source.clone();material.side=THREE.DoubleSide;material.transparent=false;material.opacity=1;material.alphaTest=0;material.depthWrite=true;material.vertexColors=true;const mesh=new THREE.Mesh(geometry,material);mesh.name='pokeathlon-building-'+family+'-cladding';group.add(mesh);triangles+=b.p.length/9;}
    // Per-clone visibility only. Never dispose/edit a cached template buffer,
    // source material, map or skeleton while replacing its generic closure.
    root.traverse(o=>{if(generated.has(o.name))o.visible=false;});root.add(group);return root.userData.pokeathlonBuildingShell={family,triangles,passages} as PokeathlonBuildingShell;
  }
}
const point=(x:number,z:number)=>new THREE.Vector2(x,z);
function gate(b:Builder,f:Face[]){
  const brick=plane(f,'gate_lm1','z',-42.0703125,1.96875,20),wall=plane(f,'gate_p2_lm1','x',97.1484375,20,44),glass=plane(f,'gate_3_lm1','x',97.1484375,44,60),upper=plane(f,'gate_lm1','z',36,60,64),canopyBack=-34.0703125;
  const openings=[[-128,-96],[40,88]],canopies=openings.map(([left,right])=>f.find(face=>face.material.name==='gate_lm1'&&face.p.every(p=>near(p.y,44))&&[left-4,right+4].every(x=>face.p.some(p=>near(p.x,x)&&near(p.z,canopyBack)))));
  if(!brick||!wall||!glass||!upper||canopies.some(face=>!face))return false;
  // Both northern vestibules are authored into every gate context. One map
  // may expose only the south warp; that is not evidence to brick them up.
  const z=-30.25,spans=[[-164,-128],[-96,40],[88,100]];
  for(const[left,right]of spans){b.band(point(left,z),point(right,z),1.96875,20,brick,'z');b.band(point(left,z),point(right,z),20,44,wall,'x');}
  for(const[left,right]of openings)b.band(point(left,z),point(right,z),40,44,wall,'x');
  b.band(point(-164,z),point(100,z),44,60,glass,'x');b.band(point(-164,z),point(100,z),60,64,upper,'z');
  // The projecting source canopies have no lower side returns. These walls
  // leave the full authored 32- and 48-unit canopy openings clear below their
  // native lintels, even on a map whose event table lists another entrance.
  for(const x of[-128,-96,40,88]){b.band(point(x,-68.0859375),point(x,z),1.96875,20,brick,'z');b.band(point(x,-68.0859375),point(x,z),20,40,wall,'x');}
  // The original canopy/fascia starts at Z-34.0703, behind the inset rear
  // wall at Z-30.25. Continue its measured Y40 underside over that short
  // join: upward paths otherwise leave the passage before reaching the
  // native roof. Both complete northern exits stay clear below the lintel.
  // Repeat only the adjoining native roof-edge texels across this return.
  openings.forEach(([left,right],i)=>{const a=new THREE.Vector3(left,44,canopyBack),c=new THREE.Vector3(right,44,canopyBack);b.face([new THREE.Vector3(left,40,canopyBack),new THREE.Vector3(right,40,canopyBack),new THREE.Vector3(right,40,z),new THREE.Vector3(left,40,z)],canopies[i]!,[a,c,c,a]);});
  return true;
}
function podShells(b:Builder,faces:Face[]){
  const roofs=faces.filter(f=>f.material.name==='poke_c_d3_lm1'),wall=faces.find(f=>f.material.name==='poke_c_d3_lm2'&&f.p.every(p=>near(p.x,136.453125)&&p.y>=4.9&&p.y<21.45)&&near(Math.min(...f.p.map(p=>p.y)),4.90625));
  if(roofs.length!==48||!wall)return false;
  const components:{faces:Face[];keys:Set<string>}[]=[],key=(p:THREE.Vector3)=>p.toArray().map(x=>x.toFixed(3)).join(',');
  for(const face of roofs){const keys=face.p.map(key),joined=components.filter(c=>keys.some(k=>c.keys.has(k)));if(!joined.length){components.push({faces:[face],keys:new Set(keys)});continue;}const target=joined[0];target.faces.push(face);keys.forEach(k=>target.keys.add(k));for(const other of joined.slice(1)){target.faces.push(...other.faces);other.keys.forEach(k=>target.keys.add(k));components.splice(components.indexOf(other),1);}}
  if(components.length!==6||components.some(c=>c.faces.length!==8))return false;
  for(const component of components){
    const points=[...new Map(component.faces.flatMap(f=>f.p).map(p=>[p.x+','+p.z,p])).values()].sort((a,c)=>a.x-c.x||a.z-c.z),cross=(a:THREE.Vector3,c:THREE.Vector3,d:THREE.Vector3)=>(c.x-a.x)*(d.z-a.z)-(c.z-a.z)*(d.x-a.x),lower:THREE.Vector3[]=[],upper:THREE.Vector3[]=[];
    for(const p of points){while(lower.length>1&&cross(lower.at(-2)!,lower.at(-1)!,p)<=0)lower.pop();lower.push(p);}for(const p of [...points].reverse()){while(upper.length>1&&cross(upper.at(-2)!,upper.at(-1)!,p)<=0)upper.pop();upper.push(p);}const hull=[...lower.slice(0,-1),...upper.slice(0,-1)],center=hull.reduce((p,q)=>p.add(new THREE.Vector2(q.x,q.z)),new THREE.Vector2()).multiplyScalar(1/hull.length);
    // Keep the original lower front/fascia first visible. The six source
    // roofs have distinct sloping profiles, so project each inset perimeter
    // point back onto its own roof rather than using one flat cap height.
    const inset=hull.map(p=>{const q=point(p.x,p.z);return q.add(center.clone().sub(q).normalize().multiplyScalar(6));}),roofAt=(p:THREE.Vector2)=>{const ray=new THREE.Ray(new THREE.Vector3(p.x,80,p.y),new THREE.Vector3(0,-1,0));let y=-Infinity;for(const face of component.faces){const hit=ray.intersectTriangle(...face.p as[THREE.Vector3,THREE.Vector3,THREE.Vector3],false,new THREE.Vector3());if(hit)y=Math.max(y,hit.y);}return y;};
    for(let edge=0;edge<inset.length;edge++){const a=inset[edge],c=inset[(edge+1)%inset.length];
      // The intact DS front includes sloping blue lower fascias. Only the
      // omitted north-facing edges need another wall; wrapping every edge
      // would place a vertical panel in front of that authored curved art.
      if(c.x<=a.x+1e-5)continue;
      for(let part=0;part<8;part++){const p=a.clone().lerp(c,part/8),q=a.clone().lerp(c,(part+1)/8),py=roofAt(p),qy=roofAt(q);if(!Number.isFinite(py)||!Number.isFinite(qy))return false;const nativeBottom=Math.min(...wall.p.map(p=>p.y)),nativeTop=Math.max(...wall.p.map(p=>p.y)),nativeZ0=Math.min(...wall.p.map(p=>p.z)),nativeZ1=Math.max(...wall.p.map(p=>p.z));b.face([new THREE.Vector3(p.x,2.6953125,p.y),new THREE.Vector3(q.x,2.6953125,q.y),new THREE.Vector3(q.x,qy+.01,q.y),new THREE.Vector3(p.x,py+.01,p.y)],wall,[new THREE.Vector3(136.453125,nativeBottom,nativeZ0),new THREE.Vector3(136.453125,nativeBottom,nativeZ1),new THREE.Vector3(136.453125,nativeTop,nativeZ1),new THREE.Vector3(136.453125,nativeTop,nativeZ0)]);}}
  }
  return true;
}
function centerStripReturns(b:Builder,faces:Face[]){
  // The co-located226 roof sits above179's white center strip. Its raised
  // glazing rim has no lower side returns, leaving two long assembly seams.
  // Match both measured edges instead of replacing either original surface.
  for(const sign of[-1,1]){
    const rear=new THREE.Vector3(sign*26.5078125,75.7578125,-46.765625),front=new THREE.Vector3(sign*26.0703125,75.7578125,52.765625),source=faces.find(face=>face.material.name==='poke_c_d1_lm1'&&face.p.some(p=>p.distanceToSquared(rear)<.001)&&face.p.some(p=>p.distanceToSquared(front)<.001));if(!source)return false;
    const upper=[new THREE.Vector3(sign*26.5078125,79.7578125,-45.9140625),new THREE.Vector3(sign*26.0703125,84.171875,0),new THREE.Vector3(sign*26.0703125,79.7578125,46.1015625)],lower=(z:number)=>rear.clone().lerp(front,(z-rear.z)/(front.z-rear.z));
    for(let i=1;i<upper.length;i++){const a=lower(upper[i-1].z),c=lower(upper[i].z);b.face([a,c,upper[i],upper[i-1]],source,[a,c,c,a]);}
    const a=lower(upper[0].z),c=lower(upper[2].z);b.face([rear,a,upper[0]],source,[rear,a,a]);b.face([c,front,upper[2]],source,[c,front,c]);
  }
  return true;
}
function dome(b:Builder,f:Face[]){
  const belt=f.find(face=>face.material.name==='huj'&&face.p.some(p=>near(p.x,100)&&near(p.z,0))&&near(Math.min(...face.p.map(p=>p.y)),32.6953125)&&near(Math.max(...face.p.map(p=>p.y)),54.28125));
  if(!belt||!f.some(face=>face.material.name==='gh'&&face.p.some(p=>near(p.y,65.1953125))))return false;
  // This is the native lower roof rim, not a model bounding cylinder: the
  // rear central rib rises by two units, and the front has extra entry nodes.
  // Continue that measured polygon down to the arena's actual foundation.
  const rim=[
    [100,0,54.28125],[96.59375,-25.8828125,54.28125],[86.6015625,-50,54.28125],[70.7109375,-70.7109375,54.28125],[50,-86.6015625,54.28125],[26.0703125,-96.890625,54.28125],[0,-98.5,56.28125],
    [-26.0703125,-96.890625,54.28125],[-50,-86.6015625,54.28125],[-70.7109375,-70.7109375,54.28125],[-86.6015625,-50,54.28125],[-96.59375,-25.8828125,54.28125],[-100,0,54.28125],
    [-96.59375,25.8828125,54.28125],[-86.6015625,50,54.28125],[-70.7109375,70.7109375,54.28125],[-50,86.6015625,54.28125],[-25.9765625,96.5546875,54.28125],[-11.7734375,98.4375,54.28125],[0,100,54.28125],
    [11.7734375,98.4375,54.28125],[25.9765625,96.5546875,54.28125],[50,86.6015625,54.28125],[70.7109375,70.7109375,54.28125],[86.6015625,50,54.28125],[96.59375,25.8828125,54.28125],[100,0,54.28125]
  ];
  const sourceA=new THREE.Vector3(96.59375,32.6953125,25.8828125),sourceC=new THREE.Vector3(100,32.6953125,0),sourceTop=54.28125;
  for(let i=0;i<rim.length-1;i++){
    const a=rim[i],c=rim[i+1],front=a[1]>85&&c[1]>85;
    // Keep the source entrance reveal and original double doors untouched.
    // The two side segments are split at the measured jamb x=28.1968.
    const splits=[0,1];if(front)for(const x of[-28.1953125,28.1953125]){const t=(x-a[0])/(c[0]-a[0]);if(t>0&&t<1)splits.push(t);}splits.sort((a,c)=>a-c);
    for(let j=0;j<splits.length-1;j++){
      const ta=splits[j],tc=splits[j+1],p=new THREE.Vector3(a[0],a[2],a[1]).lerp(new THREE.Vector3(c[0],c[2],c[1]),ta),q=new THREE.Vector3(a[0],a[2],a[1]).lerp(new THREE.Vector3(c[0],c[2],c[1]),tc),opening=front&&Math.abs((p.x+q.x)/2)<28.1954;
      // The lower source front drum is slightly inside its roof rim. Recess
      // our foundation behind it, preserving the real jamb X coordinates.
      // The upper edge remains on the authored curved roof boundary.
      const lower=opening?32.6953125:2.6953125,foundation=(v:THREE.Vector3)=>new THREE.Vector3(near(Math.abs(v.x),28.1953125)?v.x:v.x*.9998,lower,v.z*(v.z>0?.965:.9998));
      const points=[foundation(p),foundation(q),q,p];
      const s0=sourceA.clone(),s1=sourceC.clone(),s2=s1.clone().setY(sourceTop),s3=s0.clone().setY(sourceTop);b.face(points,belt,[s0,s1,s2,s3]);
    }
  }
  // The rear central roof rib is four units lower than the neighboring blue
  // roof. Its two long step walls and tiny outer joins were omitted in the
  // source; preserve both roof surfaces and continue their actual edge art.
  for(const sign of[-1,1]){
    const lowOuter=new THREE.Vector3(sign*26.0703125,61.1953125,-84.53125),lowInner=new THREE.Vector3(sign*26.5078125,75.7578125,-46.765625),highOuter=lowOuter.clone().setY(65.1953125),highInner=new THREE.Vector3(sign*26.5078125,79.7578125,-45.9140625),lowBottom=new THREE.Vector3(sign*25.8828125,54.28125,-96.59375),highBottom=new THREE.Vector3(sign*26.0703125,54.28125,-96.890625);
    const side=f.find(face=>face.material.name==='huj'&&face.p.some(p=>p.distanceToSquared(lowOuter)<.001)&&face.p.some(p=>p.distanceToSquared(lowInner)<.001)),outer=f.find(face=>face.material.name==='huj'&&face.p.some(p=>p.distanceToSquared(lowOuter)<.001)&&face.p.some(p=>p.distanceToSquared(lowBottom)<.001));if(!side||!outer)return false;
    b.face([lowOuter,lowInner,highInner,highOuter],side,[lowOuter,lowInner,lowInner,lowOuter]);b.face([lowBottom,lowOuter,highOuter,highBottom],outer,[lowBottom,lowOuter,lowOuter,lowBottom]);
  }
  // Exact diagonal rays can slip through independently authored blue roof
  // triangles at a shared radial edge, including Three's mesh-local caster.
  // These quarter-unit overlaps sit inside the existing roof; they neither
  // replace its curved panels nor change the visible native first surface.
  const edges=new Map<string,{a:THREE.Vector3;c:THREE.Vector3;face:Face;count:number}>(),key=(p:THREE.Vector3)=>p.toArray().map(v=>v.toFixed(3)).join(',');
  for(const face of f.filter(face=>face.material.name==='gh'))for(let i=0;i<3;i++){const a=face.p[i],c=face.p[(i+1)%3],id=[key(a),key(c)].sort().join('|'),previous=edges.get(id);if(previous)previous.count++;else edges.set(id,{a,c,face,count:1});}
  for(const{a,c,face,count}of edges.values()){if(count<2)continue;const normal=face.p[1].clone().sub(face.p[0]).cross(face.p[2].clone().sub(face.p[0])).normalize();if(normal.y<0)normal.negate();const across=normal.clone().cross(c.clone().sub(a).normalize()).multiplyScalar(.125),samples=[a.clone().sub(across),c.clone().sub(across),c.clone().add(across),a.clone().add(across)],points=samples.map(p=>p.clone().addScaledVector(normal,-.08));b.face(points,face,samples);}
  return true;
}
function light(root:THREE.Object3D,faces:Face[]):PokeathlonBuildingShell|null{
  const beam=faces.filter(f=>f.material.name==='_lm2');if(beam.length!==2||!beam.every(f=>f.material.transparent))return null;
  const bounds=new THREE.Box3().setFromPoints(beam.flatMap(f=>f.p));if(!near(bounds.min.y,29.8046875)||!near(bounds.max.y,79.640625))return null;
  const inverse=root.matrixWorld.clone().invert();root.traverse(o=>{if(!(o instanceof THREE.Mesh)||!generated.has(o.name))return;const material=Array.isArray(o.material)?o.material[0]:o.material;
    if(o.name==='3d-rear-facade'&&material.name==='_lm2'){o.visible=false;return;}
    if(o.name!=='3d-solid-backing')return;const p=o.geometry.getAttribute('position'),localBounds=new THREE.Box3();for(let i=0;i<p.count;i++)localBounds.expandByPoint(o.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(o.matrixWorld).applyMatrix4(inverse));
    if(near(localBounds.min.x,bounds.min.x)&&near(localBounds.max.x,bounds.max.x)&&near(localBounds.min.y,bounds.min.y)&&near(localBounds.max.y,bounds.max.y))o.visible=false;
  });return root.userData.pokeathlonBuildingShell={family:'field-light',triangles:0,passages:0} as PokeathlonBuildingShell;
}

/** Apply only to a placed native Pokeathlon clone, after closeBuildingBack.
 * 179 and 226 are co-located source assembly members: 179 owns the six blue
 * apron pods and their individual inset backs; 226 owns the arena/curved
 * roof and the new lower drum.
 * Generated buffers/materials use the pokeathlon-building- disposal prefix;
 * source geometry, materials, skeletons and texture maps remain shared. */
export function closePokeathlonBuildingShell(root:THREE.Object3D,asset:string,_doors:BuildingEntrance[]=[]):PokeathlonBuildingShell|null{
  const match=asset.match(/(?:^|\/)1-(\d+)-\d+\.glb$/),model=Number(match?.[1]);if(!match||!POKEATHLON_BUILDING_MODELS.has(model))return null;
  const previous=root.userData.pokeathlonBuildingShell as PokeathlonBuildingShell|undefined;if(previous)return previous;
  const faces=sourceFaces(root),builder=new Builder();
  if(model===182)return light(root,faces);
  if(model===179){if(!podShells(builder,faces)||!centerStripReturns(builder,faces))return null;return builder.finish(root,'dome-apron',1);}
  if(!(model===181?gate(builder,faces):dome(builder,faces)))return null;return builder.finish(root,model===181?'three-way-gate':'dome-arena',model===181?3:1);
}
