import * as THREE from 'three';
import type {BuildingEntrance} from './render-repair.ts';

/** Native Power Plant and Battle Frontier Tower: close the actual rear wall
 * and roof footprint, independently of pipes, trusses and projecting fins. */
export const INDUSTRIAL_BUILDING_MODELS=new Set([262,283]);
export type IndustrialBuildingShell={family:string;triangles:number};
type Face={p:THREE.Vector3[];uv:THREE.Vector2[];color:THREE.Color[];normal:THREE.Vector3;area:number;material:THREE.MeshBasicMaterial};
const generated=new Set(['3d-rear-facade','3d-solid-backing','entrance-rear-wall']);
const near=(a:number,b:number)=>Math.abs(a-b)<.045;
function sourceFaces(root:THREE.Object3D){
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),faces:Face[]=[];
 root.traverse(o=>{if(!(o instanceof THREE.Mesh)||o instanceof THREE.InstancedMesh||generated.has(o.name)||o.name.startsWith('industrial-building-'))return;
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
 finish(root:THREE.Object3D,family:string){const group=new THREE.Group();group.name='industrial-building-shell';let triangles=0;for(const[source,b]of this.batches){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(b.color,3));geometry.computeVertexNormals();const material=source.clone();material.side=THREE.DoubleSide;material.transparent=false;material.opacity=1;material.alphaTest=0;material.depthWrite=true;material.vertexColors=true;const mesh=new THREE.Mesh(geometry,material);mesh.name='industrial-building-'+family+'-cladding';group.add(mesh);triangles+=b.p.length/9;}if(!triangles)return null;root.traverse(o=>{if(generated.has(o.name))o.visible=false;});root.add(group);return root.userData.industrialBuildingShell={family,triangles}as IndustrialBuildingShell;}
}

