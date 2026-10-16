import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData,newState,createMon,giveMon} from './data.ts';
import {FieldObjects} from './objects.ts';
import {ScriptVM,UnsupportedScript,type ScriptHooks} from './script.ts';
import {SourceActionRecovery,SourceRecoveryError,restoreStateInPlace} from './script-recovery.ts';
import {sourceJSON,type SourceMap,type Script,type State} from './types.ts';

globalThis.fetch=async input=>{
  const path=String(input);assert.ok(path.startsWith('/source/'));
  try{return new Response(await readFile(new URL('../../public'+path,import.meta.url)));}catch{return new Response('',{status:404});}
};
const data=await loadData();
async function harness(id=156){
  const state=newState(data,'Ethan','boy');state.map=id;state.x=13.5;state.z=17.5;
  let map=await sourceJSON<SourceMap>(`maps/${id}.json`),weather=12,visible=true,hydrations=0,failHydration=false;
  const objects=new FieldObjects(data,state);objects.load(map.events.objects);
  const hooks:ScriptHooks={
    message:async()=>{},choice:async()=>1,move:async()=>{},
    position:(id,x,z,facing)=>{if(id==='obj_player'){state.x=x+.5;state.z=z+.5;}else objects.position(id,x,z,facing);},
    face:()=>{},visible:(id,shown)=>objects.show(id,shown),
    chooseStarter:async()=>{giveMon(state,createMon(data,155,5,state.name,()=>.5));state.starter=155;},nickname:async()=>{},refresh:async()=>{},battle:async()=>true,warp:async()=>{},
    weather:value=>{if(value!==undefined)weather=value;return weather;},
  };
  let vm=new ScriptVM(data,state,hooks),saved=JSON.stringify(state),writes=0;
  const recovery=new SourceActionRecovery(state,{
    capture:()=>({actors:objects.save(state.map),weather,visible}),
    restore:async(snapshot,error)=>{
      hydrations++;if(failHydration)throw Error('Original map download failed');
      map=await sourceJSON<SourceMap>(`maps/${state.map}.json`);
      objects.load(map.events.objects);objects.restore(state.map,snapshot.actors);weather=snapshot.weather;visible=snapshot.visible;
      vm=new ScriptVM(data,state,hooks);if(error instanceof UnsupportedScript)vm.lastUnsupported={map:error.map,command:error.command,pc:error.pc};
    },
  });
  function save(){if(recovery.busy)return;state.objectEvents=objects.save(state.map);saved=JSON.stringify(state);writes++;}
  function script(instructions:Script['instructions']):SourceMap{return{...map,scripts:{entries:['start'],labels:{start:0},instructions}};}
  return{state,objects,hooks,recovery,save,script,get map(){return map;},get vm(){return vm;},get weather(){return weather;},get visible(){return visible;},set visible(value){visible=value;},get saved(){return saved;},get writes(){return writes;},get hydrations(){return hydrations;},set failHydration(value){failHydration=value;},
    async enter(id:number){state.map=id;state.x=4.5;state.z=5.5;map=await sourceJSON<SourceMap>(`maps/${id}.json`);objects.load(map.events.objects);weather=0;visible=false;},
  };
}

test('actual Sprout Tower 3F failure restores both scene-variable aliases and remains explicitly retryable',async()=>{
  const h=await harness(),root=h.state,before=structuredClone(h.state),saved=h.saved;
  const trigger=h.map.events.coords.find(row=>row.var==='VAR_UNK_40A4')!;
  let attempts=0;
  const scene=()=>h.recovery.run(async()=>{attempts++;await h.vm.run(h.map,2);h.save();});
  await assert.rejects(scene(),error=>error instanceof UnsupportedScript&&error.command==='CreateCameraTarget'&&error.pc===11&&error.map==='D15R0103');
  assert.equal(h.state,root);assert.equal(h.objects.state,root);assert.equal(h.vm.state,root);
  assert.deepEqual(h.state,before);assert.equal(h.vm.value(trigger.var!,h.map),trigger.val);
  assert.equal(h.state.vars['#'+data.constants.VAR_UNK_40A4],before.vars['#'+data.constants.VAR_UNK_40A4]);
  assert.deepEqual(h.vm.lastUnsupported,{map:'D15R0103',command:'CreateCameraTarget',pc:11});
  assert.equal(h.saved,saved);assert.equal(h.writes,0);assert.equal(attempts,1);assert.equal(h.recovery.busy,false);
  // No automatic replay: only this explicit second call attempts the scene again.
  await assert.rejects(scene(),UnsupportedScript);assert.equal(attempts,2);assert.deepEqual(h.state,before);
});

