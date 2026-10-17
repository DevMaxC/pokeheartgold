import * as THREE from 'three';
import type {BuildingEntrance} from './render-repair.ts';

/** Measured source-specific rear profiles. Decorative towers and alpha light
 * cards must not define a whole building's backing silhouette. */
export const DECORATIVE_BUILDING_MODELS=new Set([78,86,104,110,113,118,173,175,176,234,243,249]);
export type DecorativeBuildingShell={family:string;triangles:number};
type Face={p:THREE.Vector3[];uv:THREE.Vector2[];color:THREE.Color[];normal:THREE.Vector3;area:number;material:THREE.MeshBasicMaterial};
const generated=new Set(['3d-rear-facade','3d-solid-backing','entrance-rear-wall']);
const near=(a:number,b:number)=>Math.abs(a-b)<.045;
function sourceFaces(root:THREE.Object3D){
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),faces:Face[]=[];
 root.traverse(o=>{if(!(o instanceof THREE.Mesh)||o instanceof THREE.InstancedMesh||generated.has(o.name)||o.name.startsWith('decorative-building-'))return;
  const g=o.geometry,p=g.getAttribute('position'),uv=g.getAttribute('uv'),colors=g.getAttribute('color'),idx=g.index,mats=Array.isArray(o.material)?o.material:[o.material];
  for(const group of g.groups.length?g.groups:[{start:0,count:idx?.count??p.count,materialIndex:0}]){const material=mats[group.materialIndex??0]as THREE.MeshBasicMaterial;if(!material.visible||material.opacity<.5||/kage|shadow|h_in/i.test(material.name))continue;
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
 finish(root:THREE.Object3D,family:string,allowEmpty=false){const group=new THREE.Group();group.name='decorative-building-shell';let triangles=0;for(const[source,b]of this.batches){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(b.color,3));geometry.computeVertexNormals();const material=source.clone();material.side=THREE.DoubleSide;material.transparent=false;material.opacity=1;material.alphaTest=0;material.depthWrite=true;material.vertexColors=true;if(source.name==='radio_a')material.alphaTest=source.alphaTest;if(source.name==='hikari'){material.transparent=source.transparent;material.opacity=source.opacity;material.alphaTest=source.alphaTest;material.depthWrite=source.depthWrite;}const mesh=new THREE.Mesh(geometry,material);mesh.name='decorative-building-'+family+'-cladding';group.add(mesh);triangles+=b.p.length/9;}if(!triangles&&!allowEmpty)return null;root.traverse(o=>{if(generated.has(o.name))o.visible=false;});root.add(group);return root.userData.decorativeBuildingShell={family,triangles}as DecorativeBuildingShell;}
}


function pharmacy(b:Builder,f:Face[]){
 const lower=f.find(face=>face.material.name==='tn_pharmacy_02'&&face.p.every(p=>near(p.x,30))&&near(Math.min(...face.p.map(p=>p.y)),2)&&near(Math.max(...face.p.map(p=>p.y)),15.97265625)&&near(Math.min(...face.p.map(p=>p.z)),-17)&&near(Math.max(...face.p.map(p=>p.z)),-.5)),upper=plane(f,'tn_pharmacy_02','x',30,15.97265625,34),trim=plane(f,'tn_pharmacy_02','x',30,34,38),post=plane(f,'tn_pharmacy_02','z',19,2,34),gable=f.filter(face=>face.material.name==='tn_pharmacy_02'&&face.p.every(p=>near(p.z,16)&&p.y>=37.99)),barge=f.filter(face=>face.material.name==='tn_pharmacy_02'&&face.p.every(p=>near(p.z,20)&&p.y>=36.99));
 if(!lower||!upper||!trim||!post||gable.length!==6||barge.length<4)return false;
 // Continue the gold timber wainscot and grey plaster from the true side
 // wall, behind the three-unit-deep rear corner posts. No front sign/door UVs.
 for(const[lo,hi,source]of[[2,15.97265625,lower],[15.97265625,34,upper]]as const)for(const[a,c]of[[-30,0],[0,30]])b.quad([[a,lo,-17],[c,lo,-17],[c,hi,-17],[a,hi,-17]],source,[[30,lo,-17],[30,lo,-.5],[30,hi,-.5],[30,hi,-17]]);
 for(const sign of[-1,1]){b.quad([[sign*24,2,-20],[sign*30,2,-20],[sign*30,34,-20],[sign*24,34,-20]],post,[[-30,2,19],[-24,2,19],[-24,34,19],[-30,34,19]]);const native=post.p[0].clone().add(post.p[1]).add(post.p[2]).multiplyScalar(1/3);b.face([new THREE.Vector3(sign*24,2,-20),new THREE.Vector3(sign*24,2,-17),new THREE.Vector3(sign*24,34,-17),new THREE.Vector3(sign*24,34,-20)],post,[native,native,native,native]);}
 b.quad([[-30,34,-20],[30,34,-20],[30,38,-20],[-30,38,-20]],trim,[[30,34,-20],[30,34,19],[30,38,19],[30,38,-20]]);
 for(const face of gable)b.face(face.p.map(p=>p.clone().setZ(-20)),face,face.p);
 for(const face of barge)b.face(face.p.map(p=>p.clone().setZ(-24)),face,face.p);
 b.join([[-30,38,-20],[30,38,-20]],[[-31,37,-24],[31,37,-24]],trim);return true;
}
function lighthouse(b:Builder,f:Face[]){
 const lower=plane(f,'toudai2','x',52,3,37.8046875),upper=plane(f,'toudai2','x',52,37.8046875,53.203125),cornice=plane(f,'toudai1','x',56.515625,50.328125,67.6875),shaft=f.filter(face=>face.material.name==='toudai2'&&face.normal.z>.75&&face.p.every(p=>p.z>0)&&[[62.84375,129.2421875],[129.2421875,141.1171875]].some(([lo,hi])=>near(Math.min(...face.p.map(p=>p.y)),lo)&&near(Math.max(...face.p.map(p=>p.y)),hi)));
 const glass=f.find(face=>face.material.name==='hikari'&&face.normal.z>.99&&face.p.every(p=>p.z>14&&p.y>=142.77&&p.y<=169.01)&&near(Math.min(...face.p.map(p=>p.y)),142.7734375)&&near(Math.max(...face.p.map(p=>p.y)),169.0078125)),roof=f.filter(face=>face.material.name==='toudai2'&&face.normal.z>.75&&face.p.every(p=>p.z>=-.01)&&[[170.8203125,178.703125],[178.703125,193],[193,197.8046875],[197.8046875,210.6875]].some(([lo,hi])=>near(Math.min(...face.p.map(p=>p.y)),lo)&&near(Math.max(...face.p.map(p=>p.y)),hi)));
 if(!lower||!upper||!cornice||!glass||shaft.length!==4||roof.length!==7)return false;
 for(const[lo,hi,source]of[[3,37.8046875,lower],[37.8046875,53.203125,upper]]as const)b.quad([[-52,lo,-56],[52,lo,-56],[52,hi,-56],[-52,hi,-56]],source,[[52,lo,-56],[52,lo,48],[52,hi,48],[52,hi,-56]]);
 // The blue deck edge follows the base building's cornice, never the211-unit
 // lantern finial. Its own side band contains no front entrance artwork.
 for(const[a,c]of[[-56.515625,0],[0,56.515625]])b.quad([[a,50.328125,-56],[c,50.328125,-56],[c,67.6875,-56],[a,67.6875,-56]],cornice,[[56.515625,50.328125,-.171875],[56.515625,50.328125,40.0859375],[56.515625,67.6875,40],[56.515625,67.6875,-.171875]]);
 // The taper and flared shoulder each have five authored hexagon sectors;
 // complete only their sixth, using uninterrupted native masonry triangles.
 for(const face of shaft)b.face(face.p.map(p=>p.clone().setZ(-p.z)),face,face.p);
 // Complete the sixth glazed lantern bay at its actual neighboring edges.
 // This is painted native luminous glass, retaining its BLEND material;
 // projected searchlight cards never become an opaque structural backing.
 b.quad([[-8.7890625,169.0078125,-15.21875],[8.7890625,169.0078125,-15.21875],[8.015625,142.7734375,-14.7734375],[-8.015625,142.7734375,-14.7734375]],glass,[[-8.7890625,169.0078125,15.21875],[8.7890625,169.0078125,15.21875],[8.40625,142.7734375,14.5546875],[-8.40625,142.7734375,14.5546875]]);
 for(const face of roof)b.face(face.p.map(p=>p.clone().setZ(-p.z)),face,face.p);
 return true;
}
function silo(b:Builder,f:Face[]){
 const lower=plane(f,'r39_naya_lm2','z',19.57421875,8.2265625,31.16015625),upper=plane(f,'r39_naya_lm2','z',19.57421875,34.4765625,81.0625),ring=plane(f,'r39_naya_lm2','z',21.64453125,32.22265625,34.40234375),base=f.find(face=>face.material.name==='r39_naya_lm2'&&face.p.every(p=>p.x>=15&&p.z<=.01)&&near(Math.min(...face.p.map(p=>p.y)),0)&&near(Math.max(...face.p.map(p=>p.y)),8.2265625)),roof=f.find(face=>face.material.name==='r39_naya_lm2'&&face.p.every(p=>p.z>=-.01)&&near(Math.min(...face.p.map(p=>p.y)),78.75)&&near(Math.max(...face.p.map(p=>p.y)),113.59765625)&&face.p.some(p=>near(p.x,-14.5))&&face.p.some(p=>near(p.x,14.5)));
 if(!lower||!upper||!ring||!base||!roof)return false;
 for(const[lo,hi,source]of[[8.2265625,31.16015625,lower],[34.4765625,81.0625,upper]]as const)b.quad([[-11.30078125,lo,-19.57421875],[11.30078125,lo,-19.57421875],[11.30078125,hi,-19.57421875],[-11.30078125,hi,-19.57421875]],source,[[-11.30078125,lo,19.57421875],[11.30078125,lo,19.57421875],[11.30078125,hi,19.57421875],[-11.30078125,hi,19.57421875]]);
 b.quad([[-14.16015625,32.22265625,-20.6328125],[14.16015625,32.22265625,-20.6328125],[14.16015625,34.40234375,-20.6328125],[-14.16015625,34.40234375,-20.6328125]],ring,[[-12.484375,32.22265625,21.64453125],[12.484375,32.22265625,21.64453125],[12.484375,34.40234375,21.64453125],[-12.484375,34.40234375,21.64453125]]);
 const native=base.p[0].clone().add(base.p[1]).add(base.p[2]).multiplyScalar(1/3);b.face([new THREE.Vector3(-15.4921875,0,-21.9921875),new THREE.Vector3(15.4921875,0,-21.9921875),new THREE.Vector3(15.4921875,8.2265625,-21.9921875),new THREE.Vector3(-15.4921875,8.2265625,-21.9921875)],base,[native,native,native,native]);
 b.join([[-15.4921875,8.2265625,-21.9921875],[15.4921875,8.2265625,-21.9921875]],[[-11.30078125,8.2265625,-19.57421875],[11.30078125,8.2265625,-19.57421875]],base);
 b.join([[-11.30078125,31.16015625,-19.57421875],[11.30078125,31.16015625,-19.57421875]],[[-14.16015625,32.22265625,-20.6328125],[14.16015625,32.22265625,-20.6328125]],ring);
 b.join([[-14.16015625,34.40234375,-20.6328125],[14.16015625,34.40234375,-20.6328125]],[[-11.30078125,34.4765625,-19.57421875],[11.30078125,34.4765625,-19.57421875]],ring);
 b.face(roof.p.map(p=>p.clone().setZ(-p.z)),roof,roof.p);
 const inner=[[22.6015625,0],[11.30078125,19.57421875],[-11.30078125,19.57421875],[-22.6015625,0],[-11.30078125,-19.57421875],[11.30078125,-19.57421875],[22.6015625,0]],outer=[[29,0],[14.5,25.1171875],[-14.5,25.1171875],[-29,0],[-14.5,-25.1171875],[14.5,-25.1171875],[29,0]];
 b.join(inner.map(([x,z])=>[x,81.0625,z]),outer.map(([x,z])=>[x,78.75,z]),upper);return true;
}

function restaurant(b:Builder,f:Face[]){
 const lower=f.find(face=>face.material.name==='t_lm1'&&face.normal.x>.99&&face.p.every(p=>p.x>31)&&near(Math.min(...face.p.map(p=>p.y)),2.625)&&near(Math.max(...face.p.map(p=>p.y)),20.65234375)),upper=f.find(face=>face.material.name==='t_lm1'&&face.normal.x>.99&&face.p.every(p=>p.x>31)&&near(Math.min(...face.p.map(p=>p.y)),20.640625)&&near(Math.max(...face.p.map(p=>p.y)),53.734375)),roof=f.filter(face=>face.material.name==='lambert7'&&face.normal.z>.8&&face.normal.y>.5&&face.p.every(p=>p.z>8&&p.y>=53.35&&p.y<=64.58)),chimney=plane(f,'t_lm1','x',21.36328125,54.67578125,66.55078125),cap=f.find(face=>face.material.name==='t_lm1'&&face.normal.x>.99&&near(Math.min(...face.p.map(p=>p.y)),66.1796875)&&near(Math.max(...face.p.map(p=>p.y)),72.91015625)&&face.p.every(p=>p.x>24));
 if(!lower||!upper||roof.length!==6||!chimney||!cap)return false;
 b.quad([[-32.1875,2.625,-24.625],[31.3125,2.625,-24.70703125],[31.30859375,20.640625,-24.70703125],[-32.17578125,20.5625,-24.625]],lower,[[31.3125,2.625,-24.70703125],[31.3125,2.625,7.97265625],[31.3125,20.65234375,7.97265625],[31.30859375,20.640625,-24.70703125]]);
 b.quad([[-32.17578125,20.5625,-24.625],[31.30859375,20.640625,-24.70703125],[31.30078125,53.71484375,-24.7265625],[-32.1640625,53.71875,-24.64453125]],upper,[[31.30859375,20.640625,-24.70703125],[31.3125,20.65234375,7.97265625],[31.3125,53.734375,7.953125],[31.30078125,53.71484375,-24.7265625]]);
 // Six authored front roof modules map exactly onto the omitted sloped rear
 // strip; source side edges fix its depth and slight height asymmetry.
 for(const face of roof)b.face(face.p.map(p=>new THREE.Vector3(p.x,53.48046875+(p.y-53.359375)*(64.71484375-53.48046875)/(64.57421875-53.359375),-16.45703125-p.z)),face,face.p);
 b.join([[-32.1640625,53.71875,-24.64453125],[31.30078125,53.71484375,-24.7265625]],[[-33.42578125,53.48046875,-32.0703125],[32.546875,53.48046875,-32.0703125]],upper);
 b.quad([[8.40234375,54.67578125,-20.265625],[21.36328125,54.67578125,-20.265625],[21.36328125,66.55078125,-20.265625],[8.40234375,66.55078125,-20.265625]],chimney,[[21.36328125,54.67578125,-20.265625],[21.36328125,54.67578125,-8.359375],[21.36328125,66.55078125,-8.359375],[21.36328125,66.55078125,-20.265625]]);
 b.quad([[5.10546875,66.1796875,-22.6953125],[24.2890625,66.1796875,-22.6953125],[24.2890625,72.91015625,-22.6953125],[5.10546875,72.91015625,-22.6953125]],cap,[[24.2890625,66.1796875,-22.6953125],[24.0859375,66.1796875,-7.7578125],[24.0859375,72.91015625,-7.7578125],[24.2890625,72.91015625,-22.6953125]]);return true;
}

function celadonRestaurant(b:Builder,f:Face[]){
 const wall=plane(f,'lambert2','x',31.0234375,2.5,24.43359375),barge=f.filter(face=>face.material.name==='lambert2'&&face.normal.z>.99&&face.p.every(p=>p.z>22&&p.y>=38.89&&p.y<=55.31)),roof=f.filter(face=>face.material.name==='lambert2'&&face.normal.y>.8&&near(Math.max(...face.p.map(p=>p.y)),55.30078125)&&face.p.every(p=>p.y>=45.19)),shaft=plane(f,'lambert2','x',-21.5,46.5,64.05859375),cap=plane(f,'lambert2','x',-19.2890625,64.87109375,73.68359375);
 if(!wall||barge.length!==8||roof.length!==8||!shaft||!cap)return false;
 // The entry threshold is 0.390625 lower than the side wall. Carry the
 // continuous plain side paint down to that actual plinth level, so the
 // front recess cannot show as a tiny brown triangle beneath the rear.
 const donor=wall.p[0].clone().add(wall.p[1]).add(wall.p[2]).multiplyScalar(1/3),native=(points:number[][],source:Face=wall)=>b.face(points.map(p=>new THREE.Vector3(...p as[number,number,number])),source,points.map(()=>source===wall?donor:source.p[0].clone().add(source.p[1]).add(source.p[2]).multiplyScalar(1/3)));
 const x=31.0234375,z=-23.64453125,profile=new Map<number,number>();for(const face of roof){const cuts:THREE.Vector3[]=[];for(let i=0;i<3;i++){const a=face.p[i],c=face.p[(i+1)%3];if(Math.abs(a.z-z)<1e-6)cuts.push(a.clone());if((a.z-z)*(c.z-z)<0)cuts.push(a.clone().lerp(c,(z-a.z)/(c.z-a.z)));}if(cuts.length<2)continue;cuts.sort((a,c)=>a.x-c.x);const a=cuts[0],c=cuts[cuts.length-1];for(const at of[Math.max(-x,a.x),Math.min(x,c.x)])if(at>=a.x-1e-6&&at<=c.x+1e-6){const y=Math.abs(c.x-a.x)<1e-7?a.y:a.y+(c.y-a.y)*(at-a.x)/(c.x-a.x);profile.set(at,Math.max(profile.get(at)??-Infinity,y));}}
 const top=[...profile].sort(([a],[c])=>a-c).map(([at,y])=>[at,y,z]);if(top.length<5||Math.abs(top[0][0]+x)>.001||Math.abs(top[top.length-1][0]-x)>.001)return false;
 native([[-x,2.109375,z],[x,2.109375,z],...[...top].reverse()]);
 for(const sign of[-1,1])native([[sign*x,2.109375,z],[sign*x,2.109375,16.23828125],[sign*x,2.5,16.23828125],[sign*x,2.5,z]]);
 // Native side roof endpoints prove the eight-part rear barge: a flat
 // central ridge and two raking wings, never a generic triangular gable.
 for(const face of barge)b.face(face.p.map(p=>new THREE.Vector3(p.x,p.y-(Math.abs(p.x)>35?.5:0),-30.3984375)),face,face.p);
 const outer=top.map(([at],i)=>{const edge=i===0?-35.19921875:i===top.length-1?35.19921875:at,a=Math.abs(edge),y=a>20.08203125?48.8515625-(a-20.08203125)*(48.8515625-38.3984375)/(35.19921875-20.08203125):48.80078125+a/20.08203125*(48.8515625-48.80078125);return[edge,y,-30.3984375];});b.join(top,outer,wall);
 native([[-29.5,46.5,-18],[-21.5,46.5,-18],[-21.5,64.05859375,-18],[-29.5,64.05859375,-18]],shaft);
 b.quad([[-31.7109375,64.87109375,-20.2109375],[-19.2890625,64.87109375,-20.2109375],[-19.2890625,73.68359375,-20.2109375],[-31.7109375,73.68359375,-20.2109375]],cap,[[-19.2890625,64.87109375,-20.2109375],[-19.2890625,64.87109375,-7.7890625],[-19.2890625,73.68359375,-7.7890625],[-19.2890625,73.68359375,-20.2109375]]);
 // The cap is 0.8125 above the narrower shaft on every native side. Join
 // their exact rings below the mouth, rather than leave a floating cap.
 b.join([[-29.5,64.05859375,-18],[-21.5,64.05859375,-18],[-21.5,64.05859375,-10],[-29.5,64.05859375,-10],[-29.5,64.05859375,-18]],[[-31.7109375,64.87109375,-20.2109375],[-19.2890625,64.87109375,-20.2109375],[-19.2890625,64.87109375,-7.7890625],[-31.7109375,64.87109375,-7.7890625],[-31.7109375,64.87109375,-20.2109375]],cap);return true;
}

type TreePixels={width:number;height:number;data:ArrayLike<number>};
const deadwoodPixels=new WeakMap<THREE.Texture,TreePixels>();
function pixels(map:THREE.Texture):TreePixels|null{
 const prior=deadwoodPixels.get(map);if(prior)return prior;const image=map.image as TreePixels;if(!image?.width||!image.height)return null;
 if(image.data){deadwoodPixels.set(map,image);return image;}
 if(typeof document==='undefined')return null;
 try{const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)return null;context.drawImage(map.image,0,0);const result={width:image.width,height:image.height,data:context.getImageData(0,0,image.width,image.height).data};deadwoodPixels.set(map,result);return result;}catch{return null;}
}
function deadwood(b:Builder,f:Face[]){
 const card=f.filter(face=>face.material.name==='lambert74'),ground=f.filter(face=>face.material.name==='road05_un');if(card.length!==2||ground.length!==8||!card.every(face=>near(face.normal.y,.639875)&&face.p.every(p=>near(p.y,-3)||near(p.y,46.181640625)))||!ground.every(face=>face.p.every(p=>near(p.y,2))))return null;
 const source=card[0],map=source.material.map,data=map&&pixels(map);if(!data||data.width!==64||data.height!==64)return null;
 const solid=(x:number,y:number)=>x>=0&&x<32&&y>=0&&y<64&&data.data[(y*64+x)*4+3]>=128,occupied:Array<[number,number]>=[];for(let y=0;y<64;y++)for(let x=0;x<32;x++)if(solid(x,y))occupied.push([x,y]);if(occupied.length!==559)return null;
 // Unbake the original 40-degree ground tilt. Its forty painted pixel rows
 // stand upright on the native Y=2 root patch. A rounded solid extrusion
 // gives every branch and root a real front, back, side and end surface.
 const depth=new Map<string,number>();for(const[x,y]of occupied){let distance=8;for(let dy=-7;dy<=7;dy++)for(let dx=-7;dx<=7;dx++)if(!solid(x+dx,y+dy))distance=Math.min(distance,Math.hypot(dx,dy));depth.set(x+','+y,1.3+Math.min(5.5,distance*1.1));}
 const corner=(x:number,y:number)=>{const neighbors=[depth.get((x-1)+','+(y-1)),depth.get(x+','+(y-1)),depth.get((x-1)+','+y),depth.get(x+','+y)].filter(v=>v!==undefined)as number[];return neighbors.reduce((a,c)=>a+c,0)/neighbors.length;},unit=32/.501953125/64,point=(x:number,y:number,sign:number)=>new THREE.Vector3((x-14.5)*unit,2+(54-y)*unit,sign*corner(x,y));
 for(const[x,y]of occupied){const u=(x+.5)/64,v=(y+.5)/64,samplePoint=new THREE.Vector3(-15+32*u/.501953125,46.181640625+(-3-46.181640625)*v,-26.951171875+(14+26.951171875)*v),samplePoints=Array.from({length:4},()=>samplePoint),corners=[[x,y],[x+1,y],[x+1,y+1],[x,y+1]];
  b.face(corners.map(([cx,cy])=>point(cx,cy,1)),source,samplePoints);b.face(corners.map(([cx,cy])=>point(cx,cy,-1)).reverse(),source,samplePoints);
  for(const[dx,dy,a,c]of[[0,-1,0,1],[1,0,1,2],[0,1,2,3],[-1,0,3,0]])if(!solid(x+dx,y+dy)){const pa=corners[a],pc=corners[c];b.face([point(...pa as[number,number],1),point(...pc as[number,number],1),point(...pc as[number,number],-1),point(...pa as[number,number],-1)],source,samplePoints);}
 }
 return source.material;
}

