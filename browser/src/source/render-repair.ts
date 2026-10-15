import * as THREE from 'three';

type Triangle={points:THREE.Vector3[];uv:THREE.Vector2[];color:THREE.Color[];material:THREE.MeshBasicMaterial};
type RepairSummary={solidFaces:number;billboardTrees:number};
const isShadow=(m:THREE.MeshBasicMaterial)=>/kage|shadow/i.test(m.name)||m.opacity<.5;
export function originalMaterial(old:THREE.MeshStandardMaterial){
  const material=new THREE.MeshBasicMaterial({map:old.map,color:old.color,transparent:old.transparent,opacity:old.opacity,alphaTest:old.alphaTest,depthWrite:old.depthWrite,depthTest:old.depthTest,side:THREE.DoubleSide,vertexColors:old.vertexColors});material.name=old.name;
  if(material.map){material.map.magFilter=THREE.NearestFilter;material.map.minFilter=THREE.NearestFilter;material.map.generateMipmaps=false;}return material;
}

function triangles(mesh:THREE.Mesh):Triangle[]{
  const geometry=mesh.geometry,position=geometry.getAttribute('position'),uv=geometry.getAttribute('uv'),color=geometry.getAttribute('color'),index=geometry.getIndex();
  const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];const groups=geometry.groups.length?geometry.groups:[{start:0,count:index?.count??position.count,materialIndex:0}];const result:Triangle[]=[];
  for(const group of groups){const material=(materials[group.materialIndex??0]||materials[0]) as THREE.MeshBasicMaterial;
    for(let i=group.start;i<group.start+group.count;i+=3){const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j);result.push({points:ids.map(id=>mesh.getVertexPosition(id,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld)),uv:ids.map(id=>uv?new THREE.Vector2(uv.getX(id),uv.getY(id)):new THREE.Vector2()),color:ids.map(id=>color?new THREE.Color(color.getX(id),color.getY(id),color.getZ(id)):new THREE.Color(1,1,1)),material});}
  }return result;
}
function normal(triangle:Triangle){const [a,b,c]=triangle.points;return new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a));}
function averageColor(material:THREE.MeshBasicMaterial){
  if(material.userData.solidColor)return (material.userData.solidColor as THREE.Color).clone();
  const result=material.color.clone();const image=material.map?.image as CanvasImageSource&{width?:number;height?:number};
  if(image?.width&&image.height){try{const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(image,0,0,32,32);const pixels=ctx.getImageData(0,0,32,32).data;let r=0,g=0,b=0,n=0;for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]<200)continue;r+=pixels[i];g+=pixels[i+1];b+=pixels[i+2];n++;}if(n)result.multiply(new THREE.Color(r/n/255,g/n/255,b/n/255).convertSRGBToLinear());}catch{/* A solid source material color remains a valid fallback. */}}
  material.userData.solidColor=result;return result;
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
function closeProps(root:THREE.Group,source:Triangle[],summary:RepairSummary){const solid=source.filter(t=>!isShadow(t.material)&&!/tree|foliage|leaf|flower|grass|bush/i.test(t.material.name));for(const component of components(solid))closeComponent(root,component,summary);}

