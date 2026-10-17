import * as THREE from 'three';
import type {BuildingEntrance} from './render-repair.ts';

export const GATE_BUILDING_MODELS=new Set([35,36,246,247]);
export type GateBuildingShell={family:'north-south-gate'|'east-west-gate';triangles:number;passages:number};
type Face={p:THREE.Vector3[];uv:THREE.Vector2[];color:THREE.Color[];material:THREE.MeshBasicMaterial};
const generated=new Set(['3d-rear-facade','3d-solid-backing','entrance-rear-wall']);
const near=(a:number,b:number)=>Math.abs(a-b)<.035;
function sourceFaces(root:THREE.Object3D){
  // updateWorldMatrix alone does not refresh a SkinnedMesh bind inverse.
  root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),faces:Face[]=[];
  root.traverse(o=>{if(!(o instanceof THREE.Mesh)||generated.has(o.name)||o.name.startsWith('gate-building-'))return;
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
  band(a:THREE.Vector2,c:THREE.Vector2,bottom:number,top:number,source:Face,axis:'x'|'z',sourceY?:[number,number]){
    const along=axis==='x'?'z':'x',at=source.p[0][axis],lo=Math.min(...source.p.map(p=>p[along])),hi=Math.max(...source.p.map(p=>p[along])),y0=sourceY?.[0]??Math.min(...source.p.map(p=>p.y)),y1=sourceY?.[1]??Math.max(...source.p.map(p=>p.y)),length=a.distanceTo(c),width=hi-lo;
    for(let start=0;start<length-1e-6;start+=width){const end=Math.min(length,start+width),left=a.clone().lerp(c,start/length),right=a.clone().lerp(c,end/length),points=[new THREE.Vector3(left.x,bottom,left.y),new THREE.Vector3(right.x,bottom,right.y),new THREE.Vector3(right.x,top,right.y),new THREE.Vector3(left.x,top,left.y)],samples=[[lo,y0],[lo+end-start,y0],[lo+end-start,y1],[lo,y1]].map(([u,y])=>{const p=new THREE.Vector3();p[axis]=at;p[along]=u;p.y=y;return p;});this.face(points,source,samples);}
  }
  finish(root:THREE.Object3D,family:GateBuildingShell['family'],passages:number){const group=new THREE.Group();group.name='gate-building-shell';let triangles=0;
    for(const[source,b]of this.batches){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(b.color,3));geometry.computeVertexNormals();const material=source.clone();material.side=THREE.DoubleSide;material.transparent=false;material.opacity=1;material.alphaTest=0;material.depthWrite=true;material.vertexColors=true;const mesh=new THREE.Mesh(geometry,material);mesh.name='gate-building-'+family+'-cladding';group.add(mesh);triangles+=b.p.length/9;}
    // Per-clone visibility only. Never dispose/edit a cached template buffer,
    // source material, map or skeleton while replacing its generic closure.
    root.traverse(o=>{if(generated.has(o.name))o.visible=false;});root.add(group);return root.userData.gateBuildingShell={family,triangles,passages} as GateBuildingShell;
  }
}
const point=(x:number,z:number)=>new THREE.Vector2(x,z);
function project(face:Face,axis:'x'|'z',along:number,y:number){const normal=face.p[1].clone().sub(face.p[0]).cross(face.p[2].clone().sub(face.p[0])),other=axis==='x'?'z':'x',p=face.p[0].clone();p[other]=along;p.y=y;p[axis]=face.p[0][axis]-(normal.y*(y-face.p[0].y)+normal[other]*(along-face.p[0][other]))/normal[axis];return p;}
function northSouth(builder:Builder,faces:Face[],northEntrance:boolean){
  const brick=plane(faces,'gate_lm1','z',-42.07421875,1.96875,20),wall=faces.find(f=>f.material.name==='gate_p2_lm1'&&f.p.every(p=>near(p.x,-33.14453125))&&near(Math.min(...f.p.map(p=>p.y)),20)&&near(Math.max(...f.p.map(p=>p.y)),44)&&near(Math.min(...f.p.map(p=>p.z)),-30.28515625)&&near(Math.max(...f.p.map(p=>p.z)),-4)),glass=faces.filter(f=>f.material.name==='gate_3_lm1'&&f.p.every(p=>near(p.z,33))),lintel=plane(faces,'gate_lm1','z',36,60,64),ceiling=faces.find(f=>f.material.name==='gate_p2_lm1'&&f.p.every(p=>near(p.y,64))&&f.p.some(p=>near(p.z,-34.07421875))),ledge=faces.find(f=>f.material.name==='gate_lm1'&&f.p.every(p=>near(p.y,20)&&p.z<-30)&&new THREE.Triangle(...f.p as[THREE.Vector3,THREE.Vector3,THREE.Vector3]).getArea()>50);
  const jambs=[-1,1].map(sign=>faces.find(f=>f.material.name==='gate_lm1'&&f.p.every(p=>p.x*sign>=27.8&&p.x*sign<=28.2&&p.z>=32.99&&p.z<=36.01)&&near(Math.min(...f.p.map(p=>p.y)),44)&&near(Math.max(...f.p.map(p=>p.y)),60)&&Math.max(...f.p.map(p=>p.z))-Math.min(...f.p.map(p=>p.z))>2.9)),sills=faces.filter(f=>f.material.name==='gate_lm1'&&f.p.every(p=>near(p.y,44)&&p.z>=32.99&&p.z<=36.01));
  if(!brick||!wall||!lintel||!ceiling||!ledge||glass.length!==2||jambs.some(j=>!j)||sills.length!==2||!faces.some(f=>f.material.name==='gate_2_lm1'&&f.p.every(p=>near(p.z,17.29296875))))return false;
  const rear=-34.07421875,outer=rear+.02,window=rear+3,base=-42.07421875+.02;
  // Complete the native protruding brick foundation between its intact
  // corner feet, then join its real eight-unit ledge to the upper wall.
  if(northEntrance){
    // Several actual maps put their north warp beyond the canopy's bounds
    // (Z-80/-88/-96/-104). Their native export omits that lower elevation entirely.
    // Reuse the exact south doorway, jambs and sloped approach, rather than
    // leaving the whole back hollow or placing a wall across an active gate.
    const entry=faces.filter(f=>f.material.name==='gate_2_lm1'),jambs=faces.filter(f=>f.material.name==='gate_lm1'&&f.p.every(p=>p.z>=35.99&&p.y<=40.01&&Math.abs(p.x)<=28.2));
    if(entry.length!==9||jambs.length!==18)return false;
    for(const face of [...entry,...jambs])builder.face(face.p.map(p=>new THREE.Vector3(p.x<-27.8?-28.05:p.x>27.8?28.05:p.x,p.y,1.92578125-p.z)),face,face.p);
    builder.band(point(-28.05,outer),point(28.05,outer),40,44,wall,'x',[40,44]);
  }else{
    builder.band(point(-28.05,base),point(28.05,base),1.96875,20,brick,'z');const nativeLedge=ledge.p[0].clone().add(ledge.p[1]).add(ledge.p[2]).multiplyScalar(1/3);builder.face([new THREE.Vector3(-28.05,20,base),new THREE.Vector3(28.05,20,base),new THREE.Vector3(28.05,20,outer),new THREE.Vector3(-28.05,20,outer)],ledge,Array.from({length:4},()=>nativeLedge));
    builder.band(point(-28.05,outer),point(28.05,outer),20,44,wall,'x');
  }
  // The rear frame tapers from +/-36 at20 to +/-28 at40. Fill behind those
  // authored corner pieces as well, rather than leaving triangular leaks.
  for(const sign of[-1,1]){const p=[new THREE.Vector3(sign*28,20,outer),new THREE.Vector3(sign*36,20,outer),new THREE.Vector3(sign*28,40,outer)],samples=[new THREE.Vector3(-33.14453125,20,-30.28515625),new THREE.Vector3(-33.14453125,20,-22.28515625),new THREE.Vector3(-33.14453125,40,-30.28515625)];builder.face(p,wall,samples);}
  // A real source window, recessed by the same three units as the front.
  // Its .125-unit native offset is centered inside the measured rear frame.
  for(const face of glass)builder.face(face.p.map(p=>new THREE.Vector3((p.x+.125)*28.05/28,p.y,window)),face,face.p);
  for(let i=0;i<2;i++){const x=i?28:-28,source=jambs[i]!;builder.face([new THREE.Vector3(x,44,rear),new THREE.Vector3(x,44,window),new THREE.Vector3(x,60,window),new THREE.Vector3(x,60,rear)],source,[project(source,'x',36,44),project(source,'x',33,44),project(source,'x',33,60),project(source,'x',36,60)]);}
  for(const face of sills)builder.face(face.p.map(p=>new THREE.Vector3((p.x+.125)*28.05/28,p.y,1.92578125-p.z)),face,face.p);
  builder.face([new THREE.Vector3(-28.05,60,rear),new THREE.Vector3(28.05,60,rear),new THREE.Vector3(28.05,60,window),new THREE.Vector3(-28.05,60,window)],lintel,[new THREE.Vector3(-28,60.01,36),new THREE.Vector3(28,60.01,36),new THREE.Vector3(28,60.01,36),new THREE.Vector3(-28,60.01,36)]);
  // Both source canopies are already horizontal. Keeping them avoids the
  // legacy mirrored, tilted roof card that looked like a collapsed awning.
  return true;
}
function eastWestIsComplete(faces:Face[]){
  return[-1,1].every(sign=>faces.some(f=>f.material.name==='gate_2_lm1'&&f.p.every(p=>near(p.x,sign*21.29296875))&&near(Math.min(...f.p.map(p=>p.y)),8)&&near(Math.max(...f.p.map(p=>p.y)),40))&&!!plane(faces,'gate_p2_lm1','z',sign*33.14453125,20,44)&&!!plane(faces,'gate_3_lm1','z',sign*33.14453125,44,60))&&faces.some(f=>f.material.name==='gate_p2_lm1'&&f.p.every(p=>near(p.y,64))&&f.p.some(p=>near(Math.abs(p.x),40)));
}
function closeUpperFrameSeams(builder:Builder,faces:Face[]){
  // Original header triangles meet along exact diagonal edges. A native
  // mesh-local ray from(-18,62,-18) towards225 degrees misses both sides of
  // one36corner despite a mathematically closed frame. Small overlaps inside
  // those existing headers close that precision seam, entirely above entries.
  const edges=new Map<string,{a:THREE.Vector3;c:THREE.Vector3;face:Face;count:number}>(),key=(p:THREE.Vector3)=>p.toArray().map(v=>v.toFixed(3)).join(',');
  for(const face of faces.filter(f=>f.material.name==='gate_lm1')){const n=face.p[1].clone().sub(face.p[0]).cross(face.p[2].clone().sub(face.p[0])).normalize();if(Math.abs(n.y)>.1)continue;for(let i=0;i<3;i++){const a=face.p[i],c=face.p[(i+1)%3];if(a.y<59.99||c.y<59.99||a.y>64.01||c.y>64.01)continue;const id=[key(a),key(c)].sort().join('|'),previous=edges.get(id);if(previous)previous.count++;else edges.set(id,{a,c,face,count:1});}}
  for(const{a,c,face,count}of edges.values()){if(count<2)continue;const n=face.p[1].clone().sub(face.p[0]).cross(face.p[2].clone().sub(face.p[0])).normalize(),center=face.p[0].clone().add(face.p[1]).add(face.p[2]);if(n.x*center.x+n.z*center.z<0)n.negate();const across=n.clone().cross(c.clone().sub(a).normalize()).multiplyScalar(.125),samples=[a.clone().sub(across),c.clone().sub(across),c.clone().add(across),a.clone().add(across)].map(p=>p.setY(Math.min(63.99,p.y))),points=samples.map(p=>p.clone().addScaledVector(n,-.04));builder.face(points,face,samples);}
}

