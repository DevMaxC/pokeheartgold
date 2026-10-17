import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import path from 'node:path';
import {nativeField,originalObjects,nativeLandMembers,nativePermissions,directions,repository,source} from '../../scripts/native-route-fixture.ts';
import {ledgeDirection} from './ledges.ts';
import {doorwayEntry,permissionWalkable} from './terrain.ts';
import {pushWarp} from './field-transitions.ts';

const terracePath=process.env.NATIVE_ROUTE_TERRACE_DATA||path.join(source,'terraces/0.json');
const fixture=nativeField(terracePath),native=nativeField('');

function walkGraph(blockObjects:boolean,flags:Record<string,boolean>={}){
 const blocked=new Set(blockObjects?originalObjects(fixture.maps,flags).filter(o=>o.visible).map(o=>`${o.x},${o.z}`):[]);
 const previous=new Map<string,string|null>([['548,383',null]]),queue=[[548,383]];
 for(let i=0;i<queue.length;i++){
  const [x,z]=queue[i],fromY=native.world.height(x+.5,z+.5);
  for(const [dx,dz,facing]of directions){
   let tx=x+dx,tz=z+dz;const middle=fixture.world.permission(tx+.5,tz+.5),jump=ledgeDirection(middle)===facing;
   if(jump){tx+=dx;tz+=dz;}else if(!fixture.world.walkable(tx+.5,tz+.5,x+.5,z+.5,fixture.world.height(x+.5,z+.5)))continue;
   if(tx<480||tx>607||tz<256||tz>415||blocked.has(`${tx},${tz}`))continue;
   if(!jump&&Math.abs(native.world.height(tx+.5,tz+.5,fromY,x+.5,z+.5)-fromY)>=1.25)continue;
   const key=`${tx},${tz}`;if(previous.has(key))continue;previous.set(key,`${x},${z}`);queue.push([tx,tz]);
  }
 }
 return {has:(x:number,z:number)=>previous.has(`${x},${z}`),path(x:number,z:number){
  let key:string|null=`${x},${z}`;if(!previous.has(key))return null;const result:number[][]=[];
  while(key){result.push(key.split(',').map(Number));key=previous.get(key)??null;}return result.reverse();
 }};
}

// Evaluate the real host step(), rather than a second implementation of its
// ledge/door/actor priority. Only animation/event/audio leaves are replaced.
function hostStep(x:number,z:number,flags:Record<string,boolean>={}){
 const text=fs.readFileSync(path.join(repository,'browser/src/source/main.ts'),'utf8');
 const start=text.indexOf('async function step(facing:number)'),end=text.indexOf('\nfunction menu()',start);
 assert.ok(start>=0&&end>start,'Actual main.ts step binding must be reviewed if its declaration changes');
 const world=fixture.world,actors=originalObjects(fixture.maps,flags).filter(o=>o.visible);
 world.npcSprites.clear();for(const actor of actors)world.npcSprites.set(actor.id,{group:{visible:true,position:{x:actor.x+.5,z:actor.z+.5}}} as never);
 const state={map:world.cell(x+.5,z+.5)!.map.id,x:x+.5,z:z+.5,facing:0,runningShoes:false};
 const movement:{x:number;z:number;jump:boolean}[]=[],events:boolean[]=[],warps:number[]=[];
 const context=vm.createContext({state,world,map:fixture.maps.get(state.map),walking:false,transitioning:false,vm:{busy:false},ui:{busy:false},battle:{active:false},deltas:directions.map(([x,z])=>({x,z})),player:{group:{position:{y:world.height(state.x,state.z)}}},keys:new Set(),pushWarp,ledgeDirection,doorwayEntry,
  tweenPlayer:async(x:number,z:number,_seconds:number,jump=false)=>{movement.push({x,z,jump});state.x=x;state.z=z;},
  encounterChecks:{step(){}},checkEvents:async(door=false)=>events.push(door),warp:async(index:number)=>warps.push(index),save(){}});
 vm.runInContext(stripTypeScriptTypes(text.slice(start,end),{mode:'transform'})+';globalThis.actualStep=step;',context);
 return {state,movement,events,warps,step:(facing:number)=>(context.actualStep as (f:number)=>Promise<void>)(facing)};
}

test('all outdoor matrix permissions match original NARC bytes, not a guessed wall mask',()=>{
 const members=nativeLandMembers();assert.equal(fixture.world.cells.size,201);
 for(const [id,land]of fixture.lands)assert.deepEqual(land.permissions,nativePermissions(members[id]),`native land ${id}`);
});

