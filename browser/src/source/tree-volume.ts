import * as THREE from 'three';
import {treeImagePixels,treeSpritePixels,treeInteriorPixels,type TreeShape} from './tree-texture.ts';

type Tree={center:THREE.Vector3;width:number;height:number;color:THREE.Color;axis?:THREE.Vector3;groundRoot?:THREE.Vector3};
type Sprite=NonNullable<ReturnType<typeof treeSpritePixels>>;
type Profile={y:number;cx:number;radius:number};
type NativeVolume={sprite:Sprite;leaves:THREE.BufferGeometry;trunks:THREE.BufferGeometry;texture:THREE.DataTexture;canopyBoxes:number[][];profile:Profile[];growth:1|-1};
const volumes=new Map<string,NativeVolume[]>(),sourceVolumes=new WeakMap<THREE.Texture,Map<string,NativeVolume>>();
const sameBytes=(a:ArrayLike<number>,b:ArrayLike<number>)=>a.length===b.length&&Array.from(a).every((v,i)=>v===b[i]);
function nativeVolume(source:THREE.Texture|undefined,shape:Partial<TreeShape>){
 const shapeKey=JSON.stringify(shape),cached=source&&sourceVolumes.get(source)?.get(shapeKey);if(cached)return cached;
 const remember=(volume:NativeVolume)=>{if(source){const entries=sourceVolumes.get(source)??new Map<string,NativeVolume>();entries.set(shapeKey,volume);sourceVolumes.set(source,entries);}return volume;};
 const pixels=treeImagePixels(source?.image);if(!pixels)return null;const sprite=treeSpritePixels(pixels,shape);if(!sprite)return null;
 const growth=shape.growth??1;let hash=2166136261;for(const value of pixels.data)hash=Math.imul(hash^value,16777619);const key=[pixels.width,pixels.height,hash,source?.colorSpace,growth,...Object.values(sprite.shape)].join(','),entries=volumes.get(key)??[],old=entries.find(v=>sameBytes(v.sprite.data,sprite.data)&&sameBytes(v.sprite.nativeAlpha,sprite.nativeAlpha));if(old)return remember(old);
 const[left,top,right,bottom]=sprite.bounds,profile:Profile[]=[],segments=12,rowStep=3;
 const row=(y:number)=>{const opaque:number[]=[];for(let x=left;x<right;x++)if(sprite.nativeAlpha[y*pixels.width+x])opaque.push(x);return opaque;};
 for(let y=top;y<bottom;y+=rowStep){const at=Math.min(bottom-1,Math.floor(y+rowStep/2)),xs=row(at);if(xs.length)profile.push({y:at+.5,cx:(xs[0]+xs.at(-1)!+1)/2,radius:(xs.at(-1)!-xs[0]+1)/2});}
 const first=row(top),last=row(bottom-1);profile.unshift({y:top,cx:(first[0]+first.at(-1)!+1)/2,radius:(first.at(-1)!-first[0]+1)/2});profile.push({y:bottom,cx:(last[0]+last.at(-1)!+1)/2,radius:(last.at(-1)!-last[0]+1)/2});
 const attributes=[null,{p:[]as number[],uv:[]as number[]},{p:[]as number[],uv:[]as number[]}],kinds:number[]=[],boxes=new Map<number,THREE.Box3>(),boxStep=Math.ceil((profile.length-1)/6);
 const point=(ring:number,i:number)=>{const r=profile[ring],angle=(i%segments)/segments*Math.PI*2;return[(r.cx+Math.sin(angle)*r.radius)/pixels.width-sprite.shape.footU,growth*(sprite.shape.footV-r.y/pixels.height),Math.cos(angle)*r.radius*.8/pixels.width];};
 const vertex=(kind:number,p:number[],u:number,v:number)=>{attributes[kind]!.p.push(...p);attributes[kind]!.uv.push(u,v);};
 // Native row widths and centres determine the whole silhouette. Joining the
 // rings continuously avoids the flat shelves and striped faces of voxel caps.
 for(let ring=0;ring+1<profile.length;ring++){
  const a=profile[ring],b=profile[ring+1],kind=(a.y+b.y)/2>=top+(bottom-top)*.7&&a.radius+b.radius<=(right-left)*.35?2:1;kinds.push(kind);
  for(let i=0;i<segments;i++){const j=i+1,u0=i/segments*2,u1=j/segments*2,v0=a.y/pixels.height,v1=b.y/pixels.height,aa=point(ring,i),bb=point(ring+1,i),cc=point(ring+1,j),dd=point(ring,j);for(const[p,u,v]of[[aa,u0,v0],[bb,u0,v1],[cc,u1,v1],[aa,u0,v0],[cc,u1,v1],[dd,u1,v0]]as const)vertex(kind,p,u,v);
   if(kind===1){const key=Math.floor(ring/boxStep),box=boxes.get(key)??new THREE.Box3();for(const p of[aa,bb,cc,dd])box.expandByPoint(new THREE.Vector3(...p.map(Math.fround)));boxes.set(key,box);}
  }
 }
 const cap=(ring:number,kind:number,up:boolean)=>{const r=profile[ring],centre=[r.cx/pixels.width-sprite.shape.footU,growth*(sprite.shape.footV-r.y/pixels.height),0],v=r.y/pixels.height;for(let i=0;i<segments;i++){const a=point(ring,i),b=point(ring,i+1),u0=i/segments*2,u1=(i+1)/segments*2;for(const[p,u]of(up?[[centre,(u0+u1)/2],[a,u0],[b,u1]]:[[centre,(u0+u1)/2],[b,u1],[a,u0]])as[number[],number][])vertex(kind,p,u,v);}};
 cap(0,kinds[0],true);cap(profile.length-1,kinds.at(-1)!,false);for(let i=1;i<kinds.length;i++)if(kinds[i]!==kinds[i-1]){cap(i,kinds[i-1],false);cap(i,kinds[i],true);}
 const geometry=(kind:1|2)=>{const a=attributes[kind]!,g=new THREE.BufferGeometry();if(growth<0)for(let i=0;i<a.p.length/3;i+=3){for(let k=0;k<3;k++)[a.p[(i+1)*3+k],a.p[(i+2)*3+k]]=[a.p[(i+2)*3+k],a.p[(i+1)*3+k]];for(let k=0;k<2;k++)[a.uv[(i+1)*2+k],a.uv[(i+2)*2+k]]=[a.uv[(i+2)*2+k],a.uv[(i+1)*2+k]];}g.setAttribute('position',new THREE.Float32BufferAttribute(a.p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(a.uv,2));g.computeVertexNormals();g.computeBoundingSphere();return g;},interior=treeInteriorPixels(pixels,sprite),texture=new THREE.DataTexture(interior,pixels.width,pixels.height);texture.colorSpace=source?.colorSpace||THREE.SRGBColorSpace;texture.flipY=false;texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;texture.wrapS=THREE.MirroredRepeatWrapping;texture.generateMipmaps=false;texture.needsUpdate=true;
 const result={sprite,leaves:geometry(1),trunks:geometry(2),texture,profile,growth,canopyBoxes:[...boxes.values()].map(b=>[...b.min.toArray(),...b.max.toArray()])};entries.push(result);volumes.set(key,entries);return remember(result);
}
/** Readable native art becomes a closed, painted tree at the authored root.
 * Unknown images keep their source cards instead of an invented olive fallback. */
export function addTreeVolumes(root:THREE.Group,trees:Tree[],source:THREE.Texture|undefined,shape:Partial<TreeShape>){
 const volume=nativeVolume(source,shape);if(!volume)return null;const material=new THREE.MeshBasicMaterial({map:volume.texture,color:0xffffff,side:THREE.FrontSide}),leaves=new THREE.InstancedMesh(volume.leaves,material,trees.length),trunks=new THREE.InstancedMesh(volume.trunks,material,trees.length),dummy=new THREE.Object3D(),roots=trees.map(tree=>tree.groundRoot?.toArray()??[tree.center.x,tree.center.y+tree.height*(1-volume.sprite.shape.footV),tree.center.z]);
 leaves.name='solid-original-tree-canopies';trunks.name='solid-original-tree-trunks';leaves.userData.canopyBoxes=volume.canopyBoxes;leaves.userData.sceneryRoots=roots;trunks.userData.sceneryRoots=roots;leaves.userData.nativeTreeBounds=volume.sprite.bounds;leaves.userData.nativeTreeShape=volume.sprite.shape;leaves.userData.nativeTreeProfile=volume.profile;leaves.userData.nativeTreeGrowth=trunks.userData.nativeTreeGrowth=volume.growth;trunks.visible=volume.trunks.getAttribute('position').count>0;
 for(const[at,tree]of trees.entries()){dummy.position.copy(tree.center);dummy.position.y+=tree.height*(1-volume.sprite.shape.footV);dummy.scale.set(tree.width,tree.height,tree.width);dummy.rotation.set(0,tree.axis?-Math.atan2(tree.axis.z,tree.axis.x):0,0);dummy.updateMatrix();for(const mesh of[leaves,trunks]){mesh.setMatrixAt(at,dummy.matrix);mesh.setColorAt(at,tree.color);}}
 leaves.computeBoundingSphere();trunks.computeBoundingSphere();root.add(leaves,trunks);return{leaves,trunks,shape:volume.sprite.shape};
}
