import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {AzaleaFieldActors,type AzaleaActorRole} from './azalea-field-bindings.ts';
import {initialAzaleaGymState,planAzaleaGymRide,azaleaGymRideFrame} from './gym-azalea-plan.ts';

function fixture(){
 const plan=planAzaleaGymRide(initialAzaleaGymState(),0);
 let player={group:new THREE.Group()},follower:{group:THREE.Group}|null={group:new THREE.Group()},active=true,forced=false;
 const logical={...plan.boarding.from,y:0};player.group.position.set(logical.x,0,logical.z);follower!.group.position.set(logical.x,0,logical.z+1);
 const facing={player:0,follower:0},settled:{role:AzaleaActorRole;point:unknown}[]=[];
 const bindings=new AzaleaFieldActors({player:()=>player,follower:()=>follower,followerActive:()=>active,playerLogical:()=>logical,forcedMovement:()=>forced,facing:role=>facing[role],face:(role,value)=>{facing[role]=value;},settle:(role,point)=>{if(role==='player')Object.assign(logical,point);settled.push({role,point});}});
 return{bindings,plan,logical,facing,settled,player:()=>player,follower:()=>follower,forced:(value:boolean)=>{forced=value;},active:(value:boolean)=>{active=value;},replacePlayer(){player={group:new THREE.Group()};},replaceFollower(){follower={group:new THREE.Group()};}};
}

test('source actor identities stay stable; ordinary idle logical positions follow completed papers',()=>{
 const h=fixture(),first=h.bindings.actors();assert.equal(h.bindings.actors().player,first.player);assert.equal(h.bindings.actors().follower,first.follower);
 h.logical.z--;h.player().group.position.z--;h.follower()!.group.position.z--;
 assert.deepEqual(h.bindings.snapshot().player,{current:{...h.logical},previous:{...h.logical}});
 h.active(false);assert.equal(h.bindings.actors().follower,null);assert.throws(()=>first.follower!.place({x:1,y:0,z:1}),{name:'AbortError'});
 first.follower!.movement(null);assert.equal(h.settled.length,0);
});

test('native cart vector does not replace logical boarding coordinates or follower previous tile',()=>{
 const h=fixture(),riders=h.bindings.actors(),from={...h.plan.boarding.from,y:0},onto={...h.plan.boarding.onto,y:0};h.forced(true);
 const movement={direction:0 as const,step:0,current:{...onto},previous:{...from}};riders.player.movement(movement);riders.follower!.movement({...movement,current:{...onto,z:onto.z+1},previous:{...from,z:from.z+1}});
 movement.current.z=999;assert.equal(h.bindings.movement('player')!.current.z,onto.z,'callers cannot mutate the owned record');
 // Boarding completed. During the route native State stays at this logical
 // tile while full vectors change, including the follower's own offset.
 riders.player.settle(onto);riders.follower!.settle({...onto,z:onto.z+1});
 const frame=azaleaGymRideFrame(h.plan,40);riders.player.place(frame.player);riders.follower!.place(frame.follower);
 assert.deepEqual(h.player().group.position.toArray(),[frame.player.x,frame.player.y,frame.player.z]);
 assert.deepEqual(h.bindings.snapshot().player,{current:{...onto},previous:{...onto}});
 assert.deepEqual(h.bindings.snapshot().follower,{current:{...onto,z:onto.z+1},previous:{...onto,z:onto.z+1}});
 assert.deepEqual(h.logical,onto);
});

test('docking settles source current/previous and releases only the owned movement record',()=>{
 const h=fixture(),rider=h.bindings.actors().player;h.forced(true);
 rider.movement({direction:0,step:7,current:{...h.plan.boarding.onto,y:0},previous:{...h.plan.boarding.from,y:0}});
 const dock={...h.plan.arrival.riding,y:0};rider.settle(dock);
 assert.equal(h.bindings.movement('player'),null);assert.deepEqual(h.bindings.snapshot().player,{current:dock,previous:dock});assert.deepEqual(h.logical,dock);
 rider.movement(null);assert.deepEqual(h.settled,[{role:'player',point:dock}]);
});

test('late cancellation cannot release a replaced actor or its new movement owner',()=>{
 const h=fixture(),old=h.bindings.actors();h.replacePlayer();h.replaceFollower();h.forced(true);const current=h.bindings.actors();
 assert.notEqual(old.player,current.player);assert.notEqual(old.follower,current.follower);
 const next={direction:1 as const,step:3,current:{x:2.5,y:0,z:4.5},previous:{x:2.5,y:0,z:3.5}};
 current.player.movement(next);current.follower!.movement(next);old.player.movement(null);old.follower!.movement(null);
 assert.deepEqual(h.bindings.movement('player'),next);assert.deepEqual(h.bindings.movement('follower'),next);
 assert.throws(()=>old.player.settle(next.current),{name:'AbortError'});assert.throws(()=>old.follower!.face(1),{name:'AbortError'});assert.equal(h.settled.length,0);
});

test('recovery rehydrates logical records without replaying source moves or facing callbacks',()=>{
 const h=fixture();h.bindings.actors();h.forced(true);const checkpoint=h.bindings.snapshot();h.replaceFollower();h.bindings.reset();
 h.bindings.restore(checkpoint);assert.deepEqual(h.bindings.snapshot(),checkpoint);assert.deepEqual(h.settled,[]);assert.deepEqual(h.facing,{player:0,follower:0});
 assert.deepEqual(h.follower()!.group.position.toArray(),[0,0,0],'the caller alone owns physical field hydration');
});
