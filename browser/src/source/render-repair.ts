import * as THREE from 'three';

type Triangle={points:THREE.Vector3[];uv:THREE.Vector2[];color:THREE.Color[];material:THREE.MeshBasicMaterial};
type RepairSummary={solidFaces:number;billboardTrees:number};
const isShadow=(m:THREE.MeshBasicMaterial)=>/kage|shadow/i.test(m.name)||m.opacity<.5;

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
  const parent=source.map((_,i)=>i),vertices=new Map<string,number>();const find=(i:number):number=>parent[i]===i?i:(parent[i]=find(parent[i]));
  source.forEach((triangle,i)=>{for(const p of triangle.points){const key=p.toArray().map(v=>Math.round(v*1000)).join(',');const previous=vertices.get(key);if(previous===undefined)vertices.set(key,i);else parent[find(i)]=find(previous);}});
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
    const byMaterial=new Map<THREE.MeshBasicMaterial,{positions:number[];uvs:number[];colors:number[]}>();const sidePositions:number[]=[];const sideColors:number[]=[];
    for(const triangle of faces){
      // Each disconnected component uses its own bounds: a mailbox stays at its
      // original position rather than being projected to the back of its building.
      const rear=thin?target-sign*1.5:target;
      const cap=triangle.points.map(p=>{const q=p.clone();q.setComponent(axis,thin?rear:bounds.min.getComponent(axis)+bounds.max.getComponent(axis)-p.getComponent(axis));return q;}).map((_,i,points)=>points[[0,2,1][i]]);
      let attributes=byMaterial.get(triangle.material);if(!attributes){attributes={positions:[],uvs:[],colors:[]};byMaterial.set(triangle.material,attributes);}
      for(const [vertex,index]of cap.map((p,i)=>[p,[0,2,1][i]] as const)){attributes.positions.push(...vertex.toArray());attributes.uvs.push(...triangle.uv[index].toArray());attributes.colors.push(...triangle.color[index].toArray());}
      const fill=averageColor(triangle.material);
      // A solid backing closes cut-out texture pixels without flattening the original front artwork.
      for(const p of cap){const q=p.clone();q.setComponent(axis,q.getComponent(axis)+sign*.025);sidePositions.push(...q.toArray());sideColors.push(...fill.toArray());}
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
    const backAt=(thin?target-sign*1.5:target)+sign*.025;
    for(let i=1;i<hull.length-1;i++)for(const point of [hull[0],hull[i],hull[i+1]]){const vertex=new THREE.Vector3();vertex.y=point.y;vertex.setComponent(sideAxis,point.x);vertex.setComponent(axis,backAt);sidePositions.push(...vertex.toArray());sideColors.push(...fill.toArray());summary.solidFaces++;}
    for(const [material,attributes]of byMaterial){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(attributes.positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(attributes.uvs,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(attributes.colors,3));geometry.computeVertexNormals();const cap=new THREE.Mesh(geometry,material);cap.name='3d-rear-facade';root.add(cap);}
    if(sidePositions.length){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(sidePositions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(sideColors,3));geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide}));mesh.name='3d-solid-backing';root.add(mesh);}
  }
}
function closeProps(root:THREE.Group,source:Triangle[],summary:RepairSummary){const solid=source.filter(t=>!isShadow(t.material)&&!/tree|foliage|leaf|flower|grass|bush/i.test(t.material.name));for(const component of components(solid))closeComponent(root,component,summary);}

