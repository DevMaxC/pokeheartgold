import {test,after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createContext,runInContext} from 'node:vm';
import * as ts from 'typescript';
import * as THREE from 'three';
import {loadData,newState,createMon} from './data.ts';
import {giveTogepiEgg,firstFollowerMon,NATIVE_EGG_ICON} from './eggs.ts';
import {hatchFirstReadyEgg} from './egg-hatching.ts';
import {chooseFieldPartySwitchTarget,swapFieldPartySlots} from './party-order.ts';
import {partyRow,partySummary,partyHUD} from './party-display.ts';
import {SourceActionRecovery,SourceTriggerGate,runRecoverableSourceAction} from './script-recovery.ts';
import {TrainerAttemptLatch} from './trainer-encounters.ts';
import {ScriptVM,UnsupportedScript} from './script.ts';
import {FieldObjects} from './objects.ts';
import {FieldPhoneHost} from './phone-field-host.ts';
import {sourceJSON} from './types.ts';
import {UI} from './ui.ts';
import {installUIDOM,installUIClock} from './ui-test-dom.ts';
const cleanups=[];afterEach(()=>{while(cleanups.length)cleanups.pop()();});
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};

globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData(),nativeMap=await sourceJSON('maps/73.json'),phoneRules=await sourceJSON('phone-triggers.json'),mainURL=new URL('./main.ts',import.meta.url),main=await readFile(mainURL,'utf8');
const mainHash=createHash('sha256').update(main).digest('hex');
const ast=ts.createSourceFile('main.ts',main,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const functions=new Map(ast.statements.filter(ts.isFunctionDeclaration).map(node=>[node.name?.text,node.getText(ast)]));
const names=['abortBagUse','resetFieldInput','save','executeSourceAction','partyMenu','choosePartyAction','summary','displayMapName','updateHUD','refreshNPCs','captureField','restoreField'];
for(const name of names)assert.ok(functions.has(name),'actual main binding '+name);
let render;function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='render')render=node;ts.forEachChild(node,visit);}visit(ast);
const statements=render.body.statements,index=statements.findIndex(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>d.name.getText(ast)==='lead'));
assert.ok(index>0);const followerSource=statements.slice(index-1,index+3).map(node=>node.getText(ast)).join('\n');
const bound=names.map(name=>functions.get(name)).join('\n')+'\nfunction renderFollowerActual(){'+followerSource+'}';
const compiled=ts.transpileModule(bound,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
after(async()=>assert.equal(createHash('sha256').update(await readFile(mainURL)).digest('hex'),mainHash,'main changed during bound tests'));
async function fixture({hatched=false}={}){
 const state=newState(data,'Ethan','boy',()=>.5);Object.assign(state,{map:73,x:10.5,z:10.5,trainerId:123,nativeEggSeed:1});state.party=[createMon(data,155,5,state.name,()=>.5)];giveTogepiEgg(data,state,{now:()=>new Date(2026,9,17)});
 if(hatched){state.party[1].friendship=0;await hatchFirstReadyEgg(data,state,{map:await sourceJSON('maps/73.json'),now:()=>new Date(2026,9,17)},{reveal:async()=>{},cry:async()=>{},announce:async(_scene,cry)=>{await cry;return false;},nickname:async()=>null,resumeField:async()=>{}});}
 const player={group:new THREE.Group()},follower={group:new THREE.Group()};player.group.position.set(10.5,3,10.5);follower.group.position.set(10.5,3,11.5);
 const controls={choices:[],update:null,height:3},writes=[],log=[],listeners=new Set(),d=installUIDOM(),clock=installUIClock(),document=d.document,ui=new UI();
 cleanups.push(()=>{ui.close();clock.restore();d.restore();});
 const element=id=>{if(!d.ids.has(id)){const node=document.createElement('div');node.id=id;document.body.appendChild(node);}return d.ids.get(id);};
 for(const id of['party-hud','map-name','map-detail'])element(id);
 const hud=element('party-hud'),descriptor=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(hud),'innerHTML');Object.defineProperty(hud,'innerHTML',{get(){return descriptor.get.call(hud);},set(value){descriptor.set.call(hud,value);log.push('hud');controls.update?.();}});
 const choose=ui.choose.bind(ui);ui.choose=(title,options,detail,signal,behavior)=>{log.push(['choice',title,[...options]]);const pending=choose(title,options,detail,signal,behavior);clock.flush();if(title==='The area could not be restored.')throw Error('Unexpected fixture hydration failure');const selected=title==='Scene not completed'?1:controls.choices.shift();if(selected!==undefined)queueMicrotask(()=>d.buttons[selected]?.click());return pending;};
 const panel=ui.customPanel.bind(ui);ui.customPanel=(...args)=>{log.push(['panel',args[0]]);const pending=panel(...args);clock.flush();return pending;};
 const map=structuredClone(nativeMap),objects=new FieldObjects(data,state);objects.load(map.events.objects);state.objectEvents=objects.save(state.map);
 const fieldPhone=new FieldPhoneHost(phoneRules,1000,12),scene=new THREE.Scene();scene.add(player.group,follower.group);
 const world={scene,npcSprites:new Map(),yaw:1.2,pitch:.5,distance:17,sky:{currentWeather:7},beginFieldTransition(){log.push('transition-begin');},endFieldTransition(){log.push('transition-end');},clearScriptCameraTarget(){log.push('clear-camera');},map:async()=>map,enter:async(id,x,z,weather,height,lift)=>{log.push('restore');log.push(['hydrate',id,x,z,weather,height,lift]);controls.height=height;world.sky.currentWeather=weather;return map;},height:()=>controls.height,clearNPCs(){log.push('clear-npcs');for(const actor of world.npcSprites.values())actor.group.removeFromParent();world.npcSprites.clear();},updateNPCs(actors){log.push('refresh');for(const npc of actors){let actor=world.npcSprites.get(npc.id);if(!actor){actor={group:new THREE.Group(),npc};world.npcSprites.set(npc.id,actor);scene.add(actor.group);}actor.npc=npc;actor.group.position.set(npc.x+.5,npc.y/16,npc.z+.5);actor.group.visible=npc.visible;}},removePaper(actor){actor.group.removeFromParent();log.push(['remove',actor]);return true;},paper(key){const actor={group:new THREE.Group()};scene.add(actor.group);log.push(['paper',key,actor]);return actor;},animate(){},battleStage:null};
 const c={state,data,map,objects,fieldPhone,player,follower,followMon:state.party[0],followSpecies:155,followerSuppressed:false,followerFacing:1,followerMoving:false,followerStep:-1,followerPrevious:null,playerDirectionLocked:false,playerTweenY:undefined,previousStepJump:false,stepFrame:-1,npcTweenY:new Map(),lastWarp:'',lastCoord:'',encounterChecks:{reset(){log.push('encounter-reset');}},hatchFollowerPendingCommit:false,world,ui,document,$:element,NATIVE_EGG_ICON,partyRow,partySummary,partyHUD,chooseFieldPartySwitchTarget,swapFieldPartySlots,firstFollowerMon,UnsupportedScript,ScriptVM,runRecoverableSourceAction,mapWeather:()=>7,ready:true,started:true,recoveryPrompt:false,transitioning:false,connecting:false,walking:false,hatching:false,battleSoundOwned:false,activeBagUse:null,musicKey:'',musicRequestSerial:0,syncMusic(){},touch:{reset(){log.push('touch-reset');}},camera:{reset(){log.push('camera-reset');}},battle:{active:false},keys:new Set(),frameTriggerGate:new SourceTriggerGate(),phoneAdmissionGate:new SourceTriggerGate(),trainerAttempts:new TrainerAttemptLatch(),lastError:'',console:{error(){},warn:console.warn},SAVE_KEY:'party-test',localStorage:{setItem:(_key,text)=>writes.push(JSON.parse(text))},structuredClone,AbortController,DOMException,addEventListener(type,handler){assert.equal(type,'keydown');listeners.add(handler);d.listen(type,event=>{if(listeners.has(handler))handler(event);});},removeEventListener(type,handler){assert.equal(type,'keydown');listeners.delete(handler);}};
 c.vm=new ScriptVM(data,state,{message:async()=>{},choice:async()=>0,move:async()=>{},position(){},face(){},visible(){},chooseStarter:async()=>{},nickname:async()=>{},refresh:async()=>{},battle:async()=>false,warp:async()=>{}});
 createContext(c);runInContext(compiled,c);
 c.sourceActions=new SourceActionRecovery(state,{capture:()=>c.captureField(),restore:(snapshot,error)=>c.restoreField(snapshot,error)});
 return Object.assign(c,{controls,writes,log,listeners,d,clock,dispatchEscape(){d.key('Escape');}});
}

