import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData,newState} from './data.ts';
import {ScriptVM,type ScriptHooks} from './script.ts';
import {FieldObjects} from './objects.ts';
import {movementAction} from './movement.ts';
import {findCoordinateTrigger} from './coordinate-triggers.ts';
import {sourceJSON,type SourceMap,type Trigger} from './types.ts';

globalThis.fetch=async input=>{try{return new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));}catch{return new Response('',{status:404});}};
const data=await loadData(),ilex=await sourceJSON<SourceMap>('maps/117.json');

function fixture(){
  const map=structuredClone(ilex),state=newState(data,'Case','boy'),objects=new FieldObjects(data,state),messages:string[]=[],warps:{map:number;x:number;z:number;facing?:number}[]=[];
  state.map=map.id;state.flags.FLAG_BEAT_AZALEA_ROCKETS=true;objects.load(map.events.objects);
  const deltas=[[0,-1],[0,1],[-1,0],[1,0]];
  const hooks:ScriptHooks={message:async text=>{messages.push(text);},choice:async()=>0,move:async(id,label,source)=>{
    for(let pc=source.scripts.labels[label];pc<source.scripts.instructions.length;pc++){
      const [command,args]=source.scripts.instructions[pc],action=movementAction(command,args);if(action.end)break;
      if(action.facing===null)continue;const [dx,dz]=deltas[action.facing],distance=action.distance*action.repeats;
      if(id==='obj_player'){state.facing=action.facing;state.x+=dx*distance;state.z+=dz*distance;}
      else if(id!=='obj_partner_poke'){const actor=objects.get(id);assert.ok(actor,id);actor.facingDirection=action.facing;actor.x+=dx*distance;actor.z+=dz*distance;}
    }
  },position:(id,x,z,facing)=>{objects.position(id,x,z,facing);},face:()=>{},visible:(id,visible)=>objects.show(id,visible),chooseStarter:async()=>{},nickname:async()=>1,refresh:async()=>{},battle:async()=>{throw Error('No battle belongs to this source branch');},warp:async(id,x,z,facing)=>{warps.push({map:id,x,z,facing});state.map=id;state.x=x+.5;state.z=z+.5;if(facing!==undefined)state.facing=facing;},coordinates:id=>{const actor=objects.get(id);assert.ok(actor,id);return{x:Math.floor(actor.x),z:Math.floor(actor.z)};}};
  const vm=new ScriptVM(data,state,hooks),find=(x=state.x,z=state.z)=>findCoordinateTrigger(map,x,z,token=>vm.value(token,map),data.constants);
  return{map,state,objects,messages,warps,vm,find};
}

async function catchFirst(f:ReturnType<typeof fixture>){
  f.state.x=25.5;f.state.z=66.5;const trigger=f.find();assert.ok(trigger);assert.equal(trigger.scriptId,'_EV_scr_seq_D36R0101_farfetchd1_sticks1 + 1');await f.vm.run(f.map,trigger.scriptId);
  f.state.x=25.5;f.state.z=61.5;f.state.facing=1;const id='obj_D36R0101_tsure_poke_static_farfetchd',bird=f.map.events.objects.find(event=>event.id===id)!;await f.vm.run(f.map,bird.scriptId,id);
}
async function catchSecond(f:ReturnType<typeof fixture>){
  const id='obj_D36R0101_tsure_poke_static_farfetchd_2',bird=f.map.events.objects.find(event=>event.id===id)!;
  // Actual initial top-left interaction sends the bird to its source top-right.
  f.state.x=41.5;f.state.z=55.5;f.state.facing=0;await f.vm.run(f.map,bird.scriptId,id);assert.deepEqual([f.objects.get(id)!.x,f.objects.get(id)!.z],[49,54]);
  f.state.x=52.5;f.state.z=53.5;const trigger=f.find();assert.ok(trigger);assert.equal(trigger.scriptId,'_EV_scr_seq_D36R0101_farfetchd2_sticks2 + 1');await f.vm.run(f.map,trigger.scriptId);assert.equal(f.vm.value('VAR_TEMP_x4003',f.map),1);
  f.state.x=48.5;f.state.z=54.5;f.state.facing=3;await f.vm.run(f.map,bird.scriptId,id);
}

