import * as THREE from 'three';
import {treeImagePixels,treeSpritePixels} from './tree-texture.ts';

type Tree={center:THREE.Vector3;width:number;height:number;color:THREE.Color;axis?:THREE.Vector3;groundRoot?:THREE.Vector3};
type Antenna={geometry:THREE.BufferGeometry;texture:THREE.DataTexture;footV:number;topV:number};
const antennae=new WeakMap<THREE.Texture,Antenna>();
/** Literal Mahogany prop136: three metal prongs occupy rows1..13 of its
 * 64px native tree01 atlas. They are a thin feature, never a revolved crown.
 * Verify the complete used alpha layout before replacing the source card. */
export function nativeTreeAntenna(source:THREE.Texture|undefined):Antenna|null{
 if(!source)return null;const cached=antennae.get(source);if(cached)return cached;
 const image=treeImagePixels(source.image);if(!image||image.width!==64||image.height!==64)return null;
 const runs=[[],[[31,33]],[[30,34]],[[30,34]],[[22,25],[30,34],[39,42]],[[21,26],[30,34],[38,43]],[[21,26],[30,34],[38,43]],[[21,27],[30,34],[37,43]],[[22,28],[30,34],[36,42]],[[25,29],[30,34],[35,39]],[[26,38]],[[27,37]],[[28,36]],[[29,35]]];
 for(let y=0;y<14;y++)for(let x=0;x<64;x++)if((image.data[(y*64+x)*4+3]>=128)!==runs[y].some(([left,right])=>x>=left&&x<right))return null;
 const sprite=treeSpritePixels(image);if(!sprite||sprite.shape.footU!==.5)return null;
 const p:number[]=[],uv:number[]=[],footV=sprite.shape.footV,yes=(x:number,y:number)=>x>=0&&x<64&&y>=0&&y<14&&image.data[(y*64+x)*4+3]>=128;
 const face=(points:number[][],x:number,y:number)=>{for(const i of[0,1,2,0,2,3]){p.push(...points[i]);uv.push((x+.5)/64,(y+.5)/64);}};
 for(let y=1;y<14;y++)for(let x=0;x<64;x++)if(yes(x,y)){
  const x0=x/64-.5,x1=(x+1)/64-.5,y0=footV-(y+1)/64,y1=footV-y/64,z0=-.5/64,z1=.5/64;
  face([[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],x,y);
  face([[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]],x,y);
  if(!yes(x-1,y))face([[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]],x,y);
  if(!yes(x+1,y))face([[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]],x,y);
  if(!yes(x,y-1))face([[x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[x1,y1,z0]],x,y);
  if(!yes(x,y+1))face([[x0,y0,z1],[x0,y0,z0],[x1,y0,z0],[x1,y0,z1]],x,y);
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();geometry.computeBoundingSphere();
 const texture=new THREE.DataTexture(sprite.data,64,64);texture.flipY=false;texture.colorSpace=source.colorSpace;texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
 const result={geometry,texture,footV,topV:14/64};antennae.set(source,result);return result;
}
export function addNativeTreeAntennae(root:THREE.Group,trees:Tree[],antenna:Antenna){
 const material=new THREE.MeshBasicMaterial({map:antenna.texture,color:0xffffff,side:THREE.FrontSide}),mesh=new THREE.InstancedMesh(antenna.geometry,material,trees.length),dummy=new THREE.Object3D();
 // Keep the literal source material identity: both field and battle cameras
 // exclude tree01 surfaces, including this small feature of the native pine.
 material.name='tree01';
 mesh.name='solid-original-tree-antenna';mesh.userData.nativeTreeAntenna=true;mesh.userData.sceneryRoots=trees.map(t=>t.groundRoot?.toArray()??[t.center.x,t.center.y+t.height*(1-antenna.footV),t.center.z]);
 for(const[i,t]of trees.entries()){dummy.position.copy(t.center);dummy.position.y+=t.height*(1-antenna.footV);dummy.scale.set(t.width,t.height,t.width);dummy.rotation.set(0,t.axis?-Math.atan2(t.axis.z,t.axis.x):0,0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,t.color);}
 mesh.computeBoundingSphere();root.add(mesh);return mesh;
}