test('inventory, starter, visibility and live actor coordinates roll back even when objectEvents was stale',async()=>{
  const h=await harness(),npc=h.map.events.objects[0].id;
  h.objects.position(npc,8,9,3);h.objects.show(npc,true);h.objects.get(npc)!.directionLocked=true;
  const actors=h.objects.save(h.state.map),before=structuredClone(h.state);
  const map=h.script([
    ['SetVar',['VAR_UNK_40A4','1']],['SetFlag',['CHECKPOINT_FLAG']],['AddItem',['ITEM_POTION','2']],['ChooseStarter',[]],
    ['HidePerson',[npc]],['MovePerson',[npc,'3','0','4']],['UnportedGameplay',[]],
  ]);
  await assert.rejects(h.recovery.run(()=>h.vm.run(map,1)),UnsupportedScript);
  assert.deepEqual(h.state,before);assert.deepEqual(h.objects.save(h.state.map),actors);
  assert.equal(h.state.objectEvents,undefined);assert.equal(h.objects.snapshot()[0].visible,true);
});

test('failure after GiveItem in actual shared script2033 unwinds parent and child without a partial save',async()=>{
  const h=await harness(61),before=structuredClone(h.state),saved=h.saved;let sawGift=false;
  h.hooks.message=async()=>{sawGift=h.state.bag.ITEM_POTION===2;h.save();throw Error('Message host failed after source GiveItem');};
  const map=h.script([['SetFlag',['PARENT_SCENE']],['GiveItemNoCheck',['ITEM_POTION','2']],['SetFlag',['LATER_SCENE']],['End',[]]]);
  await assert.rejects(h.recovery.run(()=>h.vm.run(map,1)),/Message host failed/);
  assert.equal(sawGift,true);assert.deepEqual(h.state,before);assert.equal(h.hydrations,1);assert.equal(h.saved,saved);assert.equal(h.writes,0);
});

test('rollback waits for pending source movement before restoring actors and input state',async()=>{
  const h=await harness(),npc=h.map.events.objects[0].id,actors=h.objects.save(h.state.map);
  let finish!:()=>void;h.hooks.move=async()=>{await new Promise<void>(resolve=>finish=resolve);h.objects.position(npc,40,50,2);h.state.x=40.5;};
  const map=h.script([['ApplyMovement',[npc,'moving']],['UnportedGameplay',[]]]);
  const running=h.recovery.run(()=>h.vm.run(map,1));
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(h.recovery.busy,true);assert.equal(h.vm.busy,true);assert.equal(h.hydrations,0);h.save();assert.equal(h.writes,0);
  finish();await assert.rejects(running,UnsupportedScript);
  assert.deepEqual(h.objects.save(h.state.map),actors);assert.equal(h.state.x,13.5);assert.equal(h.hydrations,1);
  await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(h.objects.save(h.state.map),actors);
});

test('nested warp and multiple entry scripts share one checkpoint including spawn, Flash, weather and NPC map',async()=>{
  const h=await harness(),before=structuredClone(h.state),actors=h.objects.save(h.state.map),saved=h.saved;
  h.state.flags.FLAG_SYS_FLASH=true;before.flags.FLAG_SYS_FLASH=true;
  h.hooks.warp=async id=>h.recovery.run(async()=>{
    await h.enter(id);h.state.flags.FLAG_SYS_FLASH=false;h.state.lastHeal={map:id,x:1.5,z:2.5};
    await h.recovery.run(async()=>{h.state.flags.ENTRY_ONE=true;h.save();});
    await h.recovery.run(async()=>{const child=new ScriptVM(data,h.state,h.hooks);await child.run(h.script([['SetFlag',['ENTRY_TWO']],['UnportedEntry',[]]]),1);});
  });
  await assert.rejects(h.recovery.run(()=>h.vm.run(h.script([['Warp',['61','0','0','4','5']]]),1)),UnsupportedScript);
  assert.deepEqual(h.state,before);assert.equal(h.map.id,156);assert.deepEqual(h.objects.save(156),actors);assert.equal(h.weather,12);assert.equal(h.visible,true);
  assert.equal(h.hydrations,1);assert.equal(h.saved,saved);assert.equal(h.writes,0);
});