test('actual party panel owns Summary then returns focus to the selected slot until Back',async t=>{
 t.diagnostic('main SHA256 '+mainHash+'; bindings SHA256 '+createHash('sha256').update(bound).digest('hex'));
 const c=await fixture();c.controls.choices=[0];let closed=false;const pending=c.partyMenu(1).then(()=>closed=true);c.clock.flush();assert.equal(c.d.document.activeElement.dataset.partySlot,'1');c.d.document.activeElement.click();await flush();c.clock.flush();assert.match(c.$('panel-content').innerHTML,/POKÉMON SUMMARY/);assert.equal(closed,false);c.$('summary-back').click();await flush();c.clock.flush();assert.equal(c.d.document.activeElement.dataset.partySlot,'1');assert.equal(c.listeners.size,0);c.dispatchEscape();await pending;assert.equal(closed,true);assert.equal(c.ui.panelOpen,false);
});

test('real gift/hatch then actual field switch persists whole records, refreshes follower and enables native Elm reward',async()=>{
 const c=await fixture({hatched:true}),starter=c.state.party[0],togepi=c.state.party[1];togepi.moves[0].pp=1;togepi.status='paralysis';const original=structuredClone(c.state.party),position=c.follower.group.position.clone();
 c.controls.choices=[1,0];const result=await c.choosePartyAction(1);assert.equal(result.focused,0);assert.equal(c.state.party[0],togepi);assert.equal(c.state.party[1],starter);assert.deepEqual(c.state.party,[original[1],original[0]]);assert.equal(c.sourceActions.busy,false);assert.equal(c.writes.at(-1).party[0].species,175);
 c.renderFollowerActual();assert.equal(c.followMon,togepi);assert.equal(c.followSpecies,175);assert.ok(c.follower.group.position.equals(position));assert.equal(c.log.filter(row=>Array.isArray(row)&&row[0]==='remove').length,1);c.renderFollowerActual();assert.equal(c.log.filter(row=>Array.isArray(row)&&row[0]==='paper').length,1);
 const continued=JSON.parse(JSON.stringify(c.writes.at(-1))),lab=await sourceJSON('maps/61.json');continued.map=61;continued.vars.VAR_SCENE_ELMS_LAB=7;const messages=[];
 const vm=new ScriptVM(data,continued,{message:async text=>{messages.push(text);},choice:async()=>0,move:async()=>{},position(){},face(){},visible(){},chooseStarter:async()=>{},nickname:async()=>{},refresh:async()=>{},battle:async()=>{throw Error('no fight');},warp:async()=>{}});await vm.run(lab,1);
 assert.equal(vm.lastUnsupported,null);assert.equal(continued.bag.ITEM_EVERSTONE,1);assert.equal(continued.flags.FLAG_GOT_EVERSTONE_FROM_ELM,true);assert.ok(messages.some(text=>text.includes('Everstone')));
});

