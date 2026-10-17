import * as THREE from 'three';
import type {BuildingEntrance} from './render-repair.ts';

type Face={points:THREE.Vector3[];uv:THREE.Vector2[];colors:THREE.Color[];material:THREE.MeshBasicMaterial};
type Sample={uv:THREE.Vector2;color:THREE.Color};
const generated=new Set(['3d-rear-facade','3d-solid-backing','entrance-rear-wall']);

function originalFaces(root:THREE.Object3D){
  root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),result:Face[]=[];
  root.traverse(object=>{
    if(!(object instanceof THREE.Mesh)||generated.has(object.name)||object.name.startsWith('special-building-'))return;
    const geometry=object.geometry,position=geometry.getAttribute('position'),uv=geometry.getAttribute('uv'),colors=geometry.getAttribute('color'),index=geometry.index,materials=Array.isArray(object.material)?object.material:[object.material];
    for(const group of geometry.groups.length?geometry.groups:[{start:0,count:index?.count??position.count,materialIndex:0}]){
      const material=materials[group.materialIndex??0] as THREE.MeshBasicMaterial;if(/kage|shadow/i.test(material.name)||material.opacity<.5)continue;
      for(let i=group.start;i<group.start+group.count;i+=3){const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j);result.push({points:ids.map(id=>object.getVertexPosition(id,new THREE.Vector3()).applyMatrix4(object.matrixWorld).applyMatrix4(inverse)),uv:ids.map(id=>uv?new THREE.Vector2(uv.getX(id),uv.getY(id)):new THREE.Vector2()),colors:ids.map(id=>colors?new THREE.Color(colors.getX(id),colors.getY(id),colors.getZ(id)):new THREE.Color(1,1,1)),material});}
    }
  });return result;
}
const near=(a:number,b:number)=>Math.abs(a-b)<.035;
function planeFace(faces:Face[],name:string,axis:'x'|'z',at:number,low:number,high:number,span?:[number,number]){
  const along=axis==='x'?'z':'x';return faces.find(face=>face.material.name===name&&face.points.every(p=>near(p[axis],at))&&near(Math.min(...face.points.map(p=>p.y)),low)&&near(Math.max(...face.points.map(p=>p.y)),high)&&(!span||(near(Math.min(...face.points.map(p=>p[along])),span[0])&&near(Math.max(...face.points.map(p=>p[along])),span[1]))));
}
function sample(face:Face,point:THREE.Vector3):Sample{
  const weights=THREE.Triangle.getBarycoord(point,...face.points as [THREE.Vector3,THREE.Vector3,THREE.Vector3],new THREE.Vector3())!;
  return {uv:face.uv[0].clone().multiplyScalar(weights.x).addScaledVector(face.uv[1],weights.y).addScaledVector(face.uv[2],weights.z),color:face.colors[0].clone().multiplyScalar(weights.x).add(face.colors[1].clone().multiplyScalar(weights.y)).add(face.colors[2].clone().multiplyScalar(weights.z))};
}

/** All added meshes/materials belong to this placed clone. Original geometry,
 * textures, skeletons and cached template materials are never changed. */
