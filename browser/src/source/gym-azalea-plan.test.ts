import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NATIVE_AZALEA_GYM as rules} from './azalea-gym-rules.ts';
import {initialAzaleaGymState,azaleaGymEntryState,flipAzaleaGymSwitch,planAzaleaGymRide,azaleaGymRideFrame,completeAzaleaGymRide,azaleaGymShakeOffsets,type AzaleaGymState} from './gym-azalea-plan.ts';

const root=new URL('../../../',import.meta.url),fixtures=JSON.parse(await readFile(new URL('../../public/source/azalea-gym-fixtures.json',import.meta.url),'utf8'));
function occupied(station:number,switches:number):AzaleaGymState{
  const destination=rules.slots[station][switches]?.destination,others=Array.from({length:12},(_,i)=>i).filter(i=>i!==station&&i!==destination).slice(0,3);
  return{spiders:[station,others[0],others[1],others[2]],switches:switches as 0|1|2|3};
}

test('native export contains all8 polylines/12stations/48switch slots and exact committed C/SDK source hashes',async()=>{
  assert.equal(Object.keys(rules.routes).length,8);assert.equal(rules.stations.length,12);assert.equal(rules.slots.flat().length,48);assert.equal(rules.slots.flat().filter(Boolean).length,36);assert.deepEqual(initialAzaleaGymState(),{spiders:[0,1,2,7],switches:0});
  for(const source of rules.sources)assert.equal(createHash('sha256').update(await readFile(new URL(source.path,root))).digest('hex'),source.sha256,source.path);
  const source=await readFile(new URL('src/field/gymmick/azalea.c',root),'utf8');
  const arrays=[...source.matchAll(/static const AzaleaGymmickSpinarakRouteNode (sSpinarakRoute_\w+)\[\] = \{([\s\S]*?)\n\};/g)];assert.equal(arrays.length,8);
  for(const[,name,body]of arrays)assert.deepEqual(rules.routes[name.replace('sSpinarakRoute_','')as keyof typeof rules.routes],[...body.matchAll(/\{\s*(\d+),\s*(\d+)\s*\}/g)].map(([,x,z])=>[Number(x),Number(z)]));
  for(let station=0;station<12;station++){
    const body=source.match(new RegExp('sSpinarakRoutes_From'+(station+1)+'\\[\\] = \\{([\\s\\S]*?)\\n\\};'))![1],entries=[...body.matchAll(/\{([^{}]*)\}/g)].map(([,entry])=>{if(!entry.trim())return null;const parsed=entry.match(/NELEMS\((sSpinarakRoute_\w+)\),\s*(\d+),\s*(sSpinarakRoute_\w+)/)!;assert.equal(parsed[1],parsed[3]);return{route:parsed[1].replace('sSpinarakRoute_',''),destination:Number(parsed[2])};});assert.deepEqual(rules.slots[station],entries);
  }
  const reverseCases=source.split('void BeginAzaleaGymSpinarakRide')[1].split('localData->spinarakDirection = 1;')[0];assert.deepEqual([...reverseCases.matchAll(/case (\d+):/g)].map(([,station])=>Number(station)),[...rules.reverseStations]);
  assert.match(source,/VEC_MultAdd\(FX32_CONST\(2\)/);assert.match(source,/terminalWaitCounter\+\+ >= 4/);assert.match(source,/terminalWaitCounter\+\+ >= 8/);
});

test('all36 actual usable station/switch routes replay independent Python SDK fixtures with exact directed nodes/ticks/poses',()=>{
  let usable=0,reverse=0;
  for(let station=0;station<12;station++)for(let switches=0;switches<4;switches++){
    const slot=rules.slots[station][switches];if(!slot)continue;const state=occupied(station,switches),before=structuredClone(state),plan=planAzaleaGymRide(state,station),expected=fixtures[slot.route][plan.reverse?'reverse':'forward'];
    assert.deepEqual(state,before);assert.equal(plan.destination,slot.destination);assert.equal(plan.movementTicks,expected.ticks);assert.equal(plan.movementSeconds,expected.ticks/30);assert.deepEqual(plan.segments.map(s=>({ticks:s.ticks,velocity:[s.velocity.x,s.velocity.z]})),expected.segments);
    for(const sample of expected.samples){const frame=azaleaGymRideFrame(plan,sample.tick);assert.deepEqual([frame.fixed.x,frame.fixed.z],sample.fixed);assert.equal(frame.model.x,frame.player.x);assert.equal(frame.model.z+.5+plan.playerZOffset,frame.player.z);assert.equal(frame.model.z+.5+plan.followerZOffset,frame.follower.z);assert.equal(Math.abs(frame.player.z-frame.follower.z),1);}
    const result=completeAzaleaGymRide(state,plan);assert.equal(result.spiders[0],slot.destination);assert.deepEqual(result.spiders.slice(1),state.spiders.slice(1));assert.equal(result.switches,state.switches);assert.deepEqual(state,before);usable++;reverse+=Number(plan.reverse);
  }
  assert.equal(usable,36);assert.equal(reverse,18);
});

test('the12 native NULL routes and unoccupied/invalid station preconditions reject without modifying saved state',()=>{
  let empty=0;
  for(let station=0;station<12;station++)for(let switches=0;switches<4;switches++)if(!rules.slots[station][switches]){const state=occupied(station,switches),before=structuredClone(state);assert.throws(()=>planAzaleaGymRide(state,station),/No native route/);assert.deepEqual(state,before);empty++;}
  assert.equal(empty,12);const state=initialAzaleaGymState(),before=structuredClone(state);assert.throws(()=>planAzaleaGymRide(state,4),/No native Spinarak/);for(const station of[-1,12,.5,NaN])assert.throws(()=>planAzaleaGymRide(state,station),RangeError);assert.deepEqual(state,before);
});

test('forward and reverse rides preserve source boarding/disembark offsets and exact native segment timings',()=>{
  const state=initialAzaleaGymState(),forward=planAzaleaGymRide(state,0);assert.equal(forward.movementTicks,209);assert.deepEqual(forward.segments.map(s=>s.ticks),[16,48,16,49,24,48,8]);assert.deepEqual(forward.boarding,{from:{x:3.5,z:32.5},onto:{x:3.5,z:31.5}});assert.deepEqual(forward.arrival,{riding:{x:9.5,z:24.5},disembarked:{x:9.5,z:23.5}});assert.equal(forward.playerZOffset,0);assert.equal(forward.followerZOffset,1);
  const next=completeAzaleaGymRide(state,forward),reverse=planAzaleaGymRide(next,4);assert.deepEqual(reverse.boarding,{from:{x:9.5,z:24.5},onto:{x:9.5,z:25.5}});assert.deepEqual(reverse.arrival,{riding:{x:3.5,z:32.5},disembarked:{x:3.5,z:33.5}});assert.equal(reverse.playerZOffset,1);assert.equal(reverse.followerZOffset,0);assert.equal(reverse.direction,1);assert.equal(reverse.movementTicks,209);assert.deepEqual(completeAzaleaGymRide(next,reverse),state);
});

test('switches toggle their native bits and select the actual upper routes without teleporting other spiders',()=>{
  const initial=initialAzaleaGymState(),zero=planAzaleaGymRide(initial,7);assert.equal(zero.destination,9);assert.equal(zero.movementTicks,209);
  const one=flipAzaleaGymSwitch(initial,0);assert.equal(one.switches,1);assert.equal(planAzaleaGymRide(one,7).destination,11);assert.equal(planAzaleaGymRide(one,7).movementTicks,104);
  const two=flipAzaleaGymSwitch(initial,1);assert.equal(two.switches,2);assert.equal(planAzaleaGymRide(two,7).destination,10);const three=flipAzaleaGymSwitch(two,0);assert.equal(three.switches,3);assert.equal(planAzaleaGymRide(three,7).destination,11);assert.deepEqual(three.spiders,initial.spiders);assert.deepEqual(flipAzaleaGymSwitch(three,1),one);assert.throws(()=>flipAzaleaGymSwitch(initial,2),RangeError);
});

test('Continue and connections retain all4 saved stations while real warps initialize source state without mutating input',()=>{
  const moved=completeAzaleaGymRide(initialAzaleaGymState(),planAzaleaGymRide(initialAzaleaGymState(),0)),saved=flipAzaleaGymSwitch(moved,1),snapshot=structuredClone(saved);
  for(const kind of['continue','connection']as const){const result=azaleaGymEntryState(JSON.parse(JSON.stringify(saved)),kind);assert.deepEqual(result,saved);assert.notEqual(result,saved);assert.notEqual(result.spiders,saved.spiders);}
  assert.deepEqual(azaleaGymEntryState(saved,'warp'),initialAzaleaGymState());assert.deepEqual(saved,snapshot);assert.deepEqual(azaleaGymEntryState(undefined,'continue'),initialAzaleaGymState());
  for(const invalid of[{spiders:[0,1,2,2],switches:0},{spiders:[0,1,2,12],switches:0},{spiders:Array(4),switches:0},{spiders:[0,1,2,7],switches:4}])assert.throws(()=>azaleaGymEntryState(invalid as AzaleaGymState,'continue'),RangeError);
});

test('stale switch/station plans and invalid ticks fail before commit; partial ride frames never mutate saved positions',()=>{
  const state=initialAzaleaGymState(),before=structuredClone(state),plan=planAzaleaGymRide(state,0);for(let tick=0;tick<=plan.movementTicks;tick++)azaleaGymRideFrame(plan,tick);assert.deepEqual(state,before);
  assert.throws(()=>completeAzaleaGymRide(flipAzaleaGymSwitch(state,0),plan),/Stale/);const moved=completeAzaleaGymRide(state,plan);assert.throws(()=>completeAzaleaGymRide(moved,plan),/Stale/);for(const tick of[-1,.5,plan.movementTicks+1,NaN])assert.throws(()=>azaleaGymRideFrame(plan,tick),RangeError);assert.deepEqual(state,before);
});

test('authored docking waits retain native postincrement ticks and camera offsets return to zero without an orbit reset',()=>{
  assert.equal(rules.phases.afterBoardWaitTicks,5);assert.equal(rules.phases.beforeDisembarkWaitTicks,9);assert.equal(rules.phases.dockTicks,1);assert.equal(rules.phases.shakeTicks,7);assert.deepEqual(azaleaGymShakeOffsets(1),[1/16,1/16,0,0,1/16,1/16,0]);for(const facing of[0,2,3])assert.deepEqual(azaleaGymShakeOffsets(facing),[-1/16,-1/16,0,0,-1/16,-1/16,0]);assert.throws(()=>azaleaGymShakeOffsets(4),RangeError);
});
