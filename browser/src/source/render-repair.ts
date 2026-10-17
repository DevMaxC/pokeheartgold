import * as THREE from 'three';
import {addTreeVolumes} from './tree-volume.ts';
import {addTreeFronds,treeFrondContact,type FrondTree} from './tree-fronds.ts';
import {treeImagePixels,treeSpritePixels,treeSpriteComponents,type TreeShape} from './tree-texture.ts';
import {solidFurniture} from './furniture.ts';

type Triangle={points:THREE.Vector3[];uv:THREE.Vector2[];color:THREE.Color[];material:THREE.MeshBasicMaterial;root?:THREE.Vector3};
type RepairSummary={solidFaces:number;billboardTrees:number;uprightPanels:number;fencePosts:number;flowerClumps:number;terrainSkirts:number;solidRocks:number;solidSeats:number};
const isShadow=(m:THREE.MeshBasicMaterial)=>/kage|shadow/i.test(m.name)||m.opacity<.5;
const solidColors=new WeakMap<THREE.Material,THREE.Color>(),rockTextures=new WeakMap<THREE.Material,THREE.Texture>();
export function originalMaterial(old:THREE.MeshStandardMaterial){
  const material=new THREE.MeshBasicMaterial({map:old.map,color:old.color,transparent:old.transparent,opacity:old.opacity,alphaTest:old.alphaTest,depthWrite:old.depthWrite,depthTest:old.depthTest,side:THREE.DoubleSide,vertexColors:old.vertexColors});material.name=old.name;
  if(material.map){material.map.magFilter=THREE.NearestFilter;material.map.minFilter=THREE.NearestFilter;material.map.generateMipmaps=false;}return material;
}

function triangles(mesh:THREE.Mesh):Triangle[]{
  const geometry=mesh.geometry,position=geometry.getAttribute('position'),uv=geometry.getAttribute('uv'),color=geometry.getAttribute('color'),roots=geometry.getAttribute('sceneryRoot'),index=geometry.getIndex();
  const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];const groups=geometry.groups.length?geometry.groups:[{start:0,count:index?.count??position.count,materialIndex:0}];const result:Triangle[]=[];
  for(const group of groups){const material=(materials[group.materialIndex??0]||materials[0]) as THREE.MeshBasicMaterial;
    for(let i=group.start;i<group.start+group.count;i+=3){const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j);result.push({root:roots?.getW(ids[0])?new THREE.Vector3(roots.getX(ids[0]),roots.getY(ids[0]),roots.getZ(ids[0])).applyMatrix4(mesh.matrixWorld):undefined,points:ids.map(id=>mesh.getVertexPosition(id,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld)),uv:ids.map(id=>uv?new THREE.Vector2(uv.getX(id),uv.getY(id)):new THREE.Vector2()),color:ids.map(id=>color?new THREE.Color(color.getX(id),color.getY(id),color.getZ(id)):new THREE.Color(1,1,1)),material});}
  }return result;
}
function normal(triangle:Triangle){const [a,b,c]=triangle.points;return new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a));}
function averageColor(material:THREE.MeshBasicMaterial){
  const cached=solidColors.get(material);if(cached)return cached.clone();
  const result=material.color.clone();const image=material.map?.image as CanvasImageSource&{width?:number;height?:number};
  if(image?.width&&image.height){try{const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(image,0,0,32,32);const pixels=ctx.getImageData(0,0,32,32).data;let r=0,g=0,b=0,n=0;for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]<200)continue;r+=pixels[i];g+=pixels[i+1];b+=pixels[i+2];n++;}if(n)result.multiply(new THREE.Color(r/n/255,g/n/255,b/n/255).convertSRGBToLinear());}catch{/* A solid source material color remains a valid fallback. */}}
  solidColors.set(material,result);return result.clone();
}

function opaqueRockTexture(material:THREE.MeshBasicMaterial):THREE.Texture|null{
  const cached=rockTextures.get(material);if(cached)return cached;
  const image=material.map?.image as CanvasImageSource&{width?:number;height?:number};if(!image?.width||!image.height||typeof document==='undefined')return null;
  try{const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data,original=pixels.slice(),count=canvas.width*canvas.height,owner=new Int32Array(count).fill(-1),queue=new Int32Array(count);let head=0,tail=0;for(let pixel=0;pixel<count;pixel++)if(pixels[pixel*4+3]>=128){owner[pixel]=pixel;queue[tail++]=pixel;}if(!tail)return null;
    // The 3D silhouette supplies the outline. Extend the original opaque pixels
    // through the sprite's transparent margins so they cannot punch new holes.
    // A multi-source wavefront visits each texel once, avoiding a quadratic
    // nearest-pixel search during landscape streaming.
    while(head<tail){const pixel=queue[head++],x=pixel%canvas.width;for(const next of [x>0?pixel-1:-1,x<canvas.width-1?pixel+1:-1,pixel-canvas.width,pixel+canvas.width])if(next>=0&&next<count&&owner[next]<0){owner[next]=owner[pixel];queue[tail++]=next;}}
    for(let pixel=0;pixel<count;pixel++){const nearest=owner[pixel]*4;pixels.set(original.subarray(nearest,nearest+3),pixel*4);pixels[pixel*4+3]=255;}
    const texture=new THREE.DataTexture(pixels,canvas.width,canvas.height);texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;texture.wrapS=THREE.RepeatWrapping;texture.needsUpdate=true;rockTextures.set(material,texture);return texture;
  }catch{return null;}
}

/** A source façade becomes a closed prism within its original footprint. */
export function extrudeTriangle(points:THREE.Vector3[],axis:0|1|2,rear:number):THREE.Vector3[][]{
  const back=points.map(p=>{const q=p.clone();q.setComponent(axis,rear);return q;});
  const faces:THREE.Vector3[][]=[[back[0],back[2],back[1]]];
  for(let i=0;i<3;i++){const j=(i+1)%3;faces.push([points[i],back[i],back[j]],[points[i],back[j],points[j]]);}return faces;
}

