// @ts-nocheck — actual production function bodies execute in an isolated VM.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import {createContext,runInContext} from 'node:vm';
import * as THREE from 'three';
import {loadData,newState} from './data.ts';
import {runOpeningSession} from './opening.ts';
import {fieldEntryScripts} from './field-transitions.ts';
import {gymFieldEntry} from './gym-violet.ts';
import {FieldObjects} from './objects.ts';
import {ScriptVM} from './script.ts';
import {SourceActionRecovery} from './script-recovery.ts';
import {FieldPhoneHost} from './phone-field-host.ts';
import {sourceJSON} from './types.ts';

globalThis.fetch=async input=>{try{return new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));}catch{return new Response('',{status:404});}};
const data=await loadData(),main=await readFile(new URL('./main.ts',import.meta.url),'utf8');
const section=(start,end)=>{const a=main.indexOf(start),b=main.indexOf(end,a);assert.ok(a>=0&&b>a,'Actual main binding '+start);return main.slice(a,b);};
const enterSource=section('async function runFieldEntry(','async function checkFrameTriggers('),titleSource=section('async function title(){','async function scriptWarp('),beginSource=section('async function begin(','async function boot(){');
const compile=source=>stripTypeScriptTypes(source,{mode:'transform'});
const unexpected=()=>{throw Error('Unexpected host operation in bounded entry fixture');};
const copied=value=>JSON.parse(JSON.stringify(value));

async function entryFixture(id=60){
 const native=await sourceJSON(`maps/${id}.json`),state=newState(data,'Case','boy',()=>.5);Object.assign(state,{map:id,x:15.5,z:20.5,fieldHeight:4.25});
 state.flags.FLAG_SYS_FLASH=true;state.flags.FLAG_SYS_DEFOG=true;state.lastHeal={map:65,x:4,z:6};
 const objects=new FieldObjects(data,state);objects.load(native.events.objects);const actor=objects.get(native.events.objects[0].id);actor.x+=3;actor.z+=2;actor.facingDirection=3;actor.shown=true;actor.directionLocked=true;state.objectEvents=objects.save(id);
 const log=[],player={group:new THREE.Group()},follower={group:new THREE.Group()};
 const c={data,state,map:structuredClone(native),objects,player,follower,restoringGym:false,playerDirectionLocked:true,transitioning:false,drag:false,previousStepJump:true,keys:new Set(['ArrowUp']),lastError:'',
  fieldPhone:{resetForSourceEvent(){log.push(['phone-reset']);}},encounterChecks:{reset(){log.push(['encounter-reset']);}},
  ui:{loading(value){log.push(['loading',value]);},choose:unexpected},gymFieldEntry,fieldEntryScripts,mapWeather:()=>7,
  mapBlackoutSpawn:async map=>{log.push(['spawn',map]);return{death:{map:999,x:7,z:8}};},
  world:{clearScriptCameraTarget(){},beginFieldTransition(){},endFieldTransition(){},clearNPCs(){},height:(_x,_z,y)=>y,
   map:async()=>structuredClone(native),enter:async(...args)=>{log.push(['world-enter',...args]);return structuredClone(native);},connect:async(...args)=>{log.push(['world-connect',...args]);return structuredClone(native);}},
  refreshNPCs(){log.push(['refresh']);},updateHUD(){},checkFrameTriggers:async()=>{log.push(['frame-check']);return false;},
 };
 const hooks={message:async()=>{},choice:async()=>0,move:unexpected,position:(id,x,z,facing)=>objects.position(id,x,z,facing),face(){},visible:(id,value)=>objects.show(id,value),chooseStarter:unexpected,nickname:unexpected,refresh:async()=>{},battle:unexpected,warp:unexpected};
 c.vm=new ScriptVM(data,state,hooks);c.vm.set('VAR_TEMP_x4007',77);c.vm.set('VAR_SCENE_NEW_BARK_TOWN_OW',0);
 c.runScript=async(script,object)=>{log.push(['script',script]);await c.vm.run(c.map,script,object);};
 c.sourceActions=new SourceActionRecovery(state,{capture:()=>({actors:objects.save(state.map)}),restore:async snapshot=>{objects.load(native.events.objects);objects.restore(state.map,snapshot.actors);}});
 c.executeSourceAction=work=>c.sourceActions.run(work);
 createContext(c);runInContext(compile(enterSource)+';globalThis.actualEnter=enterMap;',c);
 return Object.assign(c,{log,native});
}

