import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createContext,runInContext,runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import {SourceActionRecovery,SourceTriggerGate,runRecoverableSourceAction,runFieldBattleAction} from './script-recovery.ts';
import {TrainerAttemptLatch,trainerEventPriority} from './trainer-encounters.ts';
import {TouchControls,TOUCH_PREFERENCES_KEY} from './touch-controls.ts';
import {CameraInput} from './camera-input.ts';
import {fieldInput,fieldInputFacing} from './field-input.ts';
import {defaultInterfacePreferences,writeInterfacePreferences} from './interface-preferences.ts';
import {chooseFieldPartySwitchTarget,swapFieldPartySlots} from './party-order.ts';
import {partyRow,partySummary} from './party-display.ts';
import {loadData,newState} from './data.ts';
import {ScriptVM,UnsupportedScript} from './script.ts';
import {FieldObjects} from './objects.ts';
import {NATIVE_EGG_ICON} from './eggs.ts';
import {FieldPhoneHost} from './phone-field-host.ts';
import {InterfacePanels} from './interface-panels.ts';
import {runOpeningSession} from './opening.ts';
import {UI,escapeHTML as esc} from './ui.ts';
import {installUIDOM,installUIClock} from './ui-test-dom.ts';

// Bind the actual combined main rather than a duplicate orchestration model.
// GPU/audio/native effects are explicit ports; recovery, input and native
// opening/party/phone semantics run their production implementations.
const mainURL=new URL('./main.ts',import.meta.url),source=await readFile(mainURL,'utf8');
const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
const sourceHash=sha(source),parse=(text:string)=>ts.createSourceFile('main.ts',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),ast=parse(source);
const functions=new Map(ast.statements.filter(ts.isFunctionDeclaration).map(node=>[node.name?.text,node.getText(ast)]));
const compile=(text:string)=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function bind(c:any,names:string[]){for(const name of names)assert.ok(functions.has(name),`actual main binding ${name}`);createContext(c);runInContext(compile(names.map(name=>functions.get(name)).join('\n')),c);return c;}
function initializer(name:string){for(const statement of ast.statements)if(ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations)if(declaration.name.getText(ast)===name)return declaration.initializer!;throw Error('Missing initializer '+name);}
let ports:ts.ObjectLiteralExpression|undefined;function visit(node:ts.Node){if(ts.isNewExpression(node)&&node.expression.getText(ast)==='InterfacePanels')ports=node.arguments![2]as ts.ObjectLiteralExpression;ts.forEachChild(node,visit);}visit(ast);assert.ok(ports);
const onChild=(ports.properties.find(property=>property.name?.getText(ast)==='onChild')as ts.PropertyAssignment).initializer.getText(ast);
const partyPort=(ports.properties.find(property=>property.name?.getText(ast)==='party')as ts.PropertyAssignment).initializer.getText(ast);
const updatePreferences=(ports.properties.find(property=>property.name?.getText(ast)==='updatePreferences')as ts.PropertyAssignment).initializer.getText(ast);
const events=ast.statements.filter(node=>ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)&&['addEventListener','document.addEventListener'].includes(node.expression.expression.getText(ast))).map(node=>node.getText(ast)).join('\n');
const touchAst=parse(await readFile(new URL('./touch-controls.test.ts',import.meta.url),'utf8'));
const touchFixtureSource=touchAst.statements.filter(node=>ts.isFunctionDeclaration(node)&&['storage','fixture'].includes(node.name?.text??'')).map(node=>node.getText(touchAst)).join('\n');
const makeTouch=runInNewContext(compile(touchFixtureSource+'\nfixture;'),{TouchControls,TOUCH_PREFERENCES_KEY})as()=>any;
const phoneRules=JSON.parse(await readFile(new URL('../../public/source/phone-triggers.json',import.meta.url),'utf8'));
after(async()=>assert.equal(sha(await readFile(mainURL,'utf8')),sourceHash,'main changed during the bound test run'));
function deferred(){let resolve!:(value?:any)=>void,reject!:(reason:unknown)=>void;const promise=new Promise<any>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
const flush=async()=>{for(let i=0;i<25;i++)await Promise.resolve();};
function mapFixture(id=1){return{id,code:'T20',mapType:'MAP_TYPE_CITY_TOWN',key:'MAP_NEW_BARK',fields:{incomingCalls:'TRUE'},events:{objects:[],coords:[],warps:[]},initTriggers:[],initScripts:{},scripts:{instructions:[],entries:[],labels:{}}};}
function saved(){return{version:2,name:'Ethan',map:1,x:10.5,z:10.5,facing:1,gender:'boy',money:3000,party:[{species:155,name:'Cyndaquil',gender:'male',hp:10,maxHP:20,level:5,moves:[],stats:{},status:'',ot:'Ethan'}],bag:{},flags:{},vars:{},badges:[],seen:[],caught:[],boxes:[],phoneTriggers:[],pokegear:{contacts:[0,1,2]},playSeconds:10,options:{sound:true,textSpeed:1,battleStyle:'shift'},lastHeal:{map:3,x:20.5,z:20.5},runningShoes:true};}
const core=['fieldControlsAvailable','resetFieldInput','syncInputContext','running','textDelay','retainFieldInput','save','captureField','restoreField','executeSourceAction','runScript','runFieldEntry','enterMap','warp','checkFrameTriggers','checkEvents','wildEncounter','step','pollFieldInput','pollPhoneAdmission','menu','startBattle','partyMenu','choosePartyAction','summary','answerPhone'];
function fixture(){
 const f=makeTouch(),state:any=saved(),log:any[]=[],writes:any[]=[],controls:any={destination:mapFixture(2),behavior:0,owner:undefined,choices:[],battleResult:'won'},elements=new Map<string,any>();
 const $=(id:string)=>{if(f.nodes.has(id))return f.nodes.get(id);if(!elements.has(id))elements.set(id,{hidden:false,textContent:'',dataset:{},focus(){log.push(['focus',id]);}});return elements.get(id);};new f.Element('game','div');
 const player={group:new THREE.Group()},follower={group:new THREE.Group()};player.group.position.set(state.x,3,state.z);follower.group.position.set(state.x,3,state.z+1);
 const world:any={yaw:.8,pitch:.5,distance:14,fieldTransitionActive:false,npcSprites:new Map(),sky:{currentWeather:7},height:()=>controls.height??3,permission:()=>controls.behavior,walkable:()=>!controls.blocked,terrainWalkable:()=>!controls.blocked,owner:()=>controls.owner??state.map,clearScriptCameraTarget(){log.push('clear-camera');},
  async map(id:number){log.push(['map',id]);controls.mapEntered?.resolve();await controls.mapGate?.promise;return controls.destination.id===id?controls.destination:mapFixture(id);},async connect(id:number){log.push(['connect',id]);return controls.destination;},async enter(...args:any[]){log.push(['enter',...args]);controls.height=args[4];return controls.destination.id===args[0]?controls.destination:mapFixture(args[0]);},beginFieldTransition(){world.fieldTransitionActive=true;log.push('transition-start');},endFieldTransition(){world.fieldTransitionActive=false;},clearNPCs(){},paper(){return{group:new THREE.Group()};},removePaper(){log.push('remove-follower');}};
 const ui:any={busy:false,dialogueOpen:false,panelOpen:false,loading(text:any){log.push(['loading',text]);},toast(text:string){log.push(['toast',text]);},async message(text:string){log.push(['message',text]);},async input(){return'Named';},async choose(title:string,options:string[]){log.push(['choice',title,options]);if(title==='Scene not completed')return controls.recoveryChoice??1;assert.ok(controls.choices.length,'Unplanned choice '+title);return controls.choices.shift();}};
 const vm:any={busy:false,hooks:{},value:()=>0,async run(){vm.busy=true;try{controls.scriptEntered?.resolve();await controls.scriptGate?.promise;await controls.script?.();}finally{vm.busy=false;}},runTrainerApproach:async()=>{log.push('approach');await controls.approach?.();}};
 const fieldPhone=new FieldPhoneHost(phoneRules,1000,12);
 const c:any={state,map:mapFixture(),world,vm,ui,fieldPhone,keys:new Set(),touch:f.controls,camera:null,started:true,ready:true,walking:false,transitioning:false,connecting:false,recoveryPrompt:false,hatching:false,hatchFollowerPendingCommit:false,battleSoundOwned:false,ordinaryInputOwners:0,preservedControlScripts:0,sourceSceneOwners:0,fieldPolling:false,sourceActions:null,trainerAttempts:new TrainerAttemptLatch(),frameTriggerGate:new SourceTriggerGate(),phoneAdmissionGate:new SourceTriggerGate(),trainerApproachTasks:new Map(),player,follower,followMon:state.party[0],followSpecies:155,followerSuppressed:false,followerFacing:1,followerMoving:false,followerStep:-1,followerPrevious:null,playerDirectionLocked:false,playerTweenY:undefined,previousStepJump:false,restoringGym:false,npcTweenY:new Map(),stepFrame:-1,lastWarp:'',lastCoord:'',lastError:'',deltas:[{x:0,z:-1},{x:0,z:1},{x:-1,z:0},{x:1,z:0}],preferences:defaultInterfacePreferences(),preferenceStorage:null,musicKey:'',musicRequestSerial:0,musicSettledRequest:0,musicSettledLocked:false,
 data:{index:{maps:{1:{name:'New Bark'},2:{name:'Route29'}},mapIds:{DEST:2}},personal:{155:{species:'CYNDAQUIL',types:[]}},sprites:{},constants:{MAP_BATTLE_TOWER_PARTNER_ROOM:999,std_hatch_egg:9600},encounters:[],trainers:[{class:'TRAINERCLASS_PASSERBY'}],intro:{msg_0219:{}},eggSummary:{}},
 objects:{load(){log.push('load-actors');},restore(_id:any,actors:any){log.push(['restore-actors',actors]);},save(){return controls.actors??{map:state.map,actors:[]};}},
 battle:{active:false,async start(enemies:any[],trainer:any,options:any){log.push(['battle',structuredClone(enemies),trainer,options,c.battleSoundOwned]);controls.battleEntered?.resolve();await controls.battleGate?.promise;await controls.fight?.(enemies);return controls.battleResult;}},
 encounterChecks:{reset(){log.push('encounter-reset');},step(){log.push('encounter-step');},roll(...args:any[]){log.push(['encounter-roll',...args]);return false;}},
 async tweenPlayer(x:number,z:number,seconds:number,jump:boolean){log.push(['tween',seconds,jump]);controls.tweenEntered?.resolve();c.syncInputContext();await controls.tweenGate?.promise;state.x=x;state.z=z;},
 refreshNPCs(){log.push('refresh');},updateHUD(){log.push('hud');},syncMusic(){log.push('sync-music');},mapWeather:()=>7,mapBlackoutSpawn:async()=>null,gymFieldEntry:()=>({initialHeight:state.fieldHeight??0,violetLift:state.gymmick?.liftState??0}),
 fieldEntryScripts:(kind:string)=>kind==='resume'?['OnLoad','OnResume']:['InitMapOnEnter','OnLoad'],ledgeDirection:()=>null,doorwayEntry:()=>false,pushWarp:()=>false,stepWarpFacing:()=>null,arrivalFacing:(_p:number,facing:number)=>facing,arrivalStep:()=>null,findCoordinateTrigger:()=>undefined,findInteractedBackgroundEvent:()=>undefined,backgroundFlagSet:()=>false,advancePartyEggStep:()=>({hatchReady:false}),recordEggHatchEvent(){},
 trainerEventPriority,tryTrainerEncounter:async()=>false,isUsableBattler:(mon:any)=>!mon.isEgg&&mon.hp>0,firstFollowerMon:(party:any[])=>party.find(mon=>!mon.isEgg),createMon(){},landSlot:()=>0,
 runRecoverableSourceAction,runFieldBattleAction,ScriptVM:class{hooks:any;constructor(_data:any,_state:any,hooks:any){this.hooks=hooks;}},UnsupportedScript:class extends Error{},structuredClone,AbortController,DOMException,
 fieldInput,fieldInputFacing,chooseFieldPartySwitchTarget,swapFieldPartySlots,partyRow,partySummary,NATIVE_EGG_ICON,esc,
 async withBattleMusic(_enemy:any,_trainer:any,action:()=>Promise<any>){c.battleSoundOwned=true;try{return await action();}finally{c.battleSoundOwned=false;log.push('music-return');}},healParty(){for(const mon of state.party)mon.hp=mon.maxHP;},battleMoneyLoss:()=>100,trainerPrize:async()=>200,
 async whiteOut(runEntry:boolean,defer:boolean){log.push(['whiteout',runEntry,defer,c.battleSoundOwned]);state.map=3;c.map=mapFixture(3);},
 panels:{async menu(){log.push('menu');await controls.menuGate?.promise;}},SAVE_KEY:'combined-save',localStorage:{setItem(_key:string,value:string){writes.push(JSON.parse(value));}},console:{warn(){},error(){}},$: $,addEventListener(){},removeEventListener(){},writeInterfacePreferences,
 };
 bind(c,core);c.sourceActions=new SourceActionRecovery(state,{capture:()=>c.captureField(),restore:(snapshot:any,error:any)=>c.restoreField(snapshot,error)});
 const canvas=new f.Element('original-world','canvas');canvas.parent=f.doc;const args=(initializer('camera')as ts.NewExpression).arguments![1].getText(ast);c.camera=new CameraInput(canvas,runInContext(compile('('+args+')'),c),f.win,f.doc);c.syncInputContext();
 return Object.assign(c,{f,controls,log,writes,dispose(){f.controls.dispose();c.camera.dispose();}});
}

// A real recovery transaction surrounds this movement. A fake busy=false
// fixture would fail to expose the input regression that motivated the merge.
test('native transaction retains joystick + camera across completed steps and seamless OnLoad',async t=>{
 t.diagnostic('combined main SHA256 '+sourceHash);const c=fixture();try{
  c.f.send('touch-stick','pointerdown',1,152,180);c.f.send('original-world','pointerdown',99,20,20);c.controls.tweenEntered=deferred();c.controls.tweenGate=deferred();const first=c.step(3);await c.controls.tweenEntered.promise;
  assert.equal(c.sourceActions.busy,true);assert.equal(c.fieldControlsAvailable(),true);c.syncInputContext();assert.equal(c.f.captures.has(1),true);assert.equal(c.f.captures.has(99),true);assert.equal(c.touch.read().horizontal,1);c.controls.tweenGate.resolve();await first;assert.equal(c.writes.length,1);
  c.controls.tweenGate=undefined;c.controls.owner=2;c.controls.destination.initScripts.OnLoad=7;c.controls.scriptEntered=deferred();c.controls.scriptGate=deferred();const border=c.step(3);await c.controls.scriptEntered.promise;
  assert.equal(c.state.map,2);assert.equal(c.sourceActions.busy,true);assert.equal(c.connecting,true);assert.equal(c.vm.busy,true);c.syncInputContext();assert.equal(c.fieldControlsAvailable(),true);assert.equal(c.f.captures.has(1),true);assert.equal(c.f.captures.has(99),true);assert.equal(c.log.includes('transition-start'),false);
  c.controls.scriptGate.resolve();await border;assert.equal(c.f.captures.has(1),true);assert.equal(c.ordinaryInputOwners,0);assert.equal(c.preservedControlScripts,0);assert.equal(c.sourceSceneOwners,0);
 }finally{c.dispose();}
});

test('native scene/room/menu and failed action release held input while same-step entry priorities stay ordered',async()=>{
 for(const kind of['scene','room','menu','failure']){const c=fixture();try{
  c.f.send('touch-stick','pointerdown',1,152,180);c.f.send('original-world','pointerdown',99,20,20);c.keys.add('KeyW');const gate=deferred();let pending:Promise<any>;
  if(kind==='scene'){c.controls.scriptGate=gate;pending=c.runScript(1);}else if(kind==='room'){c.controls.mapGate=gate;pending=c.enterMap(2,20.5,20.5,false);}else if(kind==='menu'){c.controls.menuGate=gate;pending=c.menu();}else pending=c.executeSourceAction(async()=>{c.state.flags.PARTIAL=true;throw Error('partial');});
  await flush();assert.equal(c.f.captures.size,0,kind);assert.equal(c.keys.size,0,kind);if(kind==='scene'||kind==='room')assert.equal(c.save(),false,kind+' save during owned operation');gate.resolve();await pending;
  assert.equal(c.sourceActions.busy,false);assert.equal(c.sourceSceneOwners,0);if(kind==='failure')assert.equal(c.state.flags.PARTIAL,undefined);
 }finally{c.dispose();}}
});

test('touch run uses native shoes for .14 walking and encounter admission; ledge counts exactly once after priorities',async()=>{
 for(const shoes of[false,true]){const c=fixture();try{c.state.runningShoes=shoes;c.syncInputContext();c.f.send('touch-stick','pointerdown',1,152,180);c.f.send('touch-run','pointerdown',2);c.controls.behavior=2;c.map.fields.wildEncounterBank='ENCDATA_TEST';c.data.encounters=[{map:'TEST',land:{rate:20,mons:[]}}];await c.step(3);assert.equal(c.log.find((r:any)=>r[0]==='tween')[1],shoes?.14:.25);assert.equal(c.log.find((r:any)=>r[0]==='encounter-roll')[3],shoes);}finally{c.dispose();}}
 const c=fixture();try{let eggs=0;c.ledgeDirection=()=>3;c.advancePartyEggStep=()=>{eggs++;return{hatchReady:false};};await c.step(3);assert.equal(c.log.filter((r:any)=>r==='encounter-step').length,1);assert.equal(eggs,1);assert.equal(c.state.x,12.5);assert.equal(c.log.find((r:any)=>r[0]==='tween')[1],.42);}finally{c.dispose();}
});

test('priority coordinate scene consumes a completed step before Egg/wild/phone admission',async()=>{
 const c=fixture();try{const order:string[]=[];c.findCoordinateTrigger=()=>({scriptId:12});c.controls.script=async()=>{order.push('coordinate');};c.advancePartyEggStep=()=>{order.push('egg');return{hatchReady:false};};c.wildEncounter=async()=>{order.push('wild');return false;};c.pollPhoneAdmission=async()=>{order.push('phone');};c.keys.add('KeyD');await c.pollFieldInput();assert.deepEqual(order,['coordinate']);assert.equal(c.writes.length,1);}finally{c.dispose();}
});

test('Continue hydrates saved height/lift/actors, resumes without Init/Flash/spawn mutation',async()=>{
 const c=fixture();try{c.state.fieldHeight=5;c.state.gymmick={kind:'violet',liftState:1};c.state.flags.FLAG_SYS_FLASH=true;c.state.flags.FLAG_SYS_DEFOG=true;c.controls.destination=mapFixture(1);c.controls.destination.initScripts={InitMapOnEnter:1,OnLoad:2,OnResume:3};const scripts:number[]=[];c.vm.run=async(_map:any,script:number)=>{scripts.push(script);};await c.enterMap(1,10.5,10.5,true,true,false,false,'continue');assert.deepEqual(scripts,[2,3]);assert.equal(c.state.flags.FLAG_SYS_FLASH,true);assert.equal(c.state.flags.FLAG_SYS_DEFOG,true);assert.equal(c.state.lastHeal.map,3);assert.deepEqual(c.log.find((r:any)=>r[0]==='enter'),['enter',1,10.5,10.5,7,5,1]);assert.equal(c.log.some((r:any)=>r[0]==='restore-actors'),true);}finally{c.dispose();}
});

test('failed nested source action restores State/live actors/orbit/phone/lift and discards pending camera/VM',async()=>{
 const c=fixture();try{c.state.gymmick={kind:'violet',liftState:1};c.state.fieldHeight=3;c.controls.actors={map:1,actors:[{id:'native',x:5}]};const before=structuredClone(c.state),phone=c.fieldPhone.snapshot();const outcome=await c.executeSourceAction(async()=>{c.state.vars.QUEST=1;c.state.money+=999;c.state.party[0].hp=1;c.state.gymmick.liftState=0;c.fieldPhone.advanceRTC(2000,12);c.world.yaw=9;c.world.pitch=.9;c.world.distance=30;c.player.group.position.y=99;c.state.map=2;c.map=mapFixture(2);throw Error('unsupported after mutation');});assert.equal(outcome.ok,false);assert.equal(c.state.vars.QUEST,undefined);assert.equal(c.state.money,before.money);assert.equal(c.state.party[0].hp,10);assert.equal(c.state.gymmick.liftState,1);assert.equal(c.state.map,1);assert.deepEqual(c.fieldPhone.snapshot(),phone);assert.deepEqual([c.world.yaw,c.world.pitch,c.world.distance],[.8,.5,14]);assert.deepEqual(c.log.find((r:any)=>r[0]==='enter'),['enter',1,10.5,10.5,7,3,1]);assert.equal(c.log.includes('clear-camera'),true);assert.equal(c.writes.at(-1).vars.QUEST,undefined);}finally{c.dispose();}
});

test('nested trainer failure rolls battle rewards back while an earlier committed wild fight survives failed resume',async()=>{
 const c=fixture();try{const before=c.state.money;await c.executeSourceAction(async()=>{await c.startBattle([{species:19,hp:9}],0);c.state.flags.TRAINER_DIALOGUE_PARTIAL=true;throw Error('phone standard unsupported');});assert.equal(c.state.money,before);assert.equal(c.state.flags.TRAINER_DIALOGUE_PARTIAL,undefined);assert.equal(c.writes.at(-1).money,before);
  c.controls.fight=async()=>{c.state.money+=50;c.state.party[0].hp=5;};c.runFieldEntry=async()=>{throw Error('resume command unsupported');};await c.startBattle([{species:19,hp:9}]);assert.equal(c.state.money,before+50);assert.equal(c.state.party[0].hp,5);assert.equal(c.writes.at(-1).money,before+50);
 }finally{c.dispose();}
});

test('loss/whiteout remains within audio ownership; native deferred warp entry runs after its release',async()=>{
 const c=fixture();try{c.controls.battleResult='lost';const entry:any[]=[];c.runFieldEntry=async(kind:string)=>{entry.push([kind,c.battleSoundOwned]);};await c.startBattle([{species:19,hp:9}]);assert.deepEqual(c.log.find((r:any)=>r[0]==='whiteout'),['whiteout',false,true,true]);assert.deepEqual(entry,[['warp',false]]);assert.equal(c.state.money,2900);assert.equal(c.writes[0].map,3);}finally{c.dispose();}
});

test('explicit Retry replays fresh copied enemies and exact gates rather than stale fight mutation',async()=>{
 const c=fixture();try{const original=[{species:19,hp:9}],attempts:any[]=[];let n=0;c.controls.recoveryChoice=0;c.controls.fight=async(enemies:any[])=>{attempts.push(enemies);if(n++===0){enemies[0].hp=0;c.state.money=1;throw Error('temporary battle host failure');}};await c.startBattle(original);assert.equal(attempts.length,2);assert.equal(attempts[1][0].hp,9);assert.notEqual(attempts[0],attempts[1]);assert.equal(original[0].hp,9);assert.equal(c.state.money,3000);}finally{c.dispose();}
});

test('Return unions prior and new same-map failed-frame pauses after an A→B→A excursion',async()=>{
 const c=fixture();try{c.frameTriggerGate.failed('1','old');await c.executeSourceAction(async()=>{c.frameTriggerGate.visit('2');c.frameTriggerGate.visit('1');c.frameTriggerGate.failed('1','new');throw Error('round trip');});assert.equal(c.frameTriggerGate.allows('old'),false);assert.equal(c.frameTriggerGate.allows('new'),false);assert.equal(c.frameTriggerGate.snapshot().location,'1');}finally{c.dispose();}
});

test('menu waits for native party child to finish and resets active phone only for the four real child actions',async()=>{
 const d=installUIDOM(),clock=installUIClock();try{const ui=new UI(),state:any=saved();Object.assign(state.flags,{FLAG_GOT_BAG:true,FLAG_GOT_TRAINER_CARD:true,FLAG_GOT_SAVE_BUTTON:true,FLAG_GOT_OPTIONS_BUTTON:true});const fieldPhone=new FieldPhoneHost(phoneRules,1000,12),c:any={fieldPhone,partyMenu:async()=>{await child.promise;}};createContext(c);const child=deferred(),children:string[]=[],save:()=>boolean=()=>true;
  const hook=runInContext(compile('('+onChild+')'),c),nativeParty=runInContext(compile('('+partyPort+')'),c);const panels:any=new InterfacePanels(ui,{items:[]}as any,{state:()=>state,location:()=> 'New Bark',save,party:nativeParty,onChild:kind=>{children.push(kind);hook(kind);},preferences:defaultInterfacePreferences,updatePreferences(){},touch:{preferences:{},setPreferences(){}}as any,gesture(){}});
  // Actual native inactive elapsed-nine survives all child actions; only a
  // real ringing source event resets its active manager.
  fieldPhone.triggerQueued(0,true);const accelerated=fieldPhone.snapshot();const pending=panels.menu();clock.flush();const click=(key:string)=>{const button=d.ids.get('panel-content')!.querySelector<any>('[data-action="'+key+'"]');assert.ok(button,key);button.click();};click('party');await flush();assert.deepEqual(children,['party']);assert.deepEqual(fieldPhone.snapshot(),accelerated);assert.equal(ui.panelOpen,false,'Adventure menu must await the whole native child');child.resolve();await flush();clock.flush();assert.equal(ui.panelOpen,true);click('save');await flush();clock.flush();assert.deepEqual(children,['party']);click('back');await pending;assert.deepEqual(children,['party']);
  const active=fieldPhone.snapshot();active.ring.active={trigger:0,contact:1,scripted:3,script:13,forcePickUp:false};fieldPhone.restore(active);assert.equal(fieldPhone.current().kind,'elm');hook('trainer');assert.equal(fieldPhone.current().kind,'none');
 }finally{clock.restore();d.restore();}
});

test('actual onChild dispatch excludes Save/back and includes Bag/Trainer/Settings exactly once',async()=>{
 for(const kind of['bag','trainer','options','save','back']){const d=installUIDOM(),clock=installUIClock();try{const ui=new UI(),state:any=saved(),children:string[]=[];for(const flag of['FLAG_GOT_BAG','FLAG_GOT_TRAINER_CARD','FLAG_GOT_SAVE_BUTTON','FLAG_GOT_OPTIONS_BUTTON'])state.flags[flag]=true;const panels:any=new InterfacePanels(ui,{items:[]}as any,{state:()=>state,location:()=>'',save:()=>true,onChild:child=>children.push(child),preferences:defaultInterfacePreferences,updatePreferences(){},touch:{}as any,gesture(){}});panels.bag=panels.trainer=panels.settings=async()=>{};const pending=panels.menu();clock.flush();d.ids.get('panel-content')!.querySelector<any>('[data-action="'+kind+'"]')!.click();await flush();clock.flush();if(kind!=='back')d.ids.get('panel-content')!.querySelector<any>('[data-action="back"]')!.click();await pending;assert.deepEqual(children,['bag','trainer','options'].includes(kind)?[kind]:[]);}finally{clock.restore();d.restore();}}
});

test('owned native party Summary, switch including Eggs, and Back resolve only after their complete child flow',async()=>{
 const d=installUIDOM(),clock=installUIClock(),c=fixture();try{c.ui=new UI();c.$=(id:string)=>d.ids.get(id);c.data.personal[155]={types:[]};c.state.party.push({...c.state.party[0],species:175,name:'Egg',isEgg:true,friendship:0,provenance:{gift:1}});const beforeEgg=c.state.party[1];let finished=false;const pending=c.partyMenu(1).then(()=>finished=true);clock.flush();const chooseSlot=()=>d.ids.get('panel-content')!.querySelector<any>('[data-party-slot="1"]')!.click();chooseSlot();await flush();clock.flush();assert.equal(finished,false);assert.match(d.ids.get('panel-content')!.innerHTML,/Summary/);d.buttons[0].click();await flush();clock.flush();assert.match(d.ids.get('panel-content')!.innerHTML,/POKÉMON SUMMARY/);assert.doesNotMatch(d.ids.get('panel-content')!.innerHTML,/175-male-front|HP|Level/);d.ids.get('summary-back')!.click();await flush();clock.flush();assert.equal(finished,false);chooseSlot();await flush();clock.flush();d.buttons[1].click();await flush();clock.flush();d.buttons[0].click();await flush();clock.flush();assert.equal(c.state.party[0],beforeEgg);assert.equal(c.writes.at(-1).party[0].isEgg,true);assert.equal(finished,false);d.key('Escape');await pending;assert.equal(finished,true);assert.equal(c.sourceActions.busy,false);assert.equal(c.ui.panelOpen,false);}finally{c.dispose();clock.restore();d.restore();}
});

test('modern title Continue skips intro; New uses the actual complete native Oak draft before any begin/save',async()=>{
 for(const choice of['continue','new']){const c=fixture();try{bind(c,['title']);const existing=saved(),log:any[]=[],intro=JSON.parse(await readFile(new URL('../../public/source/messages/219.json',import.meta.url),'utf8'));
  c.readSave=()=>existing;c.ui.startScreen=async(_profile:any,_signal:any,gesture:()=>void)=>{gesture();return choice;};c.unlockSound=()=>log.push('gesture');c.ui.choose=async()=>1;c.sourceJSON=async()=>({});c.runOpeningSession=runOpeningSession;c.data.intro.msg_0219=Object.fromEntries(Object.entries(intro).map(([id,text])=>['msg_0219_'+id.padStart(5,'0'),text]));
  const nativeChoices=[2,0,0,0];c.OpeningView=class{prepare=async()=>{};scene(view:any){log.push(['scene',view.phase]);}message=async(text:string)=>{log.push(['native-text',text]);};choose=async()=>{assert.ok(nativeChoices.length);return nativeChoices.shift();};name=async()=> 'Gold';effect=async(effect:string)=>{log.push(['effect',effect]);};dispose(){log.push('dispose');}};
  c.newState=(_data:any,name:string,gender:string)=>{log.push(['newState',name,gender]);assert.equal(c.writes.length,0);return{...saved(),name,gender};};c.begin=async(mode:string)=>{log.push(['begin',mode]);assert.equal(c.writes.length,0);};await c.title();
  if(choice==='continue'){assert.equal(c.state,existing);assert.deepEqual(log,['gesture',['begin','continue']]);}else{assert.equal(c.state.name,'Gold');assert.ok(log.some((r:any)=>r[0]==='scene'&&r[1]==='topics'));assert.ok(log.some((r:any)=>r[0]==='effect'&&r[1]==='marill-cry'));assert.ok(log.some((r:any)=>r[0]==='effect'&&r[1]==='player-shrink'));assert.ok(log.findIndex((r:any)=>r[0]==='newState')>log.findIndex((r:any)=>r[0]==='effect'&&r[1]==='player-shrink'));assert.deepEqual(log.at(-1),['begin','warp']);}assert.equal(c.writes.length,0);
 }finally{c.dispose();}}
});

test('field keyboard preserves R, prevents HUD Enter default, and does not leak through owned native prompts',async()=>{
 const d=installUIDOM(),clock=installUIClock();try{const ui=new UI(),keys=new Set(),log:string[]=[],c:any={ui,keys,fieldControlsAvailable:()=>true,unlockSound(){},answerPhone:async()=>{log.push('phone');},menu:async()=>{log.push('menu');},interact:async()=>{log.push('interact');},reportInputError(){},resetFieldInput(){keys.clear();},save(){},document:{addEventListener(){}},addEventListener:(type:string,handler:any,options:any)=>d.listen(type,handler,!!options?.capture)};createContext(c);runInContext(compile(events),c);const choice=ui.choose('Required native choice',['Yes','No']);clock.flush();d.key('Enter');await choice;assert.deepEqual(log,[]);d.ids.get('open-menu')!.focus();const enter=d.key('Enter');assert.equal(enter.defaultPrevented,true);assert.deepEqual(log,['interact']);d.key('KeyR');await flush();assert.deepEqual(log,['interact','phone']);}finally{clock.restore();d.restore();}
});

test('hatch owner blocks music sync/retry/restores and field admission without consuming optional audio work',async()=>{
 const c=fixture();try{let calls=0;Object.assign(c,{hatching:true,music:{playMap:async()=>{calls++;},isUnlocked:()=>true},musicError:'failed',musicRetryable:true,musicRequestPending:null,musicPreferencePending:0,unlockPending:null,musicListeners:new Set(),pendingMusicRestores:new Set([async()=>{calls++;}]),musicChanged(){},musicFailed(){},clearMusicFailure(){}});bind(c,['syncMusic','retryMusic','retryMusicRestores','finishMusicUnlock']);await c.retryMusic();c.syncMusic();await c.retryMusicRestores();c.finishMusicUnlock(0);assert.equal(calls,0);assert.equal(c.pendingMusicRestores.size,1);assert.equal(c.fieldControlsAvailable(),false);assert.equal(c.save(),false);assert.equal(await c.step(1),false);}finally{c.dispose();}
});

// The same native source-action owner supersedes the prototype UI's narrower
// item-only snapshot. Exercise the original exported standards, including a
// late HUD failure after bag/event mutations, rather than a fabricated script.
test('real exported item standard commits once; post-VM failure Return restores its live ball and exact bag',async()=>{
 const priorFetch=globalThis.fetch;globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
 try{const data=await loadData();for(const fail of[false,true]){const c=fixture();try{
  Object.assign(c.state,newState(data,'Ethan','boy',()=>.5));c.data=data;c.map=JSON.parse(await readFile(new URL('../../public/source/maps/154.json',import.meta.url),'utf8'));c.map.initTriggers=[];const event=c.map.events.objects.find((row:any)=>row.spriteId==='SPRITE_MONSTARBALL');assert.ok(event);Object.assign(c.state,{map:c.map.id,x:event.x+.5,z:event.z+1.5,facing:0});delete c.state.flags[event.eventFlag];c.objects=new FieldObjects(data,c.state);c.objects.load(c.map.events.objects);
  c.world.map=async()=>c.map;c.world.enter=async()=>c.map;c.refreshNPCs=()=>{for(const npc of c.objects.snapshot()){let actor=c.world.npcSprites.get(npc.id);if(!actor){actor={group:new THREE.Group(),npc};c.world.npcSprites.set(npc.id,actor);}actor.group.position.set(npc.x+.5,npc.y/16,npc.z+.5);actor.group.visible=npc.visible;}};
  let failed=false;c.updateHUD=()=>{if(fail&&!failed&&c.state.bag.ITEM_ELIXIR){failed=true;throw Error('HUD after native item standard');}};c.ScriptVM=ScriptVM;c.vm=new ScriptVM(data,c.state,{message:async()=>{},choice:async()=>0,move:async()=>{},position(){},face(){},visible:(object:string,value:boolean)=>{c.objects.show(object,value);c.refreshNPCs();},chooseStarter:async()=>{},nickname:async()=>{},refresh:async()=>c.refreshNPCs(),battle:async()=>false,warp:async()=>{throw Error('unexpected warp');}});c.refreshNPCs();bind(c,['interact']);await c.interact();
  assert.equal(c.state.bag.ITEM_ELIXIR,fail?undefined:1);assert.equal(!!c.state.flags[event.eventFlag],!fail);assert.equal(c.world.npcSprites.get(event.id).group.visible,fail);assert.equal(c.writes.length,1);assert.equal(c.writes[0].bag.ITEM_ELIXIR,fail?undefined:1);assert.equal(c.sourceActions.busy,false);
  if(!fail){await c.interact();assert.equal(c.writes.length,1);assert.equal(c.state.bag.ITEM_ELIXIR,1);}
 }finally{c.dispose();}}}finally{globalThis.fetch=priorFetch;}
});