function tower(b:Builder,f:Face[]){
 const bands:[number,number][]=[[-122,-38],[-38,2],[2,48],[48,208]],walls=bands.map(([lo,hi])=>plane(f,'b_tower3_lm5','x',95,lo,hi)),glass=plane(f,'a','z',81,48,208),copper=plane(f,'b_tower3_lm5','x',109,-122,-38),outerGlass=f.find(face=>face.material.name==='a'&&face.p.every(p=>p.x>=97.99&&p.z>=76.99&&p.z<=89.01)&&near(Math.min(...face.p.map(p=>p.y)),48)&&near(Math.max(...face.p.map(p=>p.y)),208)),landing=f.find(face=>face.material.name==='b_tower3_lm5'&&face.p.every(p=>near(p.y,-113))&&face.p.some(p=>near(p.z,170))&&face.p.some(p=>near(p.z,138)));
 if(walls.some(face=>!face)||!glass||!copper||!outerGlass||!landing)return false;
 // The two outer fins extend to Z -97, but the structural rear wall ends
 // at Z -79. Using the fin extremity as an entire wall creates a billboard.
 for(let i=0;i<bands.length;i++){const[lo,hi]=bands[i],wall=walls[i]!;
  for(const[x0,x1]of[[-95,0],[0,95]])b.quad([[x0,lo,-79],[x1,lo,-79],[x1,hi,-79],[x0,hi,-79]],wall,[[95,lo,-79],[95,lo,22.0703125],[95,hi,22.0703125],[95,hi,-79]]);
  // Native cream side walls and the copper front piers stop at different
  // points. Join their actual shoulder edges at every authored floor band.
  for(const sign of[-1,1])b.quad([[sign*95,lo,22.0703125],[sign*109,lo,33],[sign*109,hi,33],[sign*95,hi,22.0703125]],wall,[[95,lo,4.3046875],[95,lo,22.0703125],[95,hi,22.0703125],[95,hi,4.3046875]]);
 }
 // Ordinary blue upper-floor glazing continues round the back. The native
 // door/lobby and transparent magenta frame atlas are deliberately excluded.
 for(let y=-110;y<195;y+=16)for(const x of[-60,-20,20,60])b.quad([[x-15,y,-79.125],[x+15,y,-79.125],[x+15,y+12,-79.125],[x-15,y+12,-79.125]],glass,[[-30,48,81],[0,48,81],[0,64,81],[-30,64,81]]);
 const footprint:number[][]=[[-95,-79],[-95,22.0703125],[-109,33],[-109,77],[-98,93],[-82,93],[-58,69],[-44,69],[-30,85],[30,85],[44,69],[58,69],[82,93],[98,93],[109,77],[109,33],[95,22.0703125],[95,-79]],contour=footprint.map(([x,z])=>new THREE.Vector2(x,z)),native=landing.p[0].clone().add(landing.p[1]).add(landing.p[2]).multiplyScalar(1/3);
 // The native building has a concave front. Triangulate that exact outline;
 // a rectangle or triangle fan bridges the entrance recess and side bays.
 for(const triangle of THREE.ShapeUtils.triangulateShape(contour,[]))b.face(triangle.map(i=>new THREE.Vector3(footprint[i][0],207.5,footprint[i][1])),landing,[native,native,native]);
 // The lower facade fans forward by72 units. Its two outer glass facets
 // and the side walls beneath that fan were omitted for the DS camera.
 // Complete those measured edges, keeping the native sloped middle bays,
 // front door, stairs and original transparent frame cards untouched.
 for(const sign of[-1,1]){
  b.quad([[sign*108,-96,151],[sign*98,-96,163],[sign*98,-38,89],[sign*108,-38,77]],outerGlass,[[108,48,77],[98,48,89],[98,112,89],[108,112,77]]);
  // The glazing is one unit behind the pier, and its lower edge is two
  // units below the frame. Give those inset edges their native copper return.
  b.join([[sign*108,-38,77],[sign*108,-96,151]],[[sign*109,-38,77],[sign*109,-94,149]],copper);
  b.join([[sign*108,-96,151],[sign*98,-96,163]],[[sign*109,-94,149],[sign*98,-94,165]],copper);
  for(const[a,c]of[[77,113],[113,149]]){const top=(z:number)=>-38-(z-77)*56/72;b.quad([[sign*109,-122,a],[sign*109,-122,c],[sign*109,top(c),c],[sign*109,top(a),a]],copper,[[109,-122,33],[109,-122,77],[109,top(c),77],[109,top(a),33]]);}
  b.quad([[sign*109,-122,149],[sign*98,-122,165],[sign*98,-94,165],[sign*109,-94,149]],copper,[[109,-122,33],[109,-122,77],[109,-94,77],[109,-94,33]]);
 }
 const podium=[[-98,165],[-82,165],[-70,153],[-58,141],[-44,141],[-30,157],[30,157],[44,141],[58,141],[70,153],[82,165],[98,165]];
 for(let i=0;i<podium.length-1;i++){const[a,c]=[podium[i],podium[i+1]];b.face([new THREE.Vector3(a[0],-122,a[1]),new THREE.Vector3(c[0],-122,c[1]),new THREE.Vector3(c[0],-111,c[1]),new THREE.Vector3(a[0],-111,a[1])],landing,[native,native,native,native]);}
 // Give the existing rear fins a thin return inside their authored extent.
 // Their diagonal native front faces remain intact, with matching wall UVs.
 for(const sign of[-1,1]){const section=[[sign*95,-79],[sign*109,-97],[sign*109,-95],[sign*95,-77]];
  for(let i=0;i<bands.length;i++){const[lo,hi]=bands[i],fin=f.find(face=>face.material.name==='b_tower3_lm5'&&face.p.every(p=>p.x*sign>=94.99&&p.z<=-78.99)&&near(Math.min(...face.p.map(p=>p.y)),lo)&&near(Math.max(...face.p.map(p=>p.y)),hi));if(!fin)return false;
   for(const edge of[1,2]){const a=section[edge],c=section[(edge+1)%4],samplePoint=(p:number[],y:number)=>new THREE.Vector3(p[0],y,-79-(Math.abs(p[0])-95)*18/14);b.face([new THREE.Vector3(a[0],lo,a[1]),new THREE.Vector3(c[0],lo,c[1]),new THREE.Vector3(c[0],hi,c[1]),new THREE.Vector3(a[0],hi,a[1])],fin,[samplePoint(a,lo),samplePoint(c,lo),samplePoint(c,hi),samplePoint(a,hi)]);}
  }
  b.face(section.map(([x,z])=>new THREE.Vector3(x,208,z)),landing,[native,native,native,native]);
  b.face(section.map(([x,z])=>new THREE.Vector3(x,-122,z)),landing,[native,native,native,native]);
 }
 return true;
}
function powerPlant(b:Builder,f:Face[]){
 const bands:[number,number][]=[[2,8],[8,31.67578125],[31.67578125,37.67578125],[37.67578125,63.35546875]],walls=bands.map(([lo,hi])=>plane(f,'knp_p02','x',72,lo,hi)),fascia=plane(f,'knp_p02','x',75,55.35546875,65.35546875),glass=f.filter(face=>face.material.name==='knp_p01'&&face.p.every(p=>near(p.z,41)&&p.y>=37.67));
 if(walls.some(face=>!face)||!fascia||glass.length!==6)return false;
 // The roof supplies the measured chamfer: the body sits three native units
 // inside its outer parapet, just as it does along the intact side walls.
 const rear=[[-72,-48],[-56,-60],[56,-60],[72,-48]],rim=[[-75,-51],[-59,-63],[59,-63],[75,-51]];
 for(let i=0;i<bands.length;i++){const[lo,hi]=bands[i],source=walls[i]!;for(let j=0;j<rear.length-1;j++){const[a,c]=[rear[j],rear[j+1]];b.quad([[a[0],lo,a[1]],[c[0],lo,c[1]],[c[0],hi,c[1]],[a[0],hi,a[1]]],source,[[72,lo,-48],[72,lo,16],[72,hi,16],[72,hi,-48]]);}}
 for(let i=0;i<rim.length-1;i++){const[a,c]=[rim[i],rim[i+1]];b.quad([[a[0],55.35546875,a[1]],[c[0],55.35546875,c[1]],[c[0],65.35546875,c[1]],[a[0],65.35546875,a[1]]],fascia,[[75,55.35546875,-51],[75,55.35546875,19],[75,65.35546875,19],[75,65.35546875,-51]]);}
 b.join(rear.map(([x,z])=>[x,55.35546875,z]),rim.map(([x,z])=>[x,55.35546875,z]),fascia);
 // Copy only the three uninterrupted upper glazing modules onto both rear
 // floors. Neither the lower front's door gap nor its white doorframe is art
 // for a rear wall. The native chimney, deck and support trusses stay intact.
 for(const[lo,hi]of[[8,31.67578125],[37.67578125,63.35546875]])for(const face of glass)b.face(face.p.map(p=>new THREE.Vector3(p.x,lo+(p.y-37.67578125)/(63.35546875-37.67578125)*(hi-lo),-60.125)),face,face.p);
 // Continue the two side window panels around the real diagonal corners.
 // A flat pane extended past X +/-56 would float away from the chamfer.
 for(const sign of[-1,1])for(const[lo,hi]of[[8,31.67578125],[37.67578125,63.35546875]]){const window=f.find(face=>face.material.name==='knp_p02'&&face.p.every(p=>near(p.z,28)&&p.x*sign>=47.99&&p.x*sign<=64.01)&&near(Math.min(...face.p.map(p=>p.y)),lo)&&near(Math.max(...face.p.map(p=>p.y)),hi));if(!window)return false;
  b.quad([[sign*71.9,lo,-48.15],[sign*56.1,lo,-60.15],[sign*56.1,hi,-60.15],[sign*71.9,hi,-48.15]],window,[[sign*64,lo,28],[sign*48,lo,28],[sign*48,hi,28],[sign*64,hi,28]]);
 }
 return true;
}
/** Exact native variants, applied to a placed clone after original repairs.
 * Materials and buffers are clone-owned; native source maps are only shared. */
export function closeIndustrialBuildingShell(root:THREE.Object3D,asset:string,doors:BuildingEntrance[]=[]):IndustrialBuildingShell|null{
 const match=asset.match(/(?:^|\/)1-(\d+)-\d+\.glb$/),model=Number(match?.[1]);if(!match||!INDUSTRIAL_BUILDING_MODELS.has(model))return null;const previous=root.userData.industrialBuildingShell as IndustrialBuildingShell|undefined;if(previous)return previous;
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),rear=model===262?-79:-60,width=model===262?95:72;
 if(doors.some(door=>{const local=new THREE.Vector3(door.x,root.getWorldPosition(new THREE.Vector3()).y,door.z).applyMatrix4(inverse);if(Math.abs(local.z-rear)>12||Math.abs(local.x)>width+4)return false;if(door.axis===undefined||door.sign===undefined)return true;return new THREE.Vector3().setComponent(door.axis,door.sign).transformDirection(inverse).z<-.5;}))return null;
 const builder=new Builder(),faces=sourceFaces(root);if(!(model===262?tower(builder,faces):powerPlant(builder,faces)))return null;return builder.finish(root,model===262?'battle-frontier-tower':'power-plant');
}
