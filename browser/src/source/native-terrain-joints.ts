import * as THREE from 'three';
import {Terraces} from './ledges.ts';
export type Vertex={p:THREE.Vector3;uv:THREE.Vector2;color:THREE.Color;root?:THREE.Vector3;bary?:THREE.Vector3;stored?:THREE.Vector3};
const lerp=(a:Vertex,b:Vertex,t:number):Vertex=>({p:a.p.clone().lerp(b.p,t),uv:a.uv.clone().lerp(b.uv,t),color:a.color.clone().lerp(b.color,t),bary:a.bary?.clone().lerp(b.bary!,t)});
export function clip(vertices:Vertex[],distance:(v:Vertex)=>number){
 const out:Vertex[]=[];for(let i=0;i<vertices.length;i++){const a=vertices[i],b=vertices[(i+1)%vertices.length],da=distance(a),db=distance(b),inside=da>=-1e-8;if(inside)out.push(a);if((da>1e-8&&db< -1e-8)||(da< -1e-8&&db>1e-8))out.push(lerp(a,b,da/(da-db)));}return out;
}
type Face={mesh:THREE.Mesh;material:THREE.Material;index:number;vertices:Vertex[];up:boolean;vertical:boolean;plane:string;edges:Occurrence[]};
type Occurrence={face:Face;opposite:number;a:number;b:number;key:string};
type Point={raw:THREE.Vector3;stored:THREE.Vector3;offset:number};
type Segment={a:Vertex;b:Vertex};
export type ReliefStrip={vertices:Vertex[];material:THREE.Material;faces:readonly[Face,Face];rawEdge:readonly[THREE.Vector3,THREE.Vector3]};
type Edge={profiles?:Map<Face,Segment[]>;key:string;a:THREE.Vector3;b:THREE.Vector3;axis:'x'|'z';occurrences:Occurrence[];points:Map<number,Point>;invalid?:boolean};
export type WallPlan={face:Face;axis:'x'|'z';cuts:number[];anchors:Edge[];offset:(at:number)=>number;inverse:THREE.Matrix4};
const key=(p:THREE.Vector3)=>p.toArray().join(','),edgeKey=(mesh:THREE.Mesh,a:THREE.Vector3,b:THREE.Vector3)=>mesh.uuid+':'+[key(a),key(b)].sort().join('|');
const eligible=(mesh:THREE.Mesh,m:THREE.Material)=>m.visible&&!/^(?:solid-original-|textured-terrain-back|crossed-|camera-facing-|terrain-scenery-|source-terrace-)/.test(mesh.name)&&!mesh.userData.terrainSceneryCoverageOnly&&!mesh.geometry.hasAttribute('sceneryRoot')&&/cliff|wall|peak|mount|slope|grass|ground|soil|earth/i.test(m.name)&&!/water|sea|river|pond|bridge|hashi|flower|tree|bush|shadow|kage/i.test(m.name)&&!(m as THREE.MeshBasicMaterial).alphaTest&&!m.transparent&&m.opacity===1;
const normal=(v:Vertex[])=>new THREE.Triangle(...v.map(v=>v.p) as [THREE.Vector3,THREE.Vector3,THREE.Vector3]).getNormal(new THREE.Vector3());
function slots(mesh:THREE.Mesh){const g=mesh.geometry,total=g.index?.count??g.getAttribute('position').count,slots=new Uint32Array(Math.ceil(total/3));slots.fill(0xffffffff);for(const group of g.groups)for(let i=Math.ceil(group.start/3);i*3<Math.min(total,group.start+group.count);i++)if(slots[i]===0xffffffff)slots[i]=group.materialIndex??0;return slots;}
function vertex(mesh:THREE.Mesh,i:number):Vertex{const uv=mesh.geometry.getAttribute('uv'),color=mesh.geometry.getAttribute('color');return{p:mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld),uv:uv?new THREE.Vector2(uv.getX(i),uv.getY(i)):new THREE.Vector2(),color:color?new THREE.Color(color.getX(i),color.getY(i),color.getZ(i)):new THREE.Color(1,1,1)};}
/** Only original, same-mesh, exact raw native edges can anchor these walls.
 * Missing/ambiguous profiles and unrelated native faces remain unchanged. */
