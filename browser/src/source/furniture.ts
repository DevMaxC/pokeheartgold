import * as THREE from 'three';

type Seat={cardY:number;height:number;top:[number,number,number,number];rim:[number,number];support:[number,number];kind:'legs'|'round'|'pedestal'|'cushion'|'box'|'bench'};
// These are the native 16×16 furniture sprites, not a name-based guess at all
// horizontal props. The Japanese seat is a floor cushion; ch_l01 also supplies
// the long bench. The box variant deliberately has no chair legs.
const seats:Record<string,Seat>={
  chair01_mat:{cardY:2.5,height:8,top:[2.5,1.5,13.5,9.5],rim:[8,10],support:[3,12],kind:'legs'},
  chair02_mat:{cardY:2.5,height:8,top:[1.5,1.5,14.5,9.5],rim:[8,10],support:[3,12],kind:'round'},
  chair03mat:{cardY:2.5,height:8,top:[2.5,1.5,13.5,9.5],rim:[8,10],support:[3,12],kind:'legs'},
  chair03mat1:{cardY:2.5,height:8,top:[1.5,1.5,13.5,9.5],rim:[8,11],support:[8,11],kind:'box'},
  pc_s05a:{cardY:1,height:8,top:[1.5,1.5,14.5,10.5],rim:[8,12],support:[8,13],kind:'pedestal'},
  pc_s05b:{cardY:1,height:8,top:[1.5,1.5,14.5,10.5],rim:[8,12],support:[8,13],kind:'pedestal'},
  chair_jpn01:{cardY:2,height:2.5,top:[1.5,1.5,14.5,12.5],rim:[8,13],support:[8,13],kind:'cushion'},
  ch_l01:{cardY:1,height:8,top:[2.5,1.5,13.5,9.5],rim:[8,10],support:[2,13],kind:'bench'},
};

/** Replace only known, flat native seats. The solid mesh remains a cached prop
 * template, so ordinary prop transforms and streaming still own its placement. */
