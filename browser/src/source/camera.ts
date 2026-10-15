import * as THREE from 'three';

/** Connected map headers must not reset an orbit. Long warps translate the
 * whole camera rig, retaining the player's angle, pitch, zoom and rotation. */
export function fieldCameraEntry(camera:THREE.PerspectiveCamera,target:THREE.Vector3,destination:THREE.Vector3,initial:boolean,yaw:number,pitch:number,distance:number){
  if(initial){
    target.copy(destination);const orbit=new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
    camera.position.copy(target).addScaledVector(orbit,distance);camera.lookAt(target);return;
  }
  if(target.distanceToSquared(destination)>4){const shift=destination.clone().sub(target);camera.position.add(shift);target.copy(destination);}
}