export async function nativeWallPlans(meshes:THREE.Mesh[],inverse:THREE.Matrix4,terraces:Terraces,pause:()=>Promise<boolean>){
 const canonicalUp=new WeakMap<THREE.Mesh,Map<number,Map<string,THREE.Vector3>>>(),faces:Face[]=[],edges=new Map<string,Edge>(),stats={sourceFaces:0,joinedRawEdges:0,anchoredComponents:0,changedVerticalFaces:0,ambiguousComponents:0,unanchoredVerticalFaces:0,profilePoints:0,unsupportedDiagonalComponents:0,diagnostics:[] as any[]};let work=0;
 for(const mesh of meshes){if(mesh instanceof THREE.InstancedMesh)continue;const geometry=mesh.geometry,index=geometry.index,total=index?.count??geometry.getAttribute('position').count,materials=Array.isArray(mesh.material)?mesh.material:[mesh.material],table=slots(mesh),start=geometry.drawRange.start,end=Math.min(total,start+geometry.drawRange.count);
  for(let i=start;i+2<end;i+=3){if((++work&31)===0&&!await pause())return null;const slot=table[Math.floor(i/3)]===0xffffffff?0:table[Math.floor(i/3)];if(!materials[slot]||!eligible(mesh,materials[slot]))continue;const vertices=[0,1,2].map(j=>({...vertex(mesh,index?index.getX(i+j):i+j),bary:new THREE.Vector3().setComponent(j,1)})),ny=normal(vertices).y;if(!(ny>.025||ny===0)||new THREE.Triangle(...vertices.map(v=>v.p)as[THREE.Vector3,THREE.Vector3,THREE.Vector3]).getArea()===0)continue;
   const face:Face={mesh,material:materials[slot],index:i,vertices,up:ny>.025,vertical:ny===0,plane:vertices.every(v=>v.p.x===vertices[0].p.x)?'x:'+vertices[0].p.x:vertices.every(v=>v.p.z===vertices[0].p.z)?'z:'+vertices[0].p.z:'',edges:[]};faces.push(face);stats.sourceFaces++;
   for(let j=0;j<3;j++){const a=vertices[j].p,b=vertices[(j+1)%3].p,k=edgeKey(mesh,a,b),occurrence={face,opposite:(j+2)%3,a:j,b:(j+1)%3,key:k};let edge=edges.get(k);if(!edge){const ordered=key(a)<key(b)?[a,b]:[b,a];edge={key:k,a:ordered[0],b:ordered[1],axis:Math.abs(b.x-a.x)>=Math.abs(b.z-a.z)?'x':'z',occurrences:[],points:new Map()};edges.set(k,edge);}edge.occurrences.push(occurrence);face.edges.push(occurrence);}
  }
 }
 const anchors=[...edges.values()].filter(e=>e.occurrences.filter(o=>o.face.up).length===1&&e.occurrences.filter(o=>o.face.vertical).length===1);stats.joinedRawEdges=anchors.length;
 // Opposite-side upward faces inside one native material primitive can
 // acquire two legitimate relief branches. Their gap has its own literal
 // raw-edge authority; it is unrelated to an omitted original vertical face.
 const upwardJoints=[...edges.values()].filter(e=>{if(e.occurrences.length!==2||!e.occurrences.every(o=>o.face.up)||e.occurrences[0].face.material!==e.occurrences[1].face.material||e.occurrences[0].face.material.side!==THREE.DoubleSide)return false;const a=e.a,b=e.b,dx=b.x-a.x,dz=b.z-a.z;if((dx===0)===(dz===0))return false;const sides=e.occurrences.map(o=>{const p=o.face.vertices[o.opposite].p;return dx*(p.z-a.z)-dz*(p.x-a.x);});return sides[0]*sides[1]<0;});
 for(const edge of upwardJoints)edge.profiles=new Map(edge.occurrences.map(o=>[o.face,[]]));
 const byUp=new Map<Face,Edge[]>();for(const edge of [...anchors,...upwardJoints])for(const occurrence of edge.occurrences.filter(o=>o.face.up)){const up=occurrence.face;byUp.set(up,[...byUp.get(up)??[],edge]);}
 for(const[face,joints]of byUp){const triangle=face.vertices,minX=Math.min(...triangle.map(v=>v.p.x)),maxX=Math.max(...triangle.map(v=>v.p.x)),minZ=Math.min(...triangle.map(v=>v.p.z)),maxZ=Math.max(...triangle.map(v=>v.p.z));
  const add=(poly:Vertex[],tx?:number,tz?:number,override?:number)=>{for(let i=1;i<poly.length-1;i++){const triangle=[poly[0],poly[i],poly[i+1]];if(new THREE.Vector3().subVectors(triangle[1].p,triangle[0].p).cross(new THREE.Vector3().subVectors(triangle[2].p,triangle[0].p)).lengthSq()<1e-14)continue;
   const emitted=triangle.map(v=>{const offset=override!==undefined?override:tx===undefined?terraces.height(v.p.x,v.p.z):terraces.sample(Math.floor(tx),Math.floor(tz!),v.p.x,v.p.z),stored=v.p.clone().setY(v.p.y+offset).applyMatrix4(inverse);stored.set(Math.fround(stored.x),Math.fround(stored.y),Math.fround(stored.z));return{v,offset,stored};});
   for(const edge of joints){const occurrence=edge.occurrences.find(o=>o.face===face)!;
    for(const{v,offset,stored}of emitted){if(v.bary!.getComponent(occurrence.opposite)!==0)continue;if(!edge.profiles){const at=v.p[edge.axis],prior=edge.points.get(at);if(prior&&!prior.stored.equals(stored)){edge.invalid=true;continue;}edge.points.set(at,{raw:v.p.clone(),stored,offset});}const own=canonicalUp.get(face.mesh)??new Map<number,Map<string,THREE.Vector3>>(),vertices=own.get(face.index)??new Map<string,THREE.Vector3>();vertices.set(key(v.p),stored);own.set(face.index,vertices);canonicalUp.set(face.mesh,own);}
    if(edge.profiles)for(let j=0;j<3;j++){const a=emitted[j],b=emitted[(j+1)%3];if(a.v.bary!.getComponent(occurrence.opposite)!==0||b.v.bary!.getComponent(occurrence.opposite)!==0||a.stored[edge.axis]===b.stored[edge.axis])continue;edge.profiles.get(face)!.push({a:{...a.v,p:a.stored},b:{...b.v,p:b.stored}});}
   }
  }};
  const flat=terraces.uniform(minX,minZ,maxX,maxZ);if(flat!==undefined){add(triangle,undefined,undefined,flat);continue;}
  for(let z=Math.floor(minZ*2+1e-8)/2;z<Math.ceil(maxZ*2-1e-8)/2;z+=.5)for(let x=Math.floor(minX*2+1e-8)/2;x<Math.ceil(maxX*2-1e-8)/2;x+=.5){if((++work&31)===0&&!await pause())return null;let poly=triangle;for(const distance of[(v:Vertex)=>v.p.x-x,(v:Vertex)=>x+.5-v.p.x,(v:Vertex)=>v.p.z-z,(v:Vertex)=>z+.5-v.p.z])poly=clip(poly,distance);if(poly.length<3)continue;add(clip(poly,v=>(v.p.x-x)-(v.p.z-z)),x,z);add(clip(poly,v=>(v.p.z-z)-(v.p.x-x)),x,z);}
 }
 const plans=new Map<THREE.Mesh,Map<number,WallPlan>>(),seen=new Set<Face>();
 for(const start of faces.filter(f=>f.vertical)){if((++work&31)===0&&!await pause())return null;if(seen.has(start))continue;const component:Face[]=[],pending=[start];while(pending.length){if((++work&31)===0&&!await pause())return null;const f=pending.pop()!;if(seen.has(f))continue;seen.add(f);component.push(f);for(const e of f.edges)for(const other of edges.get(e.key)!.occurrences)if(other.face.vertical&&other.face.plane===f.plane&&!seen.has(other.face))pending.push(other.face);}
  const joints=anchors.filter(e=>e.occurrences.some(o=>component.includes(o.face)));if(!joints.length){stats.unanchoredVerticalFaces+=component.length;continue;}
  const points=component.flatMap(f=>f.vertices.map(v=>v.p)),sameX=points.every(p=>p.x===points[0].x),sameZ=points.every(p=>p.z===points[0].z);if(!sameX&&!sameZ){stats.unsupportedDiagonalComponents++;continue;}const axis:'x'|'z'=sameX?'z':'x';
  if(joints.some(e=>e.axis!==axis||e.invalid||!e.occurrences.length||!e.points.has(e.a[axis])||!e.points.has(e.b[axis]))){stats.ambiguousComponents++;stats.diagnostics.push({reason:'endpoint-or-duplicate',faces:component.map(f=>[f.mesh.name,f.index/3]),joints:joints.map(e=>({key:e.key,invalid:e.invalid,points:[...e.points].map(([at,p])=>[at,p.offset,p.stored.toArray()])}))});continue;}
  const entries=joints.flatMap(e=>[...e.points.entries()]),allCuts=[...new Set(entries.map(([at])=>at))].sort((a,b)=>a-b),lo=Math.min(...points.map(p=>p[axis])),hi=Math.max(...points.map(p=>p[axis])),fixed=points[0][sameX?'x':'z'],cuts=allCuts.filter(at=>at===lo||at===hi||Number.isInteger(at*2)||Number.isInteger((at-fixed)*2)||joints.some(edge=>{const profile=[...edge.points.entries()].sort(([a],[b])=>a-b),i=profile.findIndex(([p])=>p===at);if(i<=0||i>=profile.length-1)return false;const[a,p]=profile[i-1],[b,q]=profile[i],[c,r]=profile[i+1];return(q.offset-p.offset)*(c-b)!==(r.offset-q.offset)*(b-a);}));
  // A plan never extrapolates the original upward profile onto an unattached
  // horizontal portion of wall. Preserve that component instead.
  const covered=(a:number,b:number)=>joints.some(e=>Math.min(e.a[axis],e.b[axis])<=a&&Math.max(e.a[axis],e.b[axis])>=b);
  if(allCuts[0]!==lo||allCuts.at(-1)!==hi||allCuts.some((v,i)=>i+1<allCuts.length&&!covered(v,allCuts[i+1]))){stats.ambiguousComponents++;stats.diagnostics.push({reason:'component-range',faces:component.map(f=>[f.mesh.name,f.index/3]),cuts,lo,hi});continue;}
  const offset=(at:number)=>{for(const edge of joints){const list=[...edge.points.entries()].sort(([a],[b])=>a-b);for(let i=0;i<list.length;i++){if(list[i][0]===at)return list[i][1].offset;if(i+1<list.length&&list[i][0]<at&&list[i+1][0]>at)return THREE.MathUtils.lerp(list[i][1].offset,list[i+1][1].offset,(at-list[i][0])/(list[i+1][0]-list[i][0]));}}throw Error('Unsupported profile extrapolation');};
  let ambiguous=false;for(const edge of joints)for(const[at,p]of edge.points){if((++work&31)===0&&!await pause())return null;if(offset(at)!==p.offset)ambiguous=true;}
  for(const edge of joints)for(const at of cuts)if(at>Math.min(edge.a[axis],edge.b[axis])&&at<Math.max(edge.a[axis],edge.b[axis])&&!edge.points.has(at))ambiguous=true;
  // A top branch cannot move an unattached foot/side onto another tile's
  // relief. Without an exact native upward anchor at that raw point, its
  // former floor() branch must remain identical; otherwise reject the whole
  // component rather than shifting the hole to a different boundary.
  const anchored=(p:THREE.Vector3)=>joints.some(edge=>{const a=edge.a,b=edge.b,delta=b[axis]-a[axis];if(!delta)return false;const t=(p[axis]-a[axis])/delta;return t>=0&&t<=1&&a.clone().lerp(b,t).equals(p);});
  for(const face of component)for(const occurrence of face.edges){if((++work&31)===0&&!await pause())return null;const a=face.vertices[occurrence.a].p,b=face.vertices[occurrence.b].p,span=b[axis]-a[axis],points=[a,b,...(span?cuts.filter(at=>at>Math.min(a[axis],b[axis])&&at<Math.max(a[axis],b[axis])).map(at=>a.clone().lerp(b,(at-a[axis])/span)):[])];for(const p of points)if(!anchored(p)&&offset(p[axis])!==terraces.height(p.x,p.z))ambiguous=true;}
  if(ambiguous){stats.ambiguousComponents++;stats.diagnostics.push({reason:'overlap-or-extra-cut',faces:component.map(f=>[f.mesh.name,f.index/3]),cuts,joints:joints.map(e=>({key:e.key,points:[...e.points].map(([at,p])=>[at,p.offset])}))});continue;}
  stats.anchoredComponents++;stats.profilePoints+=entries.length;for(const face of component){const group=plans.get(face.mesh)??new Map();group.set(face.index,{face,axis,cuts,anchors:joints,offset,inverse});plans.set(face.mesh,group);stats.changedVerticalFaces++;}
 }
 const reliefStrips=await upwardReliefStrips(upwardJoints,inverse,terraces,pause);if(!reliefStrips)return null;
 return{plans,stats,reliefStrips,storedUpVertex:(mesh:THREE.Mesh,index:number,p:THREE.Vector3,computed:THREE.Vector3)=>{const stored=canonicalUp.get(mesh)?.get(index)?.get(key(p));return stored&&Object.is(stored.x,Math.fround(computed.x))&&Object.is(stored.y,Math.fround(computed.y))&&Object.is(stored.z,Math.fround(computed.z))?stored:undefined;}};
}
export function splitNativeWall(plan:WallPlan){
 let polygons=[plan.face.vertices];for(const at of plan.cuts){polygons=polygons.flatMap(poly=>{const lo=Math.min(...poly.map(v=>v.p[plan.axis])),hi=Math.max(...poly.map(v=>v.p[plan.axis]));if(at<=lo||at>=hi)return[poly];const side=(sign:number)=>{const out:Vertex[]=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=(a.p[plan.axis]-at)*sign,db=(b.p[plan.axis]-at)*sign;if(da>=0)out.push(a);if(da*db<0){const v=lerp(a,b,da/(da-db));v.p[plan.axis]=at;out.push(v);}}return out;};return[side(1),side(-1)];});}
 for(const poly of polygons)for(const v of poly){for(const occurrence of plan.face.edges){if(v.bary!.getComponent(occurrence.opposite)!==0)continue;const originalEdge=plan.anchors.find(e=>e.key===occurrence.key),at=v.p[plan.axis],anchor=originalEdge?.points.get(at);if(anchor){v.stored=anchor.stored;break;}
   const a=plan.face.vertices[occurrence.a],b=plan.face.vertices[occurrence.b];if(a.p[plan.axis]===b.p[plan.axis]){const stored=v.p.clone().setY(v.p.y+plan.offset(at)).applyMatrix4(plan.inverse);v.stored=new THREE.Vector3(Math.fround(stored.x),Math.fround(stored.y),Math.fround(stored.z));continue;}const ordered=key(a.p)<key(b.p)?[a,b]:[b,a];let t=0;if(ordered[1].p[plan.axis]!==ordered[0].p[plan.axis])t=(at-ordered[0].p[plan.axis])/(ordered[1].p[plan.axis]-ordered[0].p[plan.axis]);else if(v.bary!.getComponent(occurrence.b)!==0)t=v.bary!.getComponent(occurrence.b);
   const raw=ordered[0].p.clone().lerp(ordered[1].p,t);raw[plan.axis]=at;const stored=raw.clone().setY(raw.y+plan.offset(at)).applyMatrix4(plan.inverse);v.stored=new THREE.Vector3(Math.fround(stored.x),Math.fround(stored.y),Math.fround(stored.z));v.uv=ordered[0].uv.clone().lerp(ordered[1].uv,t);v.color=ordered[0].color.clone().lerp(ordered[1].color,t);
  }}return polygons;
}