export function solidFurniture(root:THREE.Group){
  const meshes:THREE.Mesh[]=[];root.traverseVisible(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});const inverse=root.matrixWorld.clone().invert();let count=0;
  for(const mesh of meshes){
    if(mesh.name==='solid-original-furniture'||Array.isArray(mesh.material))continue;
    const original=mesh.material as THREE.MeshBasicMaterial,spec=seats[original.name];if(!spec)continue;
    const geometry=mesh.geometry,position=geometry.getAttribute('position'),textureUV=geometry.getAttribute('uv'),index=geometry.index;if(!textureUV)continue;
    const vertices=Array.from({length:index?.count??position.count},(_,i)=>{const id=index?index.getX(i):i;return {p:mesh.getVertexPosition(id,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse),uv:new THREE.Vector2(textureUV.getX(id),textureUV.getY(id))};});
    const bounds=new THREE.Box3().setFromPoints(vertices.map(v=>v.p));if(bounds.max.y-bounds.min.y>3.01)continue;
    // The UV derivatives preserve authored orientation, including flipped cards.
    let across:THREE.Vector3|undefined,along:THREE.Vector3|undefined;
    for(let i=0;i<vertices.length;i+=3){const[a,b,c]=vertices.slice(i,i+3),du=b.uv.clone().sub(a.uv),dv=c.uv.clone().sub(a.uv),den=du.x*dv.y-du.y*dv.x;if(Math.abs(den)<1e-6)continue;
      across=b.p.clone().sub(a.p).multiplyScalar(dv.y).addScaledVector(c.p.clone().sub(a.p),-du.y).divideScalar(den);across.y=0;across.normalize();
      along=c.p.clone().sub(a.p).multiplyScalar(du.x).addScaledVector(b.p.clone().sub(a.p),-dv.x).divideScalar(den);along.y=0;along.normalize();break;
    }
    if(!across||!along||across.lengthSq()<.99||along.lengthSq()<.99||Math.abs(across.dot(along))>.01)continue;
    const xs=vertices.map(v=>v.p.dot(across!)),zs=vertices.map(v=>v.p.dot(along!)),width=Math.max(...xs)-Math.min(...xs),depth=Math.max(...zs)-Math.min(...zs);if(width<12||width>17||depth<12||depth>65)continue;
    const centre=across.clone().multiplyScalar((Math.max(...xs)+Math.min(...xs))/2).addScaledVector(along,(Math.max(...zs)+Math.min(...zs))/2),floor=bounds.min.y-spec.cardY;
    const positions:number[]=[],uvs:number[]=[],colors:number[]=[],color=geometry.getAttribute('color'),tint=color?new THREE.Color(color.getX(index?index.getX(0):0),color.getY(index?index.getX(0):0),color.getZ(index?index.getX(0):0)):new THREE.Color(1,1,1);
    // Native GLBs use both [0,1] and [-1,0] texture coordinates.
    const vOffset=Math.floor(Math.min(...vertices.map(v=>v.uv.y))+.0001),pixel=(x:number,y:number)=>new THREE.Vector2((x+.5)/16,vOffset+(y+.5)/16);
    const point=(x:number,y:number,z:number)=>centre.clone().addScaledVector(across!,x).addScaledVector(along!,z).add(new THREE.Vector3(0,floor+y,0));
    const triangle=(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3,uv:THREE.Vector2[],normal:THREE.Vector3)=>{const ps=[a,b,c];if(b.clone().sub(a).cross(c.clone().sub(a)).dot(normal)<0){[ps[1],ps[2]]=[ps[2],ps[1]];[uv[1],uv[2]]=[uv[2],uv[1]];}for(let i=0;i<3;i++){positions.push(...ps[i].toArray());uvs.push(...uv[i].toArray());colors.push(...tint.toArray());}};
    const prism=(outline:THREE.Vector2[],bottom:number,top:number,topUV:(p:THREE.Vector2)=>THREE.Vector2,sideUV:THREE.Vector2)=>{
      const centre2=outline.reduce((c,p)=>c.add(p),new THREE.Vector2()).divideScalar(outline.length),up=new THREE.Vector3(0,1,0);
      for(let i=0;i<outline.length;i++){const a=outline[i],b=outline[(i+1)%outline.length];triangle(point(centre2.x,top,centre2.y),point(a.x,top,a.y),point(b.x,top,b.y),[topUV(centre2),topUV(a),topUV(b)],up);triangle(point(centre2.x,bottom,centre2.y),point(b.x,bottom,b.y),point(a.x,bottom,a.y),[sideUV.clone(),sideUV.clone(),sideUV.clone()],up.clone().negate());const outward=across!.clone().multiplyScalar((a.x+b.x)/2-centre2.x).addScaledVector(along!, (a.y+b.y)/2-centre2.y);triangle(point(a.x,bottom,a.y),point(b.x,bottom,b.y),point(b.x,top,b.y),[sideUV.clone(),sideUV.clone(),sideUV.clone()],outward);triangle(point(a.x,bottom,a.y),point(b.x,top,b.y),point(a.x,top,a.y),[sideUV.clone(),sideUV.clone(),sideUV.clone()],outward);}
    };
    const rectangle=(x:number,z:number,w:number,d:number)=>[new THREE.Vector2(x-w/2,z-d/2),new THREE.Vector2(x+w/2,z-d/2),new THREE.Vector2(x+w/2,z+d/2),new THREE.Vector2(x-w/2,z+d/2)];
    const w=width*(spec.kind==='round'||spec.kind==='pedestal'||spec.kind==='cushion'?.875:.75),d=depth*(['round','pedestal','cushion','bench'].includes(spec.kind)?.875:.75),h=spec.height,thickness=spec.kind==='cushion'?h:2;
    const outline=spec.kind==='round'?Array.from({length:16},(_,i)=>new THREE.Vector2(Math.cos(i*Math.PI/8)*w/2,Math.sin(i*Math.PI/8)*d/2)):[new THREE.Vector2(-w/2+2,-d/2),new THREE.Vector2(w/2-2,-d/2),new THREE.Vector2(w/2,-d/2+2),new THREE.Vector2(w/2,d/2-2),new THREE.Vector2(w/2-2,d/2),new THREE.Vector2(-w/2+2,d/2),new THREE.Vector2(-w/2,d/2-2),new THREE.Vector2(-w/2,-d/2+2)];
    const [u0,v0,u1,v1]=spec.top,rim=pixel(...spec.rim),support=pixel(...spec.support);
    prism(outline,spec.kind==='box'?0:h-thickness,h,p=>new THREE.Vector2((u0+(p.x/w+.5)*(u1-u0))/16,vOffset+(v0+(p.y/d+.5)*(v1-v0))/16),rim);
    if(['legs','round','bench'].includes(spec.kind))for(const x of [-w/2+1.5,w/2-1.5])for(const z of [-d/2+1.5,d/2-1.5])prism(rectangle(x,z,2,2),0,h-thickness,()=>support.clone(),support);
    if(spec.kind==='pedestal'){prism(rectangle(0,0,5,5),1,h-thickness,()=>support.clone(),support);prism(rectangle(0,0,10,10),0,1,()=>support.clone(),support);}
    const solid=new THREE.BufferGeometry();solid.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));solid.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));solid.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));solid.computeVertexNormals();const material=original.clone();material.transparent=false;material.opacity=1;material.alphaTest=0;material.depthWrite=true;material.side=THREE.FrontSide;const furniture=new THREE.Mesh(solid,material);furniture.name='solid-original-furniture';furniture.userData.seatKind=spec.kind;root.add(furniture);mesh.visible=false;count++;
  }
  return count;
}
