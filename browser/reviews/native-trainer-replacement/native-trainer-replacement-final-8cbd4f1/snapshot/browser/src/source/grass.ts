import * as THREE from 'three';
import {terrainHeight} from './terrain.ts';
import type {Land,Cell} from './types.ts';

function random(seed:number){let n=Math.imul(seed^0x45d9f3b,0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);return((n^(n>>>16))>>>0)/0x100000000;}
const grassClock={value:0},grassPlayer={value:new THREE.Vector3()};
export function updateGrass(time:number,x:number,y:number,z:number){grassClock.value=time;grassPlayer.value.set(x,y,z);}

/** Volume on original tall-grass permissions, never on ordinary floor/cave tiles. */
export function sourceTallGrass(land:Land,cell:Cell){
  const patches:{x:number;z:number;seed:number;tall:boolean}[]=[];
  for(let z=0;z<32;z++)for(let x=0;x<32;x++){const permission=land.permissions[z*32+x],behavior=permission&255;if(permission&0x8000||![2,3].includes(behavior))continue;
    for(let i=0;i<7;i++){const seed=(cell.x*811+cell.z*1237+x*31+z*977+i*6389)|0;patches.push({x:x+.1+random(seed)*.8,z:z+.1+random(seed+1)*.8,seed,tall:behavior===3});}
  }
  if(!patches.length)return null;
  const positions:number[]=[],colors:number[]=[];
  const bottom=new THREE.Color('#24785c'),top=new THREE.Color('#72bc73');
  for(let blade=0;blade<4;blade++){
    const angle=blade*Math.PI*.63,c=Math.cos(angle),s=Math.sin(angle),lean=.13*(blade%2?1:-1);
    // A taper and small bend make individual leaves rather than square cards.
    for(const [x,y]of [[-.13,0],[.13,0],[lean+.06,.62],[-.13,0],[lean+.06,.62],[lean-.06,.62],[lean-.06,.62],[lean+.06,.62],[lean+.16,1]]){positions.push(x*c,y,x*s);colors.push(...bottom.clone().lerp(top,y).toArray());}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
  const material=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide});
  material.onBeforeCompile=shader=>{
    shader.uniforms.grassClock=grassClock;shader.uniforms.grassPlayer=grassPlayer;
    shader.vertexShader='uniform float grassClock;uniform vec3 grassPlayer;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vec3 grassRoot=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz;
      float tip=position.y*position.y;
      transformed.x+=sin(grassClock*1.7+grassRoot.x*1.8+grassRoot.z)*.055*tip;
      vec2 away=grassRoot.xz-grassPlayer.xz;
      float part=(1.-smoothstep(.15,.8,length(away)))*(1.-smoothstep(.6,1.4,abs(grassRoot.y-grassPlayer.y)));
      vec3 direction=vec3(normalize(away+vec2(.001)).x,0.,normalize(away+vec2(.001)).y);
      mat4 grassMatrix=modelMatrix*instanceMatrix;
      transformed.x+=dot(direction,normalize(grassMatrix[0].xyz))*.28*part*tip;
      transformed.z+=dot(direction,normalize(grassMatrix[2].xyz))*.28*part*tip;
      transformed.y*=1.-part*.3*tip;`);
  };
  material.customProgramCacheKey=()=> 'source-tall-grass-v1';
  const grass=new THREE.InstancedMesh(geometry,material,patches.length),dummy=new THREE.Object3D();grass.name='source-tall-grass';
  patches.forEach((p,i)=>{const wx=cell.x*32+p.x,wz=cell.z*32+p.z,base=cell.altitude*.5;dummy.position.set(p.x-16,terrainHeight(land,cell,wx,wz,base)-base+.015,p.z-16);dummy.rotation.y=random(p.seed+2)*Math.PI*2;dummy.scale.set(.75+random(p.seed+3)*.35,(p.tall?.9:.4)+random(p.seed+4)*.2,1);dummy.updateMatrix();grass.setMatrixAt(i,dummy.matrix);});
  grass.computeBoundingSphere();return grass;
}