test('Cancel, source slot and owned Escape preserve whole party records and gate saves during selection',async()=>{
 for(const selection of['cancel-menu','cancel-target','same-slot','escape-menu','escape-target']){
  const c=await fixture(),party=c.state.party,before=structuredClone(party);if(selection==='cancel-menu')c.controls.choices=[2];if(selection==='cancel-target')c.controls.choices=[1,2];if(selection==='same-slot')c.controls.choices=[1,1];if(selection==='escape-target')c.controls.choices=[1];
  const pending=c.choosePartyAction(1);if(selection.startsWith('escape')){await flush();assert.equal(c.sourceActions.busy,true);assert.equal(c.ui.canDismiss,false);c.save();assert.equal(c.writes.length,0);c.dispatchEscape();}const result=await pending;
  assert.equal(result.focused,1);assert.equal(c.state.party,party,selection);assert.deepEqual(c.state.party,before,selection);assert.equal(c.listeners.size,0);assert.equal(c.sourceActions.busy,false);assert.ok(!c.log.includes('restore'));
 }
});

test('external UI replacement and post-swap failure recover instead of being mistaken for owned cancel',async()=>{
 for(const phase of['replaced','after-swap']){const c=await fixture(),before=structuredClone(c.state.party);if(phase!=='replaced'){c.controls.choices=[1,0];let failed=false;c.controls.update=()=>{if(!failed){failed=true;throw Error('refresh failed after swap');}};}
  const pending=c.choosePartyAction(1);if(phase==='replaced'){await flush();c.ui.panel('<h2>External replacement</h2>');}await pending;assert.deepEqual(c.state.party,before);assert.ok(c.log.includes('restore'));assert.ok(c.log.some(row=>Array.isArray(row)&&row[0]==='choice'&&row[1]==='Scene not completed'));assert.equal(c.listeners.size,0);assert.equal(c.writes.at(-1).party[0].species,155);
 }
});

