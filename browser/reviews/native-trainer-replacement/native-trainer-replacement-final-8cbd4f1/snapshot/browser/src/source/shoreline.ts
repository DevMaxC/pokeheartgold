import * as THREE from 'three';
import type {Land,Cell} from './types.ts';
import {terrainHeight,permissionWalkable} from './terrain.ts';

/** The source beach mesh has surf cut-ins below sand and shallow shore tiles.
 * Give those tiles solid sand beneath the art, rather than exposing deep water
 * through the gap when viewed from a camera the DS did not support. */
export function shorelineUnderlay(land:Land,cell:Cell,source:THREE.MeshBasicMaterial){
  const positions:number[]=[],uvs:number[]=[];
  for(let z=0;z<32;z++)for(let x=0;x<32;x++){
    const permission=land.permissions[z*32+x];if(![23,33].includes(permission&255)||!permissionWalkable(permission))continue;
    const points=[[x,z],[x+1,z],[x+1,z+1],[x,z+1]].map(([xx,zz])=>new THREE.Vector3(xx-16,terrainHeight(land,cell,cell.x*32+xx,cell.z*32+zz)-cell.altitude*.5-.16,zz-16));
    const add=(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3)=>{for(const p of [a,b,c]){positions.push(...p.toArray());uvs.push((p.x+16)/2,(p.z+16)/2-p.y/2);}};
    add(points[0],points[2],points[1]);add(points[0],points[3],points[2]);
    for(let i=0;i<4;i++){const a=points[i],b=points[(i+1)%4],c=b.clone().add(new THREE.Vector3(0,-.6,0)),d=a.clone().add(new THREE.Vector3(0,-.6,0));add(a,b,c);add(a,c,d);}
  }
  if(!positions.length)return null;const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.computeVertexNormals();const material=source.clone();material.vertexColors=false;material.transparent=false;material.alphaTest=0;material.side=THREE.DoubleSide;const mesh=new THREE.Mesh(geometry,material);mesh.name='source-shoreline-underlay';return mesh;
}
