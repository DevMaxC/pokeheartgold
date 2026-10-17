import * as THREE from 'three';
import type {Terraces} from './ledges.ts';

type Vertex={p:THREE.Vector3;uv:THREE.Vector2;color:THREE.Color};
/** Extend authored wall feet down only where synthetic relief exposes a gap.
 * Roof overhangs need not flatten a neighbouring native ledge. */
export function closeBuildingFooting(root:THREE.Object3D,terraces:Terraces,offset:number){
 root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert(),triangles:{vertices:Vertex[];material:THREE.Material}[]=[];let floor=Infinity;
 root.traverseVisible(o=>{
  if(!(o instanceof THREE.Mesh)||o instanceof THREE.InstancedMesh||o.name==='source-building-footing')return;
  const g=o.geometry as THREE.BufferGeometry,p=g.getAttribute('position'),uv=g.getAttribute('uv'),color=g.getAttribute('color'),idx=g.index,materials=Array.isArray(o.material)?o.material:[o.material];
  for(let i=g.drawRange.start;i+2<Math.min(idx?.count??p.count,g.drawRange.start+g.drawRange.count);i+=3){
   const m=materials[Array.isArray(o.material)?g.groups.find(group=>i>=group.start&&i<group.start+group.count)?.materialIndex??0:0];
   if(m.opacity<.5||/tree|bush|flower|hana|grass|fence|saku|plant|kage|shadow/i.test(m.name))continue;
   const vertices=[0,1,2].map(j=>{const n=idx?idx.getX(i+j):i+j,v={p:o.getVertexPosition(n,new THREE.Vector3()).applyMatrix4(o.matrixWorld),uv:uv?new THREE.Vector2(uv.getX(n),uv.getY(n)):new THREE.Vector2(),color:color?new THREE.Color(color.getX(n),color.getY(n),color.getZ(n)):new THREE.Color(1,1,1)};floor=Math.min(floor,v.p.y);return v;});triangles.push({vertices,material:m});
  }
 });
 const data=new Map<THREE.Material,{p:number[];uv:number[];color:number[]}>();
 for(const {vertices:v,material}of triangles)for(let edge=0;edge<3;edge++){
  const a=v[edge],b=v[(edge+1)%3],c=v[(edge+2)%3];if(Math.abs(a.p.y-b.p.y)>.02||Math.max(a.p.y,b.p.y)>floor+.5||c.p.y<Math.max(a.p.y,b.p.y)+.125)continue;
  const cuts=new Set([0,1]);for(const [from,to]of [[a.p.x,b.p.x],[a.p.z,b.p.z],[a.p.x-a.p.z,b.p.x-b.p.z]]){if(Math.abs(to-from)<1e-9)continue;for(let n=Math.ceil(Math.min(from,to)*2);n<=Math.floor(Math.max(from,to)*2);n++){const t=(n*.5-from)/(to-from);if(t>0&&t<1)cuts.add(t);}}
  const steps=[...cuts].sort((a,b)=>a-b);
  for(let step=0;step<steps.length-1;step++){
   const points=[steps[step],steps[step+1]].map(t=>({p:a.p.clone().lerp(b.p,t),uv:a.uv.clone().lerp(b.uv,t),color:a.color.clone().lerp(b.color,t)})),gaps=points.map(v=>Math.max(0,offset-Math.min(...[-1e-6,0,1e-6].flatMap(dx=>[-1e-6,0,1e-6].map(dz=>terraces.height(v.p.x+dx,v.p.z+dz))))));
   if(Math.max(...gaps)<1e-4)continue;
   const corners=[points[0],points[1],{...points[1],p:points[1].p.clone().add(new THREE.Vector3(0,-gaps[1],0))},{...points[0],p:points[0].p.clone().add(new THREE.Vector3(0,-gaps[0],0))}],out=data.get(material)??{p:[],uv:[],color:[]};data.set(material,out);
   for(const n of [0,1,2,0,2,3]){out.p.push(...corners[n].p.clone().applyMatrix4(inverse).toArray());out.uv.push(...corners[n].uv.toArray());out.color.push(...corners[n].color.toArray());}
  }
 }
 if(!data.size)return null;
 const geometry=new THREE.BufferGeometry(),positions:number[]=[],uvs:number[]=[],colors:number[]=[],materials:THREE.Material[]=[];
 for(const [source,v]of data){geometry.addGroup(positions.length/3,v.p.length/3,materials.length);positions.push(...v.p);uvs.push(...v.uv);colors.push(...v.color);const material=source.clone();material.side=THREE.DoubleSide;materials.push(material);}
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,materials);mesh.name='source-building-footing';root.add(mesh);return mesh;
}