function fountain(b:Builder,f:Face[]){
 const native=f.filter(face=>face.material.name==='funsui_a1'),key=(points:THREE.Vector3[])=>points.map(p=>p.toArray().map(v=>Math.round(v*10000)).join(',')).sort().join('|'),existing=new Set(native.map(face=>key(face.p))),missing=native.filter(face=>face.normal.z>.1&&face.p.every(p=>p.z>=-.001)&&!existing.has(key(face.p.map(p=>p.clone().setZ(-p.z)))));
 if(missing.length!==32||!native.some(face=>face.p.some(p=>near(p.x,24)&&near(p.y,3))))return false;
 // The eight-sided basin/pedestal has only its front four outer facets.
 // Complete the missing rear partners at each actual radius/height. Water
 // remains its original translucent mesh, never an averaged opaque backing.
 for(const face of missing)b.face(face.p.map(p=>p.clone().setZ(-p.z)),face,face.p);return true;
}
function radioTower(b:Builder,f:Face[]){
 const lower=plane(f,'radio_a','x',56,2,32),upper=plane(f,'radio_a','x',56,32,64),tube=f.filter(face=>face.material.name==='radio_b'&&face.p.every(p=>p.z>=-.001)&&face.normal.z>.1),windows=f.filter(face=>face.material.name==='radio_mado'&&near(Math.min(...face.p.map(p=>p.y)),125.28125)&&near(Math.max(...face.p.map(p=>p.y)),138.5859375)),frame=f.filter(face=>face.material.name==='radio_a'&&face.p.every(p=>p.y>=119.99&&p.y<=144.01&&p.z>=-.001)&&face.normal.z>.1&&Math.abs(face.normal.y)<.9);
 if(!lower||!upper||tube.length!==8||windows.length!==12||frame.length<40)return false;
 for(const[lo,hi,source]of[[2,32,lower],[32,64,upper]]as const)b.quad([[-56,lo,-56],[56,lo,-56],[56,hi,-56],[-56,hi,-56]],source,[[56,lo,-56],[56,lo,48],[56,hi,48],[56,hi,-56]]);
 // Preserve the octagonal copper mast and twelve-sided observation room.
 // Their missing rear sectors are native front partners, not rectangular
 // cards projected from the circular roof's complete bounding rectangle.
 for(const face of[...tube,...windows,...frame])b.face(face.p.map(p=>p.clone().setZ(-p.z)),face,face.p);return true;
}
function nativeOpenStructure(model:number,f:Face[]){
 if(model===249)return f.some(face=>face.material.name==='kk_school_a'&&face.p.some(p=>near(p.y,73)));
 const cloth=model===175?'msr_pt01':'msr_pt03';return f.some(face=>face.material.name===cloth&&face.p.some(p=>near(p.y,49.25)))&&f.some(face=>face.material.name==='msr_pt02'&&face.p.some(p=>near(p.y,2)));
}
/** Per-placement completion of native special structures. No shared native
 * buffers, source textures or original front cards are modified. */