function groundTreeAnchors(source:Triangle[]){
  const anchors=new Map<string,THREE.Vector3[]>(),seen=new Set<string>();
  for(const triangle of source){if(!/_(un)$/.test(triangle.material.name)||Math.abs(normal(triangle).normalize().y)<.9)continue;const [a,b,c]=triangle.uv,den=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(den)<1e-6)continue;
    for(let u=Math.floor(Math.min(a.x,b.x,c.x));u<Math.ceil(Math.max(a.x,b.x,c.x));u++)for(let v=Math.floor(Math.min(a.y,b.y,c.y));v<Math.ceil(Math.max(a.y,b.y,c.y));v++){
      const x=u+.5,y=v+.5,wa=((b.y-c.y)*(x-c.x)+(c.x-b.x)*(y-c.y))/den,wb=((c.y-a.y)*(x-c.x)+(a.x-c.x)*(y-c.y))/den,wc=1-wa-wb;if(Math.min(wa,wb,wc)<-1e-5)continue;
      const p=triangle.points[0].clone().multiplyScalar(wa).addScaledVector(triangle.points[1],wb).addScaledVector(triangle.points[2],wc),family=triangle.material.name.replace(/_un$/,''),key=family+':'+p.toArray().map(n=>Math.round(n*100)).join(',');if(seen.has(key))continue;seen.add(key);const group=anchors.get(family)||[];group.push(p);anchors.set(family,group);
    }
  }return anchors;
}
function treePanels(root:THREE.Group,mesh:THREE.Mesh,source:Triangle[],summary:RepairSummary,anchors:Map<string,THREE.Vector3[]>,roots:Set<string>):Triangle[]{
  const eligible=source.filter(t=>/tree|bush/i.test(t.material.name)&&!isShadow(t.material)&&normal(t).length()>.001&&Math.abs(normal(t).normalize().y)<.9);if(!eligible.length)return source;
  const first=normal(eligible[0]).normalize();if(!eligible.every(t=>Math.abs(normal(t).normalize().dot(first))>.99&&t.material.map===eligible[0].material.map))return source;
  const horizontal=new THREE.Vector3(first.z,0,-first.x).normalize();if((Math.abs(horizontal.x)>Math.abs(horizontal.z)?horizontal.x:horizontal.z)<0)horizontal.negate();
  const converted=new Set<Triangle>();
  const info=eligible[0].material.userData.treeInfo as {texture:THREE.Texture;centers:number[];footV:number}|undefined;
  const family=eligible[0].material.name.replace(/_re$/,''),centers=info?.centers||[.5],footV=info?.footV??1;
  const panels:{center:THREE.Vector3;width:number;height:number;uv:number[];offset:number;color:THREE.Color}[]=[];
  for(let i=0;i<eligible.length;i+=2){const pair=eligible.slice(i,i+2);if(pair.length!==2)continue;
    const vertices=pair.flatMap(t=>t.points.map((point,j)=>({point,uv:t.uv[j]}))),lower=Math.min(...vertices.map(v=>v.point.y)),upper=Math.max(...vertices.map(v=>v.point.y));if(upper-lower<1)continue;
    const bottom=vertices.filter(v=>Math.abs(v.point.y-lower)<.01),top=vertices.filter(v=>Math.abs(v.point.y-upper)<.01);if(!bottom.length||!top.length)continue;
    const left=bottom.reduce((a,b)=>a.point.dot(horizontal)<b.point.dot(horizontal)?a:b),right=bottom.reduce((a,b)=>a.point.dot(horizontal)>b.point.dot(horizontal)?a:b),width=right.point.clone().sub(left.point).dot(horizontal),uLeft=left.uv.x,uRight=right.uv.x;if(width<.1||Math.abs(uRight-uLeft)<.001)continue;
    const bottomCenter=left.point.clone().add(right.point).multiplyScalar(.5),topCenter=top[0].point.clone();topCenter.addScaledVector(horizontal,bottomCenter.dot(horizontal)-topCenter.dot(horizontal));
    const height=bottomCenter.distanceTo(topCenter),fullWidth=width/Math.abs(uRight-uLeft),minimum=Math.min(uLeft,uRight),maximum=Math.max(uLeft,uRight);
    // Forest textures contain several trunks, and source quads repeat that
    // texture. Each trunk gets its own full original-tree billboard and pivot.
    let resolved=false;for(let tile=Math.floor(minimum);tile<Math.ceil(maximum);tile++)for(const offset of centers){const u=tile+offset;if(u<minimum-1e-5||u>maximum+1e-5)continue;resolved=true;
      const stem=left.point.clone().addScaledVector(horizontal,(u-uLeft)/(uRight-uLeft)*width),nearby=(anchors.get(family)||[]).filter(p=>p.distanceTo(stem)<fullWidth*.6).sort((a,b)=>a.distanceToSquared(stem)-b.distanceToSquared(stem));if(nearby.length)stem.copy(nearby[0]);
      const key=family+':'+stem.toArray().map(n=>Math.round(n*100)).join(',');if(roots.has(key))continue;roots.add(key);
      const center=stem.clone();center.y-=height*(1-footV);panels.push({center,width:fullWidth,height,uv:[uRight>uLeft?0:1,bottom[0].uv.y,uRight>uLeft?1:0,top[0].uv.y],offset:0,color:pair[0].color[0]});
    }if(resolved)for(const triangle of pair)converted.add(triangle);
  }
  if(!converted.size)return source;
  if(panels.length){
  const base=new THREE.PlaneGeometry(1,1);base.translate(0,.5,0);const geometry=new THREE.InstancedBufferGeometry();geometry.index=base.index;for(const [name,attribute]of Object.entries(base.attributes))geometry.setAttribute(name,attribute);
  geometry.setAttribute('uvRect',new THREE.InstancedBufferAttribute(new Float32Array(panels.flatMap(p=>p.uv)),4));geometry.setAttribute('pivotOffset',new THREE.InstancedBufferAttribute(new Float32Array(panels.map(p=>p.offset)),1));geometry.setAttribute('treeColor',new THREE.InstancedBufferAttribute(new Float32Array(panels.flatMap(p=>p.color.toArray())),3));
  const material=new THREE.ShaderMaterial({uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{map:{value:info?.texture||eligible[0].material.map}}]),fog:true,side:THREE.DoubleSide,vertexShader:`
    attribute vec4 uvRect; attribute float pivotOffset; attribute vec3 treeColor;
    varying vec2 vUv; varying vec3 vColor;
    #include <fog_pars_vertex>
    void main(){
      mat4 objectInstance=modelMatrix*instanceMatrix;
      vec3 center=(objectInstance*vec4(0.,0.,0.,1.)).xyz;
      vec3 right=normalize(vec3(viewMatrix[0][0],0.,viewMatrix[2][0]));
      vec3 worldPosition=center+right*(position.x+pivotOffset)*length(objectInstance[0].xyz)+vec3(0.,position.y*length(objectInstance[1].xyz),0.);
      vec4 mvPosition=viewMatrix*vec4(worldPosition,1.);
      gl_Position=projectionMatrix*mvPosition;
      vUv=vec2(mix(uvRect.x,uvRect.z,uv.x),mix(uvRect.y,uvRect.w,uv.y));vColor=treeColor;
      #include <fog_vertex>
    }`,fragmentShader:`
    uniform sampler2D map;varying vec2 vUv;varying vec3 vColor;
    #include <fog_pars_fragment>
    void main(){vec4 sampleColor=texture2D(map,vUv);if(sampleColor.a<.45)discard;gl_FragColor=vec4(sampleColor.rgb*vColor,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`});
  const trees=new THREE.InstancedMesh(geometry,material,panels.length),dummy=new THREE.Object3D();trees.name='camera-facing-original-trees';trees.frustumCulled=false;trees.userData.footV=footV;
  panels.forEach((p,i)=>{dummy.position.copy(p.center);dummy.scale.set(p.width,p.height,1);dummy.updateMatrix();trees.setMatrixAt(i,dummy.matrix);});root.add(trees);summary.billboardTrees+=panels.length;
  }mesh.visible=false;
  // Preserve non-tree parts, shadows and degenerate triangles in mixed meshes.
  const remaining=new Map<THREE.MeshBasicMaterial,Triangle[]>();for(const triangle of source)if(!converted.has(triangle)){const group=remaining.get(triangle.material)||[];group.push(triangle);remaining.set(triangle.material,group);}
  for(const [material,triangles]of remaining){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(triangles.flatMap(t=>t.points.flatMap(p=>p.toArray())),3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(triangles.flatMap(t=>t.uv.flatMap(p=>p.toArray())),2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(triangles.flatMap(t=>t.color.flatMap(p=>p.toArray())),3));geometry.computeVertexNormals();const leftover=new THREE.Mesh(geometry,material);leftover.name='original-scenery-remainder';root.add(leftover);}
  return source.filter(t=>!converted.has(t));
}

/** Shared by every imported landscape/prop, including future streamed locations. */
export function repairOriginalAsset(root:THREE.Group,isProp:boolean):RepairSummary{
  root.updateMatrixWorld(true);const meshes:THREE.Mesh[]=[];root.traverse(object=>{if(object instanceof THREE.Mesh)meshes.push(object);});
  const summary={solidFaces:0,billboardTrees:0};const solid:Triangle[]=[],sources=meshes.map(mesh=>triangles(mesh)),anchors=groundTreeAnchors(sources.flat()),roots=new Set<string>();
  for(let i=0;i<meshes.length;i++)solid.push(...treePanels(root,meshes[i],sources[i],summary,anchors,roots));
  if(isProp)closeProps(root,solid,summary);root.userData.renderRepairs=summary;return summary;
}