function components(source:Triangle[]):Triangle[][]{
  const parent=source.map((_,i)=>i),lines=new Map<string,{triangle:number;low:number;high:number}[]>();const find=(i:number):number=>parent[i]===i?i:(parent[i]=find(parent[i]));
  // Join shared edge segments, including T junctions across source materials.
  // A single touching vertex must not attach a mailbox to an entire building.
  source.forEach((triangle,i)=>{for(let edge=0;edge<3;edge++){
    const a=triangle.points[edge],b=triangle.points[(edge+1)%3],direction=b.clone().sub(a);if(direction.length()<.001)continue;direction.normalize();const axis=[0,1,2].reduce((best,axis)=>Math.abs(direction.getComponent(axis))>Math.abs(direction.getComponent(best))?axis:best,0);if(direction.getComponent(axis)<0)direction.negate();
    const key=[...direction.toArray(),...a.clone().cross(direction).toArray()].map(v=>Math.round(v*1000)).join(','),low=Math.min(a.dot(direction),b.dot(direction)),high=Math.max(a.dot(direction),b.dot(direction));
    const previous=lines.get(key)||[];for(const segment of previous)if(Math.min(high,segment.high)-Math.max(low,segment.low)>.001)parent[find(i)]=find(segment.triangle);previous.push({triangle:i,low,high});lines.set(key,previous);
  }});
  const groups=new Map<number,Triangle[]>();source.forEach((triangle,i)=>{const root=find(i);if(!groups.has(root))groups.set(root,[]);groups.get(root)!.push(triangle);});return [...groups.values()];
}
function silhouette(points:THREE.Vector2[]){
  const unique=[...new Map(points.map(p=>[p.toArray().map(v=>Math.round(v*1000)).join(','),p])).values()].sort((a,b)=>a.x-b.x||a.y-b.y);
  const cross=(a:THREE.Vector2,b:THREE.Vector2,c:THREE.Vector2)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);const lower:THREE.Vector2[]=[],upper:THREE.Vector2[]=[];
  for(const p of unique){while(lower.length>=2&&cross(lower.at(-2)!,lower.at(-1)!,p)<=0)lower.pop();lower.push(p);}
  for(const p of [...unique].reverse()){while(upper.length>=2&&cross(upper.at(-2)!,upper.at(-1)!,p)<=0)upper.pop();upper.push(p);}
  return lower.slice(0,-1).concat(upper.slice(0,-1));
}
function closeComponent(root:THREE.Group,solid:Triangle[],summary:RepairSummary){
  if(!solid.length)return;
  const bounds=new THREE.Box3();for(const t of solid)for(const p of t.points)bounds.expandByPoint(p);
  const area=Array.from({length:3},()=>[0,0]);for(const t of solid){const n=normal(t);const length=n.length();if(length<.001)continue;n.divideScalar(length);for(let axis=0;axis<3;axis++)if(Math.abs(n.getComponent(axis))>.8)area[axis][n.getComponent(axis)>0?1:0]+=length/2;}
  // Ground/floor omissions are intentional. Repair horizontal viewing directions only.
  for(const axis of [0,2] as const){
    const [negative,positive]=area[axis];const sign=positive>negative?1:-1,front=Math.max(negative,positive),opposite=Math.min(negative,positive);
    if(front<8||opposite>front*.04)continue;
    const target=sign>0?bounds.min.getComponent(axis):bounds.max.getComponent(axis),thin=bounds.max.getComponent(axis)-bounds.min.getComponent(axis)<.5;
    const faces=solid.filter(t=>{const n=normal(t).normalize();return n.getComponent(axis)*sign>.8;});
    const byMaterial=new Map<THREE.MeshBasicMaterial,{positions:number[];uvs:number[];colors:number[]}>();const backPositions:number[]=[],backColors:number[]=[],sidePositions:number[]=[],sideColors:number[]=[];let innerCap=-Infinity;
    for(const triangle of faces){
      // Each disconnected component uses its own bounds: a mailbox stays at its
      // original position rather than being projected to the back of its building.
      const rear=thin?target-sign*1.5:target;
      const cap=triangle.points.map(p=>{const q=p.clone();q.setComponent(axis,thin?rear:bounds.min.getComponent(axis)+bounds.max.getComponent(axis)-p.getComponent(axis));return q;}).map((_,i,points)=>points[[0,2,1][i]]);
      for(const point of cap)innerCap=Math.max(innerCap,point.getComponent(axis)*sign);
      let attributes=byMaterial.get(triangle.material);if(!attributes){attributes={positions:[],uvs:[],colors:[]};byMaterial.set(triangle.material,attributes);}
      for(const [vertex,index]of cap.map((p,i)=>[p,[0,2,1][i]] as const)){attributes.positions.push(...vertex.toArray());attributes.uvs.push(...triangle.uv[index].toArray());attributes.colors.push(...triangle.color[index].toArray());}
      const fill=averageColor(triangle.material);
      // A solid backing closes cut-out texture pixels without flattening the original front artwork.
      for(const p of cap){const q=p.clone();q.setComponent(axis,q.getComponent(axis)+sign*.025);backPositions.push(...q.toArray());backColors.push(...fill.toArray());}
      // Existing side/roof surfaces already close volumetric components. Adding
      // overlapping extrusion panels there causes z-fighting and hides textures.
      // Only genuinely flat components need new thickness along their edges.
      if(thin)for(const face of extrudeTriangle(triangle.points,axis,rear).slice(1))for(const p of face){sidePositions.push(...p.toArray());sideColors.push(...fill.toArray());}
      summary.solidFaces+=thin?8:2;
    }
    // A façade can contain a real front doorway, which must not become another
    // opening at the rear. A backing silhouette closes those intentional holes.
    const sideAxis=axis===0?2:0,hull=silhouette(solid.flatMap(t=>t.points.map(p=>new THREE.Vector2(p.getComponent(sideAxis),p.y))));
    const dominant=faces.reduce((best,t)=>normal(t).length()>normal(best).length()?t:best,faces[0]);const fill=averageColor(dominant.material);
    // Keep the hull inside every textured cap, including recessed façades and
    // roof overhangs. It must not cover the rear artwork or be coplanar with it.
    const backAt=(innerCap+.05)*sign;
    for(let i=1;i<hull.length-1;i++){const face=[hull[0],hull[i],hull[i+1]].map(point=>{const vertex=new THREE.Vector3();vertex.y=point.y;vertex.setComponent(sideAxis,point.x);vertex.setComponent(axis,backAt);return vertex;});if(normal({points:face} as Triangle).getComponent(axis)*sign>0)face.reverse();for(const vertex of face){backPositions.push(...vertex.toArray());backColors.push(...fill.toArray());}summary.solidFaces++;}
    for(const [material,attributes]of byMaterial){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(attributes.positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(attributes.uvs,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(attributes.colors,3));geometry.computeVertexNormals();const rearMaterial=material.clone();rearMaterial.side=THREE.FrontSide;const cap=new THREE.Mesh(geometry,rearMaterial);cap.name='3d-rear-facade';root.add(cap);}
    if(backPositions.length){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(backPositions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(backColors,3));geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.FrontSide}));mesh.name='3d-solid-backing';root.add(mesh);}
    if(sidePositions.length){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(sidePositions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(sideColors,3));geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide}));mesh.name='3d-solid-backing';root.add(mesh);}
  }
}
function closeProps(root:THREE.Group,source:Triangle[],summary:RepairSummary){const solid=source.filter(t=>!isShadow(t.material)&&!/tree|foliage|leaf|flower|grass|bush|fence|saku|hana|plant/i.test(t.material.name));for(const component of components(solid))closeComponent(root,component,summary);}

/** A real source doorway identifies a building and its front. Close a section
 * just inside its rear shell, even when a partial rear face fooled the generic
 * missing-face heuristic. A genuine entrance on the opposite side stays open. */
