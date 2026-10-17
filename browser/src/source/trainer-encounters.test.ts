import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData,newState,createMon} from './data.ts';
import {FieldObjects} from './objects.ts';
import {ScriptVM,type ScriptHooks} from './script.ts';
import {sourceJSON,type Land,type SourceMap} from './types.ts';
import {tilePermission,terrainHeight} from './terrain.ts';
import {trainerDefeated,setTrainerDefeated} from './trainer-script-state.ts';
import {findTrainerEncounter,fieldTrainerCollision,trainerSight,trainerBehaviorBlocked,trainerEventPriority,approachTrainer,TRAINER_DIRECTIONS,TrainerAttemptLatch,MissingTrainerPartner,type TrainerEncounter,type TrainerTerrain} from './trainer-encounters.ts';

globalThis.fetch=async input=>{try{return new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));}catch{return new Response('',{status:404});}};
const data=await loadData();
async function fixture(id=35,key='TRAINER_BUG_CATCHER_WADE',distance=2){
 const map=await sourceJSON<SourceMap>(`maps/${id}.json`),state=newState(data,'Ethan','boy'),objects=new FieldObjects(data,state);state.map=id;objects.load(map.events.objects);const actor=[...objects.objects.values()].find(n=>n.scriptId===`std_trainer(${key})`)!;assert.ok(actor);
 state.party=[createMon(data,155,8,state.name,()=>.5),createMon(data,16,8,state.name,()=>.5)];const d=TRAINER_DIRECTIONS[actor.facingDirection];state.x=actor.x+d.x*distance+.5;state.z=actor.z+d.z*distance+.5;
 const lands=new Map(await Promise.all([...new Set(map.cells.map(c=>c.land))].map(async id=>[id,await sourceJSON<Land>(`lands/${id}.json`)]as const))),cell=(x:number,z:number)=>map.cells.find(c=>c.x===Math.floor(x/32)&&c.z===Math.floor(z/32));
 const terrain:TrainerTerrain={permission:(x,z)=>{const c=cell(x,z);return c?tilePermission(lands.get(c.land)!,x,z):0x8000;},height:(x,z,reference=0)=>{const c=cell(x,z);return c?terrainHeight(lands.get(c.land)!,c,x,z,reference):reference;}};
 const collision=fieldTrainerCollision(terrain,state,objects.snapshot());return{map,state,objects,actor,terrain,collision,detect:()=>findTrainerEncounter(data,state,map,objects.snapshot(),collision)};
}
test('actual Wade, Sprout Tower and Violet Gym source objects detect only their native unobstructed sight line',async()=>{
 for(const[id,key]of[[35,'TRAINER_BUG_CATCHER_WADE'],[155,'TRAINER_SAGE_NICO'],[135,'TRAINER_BIRD_KEEPER_GS_ABE'],[135,'TRAINER_BIRD_KEEPER_GS_ROD']]as const){const f=await fixture(id,key),seen=f.detect();assert.ok(seen,`${id}:${key} actual permissions and plates`);assert.equal(seen.eyeType,0);assert.equal(seen.trainers[0].trainer,data.constants[key]);assert.equal(seen.trainers[0].distance,2);f.state.x+=f.actor.facingDirection<2?1:0;f.state.z+=f.actor.facingDirection>=2?1:0;assert.equal(f.detect(),null,'no diagonal/radius encounter');}
});
test('native event flags, explicit show/hide, defeat flags and range all affect sight',async()=>{
 const f=await fixture();assert.ok(f.detect());setTrainerDefeated(f.state,4);assert.equal(f.detect(),null);setTrainerDefeated(f.state,4,false);f.actor.eventFlag='TRAINER_HIDDEN';f.state.flags.TRAINER_HIDDEN=true;assert.equal(f.detect(),null);f.objects.show(f.actor.id,true);assert.ok(f.detect());f.objects.show(f.actor.id,false);assert.equal(f.detect(),null);f.objects.show(f.actor.id,true);f.state.z=f.actor.z-3+.5;assert.equal(f.detect(),null,'native Wade range is two tiles');
});
test('actual twins produce a paired context, never a fabricated single battle, and require two usable Pokémon',async()=>{
 const f=await fixture(180,'TRAINER_TWINS_AMY_AND_MIMI',1),encounter=f.detect();assert.equal(encounter?.eyeType,1);assert.equal(encounter?.trainers.length,2);assert.ok(encounter?.trainers.every(t=>t.trainer===10));assert.notEqual(encounter?.trainers[0].object,encounter?.trainers[1].object);f.state.party.splice(1);assert.equal(f.detect(),null);
});
test('a flag-hidden missing partner is an explicit admission error that can be latched without blocking movement forever',async()=>{
 const f=await fixture(180,'TRAINER_TWINS_AMY_AND_MIMI',1),partner=[...f.objects.objects.values()].find(n=>n.id!==f.actor.id&&String(n.scriptId).includes('TRAINER_TWINS_AMY_AND_MIMI'))!;f.objects.show(partner.id,false);assert.throws(f.detect,MissingTrainerPartner);const latch=new TrainerAttemptLatch();assert.equal(latch.admit(f.state,'missing:'+f.actor.id),true);assert.equal(latch.admit(f.state,'missing:'+f.actor.id),false);f.state.x++;latch.observe(f.state);f.state.x--;assert.equal(latch.admit(f.state,'missing:'+f.actor.id),true,'leaving an encounter-free tile and returning permits a later retry');
});
test('independent trainers retain native object order and only combine when doubles are eligible',async()=>{
 const f=await fixture(),sprout=await sourceJSON<SourceMap>('maps/155.json'),second={...sprout.events.objects.find(n=>String(n.scriptId)==='std_trainer(TRAINER_SAGE_NICO)')!,x:f.actor.x+2,z:f.actor.z-2,facingDirection:2,param0:2};
 // A live script can reposition an object: this fixture supplies a literal
 // clear intersection for two real exported trainer definitions.
 const actors=[f.actor,second],collision=fieldTrainerCollision(f.terrain,f.state,actors);assert.deepEqual(findTrainerEncounter(data,f.state,f.map,actors,collision)?.trainers.map(t=>t.trainer),[4,51]);assert.equal(findTrainerEncounter(data,f.state,f.map,actors,collision)?.eyeType,2);f.state.party.splice(1);assert.equal(findTrainerEncounter(data,f.state,f.map,actors,collision)?.eyeType,0);
});
test('native type two scans cardinal directions while ordinary type one follows live facing',async()=>{
 const f=await fixture();f.actor.facingDirection=1;assert.equal(f.detect(),null);f.actor.type=2;assert.ok(f.detect());f.actor.type=0;assert.equal(f.detect(),null);f.actor.type=4;f.actor.facingDirection=0;assert.ok(f.detect());
});
test('sight ignores roaming-range bit one but requires player occupancy at the clear endpoint',async()=>{
 const f=await fixture();assert.ok(trainerSight(f.actor,f.state,(a,x,z,d)=>f.collision(a,x,z,d)|1));assert.equal(trainerSight(f.actor,f.state,()=>0),null);assert.equal(trainerSight(f.actor,f.state,()=>4),null,'intermediate actor blocks the line');assert.equal(trainerSight(f.actor,f.state,(a,x,z,d)=>f.collision(a,x,z,d)|2),null);
});
test('actual collision adapter rejects terrain, furniture, directional walls and another actor in sight',async()=>{
 const f=await fixture();f.terrain.obstructed=()=>true;assert.equal(f.detect(),null);delete f.terrain.obstructed;
 const originalPermission=f.terrain.permission;f.terrain.permission=(x,z)=>Math.floor(z)===f.actor.z-1?51:originalPermission(x,z);assert.equal(f.detect(),null,'north entry into south-blocking native edge');f.terrain.permission=originalPermission;
 const blocker=[...f.objects.objects.values()].find(n=>n.id!==f.actor.id)!;f.objects.position(blocker.id,f.actor.x,f.actor.z-1);f.objects.show(blocker.id,true);assert.equal(f.detect(),null);
 assert.equal(trainerBehaviorBlocked(50,0,0),true);assert.equal(trainerBehaviorBlocked(0,51,0),true);assert.equal(trainerBehaviorBlocked(0,50,0),false);
});
test('native trainer sight crosses water without checking player Surf eligibility, but obeys its collision attribute',async()=>{
 const f=await fixture(),original=f.terrain.permission;for(const behavior of[16,17,19,21]){f.terrain.permission=(x,z)=>Math.floor(z)===f.actor.z-1?behavior:original(x,z);assert.ok(f.detect(),`native water behavior${behavior} with collision clear`);f.terrain.permission=(x,z)=>Math.floor(z)===f.actor.z-1?behavior|0x8000:original(x,z);assert.equal(f.detect(),null,'collision bit15 still blocks');}
});
test('a moving object occupies both its current and previous source tile at the matching floor',async()=>{
 const f=await fixture(),blocker=[...f.objects.objects.values()].find(n=>n.id!==f.actor.id)!;f.objects.position(blocker.id,f.actor.x+1.25,f.actor.z-1);f.objects.show(blocker.id,true);blocker.previousX=f.actor.x;blocker.previousZ=f.actor.z-1;blocker.previousY=f.terrain.height(f.actor.x+.5,f.actor.z+.5,f.actor.y/16);assert.equal(f.detect(),null);blocker.previousY+=2;assert.ok(f.detect(),'a previous tile on another floor does not obstruct');
});
test('trainer constants use the same map-first resolution as the source VM',async()=>{const f=await fixture();f.map.constants.TRAINER_BUG_CATCHER_WADE=data.constants.TRAINER_SAGE_NICO;assert.equal(f.detect()?.trainers[0].trainer,data.constants.TRAINER_SAGE_NICO);});
test('a live following Pokémon occupies the native sight line on its own floor',async()=>{
 const f=await fixture(),height=f.terrain.height(f.actor.x+.5,f.actor.z+.5,f.actor.y/16);f.terrain.occupants=()=>[{x:f.actor.x+.5,z:f.actor.z-.5,height}];assert.equal(f.detect(),null);f.terrain.occupants=()=>[{x:f.actor.x+.5,z:f.actor.z-.5,height:height+2}];assert.ok(f.detect());
});
test('sight uses native height threshold and does not mistake the player on a different floor for an endpoint',async()=>{
 const f=await fixture(),height=f.terrain.height,base=height(f.actor.x+.5,f.actor.z+.5,f.actor.y/16);f.terrain.playerHeight=()=>base+2;assert.equal(f.detect(),null);delete f.terrain.playerHeight;
 f.terrain.height=(x,z,...args)=>Math.floor(z)===f.actor.z-1?base+1.25:height(x,z,...args);assert.equal(f.detect(),null,'20 DS unit native height step blocks');f.terrain.height=(x,z,...args)=>Math.floor(z)===f.actor.z-1?base+1.249:height(x,z,...args);assert.ok(f.detect());
});
test('the shared single-trainer approach moves distance minus one tiles before native dialogue/battle and survives save/Continue',async()=>{
 for(const[id,key]of[[35,'TRAINER_BUG_CATCHER_WADE'],[155,'TRAINER_SAGE_NICO'],[135,'TRAINER_BIRD_KEEPER_GS_ABE'],[135,'TRAINER_BIRD_KEEPER_GS_ROD']]as const){const f=await fixture(id,key),plan=f.detect()!,events:string[]=[],before={x:f.actor.x,z:f.actor.z};let won=true,task:Promise<void>|undefined;
  const hooks:ScriptHooks={message:async text=>{events.push('message:'+text);},choice:async()=>1,move:async()=>{},position:()=>{},face:()=>{},visible:()=>{},chooseStarter:async()=>{},nickname:async()=>{},refresh:async()=>{},battle:async trainer=>{events.push('battle:'+trainer);return won;},warp:async()=>{},whiteOut:async()=>{events.push('whiteout');},objectMovement:(id,next)=>f.objects.movement(id,next),objectFacing:id=>f.objects.facing(id),followerActive:()=>true,trainerPath:async index=>{task=approachTrainer(plan.trainers[index],index,plan.eyeType,f.actor,f.state,f.collision,{notice:async(t,hidden)=>{assert.equal(hidden,false);f.actor.facingDirection=t.direction;events.push('notice');},step:async(t,x,z)=>{events.push('step');f.objects.position(t.object,x,z);},facePlayer:direction=>{f.state.facing=direction;},finish:t=>{f.objects.movement(t.object,0);}});},trainerStep:async()=>{await task;return true;}};
  const vm=new ScriptVM(data,f.state,hooks);await vm.runTrainerApproach(f.map,plan);assert.deepEqual(events.slice(0,2),['notice','step']);assert.ok(events[2].startsWith('message:'));assert.equal(events.filter(e=>e==='step').length,1);assert.equal(Math.abs(f.actor.x-before.x)+Math.abs(f.actor.z-before.z),1);assert.equal(trainerDefeated(f.state,data.constants[key]),true);
  f.state.objectEvents=f.objects.save(f.state.map);const saved=JSON.parse(JSON.stringify(f.state)),restored=new FieldObjects(data,saved);restored.load(f.map.events.objects);restored.restore(f.map.id,saved.objectEvents);assert.deepEqual([restored.get(f.actor.id)!.x,restored.get(f.actor.id)!.z,restored.get(f.actor.id)!.movement],[f.actor.x,f.actor.z,0]);assert.equal(findTrainerEncounter(data,saved,f.map,restored.snapshot(),f.collision),null,'defeated trainer remains defeated after Continue');
  events.length=0;await vm.run(f.map,f.actor.scriptId,f.actor.id);assert.ok(events[0].startsWith('message:'));assert.ok(!events.some(e=>e.startsWith('battle:')));setTrainerDefeated(f.state,data.constants[key],false);won=false;await vm.run(f.map,f.actor.scriptId,f.actor.id);assert.equal(trainerDefeated(f.state,data.constants[key]),false);assert.ok(events.includes('whiteout'));
 }
});
test('blocked or stale approach plans stop explicitly instead of teleporting around obstacles',async()=>{
 const f=await fixture(),plan=f.detect()!.trainers[0];let notices=0,steps=0;const hooks={notice:async()=>{notices++;},step:async()=>{steps++;},facePlayer:()=>{},finish:()=>{}};
 await assert.rejects(approachTrainer(plan,0,0,f.actor,f.state,()=>2,hooks),/blocked/);assert.equal(notices,0);assert.equal(steps,0);f.state.x++;await assert.rejects(approachTrainer(plan,0,0,f.actor,f.state,f.collision,hooks),/no longer matches/);assert.equal(notices,0);
});
test('native event priority runs frame scripts before trainers and defers lower priority step events',async()=>{
 const events:string[]=[];assert.equal(await trainerEventPriority(async()=>{events.push('frame');return true;},async()=>{events.push('trainer');return true;}),true);assert.deepEqual(events,['frame']);events.length=0;assert.equal(await trainerEventPriority(async()=>{events.push('frame');return false;},async()=>{events.push('trainer');return true;}),true);assert.deepEqual(events,['frame','trainer']);
});
