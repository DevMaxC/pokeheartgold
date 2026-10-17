import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
import {loadData,newState,createMon,giveMon} from './data.ts';
import {FieldObjects} from './objects.ts';
import {ScriptVM,UnsupportedScript,type ScriptHooks} from './script.ts';
import {SourceActionRecovery,SourceRecoveryError,SourceTriggerGate,restoreStateInPlace,runRecoverableSourceAction,runFieldBattleAction} from './script-recovery.ts';
import {sourceJSON,type SourceMap,type Script,type State} from './types.ts';
import {TrainerAttemptLatch} from './trainer-encounters.ts';

globalThis.fetch=async input=>{
  const path=String(input);assert.ok(path.startsWith('/source/'));
  try{return new Response(await readFile(new URL('../../public'+path,import.meta.url)));}catch{return new Response('',{status:404});}
};
const data=await loadData();
async function harness(id=156){
  const state=newState(data,'Ethan','boy');state.map=id;state.x=13.5;state.z=17.5;
  let map=await sourceJSON<SourceMap>(`maps/${id}.json`),weather=12,visible=true,hydrations=0,failHydration=false,ready=true;
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
      objects.load(map.events.objects);objects.restore(state.map,snapshot.actors);weather=snapshot.weather;visible=snapshot.visible;ready=true;
      vm=new ScriptVM(data,state,hooks);if(error instanceof UnsupportedScript)vm.lastUnsupported={map:error.map,command:error.command,pc:error.pc};
    },
  });
  function save(){if(recovery.busy)return;state.objectEvents=objects.save(state.map);saved=JSON.stringify(state);writes++;}
  function script(instructions:Script['instructions']):SourceMap{return{...map,scripts:{entries:['start'],labels:{start:0},instructions}};}
  return{state,objects,hooks,recovery,save,script,get ready(){return ready;},set ready(value){ready=value;},get map(){return map;},get vm(){return vm;},get weather(){return weather;},get visible(){return visible;},set visible(value){visible=value;},get saved(){return saved;},get writes(){return writes;},get hydrations(){return hydrations;},set failHydration(value){failHydration=value;},
    async enter(id:number){state.map=id;state.x=4.5;state.z=5.5;map=await sourceJSON<SourceMap>(`maps/${id}.json`);objects.load(map.events.objects);weather=0;visible=false;},
  };
}