async function titleFixture(saved,answers){
 const choices=[...answers],log=[],entered=[],c={data,state:saved,readSave:()=>saved,world:{renderer:{}},ui:{},keys:new Set(),openingView:null,sourceJSON,newState,runOpeningSession,
  begin:async mode=>{entered.push({mode,state:c.state});log.push('begin');},
  OpeningView:class{
   async title(){log.push('title');}dispose(){log.push('dispose');}scene(){}async message(){}async effect(){}async prepare(){}async name(){return'Case';}
   async choose(){assert.ok(choices.length,'Unexpected opening prompt');return choices.shift();}
  },
 };
 createContext(c);runInContext(compile(titleSource)+';globalThis.actualTitle=title;',c);await c.actualTitle();assert.equal(choices.length,0);return{...c,entered,log};
}

test('native normal Continue restores objects without InitMapOnEnter; field loading still runs OnLoad then OnResume',async t=>{
 const source=await readFile(new URL('../../../src/field_warp_tasks.c',import.meta.url),'utf8'),fieldmap=await readFile(new URL('../../../src/field/fieldmap.c',import.meta.url),'utf8');
 const continuation=source.slice(source.indexOf('static BOOL FieldTask_ContinueGame_Normal(TaskManager *taskManager) {'));const normal=continuation.slice(continuation.indexOf('} else {'),continuation.indexOf('FieldSystem_RandomizeRoamers'));
 assert.match(normal,/FieldSystem_RestorePlayerAndMapObjects/);assert.ok(!normal.includes('FieldSystem_InitMapOnEnter'));
 const onLoad=fieldmap.indexOf('INIT_SCRIPT_ON_LOAD'),onResume=fieldmap.indexOf('INIT_SCRIPT_ON_RESUME');assert.ok(onLoad>=0&&onResume>onLoad);
 t.diagnostic('actual main SHA256 '+createHash('sha256').update(main).digest('hex')+'; native field_warp_tasks SHA256 '+createHash('sha256').update(source).digest('hex'));
});

test('actual title passes Continue only for the exact saved State; accepted replacement and first New Game pass warp',async()=>{
 const saved=newState(data,'Existing','girl',()=>.5),before=structuredClone(saved);
 const continued=await titleFixture(saved,[0]);assert.equal(continued.entered[0].mode,'continue');assert.equal(continued.entered[0].state,saved);assert.deepEqual(saved,before);assert.deepEqual(continued.log,['title','dispose','begin']);
 const replacement=await titleFixture(saved,[1,1,2,0,0,0]);assert.equal(replacement.entered[0].mode,'warp');assert.notEqual(replacement.entered[0].state,saved);assert.equal(replacement.entered[0].state.name,'Case');assert.deepEqual(saved,before);
 const fresh=await titleFixture(null,[2,0,0,0]);assert.equal(fresh.entered[0].mode,'warp');assert.ok(fresh.entered[0].state);
});

test('actual Continue preserves New Bark transition state, Flash/Defog, blackout destination and saved live actors',async()=>{
 const c=await entryFixture(),savedActors=structuredClone(c.state.objectEvents),heal=structuredClone(c.state.lastHeal);
 await c.actualEnter(c.state.map,c.state.x,c.state.z,true,true,false,false,'continue');
 assert.equal(c.vm.value('VAR_TEMP_x4007',c.map),77,'Original T20 OnTransition resets this variable and must not run on Continue');
 assert.equal(c.state.flags.FLAG_SYS_FLASH,true);assert.equal(c.state.flags.FLAG_SYS_DEFOG,true);assert.deepEqual(c.state.lastHeal,heal);assert.equal(c.log.some(row=>row[0]==='spawn'),false);
 assert.deepEqual(c.objects.save(c.state.map),savedActors);assert.deepEqual(c.log.filter(row=>row[0]==='script').map(row=>row[1]),[c.native.initScripts.OnResume]);assert.equal(c.state.fieldHeight,4.25);
 const resumed=await entryFixture();resumed.vm.set('VAR_SCENE_NEW_BARK_TOWN_OW',1);await resumed.actualEnter(60,resumed.state.x,resumed.state.z,true,true,false,false,'continue');
 const friend=resumed.objects.get('obj_T20_var_1'),marill=resumed.objects.get('obj_T20_tsure_poke_static_marill');assert.deepEqual([friend.x,friend.z,friend.facingDirection],[686,396,2]);assert.deepEqual([marill.x,marill.z,marill.facingDirection],[685,396,1]);assert.equal(resumed.state.flags.FLAG_HIDE_NEW_BARK_FRIEND,false,'The literal OnResume still performs its native actor changes');
});

