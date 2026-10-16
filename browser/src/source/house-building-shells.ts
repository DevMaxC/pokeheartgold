import * as THREE from 'three';

/** Source constants/buildmodel.h ordinary residential families. Bank 0 contains
 * unrelated indoor props with the same numbers and must never match. */
export const HOUSE_BUILDING_MODELS=new Set([11,12,20,22,37,38,41,46,47,53,56,81,101,102,109,112,132,134,153,215,216,236,237,238,251,252,253,254,272,276,277,279,280,282,292,297,298,299,313,315,316,335]);
type Door={x:number;z:number;axis?:0|2;sign?:number;passageOnly?:boolean};
type Face={p:THREE.Vector3[];uv:THREE.Vector2[];color:THREE.Color[];material:THREE.MeshBasicMaterial;normal:THREE.Vector3;area:number;repairRoof?:boolean};
export type HouseBuildingShell={panels:number;body:{min:number[];max:number[]};roofSamples:number;asset:string};
const excluded=/kage|shadow|h_in|yuki|snow|flower|hana|tree|plant|light|hikari/i;
function sourceFaces(root:THREE.Object3D){
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),faces:Face[]=[];
 root.traverse(o=>{if(!(o instanceof THREE.Mesh)||o instanceof THREE.InstancedMesh||(o.name.startsWith('3d-')&&o.name!=='3d-rear-facade')||o.name.startsWith('house-')||o.name==='entrance-rear-wall')return;
  const g=o.geometry,p=g.getAttribute('position'),uv=g.getAttribute('uv'),color=g.getAttribute('color'),idx=g.index,mats=Array.isArray(o.material)?o.material:[o.material];
  for(const group of g.groups.length?g.groups:[{start:0,count:idx?.count??p.count,materialIndex:0}]){const material=mats[group.materialIndex??0]as THREE.MeshBasicMaterial;if((excluded.test(material.name)&&!/h_in|light|hikari/i.test(material.name))||material.opacity<.5)continue;
   for(let k=group.start;k<group.start+group.count;k+=3){const ids=[0,1,2].map(j=>idx?idx.getX(k+j):k+j),points=ids.map(i=>o.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(o.matrixWorld).applyMatrix4(inverse)),normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])),area=normal.length()/2;if(area<.001)continue;normal.normalize();const repairRoof=o.name==='3d-rear-facade';if(repairRoof&&normal.y<=.25)continue;faces.push({repairRoof,p:points,uv:ids.map(i=>uv?new THREE.Vector2(uv.getX(i),uv.getY(i)):new THREE.Vector2()),color:ids.map(i=>color?new THREE.Color(color.getX(i),color.getY(i),color.getZ(i)):new THREE.Color(1,1,1)),material,normal,area});}
  }
 });return faces;
}
const cross=(a:THREE.Vector2,b:THREE.Vector2,c:THREE.Vector2)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function clipY(poly:THREE.Vector2[],height:number,sign:number){const out:THREE.Vector2[]=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=(a.y-height)*sign,db=(b.y-height)*sign;if(da>=-1e-7)out.push(a);if(da*db<0)out.push(a.clone().lerp(b,da/(da-db)));}return out;}
function clipX(poly:THREE.Vector2[],value:number,sign:number){const out:THREE.Vector2[]=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=(a.x-value)*sign,db=(b.x-value)*sign;if(da>=-1e-7)out.push(a);if(da*db<0)out.push(a.clone().lerp(b,da/(da-db)));}return out;}
function uvFor(face:Face,tangent:0|2,q:number,y:number){const [a,b,c]=face.p.map(p=>new THREE.Vector2(p.getComponent(tangent),p.y)),den=cross(a,b,c);if(Math.abs(den)<1e-8)return face.uv[0].clone();const wa=((b.y-c.y)*(q-c.x)+(c.x-b.x)*(y-c.y))/den,wb=((c.y-a.y)*(q-c.x)+(a.x-c.x)*(y-c.y))/den;return face.uv[0].clone().multiplyScalar(wa).addScaledVector(face.uv[1],wb).addScaledVector(face.uv[2],1-wa-wb);}
type ProjectedFace={a:number[];b:number[];c:number[];den:number;edges:number[][]};
const projectedFaces=new WeakMap<Face,ProjectedFace>();
function triangleXZDistance(f:Face,x:number,z:number){
 let s=projectedFaces.get(f);if(!s){const p=f.p,a=[p[0].x,p[0].z],b=[p[1].x,p[1].z],c=[p[2].x,p[2].z];s={a,b,c,den:(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]),edges:p.map((a,i)=>{const b=p[(i+1)%3],dx=b.x-a.x,dz=b.z-a.z;return[a.x,a.z,dx,dz,dx*dx+dz*dz];})};projectedFaces.set(f,s);}
 const a=s.a,b=s.b,c=s.c;if(Math.abs(s.den)>1e-7){const u=((b[0]-x)*(c[1]-z)-(b[1]-z)*(c[0]-x))/s.den,w=((b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0]))/s.den;if(u>=-1e-6&&w>=-1e-6&&u+w<=1+1e-6)return 0;}
 let best=Infinity;for(const[ax,az,dx,dz,len2]of s.edges){const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/len2)),px=x-(ax+dx*t),pz=z-(az+dz*t);best=Math.min(best,px*px+pz*pz);}return Math.sqrt(best);
}

/** Complete the three non-entrance walls underneath the actual source roof.
 * The original front, recessed doorway, windows, roof slopes, eaves and their
 * texture atlases remain untouched. New cladding uses each model's side-wall
 * atlas bands; a front door is never reflected onto the back of a house.
 * Invoke once on a placed clone, after closeBuildingBack, never on the shared
 * GLTF template. Ordinary residential source models face local +Z. */
