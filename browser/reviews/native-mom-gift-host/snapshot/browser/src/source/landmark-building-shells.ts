import * as THREE from 'three';
import type {BuildingEntrance} from './render-repair.ts';

type Face={points:THREE.Vector3[];uv:THREE.Vector2[];colors:THREE.Color[];normal:THREE.Vector3;area:number;material:THREE.MeshBasicMaterial};
type Sample={uv:THREE.Vector2;color:THREE.Color};
export type LandmarkBuildingShell={family:'bellchime-hall'|'pokemon-league'|'alph-stone-shrine';triangles:number};
/** Exact native BUILD_MODEL_EN_SEKIB and BUILD_MODEL_PKE_LEAGUE IDs.
 * Bell Tower, the lighthouse and stations already have different, intentional
 * profiles. The nine Alph stone shrine variants have their own measured rear
 * profile below. Gates and ships must never inherit either envelope. */
export const LANDMARK_BUILDING_MODELS=new Set([6,7,146,155,156,157,158,159,160,161,162,163]);
/** This is a source-authored ruin, not an accidental missing rear cap. The
 * native EN_YAKE model has charred exposed beams and a missing upper roof;
 * files/msgdata/msg/msg_0415.gmm:45 explicitly describes the tower's large
 * burned hole. Preserve that opening rather than rebuilding an intact tower. */
