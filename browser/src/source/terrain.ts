import type {Land,Cell} from './types.ts';

export function tilePermission(land:Land,x:number,z:number):number {return land.permissions[((Math.floor(z)%32+32)%32)*32+(Math.floor(x)%32+32)%32]??0x8000;}
export function permissionWalkable(permission:number,surf=false):boolean {
  if(permission&0x8000)return false;
  const behavior=permission&255;
  if(!surf&&[16,17,19,21].includes(behavior))return false;
  return true;
}
export function terrainHeight(land:Land,cell:Pick<Cell,'x'|'z'|'altitude'>,x:number,z:number,currentY=0):number {
  const lx=x-cell.x*32-16,lz=z-cell.z*32-16,base=cell.altitude*.5;
  const candidates:number[]=[];
  for(const p of land.plates){const [x1,z1,x2,z2]=p.bounds;if(lx<Math.min(x1,x2)-.001||lx>Math.max(x1,x2)+.001||lz<Math.min(z1,z2)-.001||lz>Math.max(z1,z2)+.001)continue;
    const [nx,ny,nz]=p.normal;if(Math.abs(ny)<1e-6)continue;candidates.push(-(p.constant+nx*lx+nz*lz)/ny+base);
  }
  return candidates.length?candidates.reduce((a,b)=>Math.abs(a-currentY)<Math.abs(b-currentY)?a:b):base;
}
