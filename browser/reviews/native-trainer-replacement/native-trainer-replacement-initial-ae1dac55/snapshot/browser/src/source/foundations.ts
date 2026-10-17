import * as THREE from 'three';
import type {Cell,Matrix} from './types.ts';

/** The native background forest is a horizontal carpet at the matrix altitude.
 * Fill exposed steps beneath it; never lower its trees to disguise the gap. */
export function forestFoundation(cell:Cell,matrix:Matrix,source:THREE.MeshBasicMaterial){
  const top=cell.altitude*.5,positions:number[]=[],uvs:number[]=[];
  for(const [dx,dz,a,b]of [
    [-1,0,[-16,-16],[-16,16]],[1,0,[16,16],[16,-16]],
    [0,-1,[16,-16],[-16,-16]],[0,1,[-16,16],[16,16]],
  ] as const){
    const x=cell.x+dx,z=cell.z+dz,index=z*matrix.width+x,inside=x>=0&&z>=0&&x<matrix.width&&z<matrix.height;
    const bottom=inside&&matrix.models[index]!==65535?matrix.altitudes[index]*.5:0,depth=top-bottom;if(depth<=.01)continue;
    for(const [p,y,u]of [[a,0,0],[b,0,16],[b,-depth-.1,16],[a,0,0],[b,-depth-.1,16],[a,-depth-.1,0]] as const){positions.push(p[0]-dx*.002,y,p[1]-dz*.002);uvs.push(u,-y/2);}
  }
  if(!positions.length)return null;const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.computeVertexNormals();
  const material=source.clone();material.vertexColors=false;material.transparent=false;material.opacity=1;material.alphaTest=0;material.side=THREE.DoubleSide;const mesh=new THREE.Mesh(geometry,material);mesh.name='source-background-foundation';return mesh;
}