export const LANDMARK_OPEN_ROOF_EXCEPTIONS={8:{sourceName:'BUILD_MODEL_EN_YAKE',asset:'props/1-8-5.glb',evidence:'files/msgdata/msg/msg_0415.gmm:45'}} as const;
const generated=new Set(['3d-rear-facade','3d-solid-backing','entrance-rear-wall']);
const near=(a:number,b:number)=>Math.abs(a-b)<.04;
function sourceFaces(root:THREE.Object3D){
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),result:Face[]=[];
 root.traverse(object=>{
  if(!(object instanceof THREE.Mesh)||object instanceof THREE.InstancedMesh||generated.has(object.name)||object.name.startsWith('landmark-building-'))return;
  const geometry=object.geometry,position=geometry.getAttribute('position'),uv=geometry.getAttribute('uv'),color=geometry.getAttribute('color'),index=geometry.index,materials=Array.isArray(object.material)?object.material:[object.material];
  for(const group of geometry.groups.length?geometry.groups:[{start:0,count:index?.count??position.count,materialIndex:0}]){
   const material=materials[group.materialIndex??0] as THREE.MeshBasicMaterial;if(!material.visible||material.opacity<.5||/kage|shadow|hikari/i.test(material.name))continue;
   for(let offset=group.start;offset<group.start+group.count;offset+=3){const ids=[0,1,2].map(i=>index?index.getX(offset+i):offset+i),points=ids.map(i=>object.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(object.matrixWorld).applyMatrix4(inverse)),normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])),area=normal.length()/2;if(area<1e-6)continue;
    result.push({points,uv:ids.map(i=>uv?new THREE.Vector2(uv.getX(i),uv.getY(i)):new THREE.Vector2()),colors:ids.map(i=>color?new THREE.Color(color.getX(i),color.getY(i),color.getZ(i)):new THREE.Color(1,1,1)),normal:normal.normalize(),area,material});
   }
  }
 });return result;
}
function plane(faces:Face[],name:string,axis:'x'|'z',at:number,bottom:number,top:number){return faces.find(face=>face.material.name===name&&face.points.every(p=>near(p[axis],at))&&near(Math.min(...face.points.map(p=>p.y)),bottom)&&near(Math.max(...face.points.map(p=>p.y)),top));}
function sourceSample(face:Face,point:THREE.Vector3):Sample{
 const bary=THREE.Triangle.getBarycoord(point,...face.points as [THREE.Vector3,THREE.Vector3,THREE.Vector3],new THREE.Vector3())!;
 return{uv:face.uv[0].clone().multiplyScalar(bary.x).addScaledVector(face.uv[1],bary.y).addScaledVector(face.uv[2],bary.z),color:face.colors[0].clone().multiplyScalar(bary.x).add(face.colors[1].clone().multiplyScalar(bary.y)).add(face.colors[2].clone().multiplyScalar(bary.z))};
}
class ShellBuilder{
 private batches=new Map<THREE.MeshBasicMaterial,{positions:number[];uvs:number[];colors:number[]}>();
 face(points:THREE.Vector3[],source:Face,samples:THREE.Vector3[]){
  let batch=this.batches.get(source.material);if(!batch){batch={positions:[],uvs:[],colors:[]};this.batches.set(source.material,batch);}
  const indices=points.length===3?[0,1,2]:[0,1,2,0,2,3];for(let start=0;start<indices.length;start+=3){const triangle=indices.slice(start,start+3);if(new THREE.Triangle(...triangle.map(i=>points[i]) as [THREE.Vector3,THREE.Vector3,THREE.Vector3]).getArea()<1e-6)continue;for(const i of triangle){const sample=sourceSample(source,samples[i]);batch.positions.push(...points[i].toArray());batch.uvs.push(...sample.uv.toArray());batch.colors.push(...sample.color.toArray());}}
 }
 /** Repeat an actual native wall band at its source horizontal scale. This is
  * a rear wall, never a reflected entrance facade or a bounding-box slab. */
 rear(left:number,right:number,z:number,bottom:number,top:number,source:Face,sourceAxis:'x'|'z',sourceAt:number,sourceLeft:number,sourceRight:number){
  const count=Math.max(1,Math.ceil((right-left)/Math.abs(sourceRight-sourceLeft)));
  for(let i=0;i<count;i++){const x0=THREE.MathUtils.lerp(left,right,i/count),x1=THREE.MathUtils.lerp(left,right,(i+1)/count),sourceBottom=Math.min(...source.points.map(p=>p.y)),sourceTop=Math.max(...source.points.map(p=>p.y)),points=[new THREE.Vector3(x0,bottom,z),new THREE.Vector3(x1,bottom,z),new THREE.Vector3(x1,top,z),new THREE.Vector3(x0,top,z)],samples=points.map((_,j)=>{const p=new THREE.Vector3();p[sourceAxis]=sourceAt;p[sourceAxis==='x'?'z':'x']=j===0||j===3?sourceLeft:sourceRight;p.y=j<2?sourceBottom:sourceTop;return p;});this.face(points,source,samples);}
 }
 finish(root:THREE.Object3D,family:LandmarkBuildingShell['family']){
  const group=new THREE.Group();group.name='landmark-building-shell';let triangles=0;
  for(const [source,batch]of this.batches){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(batch.positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(batch.uvs,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(batch.colors,3));geometry.computeVertexNormals();const material=source.clone();material.side=THREE.DoubleSide;material.transparent=false;material.opacity=1;material.alphaTest=0;material.depthWrite=true;material.vertexColors=true;const mesh=new THREE.Mesh(geometry,material);mesh.name='landmark-building-'+family+'-cladding';group.add(mesh);triangles+=batch.positions.length/9;}
  if(!triangles)return null;
  root.traverse(object=>{if(generated.has(object.name))object.visible=false;});root.add(group);const summary={family,triangles};root.userData.landmarkBuildingShell=summary;return summary;
 }
}
function bellchime(builder:ShellBuilder,faces:Face[],model:number){
 const entranceHall=model===6,front=entranceHall?24:32,frontRidge=entranceHall?0:4,backRidge=frontRidge-8,frontEave=front+6;
 const wall=plane(faces,'en_seki1','x',-52,2,35.8671875),beam=plane(faces,'en_seki1','x',-52,35.8671875,42),fascia=plane(faces,'en_seki1','z',frontEave,38,46),ridge=plane(faces,'en_seki1','z',frontRidge,72.625,78);if(!wall||!beam||!fascia||!ridge)return false;
 // The original hall ends at z=-32, x=±52. Its broad timber rear was omitted
 // entirely for the DS camera. Its native hipped roof remains untouched.
 builder.rear(-52,52,-32,1.96875,35.8671875,wall,'x',-52,Math.min(...wall.points.map(p=>p.z)),Math.max(...wall.points.map(p=>p.z)));
 builder.rear(-52,52,-32,35.8671875,42,beam,'x',-52,Math.min(...beam.points.map(p=>p.z)),Math.max(...beam.points.map(p=>p.z)));
 builder.rear(-56,56,-38,38,46,fascia,'z',frontEave,Math.min(...fascia.points.map(p=>p.x)),Math.max(...fascia.points.map(p=>p.x)));
 // Join the actual inset timber wall to the projecting roof fascia. Without
 // this sloping soffit, an orbit below the eaves still sees daylight inside.
 const p=[new THREE.Vector3(-52,42,-32),new THREE.Vector3(52,42,-32),new THREE.Vector3(56,38,-38),new THREE.Vector3(-56,38,-38)];builder.face(p,beam,p.map(()=>new THREE.Vector3(-52,40,-16)));
 builder.rear(-56,56,backRidge,72.625,78,ridge,'z',frontRidge,Math.min(...ridge.points.map(p=>p.x)),Math.max(...ridge.points.map(p=>p.x)));
 for(const sign of [-1,1]){
  const gable=faces.find(f=>f.material.name==='en_seki1'&&f.normal.x*sign>.999&&f.points.every(p=>near(p.x,sign*52))&&near(Math.min(...f.points.map(p=>p.y)),42)&&near(Math.max(...f.points.map(p=>p.y)),64)&&near(Math.min(...f.points.map(p=>p.z)),-32));if(!gable)return false;
  const side=sign*51.99,eave=46+(72.625-46)*6/(frontEave-frontRidge),peak=entranceHall?gable.points.find(p=>near(p.y,64))!.z:0;
  for(const [z0,z1,y0,y1]of [[-32,backRidge,eave,72.625],[frontRidge,front,72.625,eave]]){
   const points=[new THREE.Vector3(side,42,z0),new THREE.Vector3(side,42,z1),new THREE.Vector3(side,y1,z1),new THREE.Vector3(side,y0,z0)],samples=z0<backRidge?[new THREE.Vector3(sign*52,42,-32),new THREE.Vector3(sign*52,42,peak),new THREE.Vector3(sign*52,64,peak),new THREE.Vector3(sign*52,42,-32)]:[new THREE.Vector3(sign*52,42,peak),new THREE.Vector3(sign*52,42,-32),new THREE.Vector3(sign*52,42,-32),new THREE.Vector3(sign*52,64,peak)];builder.face(points,gable,samples);
  }
  const points=[new THREE.Vector3(side,42,backRidge),new THREE.Vector3(side,42,frontRidge),new THREE.Vector3(side,78,frontRidge),new THREE.Vector3(side,78,backRidge)];builder.face(points,beam,points.map(()=>new THREE.Vector3(-52,40,-16)));
 }
 if(entranceHall){
  const frontGable=plane(faces,'en_seki1','z',24,42,63);if(!frontGable)return false;
  // EN_SEKIA has its own shallower footprint and raised entry portico. Its
  // original triangular facade stops below that portico's true roof section.
  // Fill only above42, inset behind the authored facade and south doorway.
  const profile=[[-18,48.5],[-4,66],[4,66],[18,48.5]];
  for(let i=0;i<profile.length-1;i++){const[x0,y0]=profile[i],[x1,y1]=profile[i+1],points=[new THREE.Vector3(x0,42,23.99),new THREE.Vector3(x1,42,23.99),new THREE.Vector3(x1,y1,23.99),new THREE.Vector3(x0,y0,23.99)];builder.face(points,frontGable,points.map(p=>new THREE.Vector3(p.x,42+(p.y-42)*21/24,24)));}
 }
 return true;
}
function league(builder:ShellBuilder,faces:Face[]){
 const name='pke_league_lm1',base=plane(faces,name,'x',80.68359375,4,18.00390625),lower=plane(faces,name,'x',80.68359375,18.00390625,50.83203125),upper=plane(faces,name,'x',80.68359375,50.83203125,74.2421875),roofWall=plane(faces,name,'x',80.68359375,74.2421875,90),trim=plane(faces,name,'x',92,59.2421875,75),gables=faces.filter(f=>f.material.name===name&&f.normal.z>.999&&f.points.every(p=>p.z>51.9&&p.z<52.1)&&near(Math.min(...f.points.map(p=>p.y)),74.2421875)&&Math.max(...f.points.map(p=>p.y))>=88);
 if(!base||!lower||!upper||!roofWall||!trim||gables.length<8)return false;
 const frontBand=(left:number,right:number,z:number,bottom:number,top:number)=>faces.find(f=>f.material.name===name&&f.normal.z>.999&&f.points.every(p=>near(p.z,z))&&near(Math.min(...f.points.map(p=>p.x)),left)&&near(Math.max(...f.points.map(p=>p.x)),right)&&near(Math.min(...f.points.map(p=>p.y)),bottom)&&near(Math.max(...f.points.map(p=>p.y)),top));
 const stone=frontBand(17.5234375,53.19140625,52,18.00390625,50.83203125),stoneUpper=frontBand(17.5234375,53.19140625,52,50.83203125,74.2421875),brick=frontBand(53.328125,80.68359375,60,21.765625,50.83203125),brickUpper=frontBand(53.328125,80.68359375,60,50.83203125,74.2421875),plinth=frontBand(53.328125,80.68359375,60,4,18.00390625);
 if(!stone||!stoneUpper||!brick||!brickUpper||!plinth)return false;
 // Retain the League's own red brick wings and pale stone central ward on the
 // rear. Copying the source side's one-color UV swatches would seal geometry
 // but leave a featureless brown slab across this large elevation.
 builder.rear(-80.68359375,80.68359375,-63.98,4,18.00390625,plinth,'z',60,53.328125,80.68359375);
 for(const [left,right]of [[-80.68359375,-53.328125],[53.328125,80.68359375]]){
  builder.rear(left,right,-63.98,18.00390625,50.83203125,brick,'z',60,53.328125,80.68359375);
  builder.rear(left,right,-63.98,50.83203125,74.2421875,brickUpper,'z',60,53.328125,80.68359375);
 }
 builder.rear(-53.328125,53.328125,-63.98,18.00390625,50.83203125,stone,'z',52,17.5234375,53.19140625);
 builder.rear(-53.328125,53.328125,-63.98,50.83203125,74.2421875,stoneUpper,'z',52,17.5234375,53.19140625);
 builder.rear(-80.68359375,80.68359375,-63.98,74.2421875,90,roofWall,'x',80.68359375,-64,15.875);
 builder.rear(-92,92,-64,59.2421875,75,trim,'x',92,-64,60);
 for(const face of faces.filter(f=>f.material.name==='h_mado_lm1'&&f.points.every(p=>near(p.z,53.5))))builder.face(face.points.map(p=>new THREE.Vector3(p.x,p.y,-64)),face,face.points);
 const flatRoof=faces.find(f=>f.material.name===name&&f.normal.y>.999&&f.points.every(p=>near(p.y,90))&&f.area>1000);if(!flatRoof)return false;
 for(const sign of [-1,1]){
  // The roof behind each forward tower was not connected to that tower's
  // raised rear end. Close only the native triangular roof wedge and the
  // measured end wall; keep the open parapet above its existing114-unit floor.
  const inner=sign*53.328125,outer=sign*80.68359375,roof=[new THREE.Vector3(inner,90,13.875),new THREE.Vector3(outer,90,-64),new THREE.Vector3(outer,90,15.875)];builder.face(roof,flatRoof,roof.map(()=>flatRoof.points[0]));
  const points=[new THREE.Vector3(inner,90,13.875),new THREE.Vector3(outer,90,15.875),new THREE.Vector3(outer,114,sign<0?11.875:15.875),new THREE.Vector3(inner,114,15.875)],samples=[new THREE.Vector3(53.328125,50.83203125,60),new THREE.Vector3(80.68359375,50.83203125,60),new THREE.Vector3(80.68359375,74.2421875,60),new THREE.Vector3(53.328125,74.2421875,60)];builder.face(points,brickUpper,samples);
 }
 // The forward central gable rises above the large flat rear roof. Its rear
 // vertical end is missing natively: seal that measured polygon at z=13.875,
 // not a 123-unit tall box around the decorative corner towers.
 const profile=[[-53.328125,90],[-17.5234375,100.7421875],[0,106],[17.5234375,100.7421875],[53.328125,90]],bottom=90;
 for(let i=0;i<profile.length-1;i++){const [x0,y0]=profile[i],[x1,y1]=profile[i+1],middle=(x0+x1)/2,gable=gables.filter(f=>Math.min(...f.points.map(p=>p.x))<middle&&Math.max(...f.points.map(p=>p.x))>middle).sort((a,b)=>b.area-a.area)[0];if(!gable)return false;const points=[new THREE.Vector3(x0,bottom,13.875),new THREE.Vector3(x1,bottom,13.875),new THREE.Vector3(x1,y1,13.875),new THREE.Vector3(x0,y0,13.875)];builder.face(points,gable,points.map(p=>new THREE.Vector3(THREE.MathUtils.clamp(p.x,-53.26171875,53.26171875),Math.max(bottom,p.y-2.0078125),52)));}
 return true;
}
function shrine(builder:ShellBuilder,faces:Face[],model:number){
 const bodyTop=model===157?45.9375:49.9375,fasciaTop=bodyTop+8.0625,roofTop=fasciaTop+4;
 const wall=faces.find(f=>f.normal.x>.999&&f.points.every(p=>near(p.x,40))&&near(Math.min(...f.points.map(p=>p.y)),5.6953125)&&near(Math.max(...f.points.map(p=>p.y)),34.01171875));if(!wall)return false;
 const name=wall.material.name,base=plane(faces,name,'x',40,2,5.6953125),upper=plane(faces,name,'x',40,34.01171875,bodyTop),fascia=plane(faces,name,'x',46,bodyTop,fasciaTop),bevel=faces.find(f=>f.material.name===name&&f.normal.x>.5&&f.normal.y>.5&&f.points.every(p=>p.x>=39.9&&p.x<=46.1)&&near(Math.min(...f.points.map(p=>p.y)),fasciaTop)&&near(Math.max(...f.points.map(p=>p.y)),roofTop));if(!base||!upper||!fascia||!bevel)return false;
 const wallFront=Math.max(...wall.points.map(p=>p.z)),fasciaFront=Math.max(...fascia.points.map(p=>p.z));
 // These are enclosed puzzle chambers, including their damaged/mossy art
 // variants. Their front door recess is intentional; a second door-size gap
 // in the opposite elevation is not. Preserve all native rubble and moss.
 // A hundredth of one native unit overlaps each side at its shared corner.
 // Exact diagonal rays otherwise disappear between two zero-width edge hits.
 for(const [bottom,top,source]of [[2,5.6953125,base],[5.6953125,34.01171875,wall],[34.01171875,bodyTop,upper]]as const)builder.rear(-40.01,40.01,-40,bottom,top,source,'x',40,-40,wallFront);
 builder.rear(-46,46,-40,bodyTop,fasciaTop,fascia,'x',46,-40,fasciaFront);
 const bevelRear=Math.min(...bevel.points.map(p=>p.z)),bevelFront=Math.max(...bevel.points.map(p=>p.z)),points=[new THREE.Vector3(-46,fasciaTop,-40),new THREE.Vector3(46,fasciaTop,-40),new THREE.Vector3(40,roofTop,-40),new THREE.Vector3(-40,roofTop,-40)],samples=[new THREE.Vector3(46,fasciaTop,bevelRear),new THREE.Vector3(46,fasciaTop,bevelFront),new THREE.Vector3(40,roofTop,bevelFront),new THREE.Vector3(40,roofTop,bevelRear)];builder.face(points,bevel,samples);
 if(model===157){
  // AR_SHRINE3 has a shallow pitched roof, unlike the eight flat stone roofs.
  // Its body is four units lower but its center ridge rises to66: copying the
  // flat shrine cap would leave an eight-unit open triangle under that ridge.
  const profile=[[-40,58],[-20,64],[0,66],[20,64],[40,58]];
  for(let i=0;i<profile.length-1;i++){const [x0,y0]=profile[i],[x1,y1]=profile[i+1],p=[new THREE.Vector3(x0,58,-40),new THREE.Vector3(x1,58,-40),new THREE.Vector3(x1,y1,-40),new THREE.Vector3(x0,y0,-40)];builder.face(p,upper,p.map(q=>new THREE.Vector3(40,THREE.MathUtils.lerp(34.01171875,bodyTop,(q.y-58)/8),THREE.MathUtils.lerp(-40,wallFront,(q.x+40)/80))));}
 }else{
  // Native flat roofs were split exactly on x=0. An exact upward runtime ray
  // can miss both edges while the rays immediately either side hit. Give the
  // actual roof a continuous underside, a hundredth of a native unit below
  // its stone surface; the original moss, bevel and top artwork stay visible.
  const roof=faces.find(f=>f.material.name===name&&f.normal.y>.999&&f.points.every(p=>near(p.y,roofTop))&&f.area>200);if(!roof)return false;
  const y=roofTop-.01,points=[new THREE.Vector3(-40.01,y,-40.01),new THREE.Vector3(40.01,y,-40.01),new THREE.Vector3(40.01,y,32.01),new THREE.Vector3(-40.01,y,32.01)];builder.face(points,roof,points.map(()=>roof.points[0]));
 }
 return true;
}
/** Called once per placed clone after the gate-aware source entrance repair.
 * All measurements are in the native model's coordinates; placement rotation,
 * world offsets and nonuniform scale therefore cannot displace these walls.
 * Cached source geometry, texture objects and material state remain unchanged. */
export function closeLandmarkBuildingShell(root:THREE.Object3D,asset:string,doors:BuildingEntrance[]=[]):LandmarkBuildingShell|null{
 const match=asset.match(/(?:^|\/)1-(\d+)-\d+\.glb$/),model=Number(match?.[1]);if(!match||!LANDMARK_BUILDING_MODELS.has(model))return null;
 const previous=root.userData.landmarkBuildingShell as LandmarkBuildingShell|undefined;if(previous)return previous;
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),hall=model===6||model===7,rear=hall?-32:model===146?-64:-40,width=hall?52:model===146?80.68359375:40;
 // A real warp through this elevation always wins over a visual enclosure.
 // The hall's entrance is east; League and shrine entrances face south. No
 // source north entrance or through-gate may be closed by these profiles.
 if(doors.some(d=>{const p=new THREE.Vector3(d.x,root.getWorldPosition(new THREE.Vector3()).y,d.z).applyMatrix4(inverse),direction=d.axis===undefined?null:new THREE.Vector3(d.axis===0?d.sign??1:0,0,d.axis===2?d.sign??1:0).transformDirection(inverse);return p.z>=rear-16&&p.z<=rear+8&&Math.abs(p.x)<width+8&&(!direction||direction.z<-.6);} ))return null;
 const faces=sourceFaces(root),builder=new ShellBuilder();if(!(hall?bellchime(builder,faces,model):model===146?league(builder,faces):shrine(builder,faces,model)))return null;return builder.finish(root,hall?'bellchime-hall':model===146?'pokemon-league':'alph-stone-shrine');
}
