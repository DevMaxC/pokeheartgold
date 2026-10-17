import * as THREE from 'three';
import type {BuildingEntrance} from './render-repair.ts';

export type BurnedTowerShell={family:'ecruteak-burned-tower';triangles:number;passages:number};
const generated=new Set(['3d-rear-facade','3d-solid-backing','entrance-rear-wall']);
const near=(a:number,b:number)=>Math.abs(a-b)<.035;
type Vertex={point:THREE.Vector3;uv:THREE.Vector2;color:THREE.Color};
type Cut={left:number;right:number;top:number};
function interpolate(a:Vertex,b:Vertex,t:number):Vertex{return{point:a.point.clone().lerp(b.point,t),uv:a.uv.clone().lerp(b.uv,t),color:a.color.clone().lerp(b.color,t)};}
function clip(vertices:Vertex[],axis:'x'|'y',at:number,positive:boolean){
 const result:Vertex[]=[];
 for(let i=0;i<vertices.length;i++){
  const a=vertices[i],b=vertices[(i+1)%vertices.length],da=(a.point[axis]-at)*(positive?1:-1),db=(b.point[axis]-at)*(positive?1:-1);
  if(da>=-1e-7)result.push(a);if((da>1e-7&&db< -1e-7)||(da< -1e-7&&db>1e-7))result.push(interpolate(a,b,da/(da-db)));
 }return result;
}
function outsidePassage(vertices:Vertex[],cut:Cut){
 // Three disjoint regions leave the doorway empty without duplicated faces
 // or projecting a distant map entrance through the complete rear wall.
 return[clip(vertices,'x',cut.left,false),clip(vertices,'x',cut.right,true),clip(clip(clip(vertices,'x',cut.left,true),'x',cut.right,false),'y',cut.top,true)].filter(p=>p.length>=3);
}
/** Restore only the native tower's omitted north ground-story elevation.
 * Its remaining hip roof and charred, open upper story are deliberate damage
 * (msg_0415.gmm:45), so none of their vertices or openings are reconstructed. */
export function closeBurnedTowerShell(root:THREE.Object3D,asset:string,doors:BuildingEntrance[]=[]):BurnedTowerShell|null{
 if(!/(?:^|\/)1-8-\d+\.glb$/.test(asset))return null;
 const previous=root.userData.burnedTowerShell as BurnedTowerShell|undefined;if(previous)return previous;
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),cuts:Cut[]=[];
 for(const door of doors){
  const point=new THREE.Vector3(door.x,root.getWorldPosition(new THREE.Vector3()).y,door.z).applyMatrix4(inverse),direction=door.axis===undefined?null:new THREE.Vector3().setComponent(door.axis,door.sign??1).transformDirection(inverse);
  if(point.z< -48||point.z> -28||Math.abs(point.x)>44||direction&&direction.z>-.6)continue;
  cuts.push({left:point.x-8.1,right:point.x+8.1,top:34});
 }
 const batches=new Map<THREE.MeshBasicMaterial,{position:number[];uv:number[];color:number[]}>();let sourceTriangles=0;
 root.traverse(object=>{
  if(!(object instanceof THREE.Mesh)||object instanceof THREE.InstancedMesh||generated.has(object.name)||object.name.startsWith('burned-tower-'))return;
  const geometry=object.geometry,position=geometry.getAttribute('position'),uv=geometry.getAttribute('uv'),color=geometry.getAttribute('color'),index=geometry.index,materials=Array.isArray(object.material)?object.material:[object.material];
  for(const group of geometry.groups.length?geometry.groups:[{start:0,count:index?.count??position.count,materialIndex:0}]){
   const material=materials[group.materialIndex??0] as THREE.MeshBasicMaterial;if(material.name!=='en_yake2'||!material.visible||material.opacity<.5)continue;
   for(let at=group.start;at<group.start+group.count;at+=3){
    const ids=[0,1,2].map(i=>index?index.getX(at+i):at+i),points=ids.map(i=>object.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(object.matrixWorld).applyMatrix4(inverse));
    // Rotate the three genuine east-facing 24-unit window/wood bays onto
    // the rear. Front door cards, lanterns and the two-unit front return are
    // excluded by their measured plane, bounds and lower-story height.
    if(!points.every(p=>near(p.x,36)&&p.z>=-36.01&&p.z<=36.01&&p.y>=7.99&&p.y<=56.01))continue;
    const normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));if(Math.abs(normal.normalize().x)<.999)continue;sourceTriangles++;
    let pieces:Vertex[][]=[points.map((p,i)=>({point:new THREE.Vector3(p.z,p.y,-36),uv:uv?new THREE.Vector2(uv.getX(ids[i]),uv.getY(ids[i])):new THREE.Vector2(),color:color?new THREE.Color(color.getX(ids[i]),color.getY(ids[i]),color.getZ(ids[i])):new THREE.Color(1,1,1)}))];
    for(const cut of cuts)pieces=pieces.flatMap(piece=>outsidePassage(piece,cut));
    let batch=batches.get(material);if(!batch){batch={position:[],uv:[],color:[]};batches.set(material,batch);}
    for(const piece of pieces)for(let i=1;i<piece.length-1;i++){
     const triangle=[piece[0],piece[i],piece[i+1]];if(new THREE.Triangle(...triangle.map(p=>p.point) as[THREE.Vector3,THREE.Vector3,THREE.Vector3]).getArea()<1e-6)continue;
     for(const vertex of triangle){batch.position.push(...vertex.point.toArray());batch.uv.push(...vertex.uv.toArray());batch.color.push(...vertex.color.toArray());}
    }
   }
  }
 });
 if(sourceTriangles!==18)return null;
 const group=new THREE.Group();group.name='burned-tower-shell';let triangles=0;
 for(const[source,batch]of batches){
  if(!batch.position.length)continue;const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(batch.position,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(batch.uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(batch.color,3));geometry.computeVertexNormals();
  const material=source.clone();material.side=THREE.DoubleSide;material.transparent=false;material.opacity=1;material.alphaTest=0;material.depthWrite=true;material.vertexColors=true;const mesh=new THREE.Mesh(geometry,material);mesh.name='burned-tower-rear-cladding';group.add(mesh);triangles+=batch.position.length/9;
 }
 if(!triangles)return null;
 // Generic mirrored facades also bridge the irregular charred upper beams
 // with a solid brown triangle. Those invented fills must go along with the
 // false lower rear door. Native roof slopes and damaged beam surfaces remain
 // visible, so the burned opening retains its original profile in every view.
 root.traverse(object=>{if(generated.has(object.name))object.visible=false;});
 root.add(group);return root.userData.burnedTowerShell={family:'ecruteak-burned-tower',triangles,passages:cuts.length} as BurnedTowerShell;
}
