import {test,type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {OriginalWorld} from './world.ts';
import type {FieldObject} from './objects.ts';
import type {SpriteInfo} from './types.ts';

function fixture(t:TestContext){
  // Exercise the actual allocator and removal paths without a DOM/image loader
  // or a WebGL renderer. Every loader call still returns its own real texture.
  t.mock.method(THREE.TextureLoader.prototype,'load',()=>new THREE.Texture());
  const info:SpriteInfo={model:0,columns:4,rows:4,frames:16,width:32,height:32,asset:'sprites/test.png'};
  const world=Object.create(OriginalWorld.prototype) as OriginalWorld;
  Object.assign(world,{scene:new THREE.Scene(),sprites:{SPRITE_A:info,SPRITE_B:info},npcSprites:new Map(),paperResources:new WeakMap(),height:()=>0,yaw:0});
  return world;
}
function resources(actor:{group:THREE.Group;texture:THREE.Texture}){
  const result=new Set<THREE.Texture|THREE.BufferGeometry|THREE.Material>([actor.texture]);
  actor.group.traverse(object=>{if(object instanceof THREE.Mesh){result.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])result.add(material);}});
  return result;
}
function watch(...sets:ReturnType<typeof resources>[]){
  const calls=new Map<object,number>();
  for(const resource of new Set(sets.flatMap(set=>[...set])))resource.addEventListener('dispose',()=>calls.set(resource,(calls.get(resource)??0)+1));
  return calls;
}
function npc(id:string,sprite='SPRITE_A'):FieldObject{
  return{id,spriteId:sprite,resolvedSprite:sprite,movement:0,eventFlag:'FLAG_NOTHING',scriptId:0,facingDirection:0,x:1,z:2,y:0,xRange:0,yRange:0,shown:undefined,step:-1,visible:true,directionLocked:false,invisible:false};
}

test('paper removal releases its five resources once while sibling and attached shared assets survive',t=>{
  const world=fixture(t),first=world.paper('SPRITE_A'),sibling=world.paper('SPRITE_A'),owned=resources(first),other=resources(sibling);
  assert.equal(owned.size,5);assert.equal(other.size,5);for(const resource of owned)assert.ok(!other.has(resource),'even equal sprite keys allocate unique actor resources');
  const texture=new THREE.Texture(),material=new THREE.MeshBasicMaterial({map:texture}),geometry=new THREE.BoxGeometry(),shared=new Set([texture,material,geometry]);
  const template=new THREE.Mesh(geometry,material),attachment=new THREE.Mesh(geometry,material);first.group.add(attachment);world.scene.add(template);
  const calls=watch(owned,other,shared);
  assert.equal(world.removePaper(first),true);assert.equal(first.group.parent,null);assert.equal(sibling.group.parent,world.scene);assert.equal(template.parent,world.scene);
  for(const resource of owned)assert.equal(calls.get(resource),1);for(const resource of [...other,...shared])assert.equal(calls.get(resource),undefined);
  assert.equal(world.removePaper(first),false);for(const resource of owned)assert.equal(calls.get(resource),1);
  // A remaining actor can still animate and owns the same undamaged map.
  world.animate(sibling,1,2);assert.equal((sibling.sprite.material as THREE.MeshBasicMaterial).map,sibling.texture);
  assert.equal(world.removePaper(sibling),true);for(const resource of other)assert.equal(calls.get(resource),1);for(const resource of shared)assert.equal(calls.get(resource),undefined);
});

test('paper removal ignores unregistered groups and actors owned by another World',t=>{
  const world=fixture(t),other=fixture(t),actor=other.paper('SPRITE_A'),owned=resources(actor),calls=watch(owned),foreign=new THREE.Group();world.scene.add(foreign);
  assert.equal(world.removePaper({group:foreign}),false);assert.equal(foreign.parent,world.scene);
  assert.equal(world.removePaper(actor),false);assert.equal(actor.group.parent,other.scene);assert.equal(calls.size,0);
  // Detaching from the actual parent also handles an owned actor reparented by
  // a presentation; no traversal or disposal of that parent's resources occurs.
  const presentation=new THREE.Group();other.scene.add(presentation);presentation.add(actor.group);
  assert.equal(other.removePaper(actor),true);assert.equal(actor.group.parent,null);assert.equal(presentation.parent,other.scene);for(const resource of owned)assert.equal(calls.get(resource),1);
});

test('clearNPCs uses owned cleanup and leaves a separately allocated follower alive',t=>{
  const world=fixture(t),follower=world.paper('SPRITE_A');world.updateNPCs([npc('one'),npc('two','SPRITE_B')]);
  const actors=[...world.npcSprites.values()],owned=actors.map(resources),kept=resources(follower),calls=watch(...owned,kept);
  world.clearNPCs();assert.equal(world.npcSprites.size,0);assert.equal(follower.group.parent,world.scene);
  for(const actor of actors)assert.equal(actor.group.parent,null);for(const set of owned)for(const resource of set)assert.equal(calls.get(resource),1);for(const resource of kept)assert.equal(calls.get(resource),undefined);
  world.clearNPCs();for(const actor of actors)assert.equal(world.removePaper(actor),false);for(const set of owned)for(const resource of set)assert.equal(calls.get(resource),1);
  assert.equal(world.removePaper(follower),true);for(const resource of kept)assert.equal(calls.get(resource),1);
});

test('NPC sprite changes dispose texture, plane and shadow, preserve siblings and allow rebuilding',t=>{
  const world=fixture(t),one=npc('one'),two=npc('two');world.updateNPCs([one,two]);
  const original=world.npcSprites.get('one')!,sibling=world.npcSprites.get('two')!,old=resources(original),kept=resources(sibling),calls=watch(old,kept);
  one.resolvedSprite='SPRITE_B';world.updateNPCs([one,two]);const replacement=world.npcSprites.get('one')!,next=resources(replacement),nextCalls=watch(next);
  assert.notEqual(replacement.group,original.group);assert.equal(original.group.parent,null);assert.equal(replacement.group.parent,world.scene);assert.equal(world.npcSprites.get('two'),sibling);
  for(const resource of old)assert.equal(calls.get(resource),1);for(const resource of kept)assert.equal(calls.get(resource),undefined);
  world.updateNPCs([one,two]);assert.equal(world.npcSprites.get('one'),replacement);assert.equal(nextCalls.size,0);
  one.resolvedSprite='SPRITE_MISSING';world.updateNPCs([one,two]);assert.equal(world.npcSprites.has('one'),false);for(const resource of next)assert.equal(nextCalls.get(resource),1);
  one.resolvedSprite='SPRITE_A';world.updateNPCs([one,two]);assert.ok(world.npcSprites.has('one'));assert.notEqual(world.npcSprites.get('one')!.texture,original.texture);
  world.clearNPCs();for(const resource of kept)assert.equal(calls.get(resource),1);for(const resource of old)assert.equal(calls.get(resource),1);for(const resource of next)assert.equal(nextCalls.get(resource),1);
});
