import * as THREE from 'three';

type Tree={center:THREE.Vector3;width:number;height:number;color:THREE.Color};
const leafTextures=new WeakMap<THREE.Texture,THREE.Texture>();
let crownGeometry:THREE.BufferGeometry|undefined,trunkGeometry:THREE.CylinderGeometry|undefined;
function leafTexture(source:THREE.Texture|undefined){
 if(!source)return null;const cached=leafTextures.get(source);if(cached)return cached;
 const image=source.image as CanvasImageSource&{width?:number;height?:number};if(!image?.width||!image.height||typeof document==='undefined')return null;
 try{
  // Reuse the original leaf pixels, excluding the baked trunk and root art.
  // Extend their colour through alpha margins: the closed mesh owns silhouette.
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.floor(image.width*.25));canvas.height=Math.max(1,Math.floor(image.height*.25));const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(image,Math.floor(image.width*.375),Math.floor(image.height*.4),canvas.width,canvas.height,0,0,canvas.width,canvas.height);
  const sampled=ctx.getImageData(0,0,canvas.width,canvas.height).data;let left=canvas.width,right=0,top=canvas.height,bottom=0,minLight=255,maxLight=0;
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){const i=(y*canvas.width+x)*4;if(sampled[i+3]<128)continue;left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);const light=(sampled[i]+sampled[i+1]+sampled[i+2])/3;minLight=Math.min(minLight,light);maxLight=Math.max(maxLight,light);}
  if(right<=left||bottom<=top)return null;const width=right-left,height=bottom-top,pixels=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)pixels.set(sampled.subarray(((y+top)*canvas.width+left)*4,((y+top)*canvas.width+right)*4),y*width*4);
  const original=pixels.slice(),count=width*height,owner=new Int32Array(count).fill(-1),queue=new Int32Array(count);let head=0,tail=0;
  // Transparent atlas margins need leaf colours rather than the dark outline.
  for(let i=0;i<count;i++)if(pixels[i*4+3]>=128&&(pixels[i*4]+pixels[i*4+1]+pixels[i*4+2])/3>=minLight+(maxLight-minLight)*.22){owner[i]=i;queue[tail++]=i;}if(!tail)return null;
  while(head<tail){const i=queue[head++],x=i%width;for(const next of [x>0?i-1:-1,x<width-1?i+1:-1,i-width,i+width])if(next>=0&&next<count&&owner[next]<0){owner[next]=owner[i];queue[tail++]=next;}}
  for(let i=0;i<count;i++){if(pixels[i*4+3]<128)pixels.set(original.subarray(owner[i]*4,owner[i]*4+3),i*4);pixels[i*4+3]=255;}
  const texture=new THREE.DataTexture(pixels,width,height);texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=true;texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;texture.wrapS=THREE.RepeatWrapping;texture.needsUpdate=true;leafTextures.set(source,texture);return texture;
 }catch{return null;}
}
function crown(){
 if(crownGeometry)return crownGeometry;
 const positions:number[]=[],uvs:number[]=[],colors:number[]=[],light=new THREE.Vector3(-.5,.85,.3).normalize();
 for(const [y,xRadius,yRadius,zRadius]of [[.44,.43,.26,.4],[.65,.34,.24,.32],[.83,.2,.17,.2]]){
  const lobe=new THREE.SphereGeometry(1,12,6).toNonIndexed();lobe.scale(xRadius,yRadius,zRadius);lobe.translate(0,y,0);const p=lobe.getAttribute('position'),uv=lobe.getAttribute('uv');
  for(let i=0;i<p.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1),c=new THREE.Vector3().fromBufferAttribute(p,i+2),normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize(),shade=.82+.22*Math.max(-.5,normal.dot(light));for(let j=0;j<3;j++){positions.push(p.getX(i+j),p.getY(i+j),p.getZ(i+j));uvs.push(uv.getX(i+j),uv.getY(i+j));colors.push(shade,shade,shade);}}
  lobe.dispose();
 }
 crownGeometry=new THREE.BufferGeometry();crownGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));crownGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));crownGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));crownGeometry.computeVertexNormals();crownGeometry.computeBoundingSphere();return crownGeometry;
}
/** Closed layered crowns and trunks have a top and a back at every camera
 * pitch. Each original tree keeps its own authored ground pivot and palette. */
export function addTreeVolumes(root:THREE.Group,trees:Tree[],source:THREE.Texture|undefined,footV:number,topV=0,crownWidth=1){
 const texture=leafTexture(source),leaves=new THREE.InstancedMesh(crown(),new THREE.MeshBasicMaterial({map:texture,color:texture?0xffffff:'#7b9e36',vertexColors:true}),trees.length);
 if(!trunkGeometry){trunkGeometry=new THREE.CylinderGeometry(.055,.075,.34,8,1);trunkGeometry.translate(0,.17,0);}
 const trunks=new THREE.InstancedMesh(trunkGeometry,new THREE.MeshBasicMaterial({color:'#795b3d'}),trees.length),dummy=new THREE.Object3D();leaves.name='solid-original-tree-canopies';trunks.name='solid-original-tree-trunks';
 trees.forEach((tree,i)=>{dummy.position.copy(tree.center);dummy.position.y+=tree.height*(1-footV);dummy.scale.set(tree.width*crownWidth/.86,tree.height*(footV-topV),tree.width*crownWidth/.86);dummy.rotation.set(0,Math.sin(tree.center.x*1.13+tree.center.z*.79)*Math.PI,0);dummy.updateMatrix();leaves.setMatrixAt(i,dummy.matrix);trunks.setMatrixAt(i,dummy.matrix);leaves.setColorAt(i,tree.color);trunks.setColorAt(i,tree.color);});
 leaves.computeBoundingSphere();trunks.computeBoundingSphere();root.add(leaves,trunks);return{leaves,trunks};
}