export type BuildingEntrance={x:number;z:number;axis?:0|2;sign?:number;passageOnly?:boolean};
export function closeBuildingBack(root:THREE.Object3D,doors:BuildingEntrance[]){
  if(!doors.length)return 0;root.updateWorldMatrix(true,false);root.updateMatrixWorld(true);const solid:Triangle[]=[];
  root.traverse(object=>{if(!(object instanceof THREE.Mesh)||object.name.startsWith('3d-')||object.name==='entrance-rear-wall')return;for(const t of triangles(object))if(!isShadow(t.material)&&!/tree|foliage|leaf|flower|grass|bush|fence|saku|hana|plant/i.test(t.material.name))solid.push(t);});
  if(!solid.length)return 0;const bounds=new THREE.Box3();for(const t of solid)for(const p of t.points)bounds.expandByPoint(p);const size=bounds.getSize(new THREE.Vector3());if(size.x<1.8||size.z<1.4||size.y<1.8)return 0;
  const faceFor=(d:BuildingEntrance)=>[
    {axis:0 as const,sign:-1,distance:Math.abs(d.x-bounds.min.x)},{axis:0 as const,sign:1,distance:Math.abs(d.x-bounds.max.x)},
    {axis:2 as const,sign:-1,distance:Math.abs(d.z-bounds.min.z)},{axis:2 as const,sign:1,distance:Math.abs(d.z-bounds.max.z)},
  ].filter(f=>{const side=f.axis===0?'z':'x';return (d.axis===undefined||(d.axis===f.axis&&d.sign===f.sign))&&d[side]>=bounds.min[side]&&d[side]<=bounds.max[side];}).sort((a,b)=>a.distance-b.distance).map(f=>({...f,passageOnly:d.passageOnly}))[0];
  const entrances=doors.filter(d=>d.x>=bounds.min.x-.6&&d.x<=bounds.max.x+.6&&d.z>=bounds.min.z-.6&&d.z<=bounds.max.z+.6).map(faceFor).filter((f):f is NonNullable<typeof f>=>!!f).sort((a,b)=>a.distance-b.distance);if(!entrances.length)return 0;
  const front=entrances.find(f=>!f.passageOnly);if(!front||entrances.some(f=>f.axis===front.axis&&f.sign===-front.sign))return 0;
  const axis=front.axis,sideAxis=axis===0?2:0,rear=front.sign>0?bounds.min.getComponent(axis):bounds.max.getComponent(axis),depth=size.getComponent(axis);
  // Follow each floor wall's plane through any stacked upper bands. A roof
  // edge can also be vertical, but must not supply the cladding outline.
  const wallBases=solid.filter(t=>{const low=Math.min(...t.points.map(p=>p.y)),high=Math.max(...t.points.map(p=>p.y));return low<=bounds.min.y+.3&&high-low>.05&&Math.abs(normal(t).normalize().y)<.8;});
  const structuralWalls=solid.filter(t=>{const n=normal(t).normalize();return wallBases.some(base=>{const b=normal(base).normalize();return Math.abs(n.dot(b))>.999&&t.points.every(p=>Math.abs(p.clone().sub(base.points[0]).dot(b))<.03);});});
  const shell=structuralWalls.length?structuralWalls:solid;
  let hull:THREE.Vector2[]=[],at=rear;
  for(let step=0;step<28;step++){
    at=rear+front.sign*depth*(.01+step*.015);const section:THREE.Vector2[]=[];
    for(const triangle of shell)for(let i=0;i<3;i++){
      const a=triangle.points[i],b=triangle.points[(i+1)%3],da=a.getComponent(axis)-at,db=b.getComponent(axis)-at;
      if(Math.abs(da)<1e-6)section.push(new THREE.Vector2(a.getComponent(sideAxis),a.y));
      if(da*db<0){const p=a.clone().lerp(b,da/(da-db));section.push(new THREE.Vector2(p.getComponent(sideAxis),p.y));}
    }
    if(section.length<3)continue;const candidate=silhouette(section),low=Math.min(...candidate.map(p=>p.y)),high=Math.max(...candidate.map(p=>p.y));
    // Step past an overhanging roof until the section actually reaches the walls.
    if(low>bounds.min.y+.15||high-low<1.5)continue;hull=candidate;break;
  }
  if(hull.length<3){
    // Some DS buildings contain no full-height rear section at all. Use the
    // front wall outline at the rear footprint, filling its doorway in the hull.
    const facade=shell.filter(t=>normal(t).normalize().getComponent(axis)*front.sign>.8);
    if(!facade.length)return 0;hull=silhouette(facade.flatMap(t=>t.points.map(p=>new THREE.Vector2(p.getComponent(sideAxis),p.y))));at=rear+front.sign*depth*.025;
  }
  if(hull.length<3)return 0;
  const walls=solid.filter(t=>{const n=normal(t).normalize(),y=t.points.reduce((s,p)=>s+p.y,0)/3;return Math.abs(n.y)<.8&&Math.abs(n.getComponent(axis))<.5&&y<bounds.min.y+size.y*.62;}),dominant=(walls.length?walls:solid).reduce((best,t)=>normal(t).length()>normal(best).length()?t:best);
  const sample=dominant.points.map(p=>new THREE.Vector2(p.getComponent(axis),p.y)),[a,b,c]=sample,den=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y),textured=walls.length>0&&Math.abs(den)>1e-6&&!!dominant.material.map;
  const left=Math.min(...sample.map(p=>p.x)),right=Math.max(...sample.map(p=>p.x)),bottom=Math.min(...sample.map(p=>p.y)),top=Math.max(...sample.map(p=>p.y));
  // Clip at texture-band limits before triangulation. Clamping only the four
  // corners of a sloped outline would bend horizontal cladding diagonally.
  const clip=(polygon:THREE.Vector2[],height:number,sign:number)=>{const result:THREE.Vector2[]=[];for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],inside=(a.y-height)*sign>=0;if(inside)result.push(a);if((a.y-height)*(b.y-height)<0)result.push(a.clone().lerp(b,(height-a.y)/(b.y-a.y)));}return result;};
  let panels=[hull];if(textured)for(const height of [bottom,top])panels=panels.flatMap(polygon=>[clip(polygon,height,-1),clip(polygon,height,1)].filter(p=>p.length>=3));
  const inverse=root.matrixWorld.clone().invert(),positions:number[]=[],uvs:number[]=[];for(const panel of panels)for(let i=1;i<panel.length-1;i++)for(const p of [panel[0],panel[i],panel[i+1]]){const vertex=new THREE.Vector3();vertex.setComponent(axis,at);vertex.setComponent(sideAxis,p.x);vertex.y=p.y;positions.push(...vertex.applyMatrix4(inverse).toArray());
    if(textured){const x=left+(p.x-bounds.min.getComponent(sideAxis))/size.getComponent(sideAxis)*(right-left),y=THREE.MathUtils.clamp(p.y,bottom,top),wa=((b.y-c.y)*(x-c.x)+(c.x-b.x)*(y-c.y))/den,wb=((c.y-a.y)*(x-c.x)+(a.x-c.x)*(y-c.y))/den;const uv=dominant.uv[0].clone().multiplyScalar(wa).addScaledVector(dominant.uv[1],wb).addScaledVector(dominant.uv[2],1-wa-wb);uvs.push(...uv.toArray());}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));if(textured)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.computeVertexNormals();const material=new THREE.MeshBasicMaterial({map:textured?dominant.material.map:null,color:textured?dominant.material.color.clone().multiply(dominant.color[0]):averageColor(dominant.material).multiply(dominant.color[0]),side:THREE.DoubleSide}),mesh=new THREE.Mesh(geometry,material);mesh.name='entrance-rear-wall';root.add(mesh);return positions.length/9;
}

const standingScenery=/fence|saku|flower|hana|plant|(?:^|_)yo_sp\d/i;
function replacementMesh(root:THREE.Group,mesh:THREE.Mesh,source:Triangle[],name:string){
  const positions:number[]=[],uvs:number[]=[],colors:number[]=[],roots:number[]=[],materials:THREE.MeshBasicMaterial[]=[],geometry=new THREE.BufferGeometry(),inverse=root.matrixWorld.clone().invert();
  for(const t of source){let material=materials.indexOf(t.material);if(material<0){material=materials.length;materials.push(t.material);}geometry.addGroup(positions.length/3,3,material);
    for(let i=0;i<3;i++){positions.push(...t.points[i].clone().applyMatrix4(inverse).toArray());uvs.push(...t.uv[i].toArray());colors.push(...t.color[i].toArray());roots.push(...(t.root?[...t.root.clone().applyMatrix4(inverse).toArray(),1]:[0,0,0,0]));}
  }
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('sceneryRoot',new THREE.Float32BufferAttribute(roots,4));geometry.computeVertexNormals();
  const replacement=new THREE.Mesh(geometry,materials);replacement.name=name;root.add(replacement);mesh.visible=false;return replacement;
}
function groundHeight(source:Triangle[],x:number,z:number,fallback:number){
  let best=fallback,distance=Infinity;
  for(const t of source){if(/fence|saku/i.test(t.material.name)||isShadow(t.material)||Math.abs(normal(t).normalize().y)<.995)continue;
    const [a,b,c]=t.points,den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(Math.abs(den)<1e-6)continue;
    const wa=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/den,wb=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/den,wc=1-wa-wb;
    if(Math.min(wa,wb,wc)<-1e-4)continue;const y=a.y*wa+b.y*wb+c.y*wc,d=Math.abs(y-fallback);if(d<distance&&y<=fallback+1){best=y;distance=d;}
  }return best;
}

