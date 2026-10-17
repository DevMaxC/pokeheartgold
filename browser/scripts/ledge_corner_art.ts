export type NativeCornerFace={p:{x:number;y:number;z:number}[];normal:{y:number};material:string};
export function assertNativeCornerFloor(profile:number[],collisionFloor:number){
 if(profile.length!==6||!Number.isFinite(collisionFloor)||!profile.every(height=>Number.isFinite(height)&&height===collisionFloor))throw Error('Unsupported non-flat or collision-mismatched corner floor');
}
/** A literal source triangle at the supported flat rim height must cover this
 * point. No bound expansion, plane extrapolation or epsilon authorizes art. */
export function nativeCornerWitness(faces:NativeCornerFace[],cell:{x:number;z:number;altitude:number},floor:number,x:number,z:number){
 return faces.find(({p:[a,b,c],normal,material})=>{
  if(normal.y<=.7||!/^allpeak(?:_|gs|$)/i.test(material)||a.y!==b.y||a.y!==c.y||a.y/16+cell.altitude*.5!==floor+1/16)return false;
  const px=(x-cell.x*32-16)*16,pz=(z-cell.z*32-16)*16,den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(!den)return false;
  const wa=((b.z-c.z)*(px-c.x)+(c.x-b.x)*(pz-c.z))/den,wb=((c.z-a.z)*(px-c.x)+(a.x-c.x)*(pz-c.z))/den;
  return Math.min(wa,wb,1-wa-wb)>=0;
 });
}