/** Source-specific Johto/Kanto gate repairs on a placed clone. Native35/246
 * export only a south recess; actual northern warp approaches receive the
 * same native entry module while other rear elevations stay closed.36/247
 * already contain both east/west recesses and complete walls: suppress their
 * erroneous caps and overlap only tiny upper-frame seams above both entries.
 * Buffers/material clones use gate-building- ownership; native geometry,
 * skeletons and all source texture maps remain unchanged/shared. */
export function closeGateBuildingShell(root:THREE.Object3D,asset:string,doors:BuildingEntrance[]=[]):GateBuildingShell|null{
  const match=asset.match(/(?:^|\/)1-(\d+)-\d+\.glb$/),model=Number(match?.[1]);if(!match||!GATE_BUILDING_MODELS.has(model))return null;const previous=root.userData.gateBuildingShell as GateBuildingShell|undefined;if(previous)return previous;
  const faces=sourceFaces(root),builder=new Builder();
  if([36,247].includes(model)){if(!eastWestIsComplete(faces))return null;closeUpperFrameSeams(builder,faces);return builder.finish(root,'east-west-gate',2);}
  // Full-matrix metadata includes real opposite approaches beyond this
  // source canopy, missed by a model-BBox-only entrance query. Require a
  // nearby, aligned, explicitly north-facing event; distant doors do not
  // influence the building and no front door is duplicated speculatively.
  // Route29 and Mahogany's literal north warp pairs sit at local Z-104,
  // the longest measured approaches in the complete native gate inventory.
  const inverse=root.matrixWorld.clone().invert(),worldY=root.getWorldPosition(new THREE.Vector3()).y,northEntrance=doors.some(door=>{if(door.axis===undefined||door.sign===undefined)return false;const p=new THREE.Vector3(door.x,worldY,door.z).applyMatrix4(inverse);return Math.abs(p.x)<=20&&p.z<=-22&&p.z>=-104&&new THREE.Vector3().setComponent(door.axis,door.sign).transformDirection(inverse).z<-.5;});
  if(!northSouth(builder,faces,northEntrance))return null;closeUpperFrameSeams(builder,faces);return builder.finish(root,'north-south-gate',northEntrance?2:1);
}