/** Unbake the fixed DS-camera lean in cut-out fence/flower panels. These remain
 * fixed in the world: an entire fence or flower row must never orbit the camera. */
function uprightScenery(root:THREE.Group,mesh:THREE.Mesh,source:Triangle[],ground:Triangle[],summary:RepairSummary){
  const eligible=source.filter(t=>standingScenery.test(t.material.name)&&!isShadow(t.material)&&(t.material.alphaTest>0||t.material.transparent)&&normal(t).length()>.001&&Math.abs(normal(t).normalize().y)>.12&&Math.abs(normal(t).normalize().y)<.96);
  const changed=new Map<Triangle,Triangle>();
  for(const group of components(eligible)){
    const n=normal(group[0]).normalize();if(!group.every(t=>Math.abs(normal(t).normalize().dot(n))>.999))continue;
    const bounds=new THREE.Box3();for(const t of group)for(const p of t.points)bounds.expandByPoint(p);
    const lower=bounds.min.y,upper=bounds.max.y;if(upper-lower<.5)continue;
    const h2=n.x*n.x+n.z*n.z,slope=new THREE.Vector3(-n.x*n.y/h2,0,-n.z*n.y/h2),factor=1/Math.sqrt(h2),middle=(lower+upper)/2;
    // Source panels lean about their centre; their grid footprint is the centre
    // line, not the displaced bottom of the tilted quad. Root it on the floor.
    const center=bounds.getCenter(new THREE.Vector3()),floor=groundHeight(ground,center.x,center.z,lower);
    for(const t of group)changed.set(t,{...t,root:new THREE.Vector3(center.x,floor,center.z),points:t.points.map(p=>{const q=p.clone().addScaledVector(slope,-(p.y-middle));q.y=floor+(p.y-lower)*factor;return q;})});
    summary.uprightPanels++;
  }
  if(!changed.size)return{mesh,source};
  const adjusted=source.map(t=>changed.get(t)||t);return{mesh:replacementMesh(root,mesh,adjusted,'upright-original-scenery'),source:adjusted};
}

/** Fence atlas U follows the run, including the source's completely horizontal
 * north/south pieces. Build posts and rails from that run instead of a card. */
function solidFences(root:THREE.Group,mesh:THREE.Mesh,source:Triangle[],ground:Triangle[],summary:RepairSummary){
  const converted=new Set<Triangle>(),boxes:{position:THREE.Vector3;scale:THREE.Vector3;yaw:number;color:string}[]=[],seen=new Set<string>();
  for(let i=0;i+1<source.length;i+=2){const pair=source.slice(i,i+2),material=pair[0].material;
    if(!/fence|saku/i.test(material.name)||isShadow(material)||!(material.alphaTest>0||material.transparent)||pair[1].material!==material)continue;
    const n=normal(pair[0]).normalize();if(Math.abs(n.y)<.12||Math.abs(n.dot(normal(pair[1]).normalize()))<.999)continue;
    const [a,b,c]=pair[0].points,[u,v,w]=pair[0].uv,e1=b.clone().sub(a),e2=c.clone().sub(a),det=(v.x-u.x)*(w.y-u.y)-(w.x-u.x)*(v.y-u.y);if(Math.abs(det)<1e-6)continue;
    const along=e1.clone().multiplyScalar(w.y-u.y).addScaledVector(e2,-(v.y-u.y)).divideScalar(det);if(Math.abs(along.y)>.01||along.length()<1)continue;along.y=0;
    const direction=along.clone().normalize(),vertices=pair.flatMap(t=>t.points.map((p,j)=>({p,uv:t.uv[j]}))),low=Math.min(...vertices.map(v=>v.uv.x)),high=Math.max(...vertices.map(v=>v.uv.x));if(high-low<.01)continue;
    // Flat atlas bands are the side-on fence runs, not a ground shadow.
    if(Math.abs(n.y)>.99&&high-low<.4)continue;
    const bounds=new THREE.Box3().setFromPoints(vertices.map(v=>v.p)),center=bounds.getCenter(new THREE.Vector3()),base=groundHeight(ground,center.x,center.z,bounds.min.y),yaw=-Math.atan2(direction.z,direction.x),length=along.length()*(high-low);
    const add=(p:THREE.Vector3,s:THREE.Vector3,color:string)=>boxes.push({position:p,scale:s,yaw,color});
    for(const height of [5,10]){const p=center.clone();p.y=base+height;add(p,new THREE.Vector3(length,2.2,2.1),'#b6c6cf');}
    const middle=(low+high)/2;
    for(let tile=Math.floor(low);tile<Math.ceil(high);tile++)for(const fraction of [.125,.375,.625,.875]){const uv=tile+fraction;if(uv<low-1e-5||uv>high+1e-5)continue;
      const p=center.clone().addScaledVector(along,uv-middle);p.y=base;const key=p.toArray().map(v=>Math.round(v*100)).join(',');if(seen.has(key))continue;seen.add(key);
      add(p.clone().add(new THREE.Vector3(0,6.5,0)),new THREE.Vector3(3.3,13,3.3),'#d8e3e6');add(p.clone().add(new THREE.Vector3(0,13.4,0)),new THREE.Vector3(3.7,2.2,3.7),'#f5fbf7');summary.fencePosts++;
    }
    for(const t of pair)converted.add(t);
  }
  if(!converted.size)return{mesh,source};
  const geometry=new THREE.BoxGeometry(1,1,1),shades=['#c0ced4','#a6bac5','#ffffff','#92a8b4','#e9f1ef','#c3d3da'].map(color=>new THREE.MeshBasicMaterial({color})),fences=new THREE.InstancedMesh(geometry,shades,boxes.length),dummy=new THREE.Object3D();
  fences.name='solid-original-fences';boxes.forEach((b,i)=>{dummy.position.copy(b.position);dummy.scale.copy(b.scale);dummy.rotation.set(0,b.yaw,0);dummy.updateMatrix();fences.setMatrixAt(i,dummy.matrix);fences.setColorAt(i,new THREE.Color(b.color));});fences.computeBoundingSphere();root.add(fences);
  const remaining=source.filter(t=>!converted.has(t));return{mesh:replacementMesh(root,mesh,remaining,'original-fence-remainder'),source:remaining};
}

/** Each original bunch gets its own crossed cutouts; beds have volume even
 * viewed along the row, and none of the rows rotate around a shared pivot. */
