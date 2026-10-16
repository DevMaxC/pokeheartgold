import * as THREE from 'three';
import {canopyBlocks,type Canopies} from './canopy-occlusion.ts';

export function battleCameraDistance(distance:number,aspect:number){
 const vertical=46*Math.PI/180,horizontal=2*Math.atan(Math.tan(vertical/2)*aspect),fit=3.1/Math.sin(Math.min(vertical,horizontal)/2);
 return distance*Math.max(1,fit/8.4);
}
export function battleCameraEye(center:THREE.Vector3,yaw:number,pitch:number,distance:number){
 return center.clone().add(new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch)*distance,Math.sin(pitch)*distance,Math.cos(yaw)*Math.cos(pitch)*distance));
}
/** Check each Pokémon, since a roof can hide one while the midpoint stays clear. */
export function battleCameraBlocked(eye:THREE.Vector3,subjects:THREE.Vector3[],obstacles:THREE.Object3D[],canopies:Canopies=[]){
 for(const subject of subjects){const delta=eye.clone().sub(subject),distance=delta.length();if(distance<.5)continue;const ray=new THREE.Raycaster(subject,delta.normalize(),.2,distance-.2);if(ray.intersectObjects(obstacles,false).length||canopyBlocks(subject,eye,canopies))return true;}
 return false;
}
/** Select the opening shoulder once. Subsequent orbit input keeps its own yaw. */
export function battleOpeningYaw(center:THREE.Vector3,base:number,pitch:number,distance:number,subjects:THREE.Vector3[],obstacles:THREE.Object3D[],canopies:Canopies=[]){
 for(const yaw of [base+.6,base-.6,base+Math.PI+.6,base+Math.PI-.6])if(!battleCameraBlocked(battleCameraEye(center,yaw,pitch,distance),subjects,obstacles,canopies))return yaw;
 return base+.6;
}
export function clearBattleCameraEye(desired:THREE.Vector3,subjects:THREE.Vector3[],obstacles:THREE.Object3D[],canopies:Canopies=[]){
 for(const lift of [0,1.5,3,5,8,12]){const eye=desired.clone();eye.y+=lift;if(!battleCameraBlocked(eye,subjects,obstacles,canopies))return eye;}
 const eye=desired.clone();eye.y+=12;return eye;
}