class ShellBuilder{
  private batches=new Map<THREE.MeshBasicMaterial,{positions:number[];uvs:number[];colors:number[]}>();
  constructor(readonly root:THREE.Object3D){}
  face(points:THREE.Vector3[],source:Face,samples:THREE.Vector3[]){
    let batch=this.batches.get(source.material);if(!batch){batch={positions:[],uvs:[],colors:[]};this.batches.set(source.material,batch);}
    for(const ids of [[0,1,2],[0,2,3]]){
      if(points[ids[1]].clone().sub(points[ids[0]]).cross(points[ids[2]].clone().sub(points[ids[0]])).lengthSq()<1e-10)continue;
      for(const i of ids){const s=sample(source,samples[i]);batch.positions.push(...points[i].toArray());batch.uvs.push(...s.uv.toArray());batch.colors.push(...s.color.toArray());}
    }
  }
  /** A closed thin wall panel. The source side-band atlas is repeated at its
   * authored scale, rather than stretching a complete facade over a rear hull. */
  band(left:number,right:number,rear:number,bottom:number,top:number,source:Face,sourceAxis:'x'|'z',sourceAt:number,sourceLeft:number,sourceRight:number,depth=.45){
    const width=right-left,repeat=Math.max(1,Math.ceil(width/Math.abs(sourceRight-sourceLeft)));
    for(let part=0;part<repeat;part++){
      const x0=left+width*part/repeat,x1=left+width*(part+1)/repeat;
      const p=[new THREE.Vector3(x0,bottom,rear),new THREE.Vector3(x1,bottom,rear),new THREE.Vector3(x1,top,rear),new THREE.Vector3(x0,top,rear)];
      const sourceBottom=Math.min(...source.points.map(q=>q.y)),sourceTop=Math.max(...source.points.map(q=>q.y));
      const samples=p.map((q,i)=>{const s=q.clone();s.y=THREE.MathUtils.clamp(s.y,sourceBottom,sourceTop);s[sourceAxis]=sourceAt;s[sourceAxis==='x'?'z':'x']=i===0||i===3?sourceLeft:sourceRight;return s;});
      this.face(p,source,samples);const back=p.map(q=>q.clone().add(new THREE.Vector3(0,0,depth)));this.face(back,source,samples);
      for(let edge=0;edge<4;edge++){const next=(edge+1)%4;this.face([p[edge],back[edge],back[next],p[next]],source,[samples[edge],samples[edge],samples[next],samples[next]]);}
    }
  }
  soffit(inner:THREE.Vector3[],outer:THREE.Vector3[],source:Face,sourcePoint:THREE.Vector3){
    for(let i=0;i<inner.length-1;i++)this.face([inner[i],inner[i+1],outer[i+1],outer[i]],source,Array.from({length:4},()=>sourcePoint));
  }
  window(left:number,right:number,rear:number,bottom:number,top:number,source:Face,sourceLeft:number,sourceRight:number,sourceBottom:number,sourceTop:number){
    // Windows are shallow solid inset-looking boxes over an unbroken wall.
    // The front and frame pixels come from an actual source window panel.
    const p=[new THREE.Vector3(left,bottom,rear),new THREE.Vector3(right,bottom,rear),new THREE.Vector3(right,top,rear),new THREE.Vector3(left,top,rear)],nativeZ=source.points[0].z;
    const samples=[new THREE.Vector3(sourceLeft,sourceBottom,nativeZ),new THREE.Vector3(sourceRight,sourceBottom,nativeZ),new THREE.Vector3(sourceRight,sourceTop,nativeZ),new THREE.Vector3(sourceLeft,sourceTop,nativeZ)];this.face(p,source,samples);
    const back=p.map(q=>q.clone().add(new THREE.Vector3(0,0,.75)));this.face(back,source,samples);
    for(let edge=0;edge<4;edge++){const next=(edge+1)%4;this.face([p[edge],back[edge],back[next],p[next]],source,[samples[edge],samples[edge],samples[next],samples[next]]);}
  }
  finish(family:string){
    let triangles=0;const group=new THREE.Group();group.name='special-building-shell';group.userData.family=family;
    for(const [source,batch]of this.batches){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(batch.positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(batch.uvs,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(batch.colors,3));geometry.computeVertexNormals();const material=source.clone();material.transparent=false;material.opacity=1;material.alphaTest=0;material.depthWrite=true;material.side=THREE.DoubleSide;material.vertexColors=true;const mesh=new THREE.Mesh(geometry,material);mesh.name='special-building-'+family+'-cladding';group.add(mesh);triangles+=batch.positions.length/9;}
    this.root.add(group);return triangles;
  }
}

function centerShell(builder:ShellBuilder,faces:Face[]){
  const wall=planeFace(faces,'gs_pc_a','x',40,2,32,[-24,4]),upper=planeFace(faces,'gs_pc_a','x',40,32,46,[-24,4]),tower=planeFace(faces,'gs_pc_a','x',18,32,46,[-30,26]),window=planeFace(faces,'gs_pc_a','z',22,2,32,[18,36]),glass=planeFace(faces,'gs_pc_b','z',20,32,42.41796875,[18,32]);
  const roofSeam=faces.find(face=>face.material.name==='gs_pc_a'&&face.points.some(p=>near(p.x,0)&&near(p.y,60)&&p.z<-20)&&face.points.some(p=>near(p.x,0)&&near(p.y,52)&&p.z<-20)&&face.points.some(p=>p.x<-1));
  if(!wall||!upper||!tower||!window||!glass||!roofSeam)return false;
  // Native wall vertices define this stepped rear, not the roof/shadow BBox:
  // the central ward projects two units behind the two chamfered side wings.
  for(const [left,right,rear]of [[-36,-18,-28],[-18,18,-30],[18,36,-28]]){
    builder.band(left,right,rear,2,32,wall,'x',40,-24,4);
    builder.band(left,right,rear,32,46,rear===-30?tower:upper,'x',rear===-30?18:40,rear===-30?-30:-24,rear===-30?26:4);
    const middle=(left+right)/2,width=rear===-30?20:14;builder.window(middle-width/2,middle+width/2,rear-.6,12,26,window,20,34,8,30);
    // Reuse the Center's actual blue-glass texture inside its native grey
    // surround. White source cladding must not read as a blank rear window.
    const glassWidth=width-3,glassHeight=glassWidth*(42.41796875-32)/14;
    builder.window(middle-glassWidth/2,middle+glassWidth/2,rear-.72,19-glassHeight/2,19+glassHeight/2,glass,32,18,32,42.41796875);
  }
  const inner=[[-40,-24],[-36,-28],[-18,-28],[-18,-30],[18,-30],[18,-28],[36,-28],[40,-24]].map(([x,z])=>new THREE.Vector3(x,46,z));
  const outer=[[-42,-26],[-36,-32],[-18,-32],[-18,-32],[18,-32],[18,-32],[36,-32],[42,-26]].map(([x,z])=>new THREE.Vector3(x,46,z));
  builder.soffit(inner,outer,wall,new THREE.Vector3(40,31,-10));
  // The source rear hip is split exactly at x=0. A full-precision upward ray
  // can slip between those independently authored triangles, even in Three's
  // local-space ray caster. A one-unit overlap just inside the original roof
  // closes that seam without replacing, raising or z-fighting its visible art.
  const low=roofSeam.points.find(p=>near(p.x,0)&&near(p.y,52))!,high=roofSeam.points.find(p=>near(p.x,0)&&near(p.y,60))!;
  const normal=roofSeam.points[1].clone().sub(roofSeam.points[0]).cross(roofSeam.points[2].clone().sub(roofSeam.points[0])).normalize();if(normal.y<0)normal.negate();const inset=normal.multiplyScalar(-.04);
  const seamPoints=[new THREE.Vector3(-.5,low.y,low.z),new THREE.Vector3(.5,low.y,low.z),new THREE.Vector3(.5,high.y,high.z),new THREE.Vector3(-.5,high.y,high.z)].map(p=>p.add(inset));
  builder.face(seamPoints,roofSeam,[new THREE.Vector3(-.25,low.y,low.z),new THREE.Vector3(-.25,low.y,low.z),new THREE.Vector3(-.25,high.y,high.z),new THREE.Vector3(-.25,high.y,high.z)]);return true;
}

function martShell(builder:ShellBuilder,faces:Face[]){
  const wall=planeFace(faces,'fs_a','x',32,2,28),trim=planeFace(faces,'fs_a','x',32,28,32),upper=planeFace(faces,'fs_a','x',32,32,39),roof=planeFace(faces,'fs_a','x',34,39.84765625,51.55078125),window=planeFace(faces,'fs_ax','z',13,14,28);
  if(!wall||!trim||!upper||!roof||!window)return false;
  builder.band(-30,32,-21,2,28,wall,'x',32,-21,7);builder.band(-30,32,-21,28,32,trim,'x',32,-21,7);builder.band(-30,32,-21,32,39,upper,'x',32,-21,7);
  for(const middle of [-14,16])builder.window(middle-7,middle+7,-21.6,14,28,window,6,22,14,28);
  // Continue the actual octagonal blue roof fascia around the back, including
  // both diagonal corners and its underside; the animated street sign is not
  // part of either the wall footprint or its height.
  builder.band(-26,28,-29,39.84765625,51.55078125,roof,'x',34,-23,9);
  const y0=39.84765625,y1=51.55078125;
  for(const [a,b]of [[[-32,-23],[-26,-29]],[[28,-29],[34,-23]]]){const points=[new THREE.Vector3(a[0],y0,a[1]),new THREE.Vector3(b[0],y0,b[1]),new THREE.Vector3(b[0],y1,b[1]),new THREE.Vector3(a[0],y1,a[1])];builder.face(points,roof,[new THREE.Vector3(34,y0,-23),new THREE.Vector3(34,y0,9),new THREE.Vector3(34,y1,9),new THREE.Vector3(34,y1,-23)]);}
  // The source has a .847-unit wall/roof gap around its side and front eaves as
  // well. Close that shallow underside continuously, without covering any
  // existing facade art or projecting a wall up through the fascia.
  const inner=[[-30,-21],[-30,7],[-24,13],[26,13],[32,7],[32,-21],[28,-21],[-26,-21],[-30,-21]].map(([x,z])=>new THREE.Vector3(x,39,z));
  const outer=[[-32,-23],[-32,9],[-26,15],[28,15],[34,9],[34,-23],[28,-29],[-26,-29],[-32,-23]].map(([x,z])=>new THREE.Vector3(x,39.84765625,z));builder.soffit(inner,outer,upper,new THREE.Vector3(32,38,-10));return true;
}

/** Replace the incomplete DS rear of native Centers and Marts on a placed
 * clone. The original front facade/door, sides, roof and sign stay authored.
 * Asset IDs guard against applying these exact measured profiles to unrelated
 * meshes that happen to use similarly named atlas materials. */
export function closeSpecialBuildingShell(root:THREE.Object3D,asset:string,doors:BuildingEntrance[]=[]){
  if(root.getObjectByName('special-building-shell'))return 0;
  const model=asset.match(/(?:^|\/)1-(\d+)-\d+\.glb$/)?.[1],family=model&&[2,40,62].includes(Number(model))?'center':model&&[1,39,63].includes(Number(model))?'mart':null;
  if(!family)return 0;
  // These source models have one south door. A future placement with a real
  // north exit must keep that passage and fall back to the gate-aware repair.
  root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),rear=family==='center'?-30:-21;
  if(doors.some(door=>{
    const local=new THREE.Vector3(door.x,root.getWorldPosition(new THREE.Vector3()).y,door.z).applyMatrix4(inverse);
    if(Math.abs(local.z-rear)>10||Math.abs(local.x)>(family==='center'?40:32))return false;
    if(door.axis===undefined||door.sign===undefined)return true;
    const direction=new THREE.Vector3();direction.setComponent(door.axis,door.sign);return direction.transformDirection(inverse).z<-.6;
  }))return 0;
  const faces=originalFaces(root),builder=new ShellBuilder(root);if(!(family==='center'?centerShell(builder,faces):martShell(builder,faces)))return 0;
  // Visibility belongs to this clone; deleting or editing these geometries
  // would corrupt the cached repaired template shared by other placements.
  root.traverse(object=>{if(generated.has(object.name))object.visible=false;});return builder.finish(family);
}