function flowerVolume(root:THREE.Group,mesh:THREE.Mesh,source:Triangle[],summary:RepairSummary){
  const converted=new Set<Triangle>(),clumps:Triangle[]=[];
  for(let i=0;i+1<source.length;i+=2){const pair=source.slice(i,i+2),material=pair[0].material;
    if(!standingScenery.test(material.name)||/fence|saku/i.test(material.name)||isShadow(material)||!(material.alphaTest>0||material.transparent)||Math.abs(normal(pair[0]).normalize().y)>.05||pair[1].material!==material)continue;
    const vertices=pair.flatMap(t=>t.points),bounds=new THREE.Box3().setFromPoints(vertices),height=bounds.max.y-bounds.min.y;if(height<1)continue;
    const center=bounds.getCenter(new THREE.Vector3());center.y=bounds.min.y;
    for(const angle of [0,Math.PI/3,Math.PI*2/3])for(const t of pair)clumps.push({...t,root:center.clone(),points:t.points.map(p=>p.clone().sub(center).applyAxisAngle(new THREE.Vector3(0,1,0),angle).add(center))});
    for(const t of pair)converted.add(t);summary.flowerClumps++;
  }
  if(!converted.size)return{mesh,source};
  const remaining=source.filter(t=>!converted.has(t)),replacement=replacementMesh(root,mesh,[...remaining,...clumps],'crossed-original-flowers');return{mesh:replacement,source:[...remaining,...clumps]};
}

/** Rock cards baked for the DS camera are scenery volumes, not billboards.
 * Replace each authored card separately, keeping its footprint and palette. */
function rockVolume(root:THREE.Group,mesh:THREE.Mesh,source:Triangle[],ground:Triangle[],summary:RepairSummary){
  const converted=new Set<Triangle>(),positions:number[]=[],colors:number[]=[],uvs:number[]=[],roots:number[]=[],inverse=root.matrixWorld.clone().invert(),geometry=new THREE.BufferGeometry(),materials:THREE.MeshBasicMaterial[]=[],bySource=new Map<THREE.MeshBasicMaterial,number>();
  const eligible=source.filter(t=>/(?:^|_)(?:rock\d*|iwa\d*|boulder)(?:_|$)/i.test(t.material.name)&&!isShadow(t.material)&&(t.material.alphaTest>0||t.material.transparent));
  for(let index=0;index+1<eligible.length;index++){
    const group=eligible.slice(index,index+2),n=normal(group[0]).normalize();if(group[1].material!==group[0].material||Math.abs(n.y)>.96||!group.every(t=>Math.abs(normal(t).normalize().dot(n))>.999))continue;
    if(new Set(group.flatMap(t=>t.points.map(p=>p.toArray().join(',')))).size!==4)continue;
    const shared=group[0].points.reduce((count,p,i)=>count+Number(group[1].points.some((q,j)=>p.distanceToSquared(q)<1e-8&&group[0].uv[i].distanceToSquared(group[1].uv[j])<1e-8)),0);if(shared!==2)continue;
    const bounds=new THREE.Box3().setFromPoints(group.flatMap(t=>t.points)),center=bounds.getCenter(new THREE.Vector3()),horizontal=new THREE.Vector3(n.z,0,-n.x).normalize();
    const along=group.flatMap(t=>t.points.map(p=>p.dot(horizontal))),width=Math.max(...along)-Math.min(...along),rise=bounds.max.y-bounds.min.y,height=rise/Math.sqrt(1-n.y*n.y);
    if(width<1||height<1||width>height*3)continue;center.y=groundHeight(ground,center.x,center.z,bounds.min.y);
    const seed=Math.abs(Math.sin(center.x*12.9898+center.z*78.233)),sides=8,rings:THREE.Vector3[][]=[];
    // Closed, irregular rings provide substantial depth from every side. The
    // top is offset slightly, rather than leaning the whole original quad.
    for(const [y,radius]of [[0,.68],[.22,1],[.62,.78],[.9,.4]] as const){const ring:THREE.Vector3[]=[];for(let i=0;i<sides;i++){const angle=i/sides*Math.PI*2+seed*.6,jitter=.91+.09*Math.sin(i*2.7+seed*20);ring.push(new THREE.Vector3(center.x+Math.cos(angle)*width*.46*radius*jitter+width*.05*y,center.y+height*.86*y,center.z+Math.sin(angle)*width*.4*radius*jitter));}rings.push(ring);}
    const original=group[0].material,texture=opaqueRockTexture(original);let materialIndex=bySource.get(original);if(materialIndex===undefined){materialIndex=materials.length;bySource.set(original,materialIndex);materials.push(new THREE.MeshBasicMaterial({map:texture,vertexColors:true,side:THREE.DoubleSide}));}
    const start=positions.length/3,top=new THREE.Vector3(center.x+width*.045,center.y+height*.86,center.z),base=center.clone(),palette=(texture?original.color.clone():averageColor(original)).multiply(group[0].color[0]),light=new THREE.Vector3(-.45,.85,.35).normalize();
    const middle=center.clone().add(new THREE.Vector3(0,height*.43,0));
    const face=(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3)=>{const normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();if(normal.dot(a.clone().add(b).add(c).multiplyScalar(1/3).sub(middle))<0){[b,c]=[c,b];normal.negate();}const shade=.8+.3*normal.dot(light),color=palette.clone().multiplyScalar(shade),points=[a,b,c],isPole=points.map(p=>p===top||p===base),us=points.map(p=>(Math.atan2(p.z-center.z,p.x-center.x)/Math.PI/2+1.25)%1),ring=us.filter((_,i)=>!isPole[i]),seam=Math.max(...ring)-Math.min(...ring)>.5;
      for(let i=0;i<3;i++)if(!isPole[i]&&seam&&us[i]<.5)us[i]++;const poleU=us.reduce((sum,u,i)=>sum+(isPole[i]?0:u),0)/ring.length;
      for(let i=0;i<3;i++){const p=points[i];positions.push(...p.clone().applyMatrix4(inverse).toArray());roots.push(...center.clone().applyMatrix4(inverse).toArray(),1);colors.push(...color.toArray());uvs.push(isPole[i]?poleU:us[i],1-(p.y-center.y)/(height*.86));}};
    for(let i=0;i<sides;i++){const next=(i+1)%sides;face(base,rings[0][next],rings[0][i]);for(let row=0;row<rings.length-1;row++){face(rings[row][i],rings[row][next],rings[row+1][next]);face(rings[row][i],rings[row+1][next],rings[row+1][i]);}face(rings.at(-1)![i],rings.at(-1)![next],top);}
    geometry.addGroup(start,positions.length/3-start,materialIndex);for(const t of group)converted.add(t);summary.solidRocks++;index++;
  }
  if(!converted.size)return{mesh,source};
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setAttribute('sceneryRoot',new THREE.Float32BufferAttribute(roots,4));geometry.computeVertexNormals();const rocks=new THREE.Mesh(geometry,materials.length===1?materials[0]:materials);rocks.name='solid-original-rocks';root.add(rocks);
  const remaining=source.filter(t=>!converted.has(t));return{mesh:replacementMesh(root,mesh,remaining,'original-rock-remainder'),source:remaining};
}

/** DS hills frequently omit every face behind the camera. Close the open edge
 * loops down to each component's existing base, retaining every authored face. */