test('actual warp retains all three entry phases and real entry resets while Continue loads only restoration phases',async()=>{
 for(const mode of['warp','continue']){
  const c=await entryFixture(51);c.state.flags.FLAG_UNK_189=true;
  await c.actualEnter(c.state.map,c.state.x,c.state.z,true,mode==='continue',false,false,mode);
  assert.deepEqual(c.log.filter(row=>row[0]==='script').map(row=>row[1]),(mode==='warp'?['OnTransition','OnLoad','OnResume']:['OnLoad','OnResume']).map(key=>c.native.initScripts[key]));
  assert.equal(c.state.flags.FLAG_UNK_189,mode==='continue');assert.equal(c.state.flags.FLAG_SYS_FLASH,mode==='continue');assert.equal(c.log.filter(row=>row[0]==='spawn').length,mode==='warp'?1:0);
  if(mode==='warp'){assert.deepEqual(copied(c.state.lastHeal),{map:999,x:7,z:8});assert.equal(c.state.fieldHeight,undefined);assert.equal(c.objects.get(c.native.events.objects[0].id).x,c.native.events.objects[0].x);}
 }
});

test('actual Continue passes saved Violet height/lift into World entry without the warp initializer',async()=>{
 const c=await entryFixture(135);c.state.fieldHeight=31;c.state.gymmick={kind:'violet',liftState:1};
 await c.actualEnter(135,c.state.x,c.state.z,true,true,false,false,'continue');
 assert.deepEqual(c.log.find(row=>row[0]==='world-enter').slice(-2),[31,1]);assert.deepEqual(c.state.gymmick,{kind:'violet',liftState:1});assert.equal(c.log.some(row=>row[0]==='script'),false,'Violet only has native OnTransition');
});

test('actual begin forwards explicit entry mode separately from actor restoration and saves only after entry',async()=>{
 for(const mode of['continue','warp']){
  const state=newState(data,'Case','boy',()=>.5),calls=[],c={state,data,ui:{},world:{paper:()=>({group:new THREE.Group()})},fieldRTCObservation:()=>({seconds:1000,hour:12}),sourceJSON,FieldPhoneHost,FieldObjects,ScriptVM,SourceActionRecovery,
   Battle:class{},WorldBattleView:class{},captureField(){return{};},restoreField:unexpected,started:false,ready:false,
   beginTrainerPath:unexpected,finishTrainerPath:unexpected,whiteOut:unexpected,moveActor:unexpected,setPosition:unexpected,face:unexpected,showPerson:unexpected,chooseStarter:unexpected,trainerBattle:unexpected,scriptWarp:unexpected,
   enterMap:async(...args)=>{calls.push(['enter',...args]);assert.equal(c.started,true);},save(){calls.push(['save']);},$:()=>({focus(){calls.push(['focus']);}}),
  };
  createContext(c);runInContext(compile(beginSource)+';globalThis.actualBegin=begin;',c);await c.actualBegin(mode);
  assert.deepEqual(calls[0],['enter',state.map,state.x,state.z,true,mode==='continue',false,false,mode]);assert.deepEqual(calls.slice(1),[['save'],['focus']]);assert.equal(c.ready,true);
 }
});


test('actual existing connection call keeps native transition-only entry without a warp spawn reset',async()=>{
 const c=await entryFixture(51);c.state.flags.FLAG_UNK_189=true;
 await c.actualEnter(51,c.state.x,c.state.z,true,false,true,true);
 assert.equal(c.log.some(row=>row[0]==='world-enter'),false);assert.equal(c.log.filter(row=>row[0]==='world-connect').length,1);assert.equal(c.log.some(row=>row[0]==='spawn'),false);
 assert.deepEqual(c.log.filter(row=>row[0]==='script').map(row=>row[1]),[c.native.initScripts.OnTransition]);assert.equal(c.log.some(row=>row[0]==='frame-check'),false,'Existing seventh-argument trigger deferral is preserved');
});
