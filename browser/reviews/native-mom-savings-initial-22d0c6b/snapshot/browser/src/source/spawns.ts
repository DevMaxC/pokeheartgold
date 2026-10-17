import {sourceJSON} from './types.ts';
type Destination={map:number;x:number;z:number;facing:number};
type Spawn={id:number;blackout:boolean;fly:boolean;death:Destination;landing:Destination;special:Destination};
let rows:Promise<Record<number,Spawn>>|null=null;
function spawnRows(){return rows??=sourceJSON<Record<number,Spawn>>('spawns.json').catch(error=>{rows=null;throw error;});}
export async function originalSpawn(id:number){const spawn=(await spawnRows())[id];if(!spawn)throw Error(`Missing original spawn point ${id}`);return spawn;}
export async function mapBlackoutSpawn(map:number){return Object.values(await spawnRows()).find(s=>s.blackout&&s.death.map===map);}