function closeTerrain(root:THREE.Group,source:Triangle[],summary:RepairSummary){
  const forest=(t:Triangle)=>/tree|bush/i.test(t.material.name)&&/_un(?:_|$)/.test(t.material.name)&&!isShadow(t.material)&&Math.abs(normal(t).normalize().y)>.995;
  const floor=source.filter(t=>!isShadow(t.material)&&!t.material.transparent&&!t.material.alphaTest&&!/tree|bush|flower|fence|saku/i.test(t.material.name)&&Math.abs(normal(t).normalize().y)>.995),floorY=floor.length?Math.min(...floor.flatMap(t=>t.points.map(p=>p.y))):Infinity;
  const cliff=source.find(t=>/cliff\d|wall.*_d/i.test(t.material.name))?.material;
  const terrain=source.filter(t=>forest(t)||(!isShadow(t.material)&&/cliff|wall|peak|mount|rock|slope/i.test(t.material.name)&&!/tree|flower|fence|saku|grass|pond|sea|water/i.test(t.material.name)&&!(/rock|iwa|boulder/i.test(t.material.name)&&(t.material.alphaTest>0||t.material.transparent))));
  for(const component of components(terrain)){
    const woods=component.every(forest),bottom=Math.min(...component.flatMap(t=>t.points.map(p=>p.y))),base=woods?floorY:bottom;if(woods&&(!Number.isFinite(base)||bottom-base<12))continue;
    const edges=new Map<string,{a:THREE.Vector3;b:THREE.Vector3;triangle:Triangle;count:number}>();
    for(const triangle of component)for(let i=0;i<3;i++){const a=triangle.points[i],b=triangle.points[(i+1)%3],key=[a,b].map(p=>p.toArray().map(v=>Math.round(v*1000)).join(',')).sort().join('|');const edge=edges.get(key);if(edge)edge.count++;else edges.set(key,{a,b,triangle,count:1});}
    const byMaterial=new Map<THREE.MeshBasicMaterial,{positions:number[];uvs:number[];colors:number[]}>();
    for(const {a,b,triangle,count}of edges.values()){
      if(count!==1||Math.max(a.y,b.y)-base<.1||Math.hypot(a.x-b.x,a.z-b.z)<.01)continue;
      const surface=forest(triangle)&&cliff?cliff:triangle.material,floorA=new THREE.Vector3(a.x,base,a.z),floorB=new THREE.Vector3(b.x,base,b.z),attributes=byMaterial.get(surface)||{positions:[],uvs:[],colors:[]},width=Math.hypot(a.x-b.x,a.z-b.z)/32;
      for(const [p,u]of [[a,0],[b,width],[floorB,width],[a,0],[floorB,width],[floorA,0]] as const){attributes.positions.push(...p.toArray());attributes.uvs.push(u,(p.y-base)/32);attributes.colors.push(...triangle.color[0].toArray());}byMaterial.set(surface,attributes);summary.terrainSkirts++;
    }
    for(const [original,attributes]of byMaterial){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(attributes.positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(attributes.uvs,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(attributes.colors,3));geometry.computeVertexNormals();const material=new THREE.MeshBasicMaterial({color:averageColor(original),side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:2,polygonOffsetUnits:2});const mesh=new THREE.Mesh(geometry,material);mesh.name='solid-original-terrain';root.add(mesh);
      if(original.map){const textured=original.clone();textured.side=THREE.DoubleSide;textured.polygonOffset=true;textured.polygonOffsetFactor=1;textured.polygonOffsetUnits=1;const face=new THREE.Mesh(geometry,textured);face.name='textured-terrain-back';root.add(face);}
    }
  }
}

function treeFamily(name:string){return name.replace(/_(?:re|un)(?=_|$)/,'').replace(/_lm\d+$/,'').replace(/gs$/,'');}
type TreeMark={anchor:THREE.Vector3;polygon:THREE.Vector3[]};
function nativeTreeFamily(material:THREE.MeshBasicMaterial){const info=material.userData.treeInfo as {family?:string;asset?:string}|undefined;return info?.family??treeFamily(info?.asset?.replace(/^.*\/\d+-|\.png$/g,'')??material.name);}
function groundTreeMarks(source:Triangle[]){
  const aliases=new Map(source.filter(t=>t.material.userData.treeInfo).map(t=>[treeFamily(t.material.name),nativeTreeFamily(t.material)])),marks=new Map<string,TreeMark[]>();
  for(const triangle of source){if(!/_un(?:_|$)/.test(triangle.material.name)||Math.abs(normal(triangle).normalize().y)<.9)continue;const [a,b,c]=triangle.uv,den=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(den)<1e-6)continue;
    for(let u=Math.floor(Math.min(a.x,b.x,c.x));u<Math.ceil(Math.max(a.x,b.x,c.x));u++)for(let v=Math.floor(Math.min(a.y,b.y,c.y));v<Math.ceil(Math.max(a.y,b.y,c.y));v++){
      const x=u+.5,y=v+.5,wa=((b.y-c.y)*(x-c.x)+(c.x-b.x)*(y-c.y))/den,wb=((c.y-a.y)*(x-c.x)+(a.x-c.x)*(y-c.y))/den,wc=1-wa-wb;if(Math.min(wa,wb,wc)<-1e-5)continue;
      const p=triangle.points[0].clone().multiplyScalar(wa).addScaledVector(triangle.points[1],wb).addScaledVector(triangle.points[2],wc),family=aliases.get(treeFamily(triangle.material.name))??treeFamily(triangle.material.name);let polygon=triangle.points.map((p,i)=>({p:p.clone(),uv:triangle.uv[i].clone()}));for(const distance of[(v:{uv:THREE.Vector2})=>v.uv.x-u,(v:{uv:THREE.Vector2})=>u+1-v.uv.x,(q:{uv:THREE.Vector2})=>q.uv.y-v,(q:{uv:THREE.Vector2})=>v+1-q.uv.y]){const next:typeof polygon=[];for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],da=distance(a),db=distance(b);if(da>=0)next.push(a);if((da<0&&db>0)||(da>0&&db<0)){const t=da/(da-db);next.push({p:a.p.clone().lerp(b.p,t),uv:a.uv.clone().lerp(b.uv,t)});}}polygon=next;}const tiles=marks.get(family)||[];if(polygon.length>=3)tiles.push({anchor:p,polygon:polygon.map(v=>v.p)});marks.set(family,tiles);
    }
  }return marks;
}
function treePanels(root:THREE.Group,mesh:THREE.Mesh,source:Triangle[],summary:RepairSummary,roots:Set<string>,marks:Map<string,TreeMark[]>):Triangle[]{
 const eligible=source.filter(t=>(t.material.userData.treeInfo||/tree|bush/i.test(t.material.name))&&!isShadow(t.material)&&normal(t).length()>.001&&Math.abs(normal(t).normalize().y)<.9);if(!eligible.length)return source;
 // Authored multipart 3D trees have nonparallel leaf planes. Preserve the whole
 // assembly rather than turning every trunk/leaf face into a separate tree.
 const first=normal(eligible[0]).normalize();if(!eligible.every(t=>Math.abs(normal(t).normalize().dot(first))>.99&&t.material===eligible[0].material))return source;
 const material=eligible[0].material,info=material.userData.treeInfo as {texture?:THREE.Texture;centers:number[];footU?:number;footV:number;family?:string;topV?:number;asset?:string}|undefined,texture=info?.texture||material.map||undefined,pixels=treeImagePixels(texture?.image);if(!pixels)return source;
 const inverse=root.matrixWorld.clone().invert(),family=nativeTreeFamily(material),converted=new Set<Triangle>();
 type Part={pair:Triangle[];minU:number;maxU:number;minV:number;maxV:number;uAxis:THREE.Vector3;vAxis:THREE.Vector3;point:(u:number,v:number)=>THREE.Vector3};const parts:Part[]=[];
 const cards=source.filter(t=>t.material===material&&Math.abs(normal(t).normalize().y)<.99);
 for(let i=0;i<cards.length;i+=2){const pair=cards.slice(i,i+2);if(pair.length!==2)continue;const vertices=pair.flatMap(t=>t.points.map((point,j)=>({point,uv:t.uv[j]}))),unique=new Map(vertices.map(v=>[v.point.toArray().join(',')+':'+v.uv.toArray().join(','),v]));if(unique.size!==4)continue;
  const t=pair[0],[a,b,c]=t.uv,ab=t.points[1].clone().sub(t.points[0]),ac=t.points[2].clone().sub(t.points[0]),du=b.x-a.x,dv=b.y-a.y,eu=c.x-a.x,ev=c.y-a.y,det=du*ev-eu*dv;if(Math.abs(det)<1e-8)continue;
  const uAxis=ab.clone().multiplyScalar(ev).addScaledVector(ac,-dv).divideScalar(det),vAxis=ac.clone().multiplyScalar(du).addScaledVector(ab,-eu).divideScalar(det),point=(u:number,v:number)=>t.points[0].clone().addScaledVector(uAxis,u-a.x).addScaledVector(vAxis,v-a.y);
  if(vertices.some(v=>point(v.uv.x,v.uv.y).distanceTo(v.point)>.001))continue;
  parts.push({pair,uAxis,vAxis,point,minU:Math.min(...vertices.map(v=>v.uv.x)),maxU:Math.max(...vertices.map(v=>v.uv.x)),minV:Math.min(...vertices.map(v=>v.uv.y)),maxV:Math.max(...vertices.map(v=>v.uv.y))});
 }
 const groups=new Map<string,{shape:Partial<TreeShape>;trees:Parameters<typeof addTreeVolumes>[1];fronds:FrondTree[];keys:string[];pairs:Set<Triangle[]>}>(),alias=texture!==material.map,atlas=treeSpriteComponents(pixels).length>1;
 const feet=(sprite:NonNullable<ReturnType<typeof treeSpritePixels>>)=>{const result:number[]=[],y=sprite.bounds[3]-1;let start=-1;for(let x=sprite.bounds[0];x<=sprite.bounds[2];x++){const yes=x<sprite.bounds[2]&&sprite.nativeAlpha[y*pixels.width+x];if(yes&&start<0)start=x;if(!yes&&start>=0){result.push((start+x)/2/pixels.width);start=-1;}}return result;};
 // Atlas crowns and stumps may be authored as two consecutive slanted cards.
 // Only pair disjoint V bands with the same physical horizontal centre/axis.
 const companions=new Map<Part,Part>();for(let i=0;i+1<parts.length;i++){const upper=parts[i],lower=parts[i+1];if(upper.maxV>.65||lower.minV<.5)continue;const upperSprite=treeSpritePixels(pixels,{region:[0,upper.minV,1,upper.maxV]}),lowerSprite=treeSpritePixels(pixels,{region:[0,lower.minV,1,lower.maxV]});if(!upperSprite||!lowerSprite||upperSprite.bounds[3]>lowerSprite.bounds[1])continue;const a=upper.point((upper.minU+upper.maxU)/2,upper.maxV),b=lower.point((lower.minU+lower.maxU)/2,lower.maxV),axis=upper.uAxis.clone().normalize();if(Math.abs(a.clone().sub(b).dot(axis))>.05||Math.abs(axis.dot(lower.uAxis.clone().normalize()))<.999)continue;companions.set(upper,lower);companions.set(lower,upper);}
 for(const part of parts){const localOrigin=part.point(0,0).applyMatrix4(inverse),localU=part.point(1,0).applyMatrix4(inverse).sub(localOrigin),localV=part.point(0,1).applyMatrix4(inverse).sub(localOrigin),width=localU.length(),height=localV.length();if(width<.1||height<1)continue;
  const companion=companions.get(part),lower=companion?(part.minV>companion.minV?part:companion):undefined;
  // A paired atlas is one tree: do not also revolve its lower ground patch
  // into a second tall stump after the upper card has made the whole tree.
  if(lower===part)continue;
  // Isolated nearly-horizontal cards are ground art, not upright trees.
  if(Math.abs(normal(part.pair[0]).normalize().y)>=.9&&!lower)continue;
  const full=!atlas&&!lower,rootPart=lower??part,rootRegion=[0,Math.max(0,rootPart.minV),1,Math.min(1,rootPart.maxV)]as const,rootSprite=treeSpritePixels(pixels,full?{footV:info?.footV,footU:info?.footU}:{region:rootRegion});if(!rootSprite)continue;
  const sourceOffsets=alias||full?(info?.centers??[rootSprite.shape.footU]):lower?feet(rootSprite):(info?.centers??[rootSprite.shape.footU]),baseOffsets=sourceOffsets.length?sourceOffsets:[rootSprite.shape.footU];
   const markerAt=(ground:THREE.Vector3)=>{const floorY=Math.min(...rootPart.pair.flatMap(t=>t.points.map(p=>p.y))),axis=rootPart.uAxis.clone().normalize(),pixel=rootPart.uAxis.length()/pixels.width;
    const contains=(polygon:THREE.Vector3[])=>{for(let i=1;i+1<polygon.length;i++){const[a,b,c]=[polygon[0],polygon[i],polygon[i+1]],den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(!den)continue;const wa=((b.z-c.z)*(ground.x-c.x)+(c.x-b.x)*(ground.z-c.z))/den,wb=((c.z-a.z)*(ground.x-c.x)+(a.x-c.x)*(ground.z-c.z))/den;if(wa>=0&&wb>=0&&wa+wb<=1)return true;}return false;};
    const owners=(marks.get(family)||[]).filter(mark=>Math.abs(mark.anchor.y-floorY)<1e-5&&Math.abs(mark.anchor.clone().sub(ground).dot(axis))<=pixel*.5&&contains(mark.polygon)),unique=new Map(owners.map(mark=>[mark.anchor.toArray().join(','),mark.anchor]));return unique.size===1?[...unique.values()][0]:undefined;
   };

  const columns:number[]=[];for(let tile=Math.floor(rootPart.minU);tile<Math.ceil(rootPart.maxU);tile++)for(const offset of baseOffsets)if(tile+offset>=rootPart.minU-1e-5&&tile+offset<=rootPart.maxU+1e-5)columns.push(tile+offset);
  const hasNativeRoot=columns.length>0;if(alias&&!hasNativeRoot){const all:number[]=[];for(let tile=Math.floor(rootPart.minU)-1;tile<=Math.ceil(rootPart.maxU)+1;tile++)for(const offset of baseOffsets)all.push(tile+offset);columns.push(Math.max(...all.filter(u=>u<rootPart.minU)),Math.min(...all.filter(u=>u>rootPart.maxU)));}
  // A rootless sliver may be removed only after BOTH owners are proven.
  // Do not hide the whole card after replacing just one neighbouring plant.
  if(alias&&!hasNativeRoot&&!columns.every(u=>{const p=rootPart.point(u,info?.footV??rootSprite.shape.footV);if(markerAt(p))return true;const prefix=family+':'+p.toArray().map(n=>Math.round(n*100)).join(',')+':';return[...roots].some(key=>key.startsWith(prefix));}))continue;
  for(const rootU of columns){if(!Number.isFinite(rootU))continue;const offset=((rootU%1)+1)%1,outside=rootU<rootPart.minU-1e-5||rootU>rootPart.maxU+1e-5;
   const ground=rootPart.point(rootU,alias?(info?.footV??rootSprite.shape.footV):rootSprite.shape.footV);let ownedMarker:THREE.Vector3|undefined;
   ownedMarker=markerAt(ground);if(outside&&!ownedMarker)continue;
   const partBottom=part.point(0,part.maxV),u=ground.clone().sub(partBottom).dot(part.uAxis)/part.uAxis.lengthSq(),partTile=Math.floor(u),partOffset=u-partTile;
   if(!outside&&(u<part.minU-1e-5||u>part.maxU+1e-5))continue;
   const at=baseOffsets.indexOf(offset),left=at? (baseOffsets[at-1]+offset)/2:0,right=at+1<baseOffsets.length?(offset+baseOffsets[at+1])/2:1;
   // A root's atlas cell is bounded by neighbouring native root columns. For a
   // single selected half-atlas card, its literal U range is the tighter bound.
   const halfWidth=lower?Math.min(.5,(right-left)*rootPart.uAxis.length()/part.uAxis.length()/2):Infinity;
   const region=[Math.max(0,part.minU-partTile,lower?partOffset-halfWidth:left),Math.max(0,part.minV),Math.min(1,part.maxU-partTile,lower?partOffset+halfWidth:right),Math.min(1,part.maxV)]as const;
   const shape:Partial<TreeShape>=alias||full?{footU:info?.footU??rootSprite.shape.footU,footV:info?.footV??rootSprite.shape.footV,topV:info?.topV}:{region,footU:Math.fround(partOffset)};if(localV.y>0)shape.growth=-1;const sprite=treeSpritePixels(pixels,shape);if(!sprite)continue;
   const stem=part.point(u,alias?(info?.footV??sprite.shape.footV):sprite.shape.footV);if(lower){stem.x=ground.x;stem.z=ground.z;}
   if(ownedMarker){const shift=ownedMarker.clone().sub(ground);stem.add(shift);ground.copy(ownedMarker);}
   const partKey=JSON.stringify(shape),key=family+':'+ground.toArray().map(n=>Math.round(n*100)).join(',')+':'+partKey;if(roots.has(key)){part.pair.forEach(t=>converted.add(t));if(lower)lower.pair.forEach(t=>converted.add(t));continue;}
   const group=groups.get(partKey)??{shape,trees:[],fronds:[],keys:[],pairs:new Set<Triangle[]>()};if(group.keys.includes(key)){part.pair.forEach(t=>converted.add(t));if(lower)lower.pair.forEach(t=>converted.add(t));continue;}const center=stem.applyMatrix4(inverse);center.y-=height*(1-sprite.shape.footV);
   const tree={center,width,height,axis:localU.clone().normalize(),groundRoot:ground.clone().applyMatrix4(inverse),color:part.pair[0].color[0].clone().multiply(material.color)};
   if(lower){const tile=Math.floor(rootU),rootShape:Partial<TreeShape>={region:[Math.max(0,lower.minU-tile,left),Math.max(0,lower.minV),Math.min(1,lower.maxU-tile,right),Math.min(1,lower.maxV)],footU:offset},rootPixels=treeSpritePixels(pixels,rootShape);if(!rootPixels)continue;const origin=lower.point(0,0).applyMatrix4(inverse),uAxis=lower.point(1,0).applyMatrix4(inverse).sub(origin),vAxis=lower.point(0,1).applyMatrix4(inverse).sub(origin),contact=treeFrondContact(sprite),crownY=part.point(partTile+contact.u,contact.v).applyMatrix4(inverse).y;
    group.fronds.push({...tree,crownY,rootWidth:uAxis.length(),rootHeight:Math.abs(vAxis.y),rootAxis:uAxis.normalize(),rootShape,rootColor:lower.pair[0].color[0].clone().multiply(lower.pair[0].material.color)});group.pairs.add(lower.pair);
   }else group.trees.push(tree);
   group.keys.push(key);group.pairs.add(part.pair);groups.set(partKey,group);
  }
 }
 for(const group of groups.values())if(group.fronds.length?addTreeFronds(root,group.fronds,texture,group.shape):addTreeVolumes(root,group.trees,texture,group.shape)){group.keys.forEach(key=>roots.add(key));group.pairs.forEach(pair=>pair.forEach(t=>converted.add(t)));summary.billboardTrees+=group.trees.length+group.fronds.length*2;}

 // A pure atlas gap can also belong to complete canonical cards in another
 // primitive. Require BOTH literal UV-derived root points to be owned already;
 // no nearest-marker/proximity substitution is allowed on this removal path.
 if(alias&&info?.centers.length)for(const part of parts){if(part.pair.some(t=>converted.has(t)))continue;const columns:number[]=[];for(let tile=Math.floor(part.minU)-1;tile<=Math.ceil(part.maxU)+1;tile++)for(const center of info.centers)columns.push(tile+center);if(columns.some(u=>u>=part.minU&&u<=part.maxU))continue;const left=Math.max(...columns.filter(u=>u<part.minU)),right=Math.min(...columns.filter(u=>u>part.maxU));if(!Number.isFinite(left)||!Number.isFinite(right))continue;
  const owned=[left,right].every(u=>{const stem=part.point(u,info.footV),prefix=family+':'+stem.toArray().map(n=>Math.round(n*100)).join(',')+':';return[...roots].some(key=>key.startsWith(prefix));});if(owned)part.pair.forEach(t=>converted.add(t));
 }

 if(!converted.size)return source;mesh.visible=false;
 // Remove cards only after their actual pixels produced a complete volume.
 // Mixed-mesh shadows/ground marks keep their original geometry and UVs.
 const remaining=new Map<THREE.MeshBasicMaterial,Triangle[]>();for(const triangle of source)if(!converted.has(triangle)){const group=remaining.get(triangle.material)||[];group.push(triangle);remaining.set(triangle.material,group);}
 for(const [material,triangles]of remaining){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(triangles.flatMap(t=>t.points.flatMap(p=>p.clone().applyMatrix4(inverse).toArray())),3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(triangles.flatMap(t=>t.uv.flatMap(p=>p.toArray())),2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(triangles.flatMap(t=>t.color.flatMap(p=>p.toArray())),3));geometry.setAttribute('sceneryRoot',new THREE.Float32BufferAttribute(triangles.flatMap(t=>t.points.flatMap(()=>t.root?[...t.root.clone().applyMatrix4(inverse).toArray(),1]:[0,0,0,0])),4));geometry.computeVertexNormals();const leftover=new THREE.Mesh(geometry,material);leftover.name='original-scenery-remainder';root.add(leftover);}
 return source.filter(t=>!converted.has(t));
}

/** Shared by every imported landscape/prop, including future streamed locations. */
export function repairOriginalAsset(root:THREE.Group,isProp:boolean):RepairSummary{
  root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const solidSeats=isProp?solidFurniture(root):0;root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const meshes:THREE.Mesh[]=[];root.traverseVisible(object=>{if(object instanceof THREE.Mesh)meshes.push(object);});
  const summary={solidFaces:0,billboardTrees:0,uprightPanels:0,fencePosts:0,flowerClumps:0,terrainSkirts:0,solidRocks:0,solidSeats};const solid:Triangle[]=[],sources=meshes.map(mesh=>triangles(mesh)),ground=sources.flat(),marks=groundTreeMarks(ground),roots=new Set<string>();
  for(let i=0;i<meshes.length;i++){const fences=solidFences(root,meshes[i],sources[i],ground,summary),adjusted=uprightScenery(root,fences.mesh,fences.source,ground,summary),flowers=flowerVolume(root,adjusted.mesh,adjusted.source,summary),rocks=rockVolume(root,flowers.mesh,flowers.source,ground,summary);solid.push(...treePanels(root,rocks.mesh,rocks.source,summary,roots,marks));}
  // Some native primitives contain only the narrow gap between two roots whose
  // complete cards occur in a later primitive. Revisit those leftovers after
  // every valid replacement exists; the same two-root ownership check applies.
  root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const remainders:THREE.Mesh[]=[];root.traverseVisible(o=>{if(o instanceof THREE.Mesh&&o.name==='original-scenery-remainder')remainders.push(o);});for(const remainder of remainders)treePanels(root,remainder,triangles(remainder),summary,roots,marks);
  if(isProp)closeProps(root,solid,summary);else closeTerrain(root,solid,summary);root.userData.renderRepairs=summary;return summary;
}
