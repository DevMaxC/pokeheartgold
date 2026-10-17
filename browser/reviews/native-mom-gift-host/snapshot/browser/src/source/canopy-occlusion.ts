import * as THREE from 'three';

type Lobe={inverse:THREE.Matrix4;bounds:THREE.Box3};
export type Canopies={bounds:THREE.Box3;lobes:Lobe[]}[];
const cache=new WeakMap<THREE.InstancedMesh,{version:number;world:number[];value:Canopies[number]}>();
/** Cached analytic ellipsoids avoid raycasting thousands of tree triangles. */
export function fieldCanopies(groups:THREE.Object3D[]):Canopies{
 const result:Canopies=[];
 for(const group of groups)group.traverseVisible(o=>{
  if(!(o instanceof THREE.InstancedMesh)||!o.userData.canopyLobes)return;
  const prior=cache.get(o),world=o.matrixWorld.elements;if(prior&&prior.version===o.instanceMatrix.version&&prior.world.every((v,i)=>v===world[i])){result.push(prior.value);return;}
  const value={bounds:new THREE.Box3(),lobes:[] as Lobe[]},instance=new THREE.Matrix4(),matrix=new THREE.Matrix4(),sphereBox=new THREE.Box3(new THREE.Vector3(-1,-1,-1),new THREE.Vector3(1,1,1));
  for(let i=0;i<o.count;i++){o.getMatrixAt(i,instance);for(const [y,rx,ry,rz]of o.userData.canopyLobes as number[][]){matrix.copy(o.matrixWorld).multiply(instance).multiply(new THREE.Matrix4().makeTranslation(0,y,0)).multiply(new THREE.Matrix4().makeScale(rx,ry,rz));const bounds=sphereBox.clone().applyMatrix4(matrix);value.bounds.union(bounds);value.lobes.push({bounds,inverse:matrix.clone().invert()});}}
  cache.set(o,{version:o.instanceMatrix.version,world:[...world],value});result.push(value);
 });return result;
}
export function canopyContains(point:THREE.Vector3,canopies:Canopies){for(const group of canopies)if(group.bounds.containsPoint(point))for(const lobe of group.lobes)if(lobe.bounds.containsPoint(point)&&point.clone().applyMatrix4(lobe.inverse).lengthSq()<1)return true;return false;}
export function canopyBlocks(from:THREE.Vector3,to:THREE.Vector3,canopies:Canopies){
 const delta=to.clone().sub(from),length=delta.length();if(length<.5)return false;const ray=new THREE.Ray(from,delta.clone().normalize()),a=new THREE.Vector3(),b=new THREE.Vector3(),d=new THREE.Vector3();
 for(const group of canopies)if(ray.intersectsBox(group.bounds))for(const lobe of group.lobes){if(!ray.intersectsBox(lobe.bounds))continue;a.copy(from).applyMatrix4(lobe.inverse);b.copy(to).applyMatrix4(lobe.inverse);d.copy(b).sub(a);const t=THREE.MathUtils.clamp(-a.dot(d)/d.lengthSq(),.2/length,1-.2/length);if(a.addScaledVector(d,t).lengthSq()<1)return true;}
 return false;
}
