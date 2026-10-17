/** Dev-only actual OriginalWorld comparison. This is not a game entry point,
 * does not read/write saves, and is not included in the production Vite input. */
import * as THREE from'three';
import {OriginalWorld}from'../src/source/world.ts';
import {OriginalWorld as ProductionWorld}from'./native-production-reference/world.ts';
import {fieldCameraObstacles}from'../src/source/camera.ts';
const params=new URLSearchParams(location.search),mode=params.get('mode')==='production'?'production':'candidate',index=await fetch('/source/index.json').then(r=>r.json()),canvas=document.querySelector('canvas')!,status=document.getElementById('status')!,Type=mode==='production'?ProductionWorld:OriginalWorld,world=new Type(canvas,index,{});
let map=Number(params.get('map')??46),x=Number(params.get('x')??633.5),z=Number(params.get('z')??170.5);
async function pose(options:{map?:number;x?:number;z?:number;yaw?:number;pitch?:number;distance?:number}){
 if(options.map!==undefined)map=options.map;if(options.x!==undefined)x=options.x;if(options.z!==undefined)z=options.z;
 if(options.yaw!==undefined)world.yaw=options.yaw;if(options.pitch!==undefined)world.pitch=options.pitch;if(options.distance!==undefined)world.distance=options.distance;
 await world.enter(map,x,z);for(let i=0;i<6;i++){world.draw(x,z,.2);await new Promise(requestAnimationFrame);}status.textContent=`Actual ${mode} OriginalWorld · map${map} at${x},${z} · yaw${world.yaw.toFixed(3)} pitch${world.pitch.toFixed(3)} distance${world.distance} · native277 field · no T2 closures`;
 return inspect();
}
function inspect(){const orbit=new THREE.Vector3(Math.sin(world.yaw)*Math.cos(world.pitch),Math.sin(world.pitch),Math.cos(world.yaw)*Math.cos(world.pitch)),hits=new THREE.Raycaster(world.target,orbit,.5,world.distance).intersectObjects([...world.cells.values()].flatMap(c=>fieldCameraObstacles(c.group)),false).filter(h=>h.distance>1.2),first=hits[0],joints:unknown[]=[];world.scene.traverseVisible(o=>{if(o instanceof THREE.Mesh&&o.name==='source-terrace-joint')joints.push({position:o.parent?.position.toArray(),triangles:o.geometry.getAttribute('position').count/3,material:(o.material as THREE.Material).name});});return{mode,map,x,z,templateAssets:[...world.assets.keys()],nativeLandIDs:[...(world as any).landCache.keys()],headers:[...world.maps.keys()],terrainField:'277bac25178f99dfe3caa9ace134cf9097fbe5149e7e3733fb58f16ebfd87323',walkable:world.walkable(x,z),height:world.height(x,z),cells:[...world.cells.values()].map(c=>({x:c.cell.x,z:c.cell.z,asset:c.cell.asset})),camera:{position:world.camera.position.toArray(),target:world.target.toArray(),yaw:world.yaw,pitch:world.pitch,distance:world.distance,first:first?{point:first.point.toArray(),distance:first.distance,name:first.object.name}:null},joints,renderer:{memory:{...world.renderer.info.memory},render:{...world.renderer.info.render}},limit:'Actual full streaming/rendered World. The comparison adds only native deformation joints; it does not close missing geological shells or certify the T2 filler.'};}
Object.assign(window,{__NATIVE_TERRAIN_QA__:{world,pose,inspect,capture:()=>{world.draw(x,z,0);return canvas.toDataURL('image/png');}}});
await pose({map,x,z,yaw:Number(params.get('yaw')??0),pitch:Number(params.get('pitch')??.4),distance:Number(params.get('distance')??13)});
