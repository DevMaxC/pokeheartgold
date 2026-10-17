import * as THREE from 'three';

type Lobe={inverse:THREE.Matrix4;bounds:THREE.Box3;box?:boolean};
export type Canopies={bounds:THREE.Box3;lobes:Lobe[]}[];
const cache=new WeakMap<THREE.InstancedMesh,{version:number;world:number[];value:Canopies[number]}>();
/** Cached native row boxes/legacy ellipsoids avoid tree triangle raycasts. */
export function fieldCanopies(groups:THREE.Object3D[]):Canopies{
 const result:Canopies=[];
 for(const group of groups)group.traverseVisible(o=>{
  if(!(o instanceof THREE.InstancedMesh)||!o.userData.canopyLobes&&!o.userData.canopyBoxes)return;
  const prior=cache.get(o),world=o.matrixWorld.elements;if(prior&&prior.version===o.instanceMatrix.version&&prior.world.every((v,i)=>v===world[i])){result.push(prior.value);return;}
  const value={bounds:new THREE.Box3(),lobes:[] as Lobe[]},instance=new THREE.Matrix4(),matrix=new THREE.Matrix4(),sphereBox=new THREE.Box3(new THREE.Vector3(-1,-1,-1),new THREE.Vector3(1,1,1));
  for(let i=0;i<o.count;i++){o.getMatrixAt(i,instance);for(const [y,rx,ry,rz]of o.userData.canopyLobes as number[][]??[]){matrix.copy(o.matrixWorld).multiply(instance).multiply(new THREE.Matrix4().makeTranslation(0,y,0)).multiply(new THREE.Matrix4().makeScale(rx,ry,rz));const bounds=sphereBox.clone().applyMatrix4(matrix);value.bounds.union(bounds);value.lobes.push({bounds,inverse:matrix.clone().invert()});}for(const b of o.userData.canopyBoxes as number[][]??[]){const centre=new THREE.Vector3((b[0]+b[3])/2,(b[1]+b[4])/2,(b[2]+b[5])/2),half=new THREE.Vector3((b[3]-b[0])/2,(b[4]-b[1])/2,(b[5]-b[2])/2);matrix.copy(o.matrixWorld).multiply(instance).multiply(new THREE.Matrix4().makeTranslation(...centre.toArray())).multiply(new THREE.Matrix4().makeScale(...half.toArray()));const bounds=sphereBox.clone().applyMatrix4(matrix);value.bounds.union(bounds);value.lobes.push({bounds,inverse:matrix.clone().invert(),box:true});}}
  cache.set(o,{version:o.instanceMatrix.version,world:[...world],value});result.push(value);
 });return result;
}
export function canopyContains(point:THREE.Vector3,canopies:Canopies){for(const group of canopies)if(group.bounds.containsPoint(point))for(const lobe of group.lobes)if(lobe.bounds.containsPoint(point)){const p=point.clone().applyMatrix4(lobe.inverse);if(lobe.box?Math.max(Math.abs(p.x),Math.abs(p.y),Math.abs(p.z))<1:p.lengthSq()<1)return true;}return false;}
export function canopyBlocks(from:THREE.Vector3,to:THREE.Vector3,canopies:Canopies){
 const delta=to.clone().sub(from),length=delta.length();if(length<.5)return false;const ray=new THREE.Ray(from,delta.clone().normalize()),a=new THREE.Vector3(),b=new THREE.Vector3(),d=new THREE.Vector3();
 for(const group of canopies)if(ray.intersectsBox(group.bounds))for(const lobe of group.lobes){if(!ray.intersectsBox(lobe.bounds))continue;a.copy(from).applyMatrix4(lobe.inverse);b.copy(to).applyMatrix4(lobe.inverse);d.copy(b).sub(a);if(lobe.box){let low=.2/length,high=1-.2/length;for(const axis of[0,1,2]){const p=a.getComponent(axis),v=d.getComponent(axis);if(Math.abs(v)<Number.EPSILON){if(Math.abs(p)>=1){high=-1;break;}}else{const t0=(-1-p)/v,t1=(1-p)/v;low=Math.max(low,Math.min(t0,t1));high=Math.min(high,Math.max(t0,t1));}}if(low<high)return true;}else{const t=THREE.MathUtils.clamp(-a.dot(d)/d.lengthSq(),.2/length,1-.2/length);if(a.addScaledVector(d,t).lengthSq()<1)return true;}}
 return false;
}