export function closeDecorativeBuildingShell(root:THREE.Object3D,asset:string,doors:BuildingEntrance[]=[]):DecorativeBuildingShell|null{
 const match=asset.match(/(?:^|\/)1-(\d+)-\d+\.glb$/),model=Number(match?.[1]);if(!match||!DECORATIVE_BUILDING_MODELS.has(model))return null;const previous=root.userData.decorativeBuildingShell as DecorativeBuildingShell|undefined;if(previous)return previous;
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),rear=model===104?-17:model===110||model===86?-56:model===118?-24.7:model===243?-23.64453125:-19.57421875,width=model===104?30:model===110||model===86?56:model===118?33:model===243?31.0234375:23;
 if(![78,173,175,176,234,249].includes(model)&&doors.some(door=>{const local=new THREE.Vector3(door.x,root.getWorldPosition(new THREE.Vector3()).y,door.z).applyMatrix4(inverse);if(Math.abs(local.z-rear)>12||Math.abs(local.x)>width+4)return false;if(door.axis===undefined||door.sign===undefined)return true;return new THREE.Vector3().setComponent(door.axis,door.sign).transformDirection(inverse).z<-.5;}))return null;
 const b=new Builder(),f=sourceFaces(root);if([173,175,176,249].includes(model)){if(!nativeOpenStructure(model,f))return null;return b.finish(root,model===249?'native-open-lookout':'native-open-market-canopy',true);}if(model===234){const material=deadwood(b,f);if(!material)return null;const result=b.finish(root,'upright-solid-deadwood');if(result)root.traverse(o=>{if(o instanceof THREE.Mesh&&o.material===material)o.visible=false;});return result;}const ok=model===78?fountain(b,f):model===86?radioTower(b,f):model===104?pharmacy(b,f):model===110?lighthouse(b,f):model===118?restaurant(b,f):model===243?celadonRestaurant(b,f):silo(b,f);if(!ok)return null;return b.finish(root,model===78?'native-octagonal-fountain':model===86?'goldenrod-radio-tower':model===104?'cianwood-pharmacy':model===110?'olivine-lighthouse':model===118?'olivine-restaurant':model===243?'celadon-restaurant':'route39-silo');
}
