/** Native jump behaviours, checked on the tile immediately ahead of the player.
 * player_avatar_movement.c:MapObject_IsLedgeInDirection. */
export function ledgeDirection(permission:number):number|null{
 return ({56:3,57:2,58:0,59:1} as Record<number,number>)[permission&255]??null;
}
export function jumpHeight(from:number,to:number,t:number){return from+(to-from)*t+Math.sin(Math.PI*t)*.65;}

export type TerraceData={version:2;scale:number;cells:Record<string,string>;ledges:[number,number,number][];cliffAssets:Record<string,string>;nativeEdges?:Record<string,number[]>};
/** Nine height points per original tile preserve a cliff at the midpoint of a
 * short ledge while tapering its endpoints into the open paths around it. */
export class Terraces{
 private decoded=new Map<string,Int16Array>();
 readonly ledgeCells:Set<string>;
 constructor(readonly data:TerraceData){this.ledgeCells=new Set(data.ledges.map(([x,z])=>Math.floor(x/32)+','+Math.floor(z/32)));}
 points(x:number,z:number):number[]{
  const tx=Math.floor(x),tz=Math.floor(z),key=Math.floor(tx/32)+','+Math.floor(tz/32),encoded=this.data.cells[key];if(!encoded)return Array(9).fill(0);
  let values=this.decoded.get(key);if(!values){const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));values=new Int16Array(bytes.length/2);const view=new DataView(bytes.buffer);for(let i=0;i<values.length;i++)values[i]=view.getInt16(i*2,true);this.decoded.set(key,values);}
  const i=(((tz%32+32)%32)*32+(tx%32+32)%32)*9;return Array.from({length:9},(_,c)=>values![i+c]/this.data.scale);
 }
 corners(x:number,z:number){const p=this.points(x,z);return[p[0],p[2],p[8],p[6]];}
 sample(tx:number,tz:number,x:number,z:number){const p=this.points(tx,tz),u= Math.max(0,Math.min(2,(x-tx)*2)),v=Math.max(0,Math.min(2,(z-tz)*2)),cx=Math.min(1,Math.floor(u)),cz=Math.min(1,Math.floor(v)),i=cz*3+cx,a=u-cx,b=v-cz;return a>=b?(1-a)*p[i]+(a-b)*p[i+1]+b*p[i+4]:(1-b)*p[i]+a*p[i+4]+(b-a)*p[i+3];}
 height(x:number,z:number){return this.sample(Math.floor(x),Math.floor(z),x,z);}
}