function treePanels(root:THREE.Group,mesh:THREE.Mesh,source:Triangle[],summary:RepairSummary){
  const eligible=source.length>0&&source.every(t=>/tree|bush/i.test(t.material.name)&&!isShadow(t.material));if(!eligible)return false;
  const first=normal(source[0]).normalize();if(Math.abs(first.y)>.9)return false;
  if(!source.every(t=>normal(t).normalize().dot(first)>.99))return false;
  const panels:{center:THREE.Vector3;width:number;height:number;uv:number[];offset:number;color:THREE.Color}[]=[];
  for(let i=0;i<source.length;i+=2){const pair=source.slice(i,i+2),points=pair.flatMap(t=>t.points),uvs=pair.flatMap(t=>t.uv);
    if(pair.length!==2)continue;const lower=Math.min(...points.map(p=>p.y)),upper=Math.max(...points.map(p=>p.y));if(upper-lower<1)continue;
    const bottom=points.filter(p=>Math.abs(p.y-lower)<.01),top=points.filter(p=>Math.abs(p.y-upper)<.01);if(!bottom.length||!top.length)continue;
    const left=Math.min(...bottom.map(p=>p.x)),right=Math.max(...bottom.map(p=>p.x)),u0=Math.min(...uvs.map(p=>p.x)),u1=Math.max(...uvs.map(p=>p.x));if(right-left<.1||u1-u0<.001)continue;
    const width=right-left,fullWidth=width/(u1-u0);const centerX=left+(.5-u0)*fullWidth;
    const bottomZ=bottom.reduce((n,p)=>n+p.z,0)/bottom.length,topZ=top.reduce((n,p)=>n+p.z,0)/top.length;
    panels.push({center:new THREE.Vector3(centerX,lower,bottomZ),width,height:Math.hypot(upper-lower,topZ-bottomZ),uv:[u0,Math.min(...uvs.map(p=>p.y)),u1,Math.max(...uvs.map(p=>p.y))],offset:((left+right)/2-centerX)/width,color:pair[0].color[0]});
  }
  if(!panels.length)return false;
  const base=new THREE.PlaneGeometry(1,1);base.translate(0,.5,0);const geometry=new THREE.InstancedBufferGeometry();geometry.index=base.index;for(const [name,attribute]of Object.entries(base.attributes))geometry.setAttribute(name,attribute);
  geometry.setAttribute('uvRect',new THREE.InstancedBufferAttribute(new Float32Array(panels.flatMap(p=>p.uv)),4));geometry.setAttribute('pivotOffset',new THREE.InstancedBufferAttribute(new Float32Array(panels.map(p=>p.offset)),1));geometry.setAttribute('treeColor',new THREE.InstancedBufferAttribute(new Float32Array(panels.flatMap(p=>p.color.toArray())),3));
  const material=new THREE.ShaderMaterial({uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{map:{value:source[0].material.map}}]),fog:true,side:THREE.DoubleSide,vertexShader:`
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
      vUv=vec2(mix(uvRect.x,uvRect.z,uv.x),mix(uvRect.w,uvRect.y,uv.y));vColor=treeColor;
      #include <fog_vertex>
    }`,fragmentShader:`
    uniform sampler2D map;varying vec2 vUv;varying vec3 vColor;
    #include <fog_pars_fragment>
    void main(){vec4 sampleColor=texture2D(map,vUv);if(sampleColor.a<.45)discard;gl_FragColor=vec4(sampleColor.rgb*vColor,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`});
  const trees=new THREE.InstancedMesh(geometry,material,panels.length),dummy=new THREE.Object3D();trees.name='camera-facing-original-trees';trees.frustumCulled=false;
  panels.forEach((p,i)=>{dummy.position.copy(p.center);dummy.scale.set(p.width,p.height,1);dummy.updateMatrix();trees.setMatrixAt(i,dummy.matrix);});root.add(trees);mesh.visible=false;summary.billboardTrees+=panels.length;return true;
}

/** Shared by every imported landscape/prop, including future streamed locations. */
export function repairOriginalAsset(root:THREE.Group,isProp:boolean):RepairSummary{
  root.updateMatrixWorld(true);const meshes:THREE.Mesh[]=[];root.traverse(object=>{if(object instanceof THREE.Mesh)meshes.push(object);});
  const summary={solidFaces:0,billboardTrees:0};const solid:Triangle[]=[];
  for(const mesh of meshes){const source=triangles(mesh);if(!treePanels(root,mesh,source,summary))solid.push(...source);}
  if(isProp)closeProps(root,solid,summary);root.userData.renderRepairs=summary;return summary;
}
