/** Offline fixture of the actual field methods and original matrix ownership.
 * No renderer, rewritten collision function, or synthetic permission grid. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {OriginalWorld} from '../src/source/world.ts';
import {Terraces,type TerraceData} from '../src/source/ledges.ts';
import {FieldObjects} from '../src/source/objects.ts';
import type {SourceMap,Land,Matrix,State,GameData} from '../src/source/types.ts';

export const repository=fileURLToPath(new URL('../../',import.meta.url));
export const source=path.join(repository,'browser/public/source');
export const json=<T>(name:string):T=>JSON.parse(fs.readFileSync(path.join(source,name),'utf8'));
export const directions=[[0,-1,0],[0,1,1],[-1,0,2],[1,0,3]] as const;

export function nativeField(terracePath=path.join(source,'terraces/0.json')){
 const matrix=json<Matrix>('matrices/0.json'),maps=new Map<number,SourceMap>(),lands=new Map<number,Land>();
 const world=Object.create(OriginalWorld.prototype) as OriginalWorld;
 Object.assign(world,{cells:new Map(),npcSprites:new Map(),terraces:terracePath?new Terraces(JSON.parse(fs.readFileSync(terracePath,'utf8')) as TerraceData):null});
 for(let z=0;z<matrix.height;z++)for(let x=0;x<matrix.width;x++){
  const owner=matrix.headers?.[z*matrix.width+x];if(!owner)continue;
  if(!maps.has(owner))maps.set(owner,json<SourceMap>(`maps/${owner}.json`));
  const map=maps.get(owner)!,cell=map.cells.find(c=>c.x===x&&c.z===z);if(!cell)continue;
  if(!lands.has(cell.land))lands.set(cell.land,json<Land>(`lands/${cell.land}.json`));
  world.cells.set(`${x},${z}`,{cell,land:lands.get(cell.land)!,map,group:null as never,furniture:[]});
 }
 return {world,maps,lands,matrix};
}

export function originalObjects(maps:Map<number,SourceMap>,changes:Record<string,boolean>={}){
 const initial=json<{flags:Record<string,boolean>;vars:Record<string,number>}>('initial-state.json');
 const state={flags:{...initial.flags,...changes},vars:initial.vars} as State;
 const fieldObjects=new FieldObjects({constants:{},sprites:{}} as Pick<GameData,'constants'|'sprites'>,state);
 fieldObjects.load([...maps.values()].flatMap(m=>m.events.objects));
 return fieldObjects.snapshot();
}

/** Decode the original NARC allocation table directly, independently of the
 * JSON importer. The original member contains all 1,024 UInt16 permissions. */
export function nativeLandMembers(){
 const bytes=fs.readFileSync(path.join(repository,'files/a/0/6/5'));
 if(bytes.toString('ascii',0,4)!=='NARC')throw Error('Expected original land NARC');
 let allocations:[number,number][]|undefined,dataOffset:number|undefined;
 for(let at=bytes.readUInt16LE(12);at<bytes.length;){
  const kind=bytes.toString('ascii',at,at+4),size=bytes.readUInt32LE(at+4);
  if(size<8)throw Error('Invalid NARC block size');
  if(kind==='BTAF')allocations=Array.from({length:bytes.readUInt16LE(at+8)},(_,i)=>[bytes.readUInt32LE(at+12+i*8),bytes.readUInt32LE(at+16+i*8)]);
  if(kind==='GMIF')dataOffset=at+8;
  at+=size;
 }
 if(!allocations||dataOffset===undefined)throw Error('Missing native land allocation/data blocks');
 return allocations.map(([start,end])=>bytes.subarray(dataOffset!+start,dataOffset!+end));
}

export function nativePermissions(member:Buffer){
 const start=20+(member.readUInt32LE(16)>>>16);
 return Array.from({length:1024},(_,i)=>member.readUInt16LE(start+i*2));
}
