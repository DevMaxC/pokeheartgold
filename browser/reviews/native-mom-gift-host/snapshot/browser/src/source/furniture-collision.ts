import * as THREE from 'three';

export type FurnitureObstacle={outline:THREE.Vector2[];bounds:THREE.Box2;minY:number;maxY:number};
const cross=(a:THREE.Vector2,b:THREE.Vector2,c:THREE.Vector2)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function hull(points:THREE.Vector2[]){
 const sorted=[...new Map(points.map(p=>[p.toArray().map(n=>n.toFixed(5)).join(','),p])).values()].sort((a,b)=>a.x-b.x||a.y-b.y),lower:THREE.Vector2[]=[],upper:THREE.Vector2[]=[];
 for(const p of sorted){while(lower.length>1&&cross(lower.at(-2)!,lower.at(-1)!,p)<=0)lower.pop();lower.push(p);}
 for(const p of [...sorted].reverse()){while(upper.length>1&&cross(upper.at(-2)!,upper.at(-1)!,p)<=0)upper.pop();upper.push(p);}
 return lower.slice(0,-1).concat(upper.slice(0,-1));
}
/** Cache the actual transformed seat footprint once when its cell is loaded. */
export function furnitureObstacles(root:THREE.Object3D):FurnitureObstacle[]{
 root.updateWorldMatrix(true,true);const obstacles:FurnitureObstacle[]=[];
 root.traverseVisible(o=>{if(!(o instanceof THREE.Mesh)||o.name!=='solid-original-furniture')return;const p=o.geometry.getAttribute('position'),points:THREE.Vector2[]=[];let minY=Infinity,maxY=-Infinity;
  for(let i=0;i<p.count;i++){const v=o.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(o.matrixWorld);points.push(new THREE.Vector2(v.x,v.z));minY=Math.min(minY,v.y);maxY=Math.max(maxY,v.y);}
  const outline=hull(points);if(outline.length>=3)obstacles.push({outline,bounds:new THREE.Box2().setFromPoints(outline),minY,maxY});
 });return obstacles;
}
function pointDistanceSquared(p:THREE.Vector2,a:THREE.Vector2,b:THREE.Vector2){const dx=b.x-a.x,dz=b.y-a.y,length=dx*dx+dz*dz,t=length?THREE.MathUtils.clamp(((p.x-a.x)*dx+(p.y-a.y)*dz)/length,0,1):0;return (p.x-a.x-dx*t)**2+(p.y-a.y-dz*t)**2;}
function intersects(a:THREE.Vector2,b:THREE.Vector2,c:THREE.Vector2,d:THREE.Vector2){
 if(Math.max(a.x,b.x)<Math.min(c.x,d.x)||Math.max(c.x,d.x)<Math.min(a.x,b.x)||Math.max(a.y,b.y)<Math.min(c.y,d.y)||Math.max(c.y,d.y)<Math.min(a.y,b.y))return false;
 return cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0;
}
function touches(p:THREE.Vector2,obstacle:FurnitureObstacle,radius:number){const edges=obstacle.outline;return edges.every((a,i)=>cross(a,edges[(i+1)%edges.length],p)>=-1e-8)||edges.some((a,i)=>pointDistanceSquared(p,a,edges[(i+1)%edges.length])<radius*radius);}
function movingOut(from:THREE.Vector2,to:THREE.Vector2,obstacle:FurnitureObstacle){
 const points=obstacle.outline;if(points.every((a,i)=>cross(a,points[(i+1)%points.length],from)>1e-8))return true;
 let best=Infinity,normal=new THREE.Vector2();for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],edge=b.clone().sub(a),t=THREE.MathUtils.clamp(from.clone().sub(a).dot(edge)/edge.lengthSq(),0,1),nearest=a.clone().addScaledVector(edge,t),distance=from.distanceToSquared(nearest);if(distance<best){best=distance;normal=distance>1e-12?from.clone().sub(nearest):new THREE.Vector2(edge.y,-edge.x);}}
 return to.clone().sub(from).dot(normal)>=-1e-8;
}
/** Sweep the player's feet across the whole step, including gaps between tile
 * centres. Existing saves inside a seat can move out without becoming trapped. */
export function furnitureBlocksStep(obstacles:FurnitureObstacle[],fromX:number,fromZ:number,x:number,z:number,fromY:number,toY:number,radius=.24){
 const from=new THREE.Vector2(fromX,fromZ),to=new THREE.Vector2(x,z),radius2=radius*radius;
 for(const obstacle of obstacles){
  if(Math.min(fromY,toY)>=obstacle.maxY-.025||Math.max(fromY,toY)+1.65<=obstacle.minY+.025)continue;
  if(Math.max(fromX,x)+radius<obstacle.bounds.min.x||Math.min(fromX,x)-radius>obstacle.bounds.max.x||Math.max(fromZ,z)+radius<obstacle.bounds.min.y||Math.min(fromZ,z)-radius>obstacle.bounds.max.y)continue;
  const end=touches(to,obstacle,radius);if(touches(from,obstacle,radius)&&!end&&movingOut(from,to,obstacle))continue;if(end)return true;
  const points=obstacle.outline;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];if(intersects(from,to,a,b)||Math.min(pointDistanceSquared(a,from,to),pointDistanceSquared(b,from,to),pointDistanceSquared(from,a,b),pointDistanceSquared(to,a,b))<radius2)return true;}
 }
 return false;
}
