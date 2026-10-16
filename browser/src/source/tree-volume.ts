import * as THREE from 'three';
import {treeLeafPixels,type TreeShape} from './tree-texture.ts';

type Tree={center:THREE.Vector3;width:number;height:number;color:THREE.Color;crownOffset?:THREE.Vector3};
const leafTextures=new WeakMap<THREE.Texture,Map<string,THREE.Texture>>();
const canopyLobes=[[.44,.43,.26,.4],[.65,.34,.24,.32],[.83,.2,.17,.2]];
let crownGeometry:THREE.BufferGeometry|undefined,trunkGeometry:THREE.CylinderGeometry|undefined;
function leafTexture(source:THREE.Texture|undefined,shape:TreeShape){
 if(!source)return null;const key=[shape.footV,shape.topV??0,shape.crownWidth??1,shape.crownCenterU??.5].join(','),cached=leafTextures.get(source)?.get(key);if(cached)return cached;
 const image=source.image as CanvasImageSource&{width?:number;height?:number};if(!image?.width||!image.height||typeof document==='undefined')return null;
 try{
  // Reuse the original leaf pixels, excluding the baked trunk and root art.
  // Extend their colour through alpha margins: the closed mesh owns silhouette.
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(image,0,0);const patch=treeLeafPixels(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height,shape);if(!patch)return null;
  const texture=new THREE.DataTexture(patch.data,patch.width,patch.height);texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=true;texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;texture.wrapS=THREE.RepeatWrapping;texture.needsUpdate=true;const entries=leafTextures.get(source)??new Map<string,THREE.Texture>();entries.set(key,texture);leafTextures.set(source,entries);return texture;
 }catch{return null;}
}
function crown(){
 if(crownGeometry)return crownGeometry;
 const positions:number[]=[],uvs:number[]=[],colors:number[]=[],light=new THREE.Vector3(-.5,.85,.3).normalize();
 for(const [y,xRadius,yRadius,zRadius]of canopyLobes){
  const lobe=new THREE.SphereGeometry(1,12,6).toNonIndexed();lobe.scale(xRadius,yRadius,zRadius);lobe.translate(0,y,0);const p=lobe.getAttribute('position'),uv=lobe.getAttribute('uv');
  for(let i=0;i<p.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1),c=new THREE.Vector3().fromBufferAttribute(p,i+2),normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize(),shade=.82+.22*Math.max(-.5,normal.dot(light));for(let j=0;j<3;j++){positions.push(p.getX(i+j),p.getY(i+j),p.getZ(i+j));uvs.push(uv.getX(i+j),uv.getY(i+j));colors.push(shade,shade,shade);}}
  lobe.dispose();
 }
 crownGeometry=new THREE.BufferGeometry();crownGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));crownGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));crownGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));crownGeometry.computeVertexNormals();crownGeometry.computeBoundingSphere();return crownGeometry;
}
/** Closed layered crowns and trunks have a top and a back at every camera
 * pitch. Each original tree keeps its own authored ground pivot and palette. */
export function addTreeVolumes(root:THREE.Group,trees:Tree[],source:THREE.Texture|undefined,shape:TreeShape){
 const {footV,topV=0,crownWidth=1}=shape;
 const texture=leafTexture(source,shape),leaves=new THREE.InstancedMesh(crown(),new THREE.MeshBasicMaterial({map:texture,color:texture?0xffffff:'#7b9e36',vertexColors:true}),trees.length);
 if(!trunkGeometry){trunkGeometry=new THREE.CylinderGeometry(.055,.075,1,8,1);trunkGeometry.translate(0,.5,0);}
 const roots=trees.map(tree=>[tree.center.x,tree.center.y+tree.height*(1-footV),tree.center.z]);
 const trunks=new THREE.InstancedMesh(trunkGeometry,new THREE.MeshBasicMaterial({color:'#795b3d'}),trees.length),dummy=new THREE.Object3D();leaves.name='solid-original-tree-canopies';trunks.name='solid-original-tree-trunks';leaves.userData.sceneryRoots=roots;trunks.userData.sceneryRoots=roots;leaves.userData.canopyLobes=canopyLobes;
 trees.forEach((tree,i)=>{
  const ground=tree.center.clone();ground.y+=tree.height*(1-footV);const offset=tree.crownOffset??new THREE.Vector3(),visibleHeight=tree.height*(footV-topV),width=tree.width*crownWidth/.86,branch=offset.clone().add(new THREE.Vector3(0,visibleHeight*.34,0));
  dummy.position.copy(ground);dummy.scale.set(width,branch.length(),width);dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),branch.clone().normalize());dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
  dummy.position.copy(ground).add(offset);dummy.scale.set(width,visibleHeight,width);dummy.rotation.set(0,Math.sin(tree.center.x*1.13+tree.center.z*.79)*Math.PI,0);dummy.updateMatrix();leaves.setMatrixAt(i,dummy.matrix);leaves.setColorAt(i,tree.color);trunks.setColorAt(i,tree.color);
 });
 leaves.computeBoundingSphere();trunks.computeBoundingSphere();root.add(leaves,trunks);return{leaves,trunks};
}