/** Exact stored edge endpoints only. An interpolated point is admissible only
 * on a constant-height axis segment (the only interpolated case), and must
 * itself be Float32; arbitrary sloped interior samples remain unsupported; no nearby
 * inward/outward surrogate can establish new source geometry. */
async function upwardReliefStrips(edges:Edge[],inverse:THREE.Matrix4,terraces:Terraces,pause:()=>Promise<boolean>):Promise<ReliefStrip[]|null>{
 const e=inverse.elements;if(e[0]!==1||e[5]!==1||e[10]!==1||e[15]!==1||[1,2,3,4,6,7,8,9,11].some(i=>e[i]!==0))return[];
 const strips:ReliefStrip[]=[];let work=0;const ledgeWalls=await nativeLedgeCoverage(terraces,inverse,pause);if(!ledgeWalls)return null;
 const at=(segment:Segment,axis:'x'|'z',value:number)=>{const endpoint=value===segment.a.p[axis]?segment.a:value===segment.b.p[axis]?segment.b:undefined;if(endpoint)return{p:endpoint.p.clone(),uv:endpoint.uv.clone(),color:endpoint.color.clone()};if(segment.a.p.y!==segment.b.p.y)return null;const t=(value-segment.a.p[axis])/(segment.b.p[axis]-segment.a.p[axis]),p=segment.a.p.clone().lerp(segment.b.p,t);p[axis]=value;if(p.toArray().some(v=>Math.fround(v)!==v))return null;return{p,uv:segment.a.uv.clone().lerp(segment.b.uv,t),color:segment.a.color.clone().lerp(segment.b.color,t)};};
 for(const edge of edges){if((++work&31)===0&&!await pause())return null;const axis=edge.axis,fixed=axis==='x'?'z':'x',faces=edge.occurrences.map(o=>o.face)as[Face,Face],profiles=faces.map(face=>edge.profiles!.get(face)!),cuts=[...new Set(profiles.flatMap(profile=>profile.flatMap(s=>[s.a.p[axis],s.b.p[axis]])))].sort((a,b)=>a-b),pending:ReliefStrip[]=[];let invalid=false;
  const sample=(profile:Segment[],lo:number,hi:number)=>{const spans=profile.filter(s=>Math.min(s.a.p[axis],s.b.p[axis])<=lo&&Math.max(s.a.p[axis],s.b.p[axis])>=hi),points=spans.map(s=>[at(s,axis,lo),at(s,axis,hi)]);if(!points.length||points.some(row=>row.some(p=>p===null)))return null;const first=points[0]as[Vertex,Vertex];return points.every(row=>row[0]!.p.equals(first[0].p)&&row[1]!.p.equals(first[1].p))?first:null;};
  for(let i=0;i<cuts.length-1;i++){if((++work&31)===0&&!await pause())return null;const a=sample(profiles[0],cuts[i],cuts[i+1]),b=sample(profiles[1],cuts[i],cuts[i+1]);if(!a||!b||[...a,...b].some(p=>p.p[fixed]!==a[0].p[fixed])){invalid=true;break;}const d=a.map((p,j)=>p.p.y-b[j].p.y);if(d[0]*d[1]<0){invalid=true;break;}if(d.every(v=>v===0))continue;const upper=d.some(v=>v>0)?a:b,lower=upper===a?b:a;
   // Opposite native UV/color vertices retain their own interpolation, even
   // when the two authored atlas coordinates differ along this shared edge.
   const vertices=[upper[0],upper[1],lower[1],upper[0],lower[1],lower[0]];for(let j=0;j<vertices.length;j+=3){const tri=vertices.slice(j,j+3);if(new THREE.Triangle(...tri.map(v=>v.p)as[THREE.Vector3,THREE.Vector3,THREE.Vector3]).getArea()>0&&!ledgeWalls.some(w=>w.covers(tri.map(v=>v.p))))pending.push({vertices:tri,material:faces[0].material,faces,rawEdge:[edge.a,edge.b]});}
  }
  if(!invalid)strips.push(...pending);
 }
 return strips;
}