test('actual capture/restore rehydrates live actors, phone, orbit and follower after a one-shot post-swap HUD failure',async t=>{
 t.diagnostic('main SHA256 '+mainHash+'; actual capture/restore bindings SHA256 '+createHash('sha256').update(bound).digest('hex'));
 const c=await fixture({hatched:true}),stateRef=c.state,originalVM=c.vm,originalFollower=c.follower;
 const actor=[...c.objects.objects.values()][0];assert.ok(actor,'real exported field actor');
 const staleEvents=structuredClone(c.state.objectEvents);c.objects.position(actor.id,7,8,3);c.objects.movement(actor.id,17);c.objects.show(actor.id,false);actor.invisible=true;actor.directionLocked=true;
 const liveEvents=structuredClone(c.objects.save(c.state.map));assert.notDeepEqual(liveEvents,staleEvents);
 c.player.group.visible=false;c.playerDirectionLocked=true;c.followerSuppressed=true;c.followerFacing=3;c.follower.group.visible=false;c.lastWarp='73:10,10';c.lastCoord='fixture-coordinate';c.previousStepJump=true;
 c.fieldPhone.triggerQueued(0,true);c.fieldPhone.advanceRTC(1060,12);assert.equal(c.fieldPhone.poll(c.state,c.map,()=>0,()=>99).kind,'elm');
 const phoneBefore=c.fieldPhone.snapshot(),followerPosition=c.follower.group.position.toArray(),camera={yaw:c.world.yaw,pitch:c.world.pitch,distance:c.world.distance},before=structuredClone(c.state),liveCapture=c.captureField();
 assert.deepEqual(liveCapture.actors,liveEvents);assert.deepEqual(liveCapture.phone,phoneBefore);assert.equal(liveCapture.playerHeight,3);
 let hudCalls=0,provisionalFollower;
 c.controls.choices=[1,0];c.controls.update=()=>{
  if(hudCalls++)return;
  assert.equal(c.state.party[0].species,175,'the throw happens after the real swap');c.renderFollowerActual();provisionalFollower=c.follower;assert.notEqual(provisionalFollower,originalFollower);
  c.state.money+=999;c.state.flags.PARTY_FAILURE_FIXTURE=true;c.objects.position(actor.id,27,28,0);actor.shown=true;actor.invisible=false;actor.directionLocked=false;
  Object.assign(c.world,{yaw:4,pitch:.9,distance:42});c.world.sky.currentWeather=99;c.fieldPhone.resetForSourceEvent();c.fieldPhone.advanceRTC(1300);c.fieldPhone.triggerQueued(0,true);
  c.player.group.position.set(99,77,99);c.player.group.visible=true;c.playerDirectionLocked=false;c.followerSuppressed=false;c.followerFacing=0;c.follower.group.position.set(80,90,70);
  c.followerPrevious={x:8,z:9,height:7};c.followerMoving=true;c.followerStep=2;c.playerTweenY=77;c.stepFrame=2;c.npcTweenY.set(actor.id,99);c.keys.add('KeyW');c.lastWarp='bad';c.lastCoord='bad';c.previousStepJump=false;
  throw Error('one-shot HUD failure after swap');
 };
 await c.choosePartyAction(1);
 assert.equal(c.state,stateRef);assert.ok(hudCalls>=2,'recovery successfully refreshes the HUD after the one-shot failure');assert.notEqual(c.vm,originalVM);assert.equal(c.vm.hooks,originalVM.hooks);
 // The committed Return-to-field save serializes the restored LIVE NPCs,
 // rather than overwriting them with older state.objectEvents from the save.
 const expected=structuredClone(before);expected.fieldHeight=3;expected.objectEvents=liveEvents;assert.deepEqual(c.state,expected);assert.deepEqual(c.writes.at(-1),JSON.parse(JSON.stringify(expected)));
 assert.deepEqual(c.objects.save(c.state.map),liveEvents);assert.notEqual(c.objects.get(actor.id),actor);assert.equal(c.world.npcSprites.get(actor.id).npc,c.objects.get(actor.id));
 assert.deepEqual(c.fieldPhone.snapshot(),phoneBefore);assert.equal(c.fieldPhone.current().kind,'elm');assert.deepEqual({yaw:c.world.yaw,pitch:c.world.pitch,distance:c.world.distance},camera);assert.equal(c.world.sky.currentWeather,7);
 assert.deepEqual(c.player.group.position.toArray(),[before.x,3,before.z]);assert.equal(c.player.group.visible,false);assert.equal(c.playerDirectionLocked,true);
 assert.equal(originalFollower.group.parent,null);assert.equal(provisionalFollower.group.parent,null);assert.notEqual(c.follower,provisionalFollower);assert.equal(c.followMon,c.state.party[0]);assert.equal(c.followSpecies,155);assert.deepEqual(c.follower.group.position.toArray(),followerPosition);assert.equal(c.follower.group.visible,false);assert.equal(c.followerSuppressed,true);assert.equal(c.followerFacing,3);
 assert.equal(c.followerPrevious,null);assert.equal(c.followerMoving,false);assert.equal(c.followerStep,-1);assert.equal(c.playerTweenY,undefined);assert.equal(c.stepFrame,-1);assert.equal(c.npcTweenY.size,0);assert.equal(c.keys.size,0);assert.ok(c.log.filter(row=>row==='touch-reset').length>=2);assert.ok(c.log.filter(row=>row==='camera-reset').length>=2);assert.equal(c.walking,false);assert.equal(c.transitioning,false);assert.equal(c.previousStepJump,true);assert.equal(c.lastWarp,'73:10,10');assert.equal(c.lastCoord,'fixture-coordinate');
 assert.equal(c.sourceActions.busy,false);assert.equal(c.recoveryPrompt,false);assert.equal(c.listeners.size,0);assert.equal(c.log.filter(row=>row==='restore').length,1);assert.deepEqual(c.log.find(row=>Array.isArray(row)&&row[0]==='hydrate'),['hydrate',73,before.x,before.z,7,3,0]);
});