// Exercise the real bootstrap binding without loading its WebGL/UI imports.
// The recovery controller and both failure gates are the production classes.
const main=await readFile(new URL('main.ts',import.meta.url),'utf8');
const bindingStart=main.indexOf('async function executeSourceAction<'),bindingEnd=main.indexOf('\nasync function runScript(',bindingStart);
assert.ok(bindingStart>=0&&bindingEnd>bindingStart,'main source-action binding moved; update the fixture');
const actionBindingSource=stripTypeScriptTypes(main.slice(bindingStart,bindingEnd));
function bindMainAction(h:Awaited<ReturnType<typeof harness>>,gate:SourceTriggerGate,trainers:TrainerAttemptLatch,choose:()=>Promise<number>){
  const context={sourceSceneOwners:0,preservedControlScripts:0,connecting:false,syncInputContext(){},syncMusic(){},resetFieldInput(){context.keys.clear();},sourceActions:h.recovery,frameTriggerGate:gate,trainerAttempts:trainers,runRecoverableSourceAction,UnsupportedScript,state:h.state,recoveryPrompt:false,lastError:'',keys:new Set(['w']),ui:{choose},console:{error:()=>{}},save:()=>{assert.equal(context.recoveryPrompt,false);h.save();}};
  const execute=runInNewContext(actionBindingSource+';executeSourceAction;',context)as<T>(action:()=>Promise<T>)=>ReturnType<typeof runRecoverableSourceAction<T,unknown>>;
  return{execute,context};
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


test('automatic frame failures stay paused across steps; explicit retry and changing maps re-enable the scene',async()=>{
  const h=await harness(),gate=new SourceTriggerGate(),key='156:VAR_UNK_40A4:0:source2';let attempts=0;
  const poll=async()=>{
    const location=String(h.state.map);gate.visit(location);
    if(!gate.allows(key))return;
    try{await h.recovery.run(async()=>{attempts++;await h.vm.run(h.map,2);});}
    catch(error){gate.failed(location,key);throw error;}
  };
  await assert.rejects(poll(),UnsupportedScript);await poll();await poll();assert.equal(attempts,1);
  // Explicit Retry must reopen the gate before an outer warp/entry is replayed.
  gate.retry(key);await assert.rejects(poll(),UnsupportedScript);assert.equal(attempts,2);
  h.state.x++;await poll();assert.equal(attempts,2);
  gate.visit('61');gate.visit('156');await assert.rejects(poll(),UnsupportedScript);assert.equal(attempts,3);
  assert.equal(h.vm.value('VAR_UNK_40A4',h.map),0);
});

test('field snapshots are detached at capture so later live-field mutation cannot corrupt recovery',async()=>{
  const state=newState(data,'Ethan','boy'),field={actors:[{x:1}],height:2};
  const recovery=new SourceActionRecovery(state,{capture:()=>field,restore:async snapshot=>{assert.deepEqual(snapshot,{actors:[{x:1}],height:2});}});
  await assert.rejects(recovery.run(async()=>{field.actors[0].x=20;field.height=50;throw Error('stop');}),/stop/);
});


test('a nested destination trigger cannot overwrite the failed source trigger location on unwind',()=>{
  const gate=new SourceTriggerGate();gate.visit('source:13,17');gate.visit('destination:4,5');
  gate.failed('destination:4,5','destination-trigger');gate.failed('source:13,17','source-trigger');
  gate.visit('source:13,17');assert.equal(gate.allows('source-trigger'),false);
  gate.retry('source-trigger');assert.equal(gate.allows('source-trigger'),true);
});


test('a failed Continue entry can return to its hydrated field and save only after the error prompt closes',async()=>{
  const h=await harness(),before=structuredClone(h.state),actors=h.objects.save(h.state.map);h.ready=false;
  let attempts=0,prompts=0,promptOpen=false;
  const result=await runRecoverableSourceAction(h.recovery,async()=>{attempts++;await h.vm.run(h.map,2);},{
    failed:async error=>{prompts++;promptOpen=true;assert.equal(h.ready,true);assert.equal(h.recovery.busy,false);assert.deepEqual(h.state,before);assert.deepEqual(h.objects.save(h.state.map),actors);assert.ok(error instanceof UnsupportedScript);promptOpen=false;return 'return';},
    recoveryFailed:async()=>assert.fail('field hydration should succeed'),retry:()=>assert.fail('no implicit retry'),
    committed:()=>{assert.equal(promptOpen,false);h.save();},
  });
  assert.deepEqual(result,{ok:false});assert.equal(attempts,1);assert.equal(prompts,1);assert.equal(h.ready,true);assert.equal(h.writes,1);
  assert.equal(JSON.parse(h.saved).vars.VAR_UNK_40A4,before.vars.VAR_UNK_40A4);
});

test('explicit retry replays a nested actual gift once from its checkpoint; children never prompt or save independently',async()=>{
  const h=await harness(61);let messages=0,prompts=0,retries=0,attempts=0;
  h.hooks.message=async()=>{messages++;if(messages===1)throw Error('gift message unavailable');};
  const ports={failed:async()=>{prompts++;assert.equal(h.state.bag.ITEM_POTION,undefined);return 'retry' as const;},recoveryFailed:async()=>assert.fail('no failed hydration'),retry:()=>{retries++;},committed:()=>h.save()};
  const result=await runRecoverableSourceAction(h.recovery,async()=>{
    attempts++;await runRecoverableSourceAction(h.recovery,()=>h.vm.run(h.script([['GiveItemNoCheck',['ITEM_POTION','2']],['SetFlag',['GIFT_FINISHED']],['End',[]]]),1),ports);
  },ports);
  assert.equal(result.ok,true);assert.equal(prompts,1);assert.equal(retries,1);assert.equal(attempts,2);assert.equal(h.writes,1);assert.equal(h.state.bag.ITEM_POTION,2);assert.equal(h.state.flags.GIFT_FINISHED,true);
});

test('the recovery controller retries hydration without replaying source code, then offers a return and one coherent save',async()=>{
  const h=await harness();h.failHydration=true;let runs=0,loadPrompts=0,scenePrompts=0;
  const result=await runRecoverableSourceAction(h.recovery,async()=>{runs++;h.state.money=1;throw Error('scene failed');},{
    failed:async()=>{scenePrompts++;assert.equal(h.recovery.busy,false);return 'return';},
    recoveryFailed:async error=>{loadPrompts++;assert.ok(error instanceof SourceRecoveryError);assert.equal(h.recovery.busy,true);h.save();assert.equal(h.writes,0);h.failHydration=false;},
    retry:()=>assert.fail('source replay was not requested'),committed:h.save,
  });
  assert.equal(result.ok,false);assert.equal(runs,1);assert.equal(loadPrompts,1);assert.equal(scenePrompts,1);assert.equal(h.hydrations,2);assert.equal(h.writes,1);assert.equal(h.state.money,3000);
});

test('play time never rewinds across failed scenes or repeated hydration attempts',async()=>{
  const h=await harness();h.state.playSeconds=5;h.failHydration=true;
  await assert.rejects(h.recovery.run(async()=>{h.state.playSeconds=15;h.state.money=1;throw Error('stop');}),SourceRecoveryError);
  assert.equal(h.state.playSeconds,15);h.state.playSeconds=30;
  await assert.rejects(h.recovery.retryRecovery(),SourceRecoveryError);assert.equal(h.state.playSeconds,30);
  h.failHydration=false;h.state.playSeconds=45;await h.recovery.retryRecovery();assert.equal(h.state.playSeconds,45);assert.equal(h.state.money,3000);
});

test('a persistence callback failure does not falsely report an already completed source action as rolled back',async()=>{
  const h=await harness();let reported=false;
  await assert.rejects(runRecoverableSourceAction(h.recovery,async()=>{h.state.flags.FINISHED=true;},{
    failed:async()=>{reported=true;return 'return';},recoveryFailed:async()=>assert.fail('no recovery'),retry:()=>{},committed:()=>{throw Error('persistence unavailable');},
  }),/persistence unavailable/);
  assert.equal(reported,false);assert.equal(h.state.flags.FINISHED,true);assert.equal(h.recovery.busy,false);
});


test('a completed standalone wild catch is retained when its unrelated map-resume script fails',async()=>{
  const h=await harness();h.state.party=[createMon(data,155,5,h.state.name,()=>.5)];h.state.bag.ITEM_POKE_BALL=2;
  let prompts=0;const execute=<T>(task:()=>Promise<T>)=>runRecoverableSourceAction(h.recovery,task,{failed:async()=>{prompts++;return 'return';},recoveryFailed:async()=>assert.fail('no load failure'),retry:()=>{},committed:h.save});
  const result=await runFieldBattleAction({nested:false,execute,
    fight:async()=>{h.state.party[0].exp+=18;h.state.party[0].hp=3;h.state.bag.ITEM_POKE_BALL--;giveMon(h.state,createMon(data,16,3,h.state.name,()=>.5));h.state.seen.push(16);h.state.caught.push(16);return 'caught';},
    resume:async()=>{assert.equal(h.writes,1);assert.equal(JSON.parse(h.saved).party.length,2);await h.vm.run(h.script([['SetFlag',['UNFINISHED_RESUME']],['UnportedResume',[]]]),1);},
  });
  assert.deepEqual(result,{ok:true,value:'caught'});assert.equal(prompts,1);assert.equal(h.state.party.length,2);assert.equal(h.state.party[0].hp,3);assert.equal(h.state.bag.ITEM_POKE_BALL,1);assert.ok(h.state.caught.includes(16));assert.equal(h.state.flags.UNFINISHED_RESUME,undefined);assert.equal(JSON.parse(h.saved).party.length,2);
});

test('a standalone blackout retains healed party, money loss and destination when its destination entry script fails',async()=>{
  const h=await harness();h.state.party=[createMon(data,155,5,h.state.name,()=>.5)];h.state.party[0].hp=0;
  const execute=<T>(task:()=>Promise<T>)=>runRecoverableSourceAction(h.recovery,task,{failed:async()=> 'return',recoveryFailed:async()=>assert.fail('no load failure'),retry:()=>{},committed:h.save});
  const result=await runFieldBattleAction({nested:false,execute,
    fight:async()=>{h.state.money-=100;h.state.party[0].hp=h.state.party[0].maxHP;await h.enter(61);h.state.lastHeal={map:61,x:4.5,z:5.5};return 'lost';},
    resume:async()=>{assert.equal(JSON.parse(h.saved).map,61);await h.vm.run(h.script([['SetFlag',['UNFINISHED_ENTRY']],['UnportedEntry',[]]]),1);},
  });
  assert.deepEqual(result,{ok:true,value:'lost'});assert.equal(h.state.map,61);assert.equal(h.map.id,61);assert.equal(h.state.money,2900);assert.equal(h.state.party[0].hp,h.state.party[0].maxHP);assert.equal(h.state.flags.UNFINISHED_ENTRY,undefined);assert.equal(JSON.parse(h.saved).money,2900);
});

test('trainer battle and resume failures remain inside their parent quest checkpoint',async()=>{
  const h=await harness();h.state.party=[createMon(data,155,5,h.state.name,()=>.5)];const before=structuredClone(h.state);let prompts=0;
  const execute=<T>(task:()=>Promise<T>)=>runRecoverableSourceAction(h.recovery,task,{failed:async()=>{prompts++;return 'return';},recoveryFailed:async()=>assert.fail('no load failure'),retry:()=>{},committed:h.save});
  const result=await execute(async()=>{
    h.state.flags.QUEST_STARTED=true;
    await runFieldBattleAction({nested:true,execute,fight:async()=>{h.state.money+=500;h.state.party[0].exp+=100;h.state.party[0].hp=1;return 'won';},resume:async()=>{h.save();assert.equal(h.writes,0);await h.vm.run(h.script([['UnportedResume',[]]]),1);}});
    h.state.flags.TRAINER_DEFEATED=true;
  });
  assert.deepEqual(result,{ok:false});assert.equal(prompts,1);const expected={...before,objectEvents:h.objects.save(h.state.map)};assert.deepEqual(h.state,expected);assert.equal(h.writes,1);
});


test('retrying an unrelated NPC action retains a previously paused frame trigger',async()=>{
  const h=await harness(),gate=new SourceTriggerGate();gate.visit('156');gate.failed('156','paused-frame');
  const beforeAction=gate.snapshot();let attempts=0,prompts=0;
  const result=await runRecoverableSourceAction(h.recovery,async()=>{
    attempts++;h.state.flags.NPC_STARTED=true;if(attempts===1)throw Error('NPC message failed');
    assert.equal(gate.allows('paused-frame'),false);h.state.flags.NPC_FINISHED=true;
  },{failed:async()=>{prompts++;return 'retry';},recoveryFailed:async()=>assert.fail('no load failure'),retry:()=>gate.restore(beforeAction),committed:h.save});
  assert.equal(result.ok,true);assert.equal(prompts,1);assert.equal(attempts,2);assert.equal(gate.allows('paused-frame'),false);assert.equal(h.state.flags.NPC_FINISHED,true);assert.equal(h.writes,1);
});

test('retrying the failing frame action reopens that frame while preserving other paused scenes',()=>{
  const gate=new SourceTriggerGate();gate.visit('156');gate.failed('156','earlier-frame');const beforeAction=gate.snapshot();
  gate.failed('156','current-frame');assert.equal(gate.allows('earlier-frame'),false);assert.equal(gate.allows('current-frame'),false);
  gate.restore(beforeAction);assert.equal(gate.allows('earlier-frame'),false);assert.equal(gate.allows('current-frame'),true);
  gate.failed('156','current-frame');gate.retry('current-frame');assert.equal(gate.allows('earlier-frame'),false);assert.equal(gate.allows('current-frame'),true);
});

test('actual main Return restores an earlier map pause after a failed cross-map visit',async()=>{
  const h=await harness(),gate=new SourceTriggerGate(),trainers=new TrainerAttemptLatch();
  gate.failed('156','paused-A');const paused=gate.snapshot(),before=structuredClone(h.state);let prompts=0;
  const binding=bindMainAction(h,gate,trainers,async()=>{prompts++;assert.equal(binding.context.recoveryPrompt,true);assert.equal(h.state.map,156);assert.equal(h.recovery.busy,false);return 1;});
  const result=await binding.execute(async()=>{
    await h.enter(61);gate.visit('61');gate.failed('61','failed-B');h.state.money=1;
    await h.vm.run(h.script([['SetFlag',['UNFINISHED_B']],['UnportedMapEntry',[]]]),1);
  });
  assert.deepEqual(result,{ok:false});assert.equal(prompts,1);assert.equal(h.state.money,before.money);assert.equal(h.state.flags.UNFINISHED_B,undefined);assert.equal(h.map.id,156);
  // This is the next idle poll after Return; it must not reopen paused-A.
  gate.visit(String(h.state.map));assert.deepEqual(gate.snapshot(),paused);assert.equal(gate.allows('paused-A'),false);
  assert.equal(binding.context.keys.size,0);assert.equal(binding.context.recoveryPrompt,false);assert.match(binding.context.lastError,/UnportedMapEntry/);assert.equal(h.writes,1);assert.equal(JSON.parse(h.saved).map,156);
});

test('actual main Return retains newly paused triggers when recovery stays on the same map',async()=>{
  const h=await harness(),gate=new SourceTriggerGate(),trainers=new TrainerAttemptLatch();gate.failed('156','earlier-frame');
  const binding=bindMainAction(h,gate,trainers,async()=>1);
  const result=await binding.execute(async()=>{gate.failed('156','current-frame');await h.vm.run(h.script([['UnportedFrame',[]]]),1);});
  assert.deepEqual(result,{ok:false});gate.visit(String(h.state.map));assert.equal(gate.allows('earlier-frame'),false);assert.equal(gate.allows('current-frame'),false);assert.equal(h.writes,1);
});

test('actual main Return merges old and new pauses after a failed A to B to A excursion',async()=>{
  const h=await harness(),gate=new SourceTriggerGate(),trainers=new TrainerAttemptLatch();gate.failed('156','earlier-A');
  const binding=bindMainAction(h,gate,trainers,async()=>1);
  const result=await binding.execute(async()=>{
    await h.enter(61);gate.failed('61','temporary-B');await h.enter(156);gate.failed('156','newly-failed-A');
    await h.vm.run(h.script([['UnportedFrame',[]]]),1);
  });
  assert.deepEqual(result,{ok:false});gate.visit(String(h.state.map));assert.deepEqual(gate.snapshot(),{location:'156',blocked:['earlier-A','newly-failed-A']});assert.equal(gate.allows('temporary-B'),true);assert.equal(h.writes,1);
});

test('actual main successful map visits keep normal pause clearing rather than restoring failure snapshots',async()=>{
  const h=await harness(),gate=new SourceTriggerGate(),trainers=new TrainerAttemptLatch();gate.failed('156','earlier-A');
  const binding=bindMainAction(h,gate,trainers,async()=>assert.fail('successful visits do not prompt'));
  const result=await binding.execute(async()=>{await h.enter(61);gate.visit('61');await h.enter(156);gate.visit('156');});
  assert.equal(result.ok,true);assert.equal(gate.allows('earlier-A'),true);assert.equal(h.writes,1);
});

test('actual main explicit Retry restores both pre-outer frame and trainer gates before replay',async()=>{
  const h=await harness(),gate=new SourceTriggerGate(),trainers=new TrainerAttemptLatch();gate.failed('156','earlier-frame');trainers.admit(h.state,'earlier-trainer');
  const frameBefore=gate.snapshot(),trainerBefore=trainers.snapshot();let attempts=0,prompts=0;
  const binding=bindMainAction(h,gate,trainers,async()=>{prompts++;assert.equal(h.state.map,156);return 0;});
  const result=await binding.execute(async()=>{
    attempts++;
    if(attempts===1){await h.enter(61);gate.failed('61','failed-B');trainers.admit(h.state,'failed-trainer');await h.vm.run(h.script([['SetFlag',['UNFINISHED_B']],['UnportedMapEntry',[]]]),1);}
    assert.equal(h.state.map,156);assert.equal(h.map.id,156);assert.deepEqual(gate.snapshot(),frameBefore);assert.deepEqual(trainers.snapshot(),trainerBefore);assert.equal(h.state.flags.UNFINISHED_B,undefined);
    h.state.flags.RETRY_FINISHED=true;
  });
  assert.equal(result.ok,true);assert.equal(attempts,2);assert.equal(prompts,1);assert.equal(h.writes,1);assert.equal(JSON.parse(h.saved).flags.RETRY_FINISHED,true);assert.equal(binding.context.recoveryPrompt,false);
});