test('Route30/31 ordinary native steps remain eligible across terrain fields and connected map seams',()=>{
 let count=0,seams=0,maxPresentationStep=0;
 for(const loaded of fixture.world.cells.values()){
  if(![34,35].includes(loaded.map.id))continue;
  for(let z=loaded.cell.z*32;z<(loaded.cell.z+1)*32;z++)for(let x=loaded.cell.x*32;x<(loaded.cell.x+1)*32;x++){
   if(!native.world.terrainWalkable(x+.5,z+.5))continue;
   for(const [dx,dz,facing]of directions){const tx=x+dx,tz=z+dz;
    if(!native.world.terrainWalkable(tx+.5,tz+.5)||ledgeDirection(native.world.permission(tx+.5,tz+.5))===facing)continue;
    const from=native.world.height(x+.5,z+.5),to=native.world.height(tx+.5,tz+.5,from,x+.5,z+.5);
    assert.ok(Math.abs(to-from)<1.25,`native height eligibility ${x},${z} -> ${tx},${tz}`);
    const presented=fixture.world.height(x+.5,z+.5),destination=fixture.world.height(tx+.5,tz+.5,presented,x+.5,z+.5);
    assert.ok(fixture.world.walkable(tx+.5,tz+.5,x+.5,z+.5,presented));
    assert.ok(Math.abs(destination-presented)<1.25,`ordinary art now resembles an impassable step ${x},${z} -> ${tx},${tz}`);
    maxPresentationStep=Math.max(maxPresentationStep,Math.abs(destination-presented));
    if(fixture.world.cell(tx+.5,tz+.5)!.map.id!==loaded.map.id)seams++;
    // Sample the actual tween path, including both sides of tile/cell edges.
    let y=presented,px=x+.5,pz=z+.5;
    for(let i=1;i<=16;i++){const nx=x+.5+dx*i/16,nz=z+.5+dz*i/16,ny=fixture.world.height(nx,nz,y,px,pz);assert.ok(Number.isFinite(ny));assert.ok(Math.abs(ny-y)<1.25,`within-step discontinuity ${nx},${nz}`);y=ny;px=nx;pz=nz;}
    count++;
   }
  }
 }
 assert.equal(count,6712);assert.ok(seams>0);assert.ok(maxPresentationStep>0);
});

test('the house is reachable before Cut and cave/gate paths open after the native battler flag, while Cut remains blocked',()=>{
 const before=walkGraph(true);assert.ok(before.has(568,295));assert.ok(before.has(555,356));assert.equal(before.has(565,270),false);
 const original=fs.readFileSync(path.join(repository,'files/fielddata/script/scr_seq/scr_seq_0843_T20R0101.s'),'utf8');
 assert.match(original,/TakeItemNoCheck ITEM_MYSTERY_EGG, 1[\s\S]*SetFlag FLAG_HIDE_ROUTE_30_BATTLERS/);
 const flags={FLAG_HIDE_ROUTE_30_BATTLERS:true,FLAG_HIDE_ROUTE_30_YOUNGSTER_JOEY:false};
 const after=walkGraph(true,flags);assert.ok(after.has(565,270));assert.ok(after.has(519,269));
 const pathToHouse=before.path(568,295)!;assert.equal(pathToHouse.length-1,114);assert.ok(!pathToHouse.some(([x,z])=>x===559&&z===295));
 const cut=originalObjects(fixture.maps,flags).find(o=>o.id==='obj_R30_tree')!;assert.equal(cut.visible,true);assert.equal(cut.scriptId,'std_field_cut');
});

test('actual main step enters the native house door, takes only the forward ledge, and preserves actor/water collision',async()=>{
 let host=hostStep(568,295);await host.step(0);assert.deepEqual(host.movement,[{x:568.5,z:294.5,jump:false}]);assert.deepEqual(host.events,[true]);
 host=hostStep(567,294);await host.step(3);assert.equal(host.movement.length,0,'A source door is not a side passage');
 host=hostStep(550,291);await host.step(1);assert.deepEqual(host.movement,[{x:550.5,z:293.5,jump:true}]);
 host=hostStep(550,293);await host.step(0);assert.equal(host.movement.length,0,'The south-facing ledge cannot be climbed north');
 host=hostStep(558,295);await host.step(3);assert.equal(host.movement.length,0,'Visible source Cut tree owns collision');
 host=hostStep(558,295,{FLAG_MAPTEMP_010:true});await host.step(3);assert.equal(host.movement.length,1,'The same native path opens only after its object flag is set');
 assert.equal(permissionWalkable(fixture.world.permission(566.5,376.5)),false);
 host=hostStep(565,376);await host.step(3);assert.equal(host.movement.length,0,'No implicit Surf permission');
});

test('actual cave approach and every outdoor native door preserve the correct field/warp distinction',async()=>{
 const host=hostStep(565,270);await host.step(0);assert.deepEqual(host.movement,[{x:565.5,z:269.5,jump:false}]);assert.deepEqual(host.events,[false]);
 let doors=0;
 for(const map of fixture.maps.values())for(const warp of map.events.warps){const p=fixture.world.permission(warp.x+.5,warp.z+.5);if((p&255)!==105)continue;
  assert.ok(doorwayEntry(p,true,0));for(const facing of[1,2,3])assert.equal(doorwayEntry(p,true,facing),false);assert.equal(doorwayEntry(p,false,0),false);doors++;
 }
 assert.ok(doors>=50,'Exercise the actual global outdoor door population');
});

test('a real Route48 bridge retains both native floors throughout the field height path',()=>{
 // Land74 has overlapping BDHC planes at10.5 and13. The player reference,
 // rather than the default zero-height lookup, selects the occupied floor.
 assert.equal(fixture.world.cell(87.5,328.5)!.map.id,152);
 assert.equal(fixture.world.permission(87.5,328.5)&255,115);
 for(const floor of[10.5,13]){
  let previousZ=328.5,y=floor;
  for(let i=0;i<=32;i++){
   const z=328.5+i/16,next=fixture.world.height(87.5,z,y,87.5,previousZ);
   assert.equal(next,floor,'Moving through the bridge must not switch native floors');
   if(floor===13)assert.equal(fixture.world.walkable(87.5,z,87.5,previousZ,y),true);
   y=next;previousZ=z;
  }
 }
 assert.equal(fixture.world.walkable(86.5,328.5,87.5,328.5,13),false,'A bridge-side source barrier remains closed');
});
