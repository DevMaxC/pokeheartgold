import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {OriginalWorld} from './world.ts';
import {Terraces,ledgeDirection,jumpHeight} from './ledges.ts';
import {doorwayEntry} from './terrain.ts';
import type {SourceMap,Cell,Land,Matrix} from './types.ts';
const json=async(path:string)=>JSON.parse(await readFile(new URL('../../public/source/'+path,import.meta.url),'utf8'));
const matrix:Matrix=await json('matrices/0.json'),maps=new Map<number,SourceMap>(),lands=new Map<number,Land>(),cells=new Map<string,{cell:Cell;land:Land;map:SourceMap;furniture:never[]}>();
for(let z=0;z<matrix.height;z++)for(let x=0;x<matrix.width;x++){
 const owner=matrix.headers![z*matrix.width+x];if(!owner)continue;
 if(!maps.has(owner))maps.set(owner,await json('maps/'+owner+'.json'));const map=maps.get(owner)!,cell=map.cells.find(c=>c.x===x&&c.z===z);if(!cell)continue;
 if(!lands.has(cell.land))lands.set(cell.land,await json('lands/'+cell.land+'.json'));cells.set(x+','+z,{cell,land:lands.get(cell.land)!,map,furniture:[]});
}
function makeWorld(terraces:Terraces|null){const world=Object.create(OriginalWorld.prototype) as OriginalWorld;Object.assign(world,{cells,terraces});return world;}
const world=makeWorld(new Terraces(await json('terraces/0.json'))),native=makeWorld(null),dirs=[[0,-1,0],[0,1,1],[-1,0,2],[1,0,3]];
const source=await readFile(new URL('../../../src/field_terrain.c',import.meta.url),'utf8');
const nativeHeightFunction=source.slice(source.indexOf('int FieldSystem_GetHeightStep(FieldSystem *fieldSystem, VecFx32 *playerPos, int x, int z, u8 *outKind) {'));
const nativeLimit=nativeHeightFunction.match(/hi - lo >= (0x[0-9a-f]+)/i);assert.ok(nativeLimit);
// Native fx32 has12fraction bits; a source tile is16world units. This is a
// comparison fixture only: no1.25cutoff is added to browser movement/relief.
const nativeBlockedStep=Number.parseInt(nativeLimit[1],16)/4096/16;
function height(w:OriginalWorld,x:number,z:number){return w.height(x+.5,z+.5,0);}
function step(w:OriginalWorld,from:[number,number],to:[number,number]){const fromY=height(w,...from);return{from:fromY,to:w.height(to[0]+.5,to[1]+.5,fromY,from[0]+.5,from[1]+.5),allowed:w.walkable(to[0]+.5,to[1]+.5,from[0]+.5,from[1]+.5,fromY)};}

test('actual World Route30/31 ordinary steps retain source walkability and stay below the literal native blocked-height boundary',()=>{
 assert.equal(nativeBlockedStep,1.25);let checked=0,maxStep=0;
 for(const{cell,map}of cells.values())if([34,35].includes(map.id))for(let z=cell.z*32;z<(cell.z+1)*32;z++)for(let x=cell.x*32;x<(cell.x+1)*32;x++){
  if(!native.terrainWalkable(x+.5,z+.5))continue;
  for(const[dx,dz,facing]of dirs){const tx=x+dx,tz=z+dz;if(!native.terrainWalkable(tx+.5,tz+.5)||ledgeDirection(native.permission(tx+.5,tz+.5))===facing)continue;
   const original=step(native,[x,z],[tx,tz]),actual=step(world,[x,z],[tx,tz]);assert.equal(original.allowed,true);assert.equal(actual.allowed,original.allowed,`${x},${z}→${tx},${tz}`);
   assert.ok(Math.abs(original.to-original.from)<nativeBlockedStep);assert.ok(Math.abs(actual.to-actual.from)<nativeBlockedStep,`${x},${z}→${tx},${tz} is a new visual cliff on an ordinary source path`);maxStep=Math.max(maxStep,Math.abs(actual.to-actual.from));checked++;
  }
 }
 assert.equal(checked,6712);assert.ok(maxStep>.9&&maxStep<1);
});

test('MrPokémon house approach, native Cut object and Route31 cave keep their actual source transition classifications',()=>{
 const route=maps.get(34)!,door=step(world,[568,295],[568,294]);assert.deepEqual(door,{from:2.0078125,to:2.0078125,allowed:false});
 assert.equal(doorwayEntry(world.permission(568.5,294.5),route.events.warps.some(w=>w.x===568&&w.z===294),0),true);
 assert.equal(doorwayEntry(world.permission(568.5,294.5),true,1),false);
 const cut=route.events.objects.find(o=>o.x===559&&o.z===295);assert.ok(cut);assert.equal(cut.scriptId,'std_field_cut');assert.equal(cut.spriteId,'SPRITE_TREE');
 assert.deepEqual(step(world,[558,295],[559,295]),{from:2.02734375,to:2.02734375,allowed:true});
 // Actor collision/availability is owned by main's actual visible source NPC,
 // not by adding a cliff or changing the underlying walkable permissions.
 assert.deepEqual(step(world,[565,270],[565,269]),{from:5,to:5,allowed:true});
});

test('actual Route30 south ledge keeps its native one-way branch and correct upper/lower World landing references',()=>{
 assert.equal(world.permission(550.5,292.5),0x803b);assert.equal(ledgeDirection(world.permission(550.5,292.5)),1);
 assert.equal(step(world,[550,291],[550,292]).allowed,false);
 const landing=step(world,[550,291],[550,293]);assert.deepEqual(landing,{from:3.4765625,to:2.42578125,allowed:true});
 assert.equal(jumpHeight(landing.from,landing.to,0),landing.from);assert.equal(jumpHeight(landing.from,landing.to,1),landing.to);assert.ok(jumpHeight(landing.from,landing.to,.5)>landing.from);
});

test('actual terrain-only traversal still reaches the south house approach',()=>{
 const start:[number,number]=[548,383],goal='568,295',queue:[number,number][]=[start],seen=new Set([start.join(',')]);let reached=false;
 for(let i=0;i<queue.length&&!reached;i++){const[x,z]=queue[i];if(x+','+z===goal){reached=true;break;}
  for(const[dx,dz,facing]of dirs){let tx=x+dx,tz=z+dz;if(tx<480||tx>607||tz<256||tz>415)continue;
   if(ledgeDirection(world.permission(tx+.5,tz+.5))===facing){tx+=dx;tz+=dz;}else if(!step(world,[x,z],[tx,tz]).allowed)continue;
   if(!world.terrainWalkable(tx+.5,tz+.5))continue;const key=tx+','+tz;if(seen.has(key))continue;seen.add(key);queue.push([tx,tz]);
  }
 }
 assert.equal(reached,true,'Terrain-only reachability is not a script/NPC/full playthrough assertion');
});