test('actual native partner-room exception omits Switch; other rooms retain it, including Eggs',async()=>{
 for(const partner of[false,true]){const c=await fixture();c.state.map=partner?data.constants.MAP_BATTLE_TOWER_PARTNER_ROOM:73;c.controls.choices=[partner?1:2];await c.choosePartyAction(1);const options=c.log.find(row=>Array.isArray(row)&&row[0]==='choice')[2];assert.deepEqual(options,partner?['Summary','Cancel']:['Summary','Switch','Cancel']);assert.equal(c.state.party[1].isEgg,true);}
});

test('actual follower render distinguishes same-species identities, preserves position and removes an absent lead once',async()=>{
 const c=await fixture(),second=createMon(data,155,5,c.state.name,()=>.1);c.state.party=[c.state.party[0],second];const position=c.follower.group.position.clone();c.state.party=swapFieldPartySlots(c.state.party,0,1);c.renderFollowerActual();assert.equal(c.followMon,second);assert.ok(c.follower.group.position.equals(position));assert.equal(c.log.filter(row=>Array.isArray(row)&&row[0]==='paper').length,1);
 c.state.party=[];c.renderFollowerActual();assert.equal(c.follower,null);assert.equal(c.followMon,null);assert.equal(c.followSpecies,0);c.renderFollowerActual();assert.equal(c.log.filter(row=>Array.isArray(row)&&row[0]==='remove').length,2);
});