/** World adds terraceWalls after terraceModel. Only an explicit six-height
 * main/corner profile in this exact owning cell can prove that a future native
 * wall wholly covers a proposed join. No BDHC fallback/partial overlap is
 * suppression authority. Coordinates are encoded exactly like terraceWalls. */
async function nativeLedgeCoverage(terraces:Terraces,inverse:THREE.Matrix4,pause:()=>Promise<boolean>){
 const origin=new THREE.Vector3().setFromMatrixPosition(inverse.clone().invert()),walls:{covers:(p:THREE.Vector3[])=>boolean}[]=[];let work=0;
 for(const[edges,profiles,corner]of[[terraces.data.ledges,terraces.data.nativeEdges,false],[terraces.data.cornerEdges??[],terraces.data.nativeCornerEdges,true]]as const)for(const[x,z,b]of edges){if((++work&63)===0&&!await pause())return null;const profile=profiles?.[corner?[x,z,b].join(','):x+','+z];if(!profile||profile.length!==6||!profile.every(Number.isFinite)||Math.floor(x/32)*32+16!==origin.x||Math.floor(z/32)*32+16!==origin.z)continue;const direction=({56:[1,0],57:[-1,0],58:[0,-1],59:[0,1]}as Record<number,number[]>)[b];if(!direction)continue;const[dx,dz]=direction,upper=terraces.points(x,z),lower=terraces.points(x+dx,z+dz),edge=dx===1?{p:[[x+1,z],[x+1,z+.5],[x+1,z+1]],u:[2,5,8],l:[0,3,6]}:dx===-1?{p:[[x,z+1],[x,z+.5],[x,z]],u:[6,3,0],l:[8,5,2]}:dz===1?{p:[[x+1,z+1],[x+.5,z+1],[x,z+1]],u:[8,7,6],l:[2,1,0]}:{p:[[x,z],[x+.5,z],[x+1,z]],u:[0,1,2],l:[6,7,8]};
  for(let part=0;part<2;part++){const a=edge.p[part],c=edge.p[part+1],poly=[[a[0],profile[part]+upper[edge.u[part]],a[1]],[c[0],profile[part+1]+upper[edge.u[part+1]],c[1]],[c[0],profile[part+4]+lower[edge.l[part+1]],c[1]],[a[0],profile[part+3]+lower[edge.l[part]],a[1]]].map(p=>new THREE.Vector3(Math.fround(p[0]-origin.x),Math.fround(p[1]-origin.y),Math.fround(p[2]-origin.z))),axis=dx===0?'x':'z',fixed=axis==='x'?'z':'x',cross=(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3)=>(b[axis]-a[axis])*(c.y-a.y)-(b.y-a.y)*(c[axis]-a[axis]);let sign=0,convex=true;for(let i=0;i<4;i++){const d=cross(poly[i],poly[(i+1)%4],poly[(i+2)%4]);if(d!==0){if(sign&&sign!==Math.sign(d))convex=false;sign=Math.sign(d);}}if(!sign||!convex)continue;walls.push({covers:points=>points.every(p=>p[fixed]===poly[0][fixed]&&poly.every((a,i)=>cross(a,poly[(i+1)%4],p)*sign>=0))});
  }
 }
 return walls;
}
