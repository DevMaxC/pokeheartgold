/** Native jump behaviours, checked on the tile immediately ahead of the player.
 * player_avatar_movement.c:MapObject_IsLedgeInDirection. */
export function ledgeDirection(permission:number):number|null{
 return ({56:3,57:2,58:0,59:1} as Record<number,number>)[permission&255]??null;
}
export function jumpHeight(from:number,to:number,t:number){return from+(to-from)*t+Math.sin(Math.PI*t)*.65;}

export type TerraceData={version:2;scale:number;cells:Record<string,string>;ledges:[number,number,number][];cliffAssets:Record<string,string>;nativeEdges?:Record<string,number[]>;foundations?:Record<string,[number,number]>};
/** Nine height points per original tile preserve a cliff at the midpoint of a
 * short ledge while tapering its endpoints into the open paths around it. */
export class Terraces{
 private decoded=new Map<string,Int16Array>();
 readonly ledgeCells:Set<string>;
 constructor(readonly data:TerraceData){this.ledgeCells=new Set(data.ledges.map(([x,z])=>Math.floor(x/32)+','+Math.floor(z/32)));}
 private lastX=NaN;private lastZ=NaN;private lastValues:Int16Array|null=null;
 private values(tx:number,tz:number){
  const cx=Math.floor(tx/32),cz=Math.floor(tz/32);if(cx===this.lastX&&cz===this.lastZ)return this.lastValues;
  const key=cx+','+cz,encoded=this.data.cells[key];let values=this.decoded.get(key)??null;
  if(!values&&encoded){const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));values=new Int16Array(bytes.length/2);const view=new DataView(bytes.buffer);for(let i=0;i<values.length;i++)values[i]=view.getInt16(i*2,true);this.decoded.set(key,values);}
  this.lastX=cx;this.lastZ=cz;this.lastValues=values;return values;
 }
 points(x:number,z:number):number[]{const tx=Math.floor(x),tz=Math.floor(z),values=this.values(tx,tz);if(!values)return Array(9).fill(0);const i=(((tz%32+32)%32)*32+(tx%32+32)%32)*9;return Array.from({length:9},(_,c)=>values[i+c]/this.data.scale);}
 corners(x:number,z:number){const p=this.points(x,z);return[p[0],p[2],p[8],p[6]];}
 sample(tx:number,tz:number,x:number,z:number){
  const values=this.values(tx,tz);if(!values)return 0;
  const u=Math.max(0,Math.min(2,(x-tx)*2)),v=Math.max(0,Math.min(2,(z-tz)*2)),cx=Math.min(1,Math.floor(u)),cz=Math.min(1,Math.floor(v)),i=(((tz%32+32)%32)*32+(tx%32+32)%32)*9+cz*3+cx,a=u-cx,b=v-cz;
  return (a>=b?(1-a)*values[i]+(a-b)*values[i+1]+b*values[i+4]:(1-b)*values[i]+a*values[i+4]+(b-a)*values[i+3])/this.data.scale;
 }
 /** A flat quantised region can retain its original triangles unchanged. */
 uniform(minX:number,minZ:number,maxX:number,maxZ:number){
  let first:number|undefined;
  for(let z=Math.floor(minZ+1e-8);z<=Math.floor(maxZ-1e-8);z++)for(let x=Math.floor(minX+1e-8);x<=Math.floor(maxX-1e-8);x++){
   const values=this.values(x,z),base=(((z%32+32)%32)*32+(x%32+32)%32)*9;
   for(let i=0;i<9;i++){const value=values?values[base+i]:0;if(first===undefined)first=value;else if(value!==first)return undefined;}
  }
  return first===undefined?undefined:first/this.data.scale;
 }
 height(x:number,z:number){return this.sample(Math.floor(x),Math.floor(z),x,z);}
}
