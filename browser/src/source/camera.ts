import * as THREE from 'three';

/** Paper vegetation and replaced/hidden DS meshes must not obstruct the camera.
 * Querying their thousands of instances also needlessly stalls every frame. */
export function fieldCameraObstacles(root:THREE.Object3D){
  const meshes:THREE.Object3D[]=[];root.traverseVisible(object=>{
    if(!(object instanceof THREE.Mesh)||['camera-facing-original-trees','solid-original-tree-canopies','solid-original-tree-trunks','source-tall-grass','crossed-original-flowers'].includes(object.name))return;
    const materials=Array.isArray(object.material)?object.material:[object.material];
    if(materials.every(m=>m.opacity<.5||/(?:^|_)(?:tree\d*|bush\w*|leaf\d*|flower\d*|hana\d*|plant\d*|yo_sp\d*|kage|shadow)(?:_|$)/i.test(m.name)))return;meshes.push(object);
  });return meshes;
}

/** Connected map headers must not reset an orbit. Long warps translate the
 * whole camera rig, retaining the player's angle, pitch, zoom and rotation. */
export function fieldCameraEntry(camera:THREE.PerspectiveCamera,target:THREE.Vector3,destination:THREE.Vector3,initial:boolean,yaw:number,pitch:number,distance:number,warp=false){
  if(initial){
    target.copy(destination);const orbit=new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
    camera.position.copy(target).addScaledVector(orbit,distance);camera.lookAt(target);return;
  }
  if(warp||target.distanceToSquared(destination)>4){const shift=destination.clone().sub(target);camera.position.add(shift);target.copy(destination);}
}