test('an earlier committed battle stays committed; a battle in a later failed trainer scene rolls back with its flags and phone offer',async()=>{
  const h=await harness();h.state.party=[createMon(data,155,5,h.state.name,()=>.5)];
  await h.recovery.run(async()=>{h.state.money+=100;h.state.party[0].exp+=25;h.state.flags.PRIOR_TRAINER=true;});h.save();
  const before=structuredClone(h.state),saved=h.saved;
  h.hooks.battle=async()=>h.recovery.run(async()=>{h.state.money+=500;h.state.party[0].hp=1;h.state.party[0].exp+=100;h.state.party[0].moves[0].pp=0;h.state.seen.push(16);h.state.caught.push(16);h.save();return true;});
  h.hooks.message=async()=>{h.state.pokegear={contacts:['TRAINER'],cards:[1]};throw Error('Phone offer unavailable');};
  await assert.rejects(h.recovery.run(()=>h.vm.run(h.script([['TrainerBattle',['1']],['SetFlag',['#1361']],['Message',['Phone offer']],['End',[]]]),1)),/Phone offer unavailable/);
  assert.deepEqual(h.state,before);assert.equal(h.state.flags.PRIOR_TRAINER,true);assert.equal(h.saved,saved);assert.equal(h.writes,1);
  assert.equal(h.state.pokegear,undefined);
});

test('successful nested actions unlock one outer commit and preserve shared State identity',async()=>{
  const h=await harness(),root=h.state;
  const result=await h.recovery.run(async()=>{h.state.money+=10;await h.recovery.run(async()=>{h.state.bag.ITEM_POTION=2;h.save();});assert.equal(h.writes,0);return 7;});
  h.save();assert.equal(result,7);assert.equal(h.writes,1);assert.equal(h.state,root);assert.equal(h.vm.state,root);assert.equal(h.objects.state,root);
  assert.equal(JSON.parse(h.saved).bag.ITEM_POTION,2);assert.equal(h.recovery.busy,false);
});

test('failed field hydration keeps saves and new actions blocked until explicit recovery retry succeeds',async()=>{
  const h=await harness(),before=structuredClone(h.state),saved=h.saved;
  h.failHydration=true;
  await assert.rejects(h.recovery.run(async()=>{h.state.money=1;await h.enter(61);throw Error('Scene failure');}),error=>error instanceof SourceRecoveryError&&String(error.actionError).includes('Scene failure')&&String(error.recoveryError).includes('download failed'));
  assert.deepEqual(h.state,before);assert.equal(h.recovery.recovering,true);assert.equal(h.recovery.busy,true);h.save();assert.equal(h.saved,saved);
  let replayed=false;await assert.rejects(h.recovery.run(async()=>{replayed=true;}),SourceRecoveryError);assert.equal(replayed,false);
  await assert.rejects(h.recovery.retryRecovery(),SourceRecoveryError);assert.equal(h.recovery.busy,true);
  h.failHydration=false;await h.recovery.retryRecovery();assert.equal(h.map.id,156);assert.equal(h.recovery.busy,false);assert.equal(h.writes,0);assert.deepEqual(h.state,before);
});

test('restoring in place deletes newly created optional keys and does not alias the reusable checkpoint',()=>{
  const state=newState(data,'Ethan','boy') as State&{trainerPhone?:{seeking:number[]}},snapshot=structuredClone(state),root=state;
  state.trainerPhone={seeking:[4]};state.pokegear={contacts:['MOM'],cards:[1]};state.runningShoes=true;state.bag.ITEM_POTION=2;
  restoreStateInPlace(state,snapshot);assert.equal(state,root);assert.equal(Object.hasOwn(state,'trainerPhone'),false);assert.equal(Object.hasOwn(state,'pokegear'),false);assert.equal(Object.hasOwn(state,'runningShoes'),Object.hasOwn(snapshot,'runningShoes'));
  state.flags.NEW=true;state.bag.ITEM_POTION=10;restoreStateInPlace(state,snapshot);assert.deepEqual(state,snapshot);
});