test('all six actual Ilex stick triggers resolve native STICKS_ACTIVE rather than number/string equality',()=>{
  const f=fixture(),sticks=f.map.events.coords.filter(event=>event.val==='STICKS_ACTIVE');assert.equal(sticks.length,6);assert.equal(f.map.constants.STICKS_ACTIVE,1);assert.equal(f.map.constants.STICKS_INACTIVE,2);
  for(const event of sticks){
    f.vm.set(event.var!,1);const x=event.x+.5,z=event.z+.5;
    const previous=f.map.events.coords.find(c=>Math.floor(x)>=c.x&&Math.floor(x)<c.x+(c.w||1)&&Math.floor(z)>=c.z&&Math.floor(z)<c.z+(c.h||1)&&f.vm.value(c.var||'0',f.map)===c.val);
    assert.equal(previous,undefined,'counterfactual old host misses this literal');assert.equal(f.find(x,z),event);
    f.vm.set(event.var!,2);assert.equal(f.find(x,z),undefined,'the inactive native state does not trigger');
  }
});

test('native rectangles retain source precedence, explicit zero extents, integer tiles and no invented Y gate',()=>{
  const f=fixture(),base:Trigger={scriptId:'first',x:10,z:20,w:2,h:2,y:999,var:'VAR_TEMP_x4000',val:1};f.vm.set(base.var!,1);
  f.map.events.coords=[base,{...base,scriptId:'second'}];assert.equal(f.find(10.5,20.9),base);assert.equal(f.find(11.999,21.999),base);assert.equal(f.find(12,21),undefined);assert.equal(f.find(11,22),undefined);assert.equal(f.find(9.999,20),undefined);
  f.map.events.coords=[{...base,w:0},{...base,h:0}];assert.equal(f.find(10,20),undefined);
});

test('expected event values are native literals even when the literal has a variable-number value',()=>{
  const f=fixture(),event:Trigger={scriptId:1,x:1,z:1,w:1,h:1,y:0,var:'VAR_TEMP_x4000',val:'RAW_VALUE'};f.map.events.coords=[event];f.map.constants.RAW_VALUE=0x4001;f.vm.set(event.var!,0x4001);f.vm.set('VAR_TEMP_x4001',7);
  assert.equal(f.find(1,1),event);event.val='16385';assert.equal(f.find(1,1),event);event.val='0x4001';assert.equal(f.find(1,1),event);
  event.val='STICKS_ACTIVE';f.vm.set(event.var!,1);assert.equal(findCoordinateTrigger(f.map,1,1,token=>f.vm.value(token,f.map),{STICKS_ACTIVE:2}),event,'map-local constants have source scope');
  event.val='UNKNOWN_ORIGINAL_LITERAL';assert.throws(()=>f.find(1,1),/Invalid original coordinate-event value/);
});

test('numeric campaign triggers and persisted variable aliases retain their prior source behavior',async()=>{
  const f=fixture(),azalea=await sourceJSON<SourceMap>('maps/74.json'),event=azalea.events.coords.find(c=>c.var==='VAR_UNK_4075')!;assert.ok(event);f.vm.set('VAR_UNK_4075',1);
  const persisted=JSON.parse(JSON.stringify(f.state));delete persisted.vars.VAR_UNK_4075;const vm=new ScriptVM(data,persisted,f.vm.hooks);
  assert.equal(findCoordinateTrigger(azalea,event.x+.5,event.z+4.5,token=>vm.value(token,azalea),data.constants),event);assert.equal(findCoordinateTrigger(azalea,event.x+.5,event.z+5.5,token=>vm.value(token,azalea),data.constants),undefined);
});

