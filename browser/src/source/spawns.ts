import {sourceJSON} from './types.ts';
type Destination={map:number;x:number;z:number;facing:number};
type Spawn={id:number;blackout:boolean;fly:boolean;death:Destination;landing:Destination;special:Destination};
let rows:Promise<Record<number,Spawn>>|null=null;
export async function originalSpawn(id:number){rows??=sourceJSON('spawns.json');const spawn=(await rows)[id];if(!spawn)throw Error(`Missing original spawn point ${id}`);return spawn;}
export async function mapBlackoutSpawn(map:number){rows??=sourceJSON('spawns.json');return Object.values(await rows).find(s=>s.blackout&&s.death.map===map);}