export function closeHouseBuildingShell(root:THREE.Object3D,asset:string,doors:Door[]):HouseBuildingShell|null{
 const match=asset.match(/(?:^|\/)1-(\d+)-\d+\.glb$/);if(!match||!HOUSE_BUILDING_MODELS.has(Number(match[1])))return null;
 const previous=root.userData.houseBuildingShell as HouseBuildingShell|undefined;if(previous)return previous;
 const authored=sourceFaces(root);let faces=authored.filter(f=>!/h_in/i.test(f.material.name)&&(!/mado|window|light|hikari/i.test(f.material.name)||f.normal.y>=.08));if(!faces.length)return null;const all=new THREE.Box3().setFromPoints(faces.flatMap(f=>f.p)),size=all.getSize(new THREE.Vector3()),floor=all.min.y;
 faces=faces.filter(f=>!f.repairRoof||Math.max(...f.p.map(p=>p.y))>floor+size.y*.48);
 // Structural sides begin at the native building base and run along its depth.
 // Window trim, doorway reveals and decorative posts cannot define the body.
 const sides=faces.filter(f=>Math.abs(f.normal.x)>.995&&Math.min(...f.p.map(p=>p.y))<floor+Math.max(.5,size.y*.025)&&Math.max(...f.p.map(p=>p.z))-Math.min(...f.p.map(p=>p.z))>size.z*.2);
 if(sides.length<2)return null;
 const baseBody=new THREE.Box3().setFromPoints(sides.flatMap(f=>f.p)),structuralSides=faces.filter(f=>Math.abs(f.normal.x)>.995&&f.p.every(p=>Math.abs(p.x-baseBody.min.x)<Math.max(.75,size.x*.02)||Math.abs(p.x-baseBody.max.x)<Math.max(.75,size.x*.02)));
 const body=new THREE.Box3().setFromPoints(structuralSides.flatMap(f=>f.p));if(body.max.x-body.min.x<16||body.max.z-body.min.z<12||body.max.y-floor<16)return null;
 // Foundations and corner trim often extend several native units behind the
 // actual wall. A rear cap at that wider base leaves an open slot between wall
 // and roof. Use the long, full-height wall bands for the structural depth.
 const depthWalls=structuralSides.filter(f=>Math.min(...f.p.map(p=>p.y))<floor+(body.max.y-floor)*.25&&Math.max(...f.p.map(p=>p.y))-Math.min(...f.p.map(p=>p.y))>(body.max.y-floor)*.3&&Math.max(...f.p.map(p=>p.z))-Math.min(...f.p.map(p=>p.z))>(body.max.z-body.min.z)*.3);
 if(depthWalls.length>=2){const depth=new THREE.Box3().setFromPoints(depthWalls.flatMap(f=>f.p));if(depth.max.z-depth.min.z>=12){body.min.z=depth.min.z;body.max.z=depth.max.z;}}
 // SK_H03 has one left-wall band vertex eight units behind every matching
 // right-wall and full-height rear endpoint. The paired sides establish its
 // actual extrusion; that stray band corner must not pull the whole rear out.
 if(Number(match[1])===297){const paired=[-1,1].map(sign=>depthWalls.filter(f=>f.normal.x*sign>.995)).map(side=>side.length?new THREE.Box3().setFromPoints(side.flatMap(f=>f.p)):null);if(paired[0]&&paired[1]){body.min.z=Math.max(paired[0].min.z,paired[1].min.z);body.max.z=Math.min(paired[0].max.z,paired[1].max.z);}}

 const inverse=root.matrixWorld.clone().invert(),localDoors=doors.map(d=>({point:new THREE.Vector3(d.x,root.getWorldPosition(new THREE.Vector3()).y,d.z).applyMatrix4(inverse),passageOnly:d.passageOnly})).filter(({point:p})=>p.x>=all.min.x-9.6&&p.x<=all.max.x+9.6&&p.z>=all.min.z-9.6&&p.z<=all.max.z+9.6);
 // Gates and through-houses retain real passages. Their opposite entrance is
 // never closed merely because the model resembles an ordinary house.
 if(localDoors.some(({point:p})=>Math.abs(p.z-body.min.z)<Math.abs(p.z-body.max.z)&&p.x>=body.min.x-8&&p.x<=body.max.x+8))return null;
 const upper=faces.filter(f=>!/mado|window/i.test(f.material.name)&&f.normal.y>(Number(match[1])===134?.5:.25)&&Math.max(...f.p.map(p=>p.y))>floor+size.y*.48),largest=Math.max(0,...upper.map(f=>f.area));
 const roof=upper.filter(f=>f.area>=(Number(match[1])===252||Number(match[1])===253?1:Math.max(12,largest*.08)));if(!roof.length)return null;
 // Some native regional roofs omit an entire rear slope even though a small
 // rear detail defeats the old one-sided-area heuristic. Reflect native front
 // roof artwork only into uncovered XZ regions. Existing roof/window triangles
 // win everywhere they already cover the house, so their art and silhouette
 // remain intact rather than being replaced by a generic roof box.
 const roofZ=roof.flatMap(f=>f.p.map(p=>p.z)),mirror=(Math.min(...roofZ)+Math.max(...roofZ))/2,coverage=faces.filter(f=>!f.repairRoof&&f.normal.y>.25&&Math.max(...f.p.map(p=>p.y))>floor+size.y*.45),infilled:Face[]=[];
 const clipLine=(poly:THREE.Vector2[],a:THREE.Vector2,b:THREE.Vector2,sign:number)=>{const out:THREE.Vector2[]=[];for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],dp=cross(a,b,p)*sign,dq=cross(a,b,q)*sign;if(dp>=-1e-7)out.push(p);if(dp*dq<0)out.push(p.clone().lerp(q,dp/(dp-dq)));}return out;};
 const polygonArea=(poly:THREE.Vector2[])=>Math.abs(poly.reduce((sum,p,i)=>sum+p.x*poly[(i+1)%poly.length].y-p.y*poly[(i+1)%poly.length].x,0))/2;
 const cutTriangle=(poly:THREE.Vector2[],triangle:THREE.Vector2[])=>{const sign=Math.sign(cross(...triangle as [THREE.Vector2,THREE.Vector2,THREE.Vector2]));let inside=poly;const outside:THREE.Vector2[][]=[];for(let edge=0;edge<3&&inside.length>=3;edge++){const a=triangle[edge],b=triangle[(edge+1)%3],part=clipLine(inside,a,b,-sign);if(part.length>=3&&polygonArea(part)>1e-5)outside.push(part);inside=clipLine(inside,a,b,sign);}return outside;};
 const appendUncoveredRoof=(original:Face,points:THREE.Vector3[],uv:THREE.Vector2[],colors:THREE.Color[])=>{
  const projected=points.map(p=>new THREE.Vector2(p.x,p.z)),den=cross(...projected as [THREE.Vector2,THREE.Vector2,THREE.Vector2]);if(Math.abs(den)<1e-5)return;
  let pieces=[projected];for(const covered of coverage){const clip=covered.p.map(p=>new THREE.Vector2(p.x,p.z)),box=new THREE.Box2().setFromPoints(clip);pieces=pieces.flatMap(piece=>new THREE.Box2().setFromPoints(piece).intersectsBox(box)?cutTriangle(piece,clip):[piece]);if(!pieces.length)break;}
  for(const piece of pieces)for(let i=1;i<piece.length-1;i++){const p2=[piece[0],piece[i],piece[i+1]],attrs=p2.map(p=>{const wa=cross(p,projected[1],projected[2])/den,wc=cross(projected[0],projected[1],p)/den,wb=1-wa-wc;return{point:new THREE.Vector3(p.x,points[0].y*wa+points[1].y*wb+points[2].y*wc,p.y),uv:uv[0].clone().multiplyScalar(wa).addScaledVector(uv[1],wb).addScaledVector(uv[2],wc),color:colors[0].clone().multiplyScalar(wa).add(colors[1].clone().multiplyScalar(wb)).add(colors[2].clone().multiplyScalar(wc))};}),normal=attrs[1].point.clone().sub(attrs[0].point).cross(attrs[2].point.clone().sub(attrs[0].point));if(normal.y<0)attrs.reverse();const area=normal.length()/2;if(area<1e-5||[215,216].includes(Number(match[1]))&&attrs.every(a=>a.point.y<body.max.y-.5))continue;const generated={p:attrs.map(a=>a.point),uv:attrs.map(a=>a.uv),color:attrs.map(a=>a.color),normal:normal.normalize().multiplyScalar(normal.y<0?-1:1),material:original.material,area,repairRoof:true};infilled.push(generated);coverage.push(generated);}
 };
 // Legacy mirrored roof sheets can overlap real front slopes. They are
 // useful only in native uncovered regions; source paint always wins.
 const legacyRoofs=roof.filter(f=>f.repairRoof&&(![215,216].includes(Number(match[1]))||Math.max(...f.p.map(p=>p.y))>=body.max.y-.5)),nativeRoof=roof.filter(f=>!f.repairRoof);faces=faces.filter(f=>!f.repairRoof);roof.splice(0,roof.length,...nativeRoof);
 for(const original of legacyRoofs)appendUncoveredRoof(original,original.p,original.uv,original.color);
 for(const original of nativeRoof.filter(f=>f.normal.z>.15)){const order=[0,2,1],points=order.map(i=>{const p=original.p[i].clone();p.z=mirror*2-p.z;return p;});appendUncoveredRoof(original,points,order.map(i=>original.uv[i]),order.map(i=>original.color[i]));}
 if(Number(match[1])===134)for(const original of nativeRoof.filter(f=>f.normal.y>.7&&f.normal.y<.85&&Math.abs(f.normal.z)<.02)){const order=[0,2,1],points=order.map(i=>{const p=original.p[i].clone();p.x=-p.x;return p;});appendUncoveredRoof(original,points,order.map(i=>original.uv[i]),order.map(i=>original.color[i]));}
 faces.push(...infilled);roof.push(...infilled);
 // CH_H01's main red roof ends at X=±3 while its separate ornamental crest
 // stops short of both eaves. Continue those two real roof planes to the
 // center underneath the crest, closing the native ridge-end daylight slots.
 if(Number(match[1])===134){const joins:Face[]=[];for(const f of roof.filter(f=>f.normal.y>.7&&f.normal.y<.8&&Math.abs(f.normal.z)<.02))for(let i=0;i<3;i++){const j=(i+1)%3,a=f.p[i],b=f.p[j];if(Math.abs(a.x-b.x)>.001||Math.abs(Math.abs(a.x)-3)>.01||Math.abs(a.z-b.z)<.01)continue;const project=(p:THREE.Vector3)=>new THREE.Vector3(0,p.y+f.normal.x*p.x/f.normal.y,p.z),c=project(b),d=project(a);for(const[points,uv]of [[[a,b,c],[f.uv[i],f.uv[j],f.uv[j]]],[[a,c,d],[f.uv[i],f.uv[j],f.uv[i]]]]as [THREE.Vector3[],THREE.Vector2[]][]){const normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])),area=normal.length()/2;if(normal.y<0){points.reverse();uv.reverse();normal.negate();}joins.push({p:points,uv,color:points.map(()=>f.color[0].clone()),normal:normal.normalize(),area,material:f.material,repairRoof:true});}}faces.push(...joins);roof.push(...joins);}

 // CH_H01's rear roof end is omitted in the DS viewing direction. Its
 // inclined front gable, including the dark recessed vent, provides the exact
 // matching rear artwork around the authored Z=-2 roof center. Keep it out of
 // the horizontal roof envelope: it is an end wall, not a rising roof slope.
 if(Number(match[1])===134){for(const f of authored.filter(f=>!f.repairRoof&&f.p.every(p=>p.z>=12)&&Math.min(...f.p.map(p=>p.y))>=38.99&&Math.max(...f.p.map(p=>p.y))<=65.1)){const order=[0,2,1],p=order.map(i=>{const q=f.p[i].clone();q.z=-4-q.z;return q;}),normal=p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0])).normalize();faces.push({...f,p,uv:order.map(i=>f.uv[i]),color:order.map(i=>f.color[i]),normal,repairRoof:true});}
  const rim=authored.find(f=>f.normal.z>.7&&f.p.some(p=>Math.abs(p.y-39)<.01)&&f.p.some(p=>Math.abs(p.x-34)<.01))!;
  const p=[new THREE.Vector3(-34,39,-28),new THREE.Vector3(34,39,-28),new THREE.Vector3(34,39,body.min.z+.1),new THREE.Vector3(-34,39,body.min.z+.1)];for(const ids of [[0,2,1],[0,3,2]]){const points=ids.map(i=>p[i]);faces.push({p:points,uv:points.map(p=>uvFor(rim,0,p.x,39)),color:points.map(()=>rim.color[0].clone()),material:rim.material,normal:new THREE.Vector3(0,-1,0),area:new THREE.Triangle(...points as [THREE.Vector3,THREE.Vector3,THREE.Vector3]).getArea(),repairRoof:true});}
 }
 // Join a rear eave that stops just short of the real wall (several source
 // families have a one-pixel separation). Continue that actual roof plane to
 // the wall, repeating its painted edge texels rather than stretching a wall
 // upwards through the roof or moving the complete building backwards.
 const edgeMap=new Map<string,{a:THREE.Vector3;b:THREE.Vector3;u:THREE.Vector2;v:THREE.Vector2;face:Face;count:number}>();
 for(const face of roof)for(let i=0;i<3;i++){const j=(i+1)%3,a=face.p[i],b=face.p[j],key=[a,b].map(p=>p.toArray().map(v=>v.toFixed(3)).join(',')).sort().join('|'),old=edgeMap.get(key);if(old)old.count++;else edgeMap.set(key,{a,b,u:face.uv[i],v:face.uv[j],face,count:1});}
 const bridges:Face[]=[],regionalRear=Number(match[1])===297||Number(match[1])===298,rearEave=Math.min(...roof.flatMap(f=>f.p.map(p=>p.z)));
 for(const edge of edgeMap.values()){
  const{a,b,u,v,face}=edge;if(edge.count!==1||Math.abs(a.x-b.x)<.1)continue;
  // The SK_H02/H03 roofs retain their native front porch and different
  // ridge profiles, but their main roof sheets stop before the rear wall.
  // Continue each existing main roof plane to its authored outer rear eave.
  // This gives them a proper gable back without borrowing the porch/door.
  const continueRear=regionalRear&&!face.repairRoof&&Math.abs(face.normal.z)<.02&&Math.max(a.z,b.z)<body.getCenter(new THREE.Vector3()).z-(body.max.z-body.min.z)*.15&&Math.max(a.z,b.z)>rearEave+.02;
  if(!continueRear&&(Math.min(a.z,b.z)<body.min.z-.02||Math.max(a.z,b.z)>body.min.z+2||Math.max(a.z,b.z)<body.min.z+.02))continue;
  const z=Math.max(all.min.z,continueRear?rearEave:body.min.z-.1),project=(p:THREE.Vector3)=>new THREE.Vector3(p.x,p.y-face.normal.z*(z-p.z)/face.normal.y,z),c=project(b),d=project(a);
  for(const [points,uv]of [[[a,b,c],[u,v,v]],[[a,c,d],[u,v,u]]]as [THREE.Vector3[],THREE.Vector2[]][]){const normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])),area=normal.length()/2;if(area<1e-5)continue;if(normal.y<0){points.reverse();uv.reverse();normal.negate();}bridges.push({p:points,uv,color:points.map(()=>face.color[0].clone()),normal:normal.normalize(),area,material:face.material,repairRoof:true});}
 }
 faces.push(...bridges);roof.push(...bridges);


 // Mirrored curved roof patches can meet a native edge in XZ while their
 // heights differ. Join those literal overlapping edges vertically instead
 // of flattening the native roof or spreading an unrelated triangle over it.
 if([132,299].includes(Number(match[1]))){const seams:Face[]=[],seen=new Set<string>(),native=upper.filter(f=>!f.repairRoof);for(const fill of roof.filter(f=>f.repairRoof))for(let ge=0;ge<3;ge++){const a=fill.p[ge],b=fill.p[(ge+1)%3],gx=b.x-a.x,gz=b.z-a.z,gl=gx*gx+gz*gz;if(gl<1e-8)continue;for(const original of native)for(let ne=0;ne<3;ne++){const c=original.p[ne],d=original.p[(ne+1)%3],dx=d.x-c.x,dz=d.z-c.z,len=dx*dx+dz*dz;if(len<1e-8)continue;const distance=(p:THREE.Vector3)=>Math.abs(dx*(p.z-c.z)-dz*(p.x-c.x))/Math.sqrt(len);if(distance(a)>.001||distance(b)>.001)continue;const ta=((a.x-c.x)*dx+(a.z-c.z)*dz)/len,tb=((b.x-c.x)*dx+(b.z-c.z)*dz)/len,left=Math.max(0,Math.min(ta,tb)),right=Math.min(1,Math.max(ta,tb));if(right-left<1e-6)continue;
   const point=(t:number)=>{const top=c.clone().lerp(d,t),u=((top.x-a.x)*gx+(top.z-a.z)*gz)/gl,bottom=new THREE.Vector3(top.x,a.y+(b.y-a.y)*u,top.z),uv=original.uv[ne].clone().lerp(original.uv[(ne+1)%3],t),color=original.color[ne].clone().lerp(original.color[(ne+1)%3],t);return{top,bottom,uv,color};},l=point(left),r=point(right),dl=l.top.y-l.bottom.y,dr=r.top.y-r.bottom.y;if(Math.max(Math.abs(dl),Math.abs(dr))<.005)continue;
   const ranges=dl*dr<0?[left,left+(right-left)*dl/(dl-dr),right]:[left,right];for(let segment=1;segment<ranges.length;segment++){const l=point(ranges[segment-1]),r=point(ranges[segment]),key=[l.top,l.bottom,r.top,r.bottom].map(p=>p.toArray().map(v=>v.toFixed(4)).join(',')).sort().join('|');if(seen.has(key))continue;seen.add(key);for(const ids of [[0,1,2],[0,2,3]]){const points=ids.map(i=>[l.top,r.top,r.bottom,l.bottom][i]),normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])),area=normal.length()/2;if(area<1e-5)continue;seams.push({p:points,uv:ids.map(i=>(i===0||i===3?l:r).uv),color:ids.map(i=>(i===0||i===3?l:r).color),normal:normal.normalize(),area,material:original.material,repairRoof:true});}}
  }}faces.push(...seams);}
 // HW_H01's curled eaves widen outwards as they rise. The reflected inner
 // slope ends at the curl's lower X, so matching only projected XZ edges
 // misses the narrow open strip beside that downturn. Join the two literal
 // boundaries at matching Z values, repeating the authored curl-edge paint.
 if(Number(match[1])===46){const joins:Face[]=[],seen=new Set<string>();for(const native of authored.filter(f=>!f.repairRoof&&f.material.name==='hw_h01_a_lm8'&&f.normal.y<-.08&&Math.abs(f.normal.x)>.9))for(let i=0;i<3;i++){const j=(i+1)%3,a=native.p[i],b=native.p[j];if(Math.abs(a.z-b.z)<1||Math.abs(a.x-b.x)<.5||Math.min(a.y,b.y)<60)continue;const base=Math.abs(a.x)<Math.abs(b.x)?a:b;for(const edge of edgeMap.values()){if(edge.count!==1||!edge.face.repairRoof||Math.abs(edge.a.x-base.x)>.001||Math.abs(edge.b.x-base.x)>.001||Math.abs(edge.a.z-edge.b.z)<.01)continue;const low=Math.max(Math.min(a.z,b.z),Math.min(edge.a.z,edge.b.z)),high=Math.min(Math.max(a.z,b.z),Math.max(edge.a.z,edge.b.z));if(high-low<.001)continue;
   const at=(z:number)=>{const t=(z-a.z)/(b.z-a.z),u=(z-edge.a.z)/(edge.b.z-edge.a.z);return{native:a.clone().lerp(b,t),fill:edge.a.clone().lerp(edge.b,u),uv:native.uv[i].clone().lerp(native.uv[j],t),color:native.color[i].clone().lerp(native.color[j],t)};},l=at(low),r=at(high),key=[l.native,r.native,l.fill,r.fill].map(p=>p.toArray().map(v=>v.toFixed(4)).join(',')).sort().join('|');if(seen.has(key))continue;seen.add(key);for(const ids of [[0,1,2],[0,2,3]]){const points=ids.map(k=>[l.fill,r.fill,r.native,l.native][k]),normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])),area=normal.length()/2;if(area<1e-5)continue;joins.push({p:points,uv:ids.map(k=>(k===0||k===3?l:r).uv),color:ids.map(k=>(k===0||k===3?l:r).color),normal:normal.normalize(),area,material:native.material,repairRoof:true});}
  }}faces.push(...joins);}
 const bodyRoof=[238,299].includes(Number(match[1]))?[...roof,...upper.filter(f=>!f.repairRoof)]:roof;let roofSamples=0;const roofHeights=new Map<string,number>();
 const roofHeight=(x:number,z:number,lowest=false,smallStructuralFaces=false)=>{const key=(smallStructuralFaces?'body:':'')+(lowest?'low:':'high:')+x.toFixed(4)+','+z.toFixed(4),cached=roofHeights.get(key);if(cached!==undefined)return cached;roofSamples++;let closest=Infinity,candidates:Face[]=[];for(const f of lowest||smallStructuralFaces?bodyRoof:roof){const d=triangleXZDistance(f,x,z);if(d<closest-.001){closest=d;candidates=[f];}else if(Math.abs(d-closest)<.001)candidates.push(f);}const result=(lowest?Math.min:Math.max)(...candidates.map(f=>{const a=f.p[0];return a.y-(f.normal.x*(x-a.x)+f.normal.z*(z-a.z))/f.normal.y;}));roofHeights.set(key,result);return result;};
 const group=new THREE.Group();group.name='house-closed-exterior';let panels=0;const batches=new Map<string,{name:string;material:THREE.Material;p:number[];uv:number[];color:number[]}>();const emit=(name:string,material:THREE.Material,p:number[],uv:number[],color:number[])=>{const key=name+':'+material.uuid;let batch=batches.get(key);if(!batch){batch={name,material,p:[],uv:[],color:[]};batches.set(key,batch);}batch.p.push(...p);batch.uv.push(...uv);batch.color.push(...color);panels++;};const liningMaterials=new Map<THREE.MeshBasicMaterial,THREE.MeshBasicMaterial>();const sideMaterials=new Map<THREE.MeshBasicMaterial,THREE.MeshBasicMaterial>();const opaqueMaterials=new Map<THREE.MeshBasicMaterial,THREE.MeshBasicMaterial>();
 const opaque=(source:THREE.MeshBasicMaterial)=>{let material=opaqueMaterials.get(source);if(!material){material=source.clone();material.side=THREE.DoubleSide;material.transparent=false;material.opacity=1;material.alphaTest=0;material.vertexColors=true;opaqueMaterials.set(source,material);}return material;};
 // The defensive inner wall sits close to the painted outer siding. Bias
 // only this hidden layer in depth, so distant perspective precision cannot
 // make the two complete surfaces alternate between pixels.
 const liningMaterial=(source:THREE.MeshBasicMaterial)=>{let m=liningMaterials.get(source);if(!m){m=opaque(source).clone();m.polygonOffset=true;m.polygonOffsetFactor=1;m.polygonOffsetUnits=4;liningMaterials.set(source,m);}return m;};
 const sideMaterial=(source:THREE.MeshBasicMaterial)=>{let m=sideMaterials.get(source);if(!m){m=opaque(source).clone();m.polygonOffset=true;m.polygonOffsetFactor=1;m.polygonOffsetUnits=2;sideMaterials.set(source,m);}return m;};
 // Generic source repair already reconstructs omitted rear roof slopes by
 // reflecting their actual authored triangles. Keep those roof triangles, but
 // discard its reflected vertical facade (which duplicates the front door).
 for(const face of faces.filter(f=>f.repairRoof))emit('house-preserved-native-roof',opaque(face.material),face.p.flatMap(p=>p.toArray()),face.uv.flatMap(p=>p.toArray()),face.color.flatMap(p=>p.toArray()));
 // Give roof sheets a thin lining beneath the painted surface. Native DS
 // roof halves can miss by fractions of a pixel at their shared edge; a small
 // hidden underlap supplies physical thickness without changing the roof art.
 // Keep it within the source bounds, including along the outer eaves.
 for(const face of roof){const center=face.p.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).multiplyScalar(1/3),top=face.p.map(p=>{const delta=new THREE.Vector2(p.x-center.x,p.z-center.z);if(delta.lengthSq())delta.normalize().multiplyScalar(.001);let x=THREE.MathUtils.clamp(p.x+delta.x,all.min.x,all.max.x),z=THREE.MathUtils.clamp(p.z+delta.y,all.min.z,all.max.z);if(!roof.some(f=>triangleXZDistance(f,x,z)<1e-5)){x=p.x;z=p.z;}const a=face.p[0],y=a.y-(face.normal.x*(x-a.x)+face.normal.z*(z-a.z))/face.normal.y-.08;return new THREE.Vector3(x,y,z);}),bottom=top.map(p=>p.clone().add(new THREE.Vector3(0,-.24,0))),positions:number[]=[],uv:number[]=[],colors:number[]=[];
  const append=(vertices:THREE.Vector3[],ids:number[])=>{for(let i=0;i<3;i++){positions.push(...vertices[i].toArray());uv.push(...face.uv[ids[i]].toArray());colors.push(...face.color[ids[i]].toArray());}};append(top,[0,1,2]);append([bottom[0],bottom[2],bottom[1]],[0,2,1]);for(let i=0;i<3;i++){const j=(i+1)%3;append([top[i],bottom[i],bottom[j]],[i,i,j]);append([top[i],bottom[j],top[j]],[i,j,j]);}
  emit('house-roof-lining',opaque(face.material),positions,uv,colors);
 }
 const addPanel=(axis:0|2,at:number,low:number,high:number,source:Face[],base=floor,name?:string,apertures:{left:number;right:number;top:number;bottom?:number}[]=[],continuous=false)=>{
  const upperRear=axis===2&&at<body.getCenter(new THREE.Vector3()).z&&[20,102,237,238].includes(Number(match[1])),upperFront=Number(match[1])===20&&name==='house-front-interior-closure',upperPost=[153,335].includes(Number(match[1]))&&name?.startsWith('house-post-'),profileRoof=Number(match[1])===238?bodyRoof:roof;
  const tangent:0|2=axis===0?2:0,intersections:number[]=[],sections:[number,number][]=[];for(const face of profileRoof)for(let i=0;i<3;i++){const a=face.p[i],b=face.p[(i+1)%3],da=a.getComponent(axis)-at,db=b.getComponent(axis)-at;if(da*db<0)intersections.push(a.getComponent(tangent)+(b.getComponent(tangent)-a.getComponent(tangent))*da/(da-db));if(Math.abs(da)<1e-7)intersections.push(a.getComponent(tangent));}
  // The upper envelope changes at crossings as well as at triangle ends.
  // Without those literal plane crossings a straight chord can poke through
  // the lower part of an overlapping dormer/main roof (WK_HHOUSE's front).
  if(upperRear||upperFront){const spans=profileRoof.flatMap(f=>{const points:THREE.Vector3[]=[];for(let i=0;i<3;i++){const a=f.p[i],b=f.p[(i+1)%3],da=a.getComponent(axis)-at,db=b.getComponent(axis)-at;if(Math.abs(da)<1e-7)points.push(a);if(da*db<0)points.push(a.clone().lerp(b,da/(da-db)));}points.sort((a,b)=>a.getComponent(tangent)-b.getComponent(tangent));if(points.length<2)return[];const a=points[0],b=points[points.length-1],lo=a.getComponent(tangent),hi=b.getComponent(tangent);if(hi-lo<1e-7)return[];const slope=(b.y-a.y)/(hi-lo);return[{lo,hi,slope,offset:a.y-slope*lo}];});for(let i=0;i<spans.length;i++)for(let j=i+1;j<spans.length;j++){const a=spans[i],b=spans[j],left=Math.max(low,a.lo,b.lo),right=Math.min(high,a.hi,b.hi),delta=a.slope-b.slope;if(right-left<1e-7||Math.abs(delta)<1e-8)continue;const q=(b.offset-a.offset)/delta;if(q>left+1e-6&&q<right-1e-6)intersections.push(q);}}
  if(Number(match[1])===132)for(const f of roof){const qs:number[]=[];for(let i=0;i<3;i++){const a=f.p[i],b=f.p[(i+1)%3],da=a.getComponent(axis)-at,db=b.getComponent(axis)-at;if(Math.abs(da)<1e-7)qs.push(a.getComponent(tangent));if(da*db<0)qs.push(a.getComponent(tangent)+(b.getComponent(tangent)-a.getComponent(tangent))*da/(da-db));}if(qs.length>=2)sections.push([Math.min(...qs),Math.max(...qs)]);}
  let covered=low;for(const[a,b]of sections.sort((a,b)=>a[0]-b[0]))if(a<=covered+1e-6)covered=Math.max(covered,b);
  // The curved FU roof has no height crossings between overlapping wall-plane
  // sections. When these sections cover the wall completely, only their real
  // endpoints can change the profile; vertices at other depths are redundant.
  const knots=Number(match[1])===132&&covered>=high-1e-6?intersections:[...profileRoof.flatMap(f=>f.p.map(p=>p.getComponent(tangent))),...intersections];
  // Their lower dormer/ornamental roof crosses the same projection as a real
  // enclosed upper loft. Its missing rear must meet the main roof, rather
  // than stopping at that lower decorative plane and opening the whole attic.
  const breaks=[low,high,...knots].filter(v=>v>=low&&v<=high).sort((a,b)=>a-b),xs=breaks.filter((v,i)=>!i||v-breaks[i-1]>.001),profile=xs.map(q=>{const y=roofHeight(axis===0?at:q,axis===2?at:q,Number(match[1])!==313&&!upperRear&&!upperFront&&!upperPost,Number(match[1])===238);return new THREE.Vector2(q,Number(match[1])===134&&axis===2&&at<body.getCenter(new THREE.Vector3()).z?Math.min(y,39):y);}),strips=profile.slice(1).map((p,i)=>clipY([new THREE.Vector2(profile[i].x,floor),new THREE.Vector2(p.x,floor),p,profile[i]],base,1)).filter(p=>p.length>=3),highest=Math.max(...profile.map(p=>p.y));
  if(!strips.length)return;
  const sideWindows=axis===0?authored.filter(f=>/mado|window|light|hikari/i.test(f.material.name)&&Math.abs(f.normal.x)>.9).map(f=>new THREE.Box3().setFromPoints(f.p).expandByScalar(5)):[];
  // Each monotone strip is convex. Clipping a whole multi-peaked profile as
  // one polygon can connect disconnected upper bands and leave wall holes.
  const bands=[base,...(continuous?[]:source.flatMap(f=>f.p.map(p=>p.y)).filter(y=>y>base+.001&&y<highest-.001)),highest].sort((a,b)=>a-b).filter((y,i,a)=>!i||y-a[i-1]>.001);
  for(let band=0;band<bands.length-1;band++){const bottom=bands[band],top=bands[band+1],mid=(bottom+top)/2,eligible=source.filter(f=>Math.min(...f.p.map(p=>p.y))<=mid&&Math.max(...f.p.map(p=>p.y))>=mid),chosen=(eligible.length?eligible:source).reduce((best,f)=>f.area>best.area?f:best),sourceTangent:0|2=Math.abs(chosen.normal.x)>.995?2:0,sourceLow=Math.min(...chosen.p.map(p=>p.getComponent(sourceTangent))),sourceHigh=Math.max(...chosen.p.map(p=>p.getComponent(sourceTangent))),sourceBottom=Math.min(...chosen.p.map(p=>p.y)),sourceTop=Math.max(...chosen.p.map(p=>p.y));
   let pieces=strips.map(p=>clipY(clipY(p,bottom,1),top,-1)).filter(p=>p.length>=3);if(!pieces.length)continue;for(const opening of apertures)pieces=pieces.flatMap(p=>[clipX(p,opening.left,-1),clipX(p,opening.right,1),clipY(clipX(clipX(p,opening.left,1),opening.right,-1),opening.top,1),...(opening.bottom===undefined?[]:[clipY(clipX(clipX(p,opening.left,1),opening.right,-1),opening.bottom,-1)])].filter(p=>p.length>=3));
   // Preserve authored vertical facade artwork, including deeper stepped
   // planes. A solid fill belongs only in the missing geometry around it.
   if(axis===0&&name!=='house-post-side-closure'||name==='house-front-interior-closure'||axis===2&&name===undefined){for(const native of authored.filter(f=>!f.repairRoof&&!/h_in/i.test(f.material.name)&&Math.abs(f.normal.getComponent(axis))>.25&&!(axis===0&&f.p.every(p=>(p.x-at)*(at<body.getCenter(new THREE.Vector3()).x?-1:1)>.001))&&!(name==='house-front-interior-closure'&&f.p.every(p=>p.z>at+.001))&&(axis!==0||Math.abs(f.normal.x)>.995||sideWindows.some(box=>box.intersectsBox(new THREE.Box3().setFromPoints(f.p))))&&f.p.some(p=>Math.abs(p.getComponent(axis)-at)<16)&&(name!==undefined||Math.min(...f.p.map(p=>p.y))>floor+(body.max.y-floor)*.65&&Math.abs(f.normal.z)>.995&&f.p.every(p=>Math.abs(p.z-at)<.1)))){const triangle=native.p.map(p=>new THREE.Vector2(p.getComponent(tangent),p.y));if(polygonArea(triangle)<1e-5)continue;const box=new THREE.Box2().setFromPoints(triangle);pieces=pieces.flatMap(p=>new THREE.Box2().setFromPoints(p).intersectsBox(box)?cutTriangle(p,triangle):[p]);if(!pieces.length)break;}}
   const positions:number[]=[],uv:number[]=[],colors:number[]=[];
   for(const piece of pieces)for(const tri of THREE.ShapeUtils.triangulateShape(piece,[]))for(const i of tri){const p=piece[i],v=new THREE.Vector3();v.setComponent(axis,at);v.setComponent(tangent,p.x);v.y=p.y;positions.push(...v.toArray());const q=sourceLow+(p.x-low)/(high-low)*(sourceHigh-sourceLow);uv.push(...uvFor(chosen,sourceTangent,q,THREE.MathUtils.clamp(p.y,sourceBottom,sourceTop)).toArray());colors.push(...chosen.color[0].toArray());}
   if(!positions.length)continue;emit(name??(axis===2?'house-rear-cladding':'house-side-closure'),name==='house-wall-lining'?liningMaterial(chosen.material):axis===0?sideMaterial(chosen.material):opaque(chosen.material),positions,uv,colors);
  }
 };
 // A small inward bias leaves all original side artwork visible and eliminates
 // coplanar stripes; only previously missing side/roof joints expose the fill.
 const fullSides=faces.filter(f=>!f.repairRoof&&Math.abs(f.normal.x)>.995&&f.area>12&&f.p.every(p=>Math.abs(p.x-body.min.x)<Math.max(.75,size.x*.02)||Math.abs(p.x-body.max.x)<Math.max(.75,size.x*.02)));
 const sideSource=fullSides.length?fullSides:sides;
 // Some interiors end their dark door-recess backplate exactly on the native
 // rear wall plane (NBC_H01). Put siding just outside that coplanar interior
 // card, otherwise its reverse remains visible as a fake rear doorway.
 const rearShadow=authored.some(f=>/h_in/i.test(f.material.name)&&f.normal.z>.995&&f.p.every(p=>Math.abs(p.z-body.min.z)<.05)),rearAt=body.min.z+(rearShadow?-.025:.01);
 if(Number(match[1])===112){
  // R39_MOUMOU is two attached buildings, not one material family. Preserve
  // the log cabin's striped wooden side atlas on its own rear, and the lower
  // dairy wing's native plank facade on the other side of their authored join.
  const cabin=faces.filter(f=>/wak_h01_a_lm7/.test(f.material.name)&&Math.abs(f.normal.x)>.995&&f.area>12),joint=Math.min(...cabin.flatMap(f=>f.p.map(p=>p.x))),dairy=faces.filter(f=>/wak_h01_a_lm8/.test(f.material.name)&&f.normal.z>.995&&f.p.every(p=>p.x<=joint+.3&&Math.abs(p.z-11.74609375)<.02)&&Math.max(...f.p.map(p=>p.y))<47);
  if(cabin.length&&dairy.length&&joint>body.min.x&&joint<body.max.x){addPanel(2,rearAt,body.min.x,joint,dairy);addPanel(2,rearAt,joint,body.max.x,cabin);}else addPanel(2,rearAt,body.min.x,body.max.x,sideSource);
 }else addPanel(2,rearAt,body.min.x,body.max.x,sideSource);
 // A continuous inner lining closes exact atlas-band edge rays without
 // changing the visible cladding or sealing the real front entry corridor.
 addPanel(2,body.min.z+(rearShadow?-.01:.035),body.min.x,body.max.x,sideSource,floor,'house-wall-lining',[],true);

 // Dormers can have their own omitted rear faces. Fill only the vertical
 // difference between the two roof sections, never an entire wall through the
 // roof. The upper roof's own atlas patch supplies this small roof end panel.
 const roofXs=[...new Set([body.min.x,body.max.x,...roof.flatMap(f=>f.p.map(p=>p.x)).filter(x=>x>body.min.x&&x<body.max.x)])].sort((a,b)=>a-b),probeXs=roofXs.flatMap((x,i)=>i?[x,(x+roofXs[i-1])/2]:[x]);
 // A smooth curved roof has many vertex rows, but they are not dormer ends.
 // Only a free, horizontal-in-X roof boundary can create the Z discontinuity
 // this closure handles. Shared interior edges need no repeated profile scan.
 const detailEdges=new Map<string,{a:THREE.Vector3;b:THREE.Vector3;count:number}>();for(const f of roof)for(let i=0;i<3;i++){const a=f.p[i],b=f.p[(i+1)%3],key=[a,b].map(p=>p.toArray().map(v=>v.toFixed(3)).join(',')).sort().join('|'),entry=detailEdges.get(key);if(entry)entry.count++;else detailEdges.set(key,{a,b,count:1});}
 const detailRows=[...new Set([...detailEdges.values()].filter(e=>e.count===1&&Math.abs(e.a.z-e.b.z)<.001&&Math.abs(e.a.x-e.b.x)>.01).map(e=>Math.round(e.a.z*1000)/1000))];
 const pairedRidge=[153,335].includes(Number(match[1])),frontRidge=Number(match[1])===335?11:3,rearRidge=mirror*2-frontRidge;
 for(const z of detailRows)if(z>body.min.z+.1&&z<body.max.z-.1){
  if(pairedRidge&&Math.abs(z-rearRidge)<.01)continue;
  if(!probeXs.some(x=>Math.abs(roofHeight(x,z+.02)-roofHeight(x,z-.02))>.5))continue;
  const cuts=[...roofXs];for(const f of roof)for(let e=0;e<3;e++){const a=f.p[e],b=f.p[(e+1)%3];for(const at of [z-.02,z+.02])if((a.z-at)*(b.z-at)<0)cuts.push(a.x+(b.x-a.x)*(at-a.z)/(b.z-a.z));}
  const xs=[...new Set(cuts.filter(x=>x>=body.min.x&&x<=body.max.x))].sort((a,b)=>a-b);
  for(let i=1;i<xs.length;i++){const left=xs[i-1],right=xs[i],middle=(left+right)/2,delta=roofHeight(middle,z+.02)-roofHeight(middle,z-.02);if(Math.abs(delta)<.5)continue;const sign=Math.sign(delta),inside=z+sign*.02,outside=z-sign*.02,at=z+sign*.005,high=[roofHeight(left,inside)+.01,roofHeight(right,inside)+.01],low=[roofHeight(left,outside)-.01,roofHeight(right,outside)-.01];if(high.some((y,j)=>y<low[j]))continue;
   // Raised skylight ribs and roof ornaments can sit above an already closed
   // roof. Their exposed air is intentional; do not wrap it in new colored
   // ribbons. Only a true discontinuity in the structural roof needs an end.
   const below=(at:number)=>roof.filter(f=>triangleXZDistance(f,middle,at)<.001).map(f=>f.p[0].y-(f.normal.x*(middle-f.p[0].x)+f.normal.z*(at-f.p[0].z))/f.normal.y),insideBelow=below(inside),outsideBelow=below(outside);if(insideBelow.some(y=>y<Math.min(...high)-.25&&outsideBelow.some(other=>Math.abs(other-y)<.1)))continue;
   const candidates=roof.filter(f=>triangleXZDistance(f,middle,inside)<.001),source=(candidates.length?candidates:roof).reduce((best,f)=>{const height=(face:Face)=>face.p[0].y-(face.normal.x*(middle-face.p[0].x)+face.normal.z*(inside-face.p[0].z))/face.normal.y;return height(f)>height(best)?f:best;}),edgeSample=(x:number)=>{const p=source.p[0],y=p.y-(source.normal.x*(x-p.x)+source.normal.z*(inside-p.z))/source.normal.y,nearest=new THREE.Triangle(...source.p as [THREE.Vector3,THREE.Vector3,THREE.Vector3]).closestPointToPoint(new THREE.Vector3(x,y,inside),new THREE.Vector3()),weights=THREE.Triangle.getBarycoord(nearest,...source.p as [THREE.Vector3,THREE.Vector3,THREE.Vector3],new THREE.Vector3())!;return{uv:source.uv[0].clone().multiplyScalar(weights.x).addScaledVector(source.uv[1],weights.y).addScaledVector(source.uv[2],weights.z),color:source.color[0].clone().multiplyScalar(weights.x).add(source.color[1].clone().multiplyScalar(weights.y)).add(source.color[2].clone().multiplyScalar(weights.z))};},edgeSamples=[edgeSample(left),edgeSample(right)],positions:number[]=[],uv:number[]=[],colors:number[]=[];
   // Extrude the painted roof-edge texels down this local end. A triangle's
   // rectangular UV bounds can include unrelated window/wall atlas art.
   for(const [x,y,index]of [[left,low[0],0],[right,low[1],1],[right,high[1],1],[left,low[0],0],[right,high[1],1],[left,high[0],0]]){positions.push(x,y,at);uv.push(...edgeSamples[index].uv.toArray());colors.push(...edgeSamples[index].color.toArray());}
   emit('house-roof-detail-closure',opaque(source.material),positions,uv,colors);
  }
 }
 // The shared AR_STUDY/SINTO roof has a raised rectangular ridge. Its
 // horizontal roof-edge texels are pale, while the actual vertical fascia is
 // blue/brown. Reuse that measured fascia at the rear instead of projecting
 // the unrelated top paint down its four-unit end face.
 if(pairedRidge)for(const face of authored.filter(f=>!f.repairRoof&&f.normal.z>.995&&f.p.every(p=>Math.abs(p.z-frontRidge)<.01&&p.y>=47.99&&p.y<=52.01))){const order=[0,2,1],points=order.map(i=>new THREE.Vector3(face.p[i].x,face.p[i].y,rearRidge+.001));emit('house-rear-ridge-fascia',opaque(face.material),points.flatMap(p=>p.toArray()),order.flatMap(i=>face.uv[i].toArray()),order.flatMap(i=>face.color[i].toArray()));}
 for(const sign of [-1,1]){const source=sideSource.filter(f=>f.normal.x*sign>0),wall=source.length?source:sideSource,dominant=wall.reduce((best,f)=>f.area>best.area?f:best),at=dominant.p[0].x-sign*.02,windows=authored.filter(f=>/mado|window/i.test(f.material.name)&&f.normal.x*sign>.9&&f.p.every(p=>(p.x-at)*sign<=.01&&(p.x-at)*sign>=-16)).map(f=>({left:Math.min(...f.p.map(p=>p.z))-.02,right:Math.max(...f.p.map(p=>p.z))+.02,bottom:Math.min(...f.p.map(p=>p.y))-.02,top:Math.max(...f.p.map(p=>p.y))+.02}));addPanel(0,at,body.min.z,body.max.z,wall,floor,'house-side-closure',windows);}
 // These native house families have corner posts extending three units
 // beyond the room. Continue their measured 34/42-unit tops to the real roof;
 // the door and central front windows remain outside these corner strips.
 if([153,335,315,316].includes(Number(match[1])))for(const sign of [-1,1]){const left=sign<0?-30:24,right=sign<0?-24:30,postTop=[153,335].includes(Number(match[1]))?34:42,back=body.max.z,frontZ=back+3,front=authored.filter(f=>f.normal.z>.99&&f.p.every(p=>Math.abs(p.z-frontZ)<.01&&p.x>=left-.01&&p.x<=right+.01)&&Math.abs(Math.max(...f.p.map(p=>p.y))-postTop)<.01),side=authored.filter(f=>f.normal.x*sign>.99&&f.p.every(p=>Math.abs(p.x-sign*30)<.01&&p.z>=back-.01&&p.z<=frontZ+.01)&&Math.abs(Math.max(...f.p.map(p=>p.y))-postTop)<.01);if(front.length)addPanel(2,frontZ-.02,left,right,front,postTop,'house-post-header-closure');if(side.length)addPanel(0,sign*29.98,back,frontZ,side,postTop,'house-post-side-closure');}
 // Back missing facade and gable pixels behind the dominant real facade.
 // Source doorway corridors are cut out up to their measured reveal lintel,
 // preserving the real door sprite and the full depth of its recessed entry.
 const frontPlanes=new Map<number,{area:number;faces:Face[]}>();for(const face of faces)if(face.normal.z>.995&&Math.min(...face.p.map(p=>p.y))<floor+body.getSize(new THREE.Vector3()).y*.7){const z=Math.round(face.p[0].z*50)/50,plane=frontPlanes.get(z)??{area:0,faces:[]};plane.area+=face.area;plane.faces.push(face);frontPlanes.set(z,plane);}
 const frontPlane=[...frontPlanes.entries()].sort((a,b)=>b[1].area-a[1].area)[0];
 if(frontPlane){const z=frontPlane[0]-.02,apertures=localDoors.map(({point:d})=>{const reveals=faces.filter(f=>Math.abs(f.normal.x)>.95&&Math.min(...f.p.map(p=>p.y))<=floor+1.5&&Math.max(...f.p.map(p=>p.z))>=z-.3&&Math.min(...f.p.map(p=>p.z))<z-1&&Math.abs(f.p[0].x-d.x)<14),top=Math.max(floor+30.4,...reveals.map(f=>Math.max(...f.p.map(p=>p.y))+.05));return{left:d.x-11.2,right:d.x+11.2,top};}),windows=authored.filter(f=>/mado|window/i.test(f.material.name)&&f.normal.z>.9&&f.p.every(p=>p.z<=z+.01&&p.z>=z-16)).map(f=>({left:Math.min(...f.p.map(p=>p.x))-.02,right:Math.max(...f.p.map(p=>p.x))+.02,bottom:Math.min(...f.p.map(p=>p.y))-.02,top:Math.max(...f.p.map(p=>p.y))+.02}));addPanel(2,z,body.min.x,body.max.x,sideSource,floor,'house-front-interior-closure',[...apertures,...windows]);}

 // EN_H01's solid center column stops at Z=16, while its paired glass panes
 // sit at Z=12 with a two-unit gap between them. Give that existing opaque
 // column a back immediately behind the glass plane: oblique attic/room rays
 // cannot slip through its hollow center, and the real panes remain in front.
 if(Number(match[1])===12)for(const f of authored.filter(f=>!f.repairRoof&&f.normal.z>.995&&f.p.every(p=>Math.abs(p.x)<=2.001&&Math.abs(p.z-18)<.001&&p.y>=2&&p.y<=36))){const points=f.p.map(p=>new THREE.Vector3(p.x,p.y,11.98));emit('house-window-column-backing',opaque(f.material),points.flatMap(p=>p.toArray()),f.uv.flatMap(uv=>uv.toArray()),f.color.flatMap(c=>c.toArray()));}

 // Copy only the thin front roof fascia to its rear eave. Its source material
 // and atlas coordinates retain each town's roof trim instead of a flat slab.
 const roofFront=Math.max(...roof.flatMap(f=>f.p.map(p=>p.z))),roofBack=Math.min(...roof.flatMap(f=>f.p.map(p=>p.z))),fascia=faces.filter(f=>f.normal.z>.99&&f.p.every(p=>Math.abs(p.z-roofFront)<.1)&&Math.max(...f.p.map(p=>p.y))>body.max.y-4&&f.p.every(p=>{const gap=roofHeight(p.x,p.z)-p.y;return gap>=-.1&&gap<=8;}));
 for(const original of fascia){if([313,316].includes(Number(match[1]))&&!original.p.every(p=>{const gap=roofHeight(p.x,roofBack)-p.y;return gap>=-.1&&gap<=4.1;}))continue;const points=original.p.map(p=>new THREE.Vector3(p.x,p.y,roofBack+.005));emit('house-rear-roof-fascia',opaque(original.material),points.flatMap(p=>p.toArray()),original.uv.flatMap(p=>p.toArray()),original.color.flatMap(p=>p.toArray()));}
 if(!panels)return null;
 // Allocate only the final role/material batches; temporary per-triangle
 // Mesh and BufferGeometry objects would be immediately discarded here.
 for(const batch of batches.values()){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(batch.p,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(batch.uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(batch.color,3));geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,batch.material);mesh.name=batch.name;group.add(mesh);}
 // The earlier heuristic reflects front details and can make duplicate doors.
 // This complete house-specific envelope replaces those generated rear caps.
 root.traverse(o=>{if(o.name==='entrance-rear-wall'||o.name==='3d-rear-facade'||o.name==='3d-solid-backing')o.visible=false;});
 root.add(group);const result={panels,body:{min:body.min.toArray(),max:body.max.toArray()},roofSamples,asset};root.userData.houseBuildingShell=result;return result;
}