test('actual Ilex stick script changes the blind spot and first-Farfetchd catch returns to its native warp coordinates/facing',async()=>{
  const f=fixture();await f.vm.run(f.map,f.map.initScripts.OnTransition);const bird=f.map.events.objects.find(o=>o.id==='obj_D36R0101_tsure_poke_static_farfetchd')!;assert.ok(bird);assert.deepEqual([f.objects.get(bird.id)!.x,f.objects.get(bird.id)!.z],[25,62]);
  f.state.x=25.5;f.state.z=66.5;const stick=f.find();assert.ok(stick);assert.equal(stick.scriptId,'_EV_scr_seq_D36R0101_farfetchd1_sticks1 + 1');await f.vm.run(f.map,stick.scriptId);
  assert.equal(f.vm.value('VAR_TEMP_x4002',f.map),1);assert.equal(f.vm.value('VAR_FARFETCHD1_STICKS1',f.map),2);assert.equal(f.find(),undefined,'deactivated sticks do not retrigger underfoot');assert.ok(f.messages.some(text=>text.includes('noticed you')));
  f.state.x=25.5;f.state.z=61.5;f.state.facing=1;await f.vm.run(f.map,bird.scriptId,bird.id);
  assert.equal(f.vm.lastUnsupported,null);assert.equal(f.state.flags.FLAG_FOUND_FIRST_FARFETCHD,true);assert.equal(f.state.flags.FLAG_HIDE_FARFETCHD_1_LOST,true);assert.equal(f.state.flags.FLAG_HIDE_FARFETCHD_1_FOUND,false);assert.equal(f.objects.snapshot().find(object=>object.id===bird.id)!.visible,false);assert.equal(f.objects.get(bird.id)!.shown,undefined);assert.equal(f.state.flags.FLAG_FOUND_SECOND_FARFETCHD,undefined);assert.equal(f.state.flags.FLAG_GOT_HM01,undefined);
  assert.deepEqual(f.warps,[{map:117,x:15,z:65,facing:data.constants.DIR_NORTH}]);assert.deepEqual([f.state.map,f.state.x,f.state.z,f.state.facing],[117,15.5,65.5,0]);
});

for(const order of['first-second','second-first']as const)test(`both actual Ilex capture branches grant HM01 in ${order} order without pretending to teach or use Cut`,async()=>{
  const f=fixture();await f.vm.run(f.map,f.map.initScripts.OnTransition);for(const capture of order==='first-second'?[catchFirst,catchSecond]:[catchSecond,catchFirst])await capture(f);
  assert.equal(f.vm.lastUnsupported,null);for(const flag of['FLAG_FOUND_FIRST_FARFETCHD','FLAG_FOUND_SECOND_FARFETCHD','FLAG_HIDE_FARFETCHD_1_LOST','FLAG_HIDE_FARFETCHD_2_LOST','FLAG_HIDE_FARFETCHD_1_FOUND','FLAG_HIDE_FARFETCHD_2_FOUND','FLAG_HIDE_ILEX_CUT_MASTER','FLAG_HIDE_ILEX_APPRENTICE','FLAG_GOT_HM01'])assert.equal(f.state.flags[flag],true,flag);
  assert.equal(f.state.bag.ITEM_HM01,1);assert.deepEqual(f.warps.map(w=>[w.map,w.x,w.z,w.facing]),[[117,15,65,0],[117,15,65,0]]);assert.equal(f.state.flags.FLAG_MAPTEMP_010,undefined,'native Cut tree is not removed by HM acquisition');assert.deepEqual(f.state.party,[],'the source gift does not invent a learner');
});

test('actual full-HM-stack catch preserves both catches and master retry grants once after space exists',async()=>{
  const f=fixture();f.state.bag.ITEM_HM01=data.constants.BAG_TMHM_QUANTITY_MAX;await f.vm.run(f.map,f.map.initScripts.OnTransition);await catchFirst(f);await catchSecond(f);
  assert.equal(f.state.flags.FLAG_FOUND_FIRST_FARFETCHD,true);assert.equal(f.state.flags.FLAG_FOUND_SECOND_FARFETCHD,true);assert.equal(f.state.flags.FLAG_GOT_HM01,undefined);assert.equal(f.state.flags.FLAG_HIDE_ILEX_CUT_MASTER,false);assert.equal(f.state.bag.ITEM_HM01,99);assert.ok(f.messages.some(text=>text.includes('Bag is full')));
  f.state.bag.ITEM_HM01--;const master=f.map.events.objects.find(event=>event.id==='obj_D36R0101_gsfighter')!;await f.vm.run(f.map,master.scriptId,master.id);assert.equal(f.state.flags.FLAG_GOT_HM01,true);assert.equal(f.state.bag.ITEM_HM01,99);await f.vm.run(f.map,master.scriptId,master.id);assert.equal(f.state.bag.ITEM_HM01,99);assert.equal(f.state.flags.FLAG_MAPTEMP_010,undefined);
});
