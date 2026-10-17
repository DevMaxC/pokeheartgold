import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
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
import {useFieldBagItem} from './field-bag-actions.ts';
import {partyRow,partySummary} from './party-display.ts';
import {loadData,newState,createMon} from './data.ts';
import {Battle} from './battle.ts';
import {ScriptVM,UnsupportedScript} from './script.ts';
import {FieldObjects} from './objects.ts';
import {NATIVE_EGG_ICON,giveTogepiEgg} from './eggs.ts';
import {createHatchHostAudio} from './hatch-host-audio.ts';
import {presentNativeEggHatch} from './egg-hatch-presentation.ts';
import {momSavingsActive,settleMomBattleMoney,readMomSavings} from './mom-savings.ts';
import {phoneCall} from './phone.ts';
import {FieldPhoneHost} from './phone-field-host.ts';
import {InterfacePanels} from './interface-panels.ts';
import {runOpeningSession} from './opening.ts';
import {UI,escapeHTML as esc} from './ui.ts';
import {bindAudioControls} from './audio-controls.ts';
import {installUIDOM,installUIClock} from './ui-test-dom.ts';

// Bind the actual combined main rather than a duplicate orchestration model.
// GPU/audio/native effects are explicit ports; recovery, input and native
// opening/party/phone semantics run their production implementations.
const mainURL=process.env.HG_NATIVE_INTERFACE_REVIEW_MAIN?pathToFileURL(process.env.HG_NATIVE_INTERFACE_REVIEW_MAIN):new URL('./main.ts',import.meta.url),source=await readFile(mainURL,'utf8');
const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
const sourceHash=sha(source),parse=(text:string)=>ts.createSourceFile('main.ts',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),ast=parse(source);
const functions=new Map(ast.statements.filter(ts.isFunctionDeclaration).map(node=>[node.name?.text,node.getText(ast)]));
const compile=(text:string)=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function bind(c:any,names:string[]){for(const name of names)assert.ok(functions.has(name),`actual main binding ${name}`);createContext(c);runInContext(compile(names.map(name=>functions.get(name)).join('\n')),c);return c;}
function initializer(name:string){for(const statement of ast.statements)if(ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations)if(declaration.name.getText(ast)===name)return declaration.initializer!;throw Error('Missing initializer '+name);}
let ports:ts.ObjectLiteralExpression|undefined;function visit(node:ts.Node){if(ts.isNewExpression(node)&&node.expression.getText(ast)==='InterfacePanels')ports=node.arguments![2]as ts.ObjectLiteralExpression;ts.forEachChild(node,visit);}visit(ast);assert.ok(ports);
const onChild=(ports.properties.find(property=>property.name?.getText(ast)==='onChild')as ts.PropertyAssignment).initializer.getText(ast);
const partyPort=(ports.properties.find(property=>property.name?.getText(ast)==='party')as ts.PropertyAssignment).initializer.getText(ast);
const preferencePort=ports.properties.find(property=>property.name?.getText(ast)==='updatePreferences')!;
const updatePreferences=ts.isShorthandPropertyAssignment(preferencePort)?'('+functions.get('updatePreferences')!+')':(preferencePort as ts.PropertyAssignment).initializer.getText(ast);
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
const core=['abortBagUse','useBagItem','fieldControlsAvailable','resetFieldInput','syncInputContext','running','textDelay','retainFieldInput','save','captureField','restoreField','executeSourceAction','runScript','runFieldEntry','enterMap','warp','checkFrameTriggers','checkEvents','wildEncounter','step','pollFieldInput','pollPhoneAdmission','menu','startBattle','partyMenu','choosePartyAction','summary','refreshPhoneIndicator','answerPhone'];
function fixture(){
 const f=makeTouch(),state:any=saved(),log:any[]=[],writes:any[]=[],controls:any={destination:mapFixture(2),behavior:0,owner:undefined,choices:[],battleResult:'won'},elements=new Map<string,any>();
 const $=(id:string)=>{if(f.nodes.has(id))return f.nodes.get(id);if(!elements.has(id))elements.set(id,{hidden:false,textContent:'',dataset:{},setAttribute(key:string,value:string){this[key]=value;},focus(){log.push(['focus',id]);}});return elements.get(id);};new f.Element('game','div');
 const player={group:new THREE.Group()},follower={group:new THREE.Group()};player.group.position.set(state.x,3,state.z);follower.group.position.set(state.x,3,state.z+1);
 const world:any={yaw:.8,pitch:.5,distance:14,fieldTransitionActive:false,npcSprites:new Map(),sky:{currentWeather:7},height:()=>controls.height??3,permission:()=>controls.behavior,walkable:()=>!controls.blocked,terrainWalkable:()=>!controls.blocked,owner:()=>controls.owner??state.map,clearScriptCameraTarget(){log.push('clear-camera');},
  async map(id:number){log.push(['map',id]);controls.mapEntered?.resolve();await controls.mapGate?.promise;return controls.destination.id===id?controls.destination:mapFixture(id);},async connect(id:number){log.push(['connect',id]);return controls.destination;},async enter(...args:any[]){log.push(['enter',...args]);controls.height=args[4];return controls.destination.id===args[0]?controls.destination:mapFixture(args[0]);},beginFieldTransition(){world.fieldTransitionActive=true;log.push('transition-start');},endFieldTransition(){world.fieldTransitionActive=false;},clearNPCs(){},paper(){return{group:new THREE.Group()};},removePaper(){log.push('remove-follower');}};
 const ui:any={busy:false,dialogueOpen:false,panelOpen:false,loading(text:any){log.push(['loading',text]);},toast(text:string){log.push(['toast',text]);},async message(text:string){log.push(['message',text]);},async input(){return'Named';},async choose(title:string,options:string[]){log.push(['choice',title,options]);if(title==='Scene not completed')return controls.recoveryChoice??1;assert.ok(controls.choices.length,'Unplanned choice '+title);return controls.choices.shift();}};
 const vm:any={busy:false,hooks:{},value:()=>0,text:(text:string)=>text,async run(){vm.busy=true;try{controls.scriptEntered?.resolve();await controls.scriptGate?.promise;await controls.script?.();}finally{vm.busy=false;}},runTrainerApproach:async()=>{log.push('approach');await controls.approach?.();}};
 const fieldPhone=new FieldPhoneHost(phoneRules,1000,12);
 const c:any={state,map:mapFixture(),world,vm,ui,fieldPhone,keys:new Set(),touch:f.controls,camera:null,started:true,ready:true,walking:false,transitioning:false,connecting:false,recoveryPrompt:false,hatching:false,hatchFollowerPendingCommit:false,battleSoundOwned:false,ordinaryInputOwners:0,preservedControlScripts:0,sourceSceneOwners:0,activeBagUse:null,nativeFieldMoveData:{},fieldPolling:false,sourceActions:null,trainerAttempts:new TrainerAttemptLatch(),frameTriggerGate:new SourceTriggerGate(),phoneAdmissionGate:new SourceTriggerGate(),trainerApproachTasks:new Map(),player,follower,followMon:state.party[0],followSpecies:155,followerSuppressed:false,followerFacing:1,followerMoving:false,followerStep:-1,followerPrevious:null,playerDirectionLocked:false,playerTweenY:undefined,previousStepJump:false,restoringGym:false,npcTweenY:new Map(),stepFrame:-1,lastWarp:'',lastCoord:'',lastError:'',deltas:[{x:0,z:-1},{x:0,z:1},{x:-1,z:0},{x:1,z:0}],preferences:defaultInterfacePreferences(),preferenceStorage:null,musicKey:'',musicRequestSerial:0,musicSettledRequest:0,musicSettledLocked:false,
 data:{index:{maps:{1:{name:'New Bark'},2:{name:'Route29'}},mapIds:{DEST:2}},personal:{155:{species:'CYNDAQUIL',types:[]}},sprites:{},constants:{MAP_BATTLE_TOWER_PARTNER_ROOM:999,std_hatch_egg:9600},encounters:[],trainers:[{class:'TRAINERCLASS_PASSERBY'}],intro:{msg_0219:{}},eggSummary:{}},
 objects:{load(){log.push('load-actors');},restore(_id:any,actors:any){log.push(['restore-actors',actors]);},save(){return controls.actors??{map:state.map,actors:[]};}},
 battle:{active:false,async start(enemies:any[],trainer:any,options:any){log.push(['battle',structuredClone(enemies),trainer,options,c.battleSoundOwned]);controls.battleEntered?.resolve();await controls.battleGate?.promise;await controls.fight?.(enemies);return controls.battleResult;}},
 encounterChecks:{reset(){log.push('encounter-reset');},step(){log.push('encounter-step');},roll(...args:any[]){log.push(['encounter-roll',...args]);return false;}},
 async tweenPlayer(x:number,z:number,seconds:number,jump:boolean){log.push(['tween',seconds,jump]);controls.tweenEntered?.resolve();c.syncInputContext();await controls.tweenGate?.promise;state.x=x;state.z=z;},
 refreshNPCs(){log.push('refresh');},updateHUD(){log.push('hud');},syncMusic(){log.push('sync-music');},mapWeather:()=>7,mapBlackoutSpawn:async()=>null,gymFieldEntry:()=>({initialHeight:state.fieldHeight??0,violetLift:state.gymmick?.liftState??0}),
 fieldEntryScripts:(kind:string)=>kind==='resume'?['OnLoad','OnResume']:['InitMapOnEnter','OnLoad'],ledgeDirection:()=>null,doorwayEntry:()=>false,pushWarp:()=>false,stepWarpFacing:()=>null,arrivalFacing:(_p:number,facing:number)=>facing,arrivalStep:()=>null,findCoordinateTrigger:()=>undefined,findInteractedBackgroundEvent:()=>undefined,backgroundFlagSet:()=>false,advancePartyEggStep:()=>({hatchReady:false}),recordEggHatchEvent(){},
 trainerEventPriority,tryTrainerEncounter:async()=>false,isUsableBattler:(mon:any)=>!mon.isEgg&&mon.hp>0,firstFollowerMon:(party:any[])=>party.find(mon=>!mon.isEgg),createMon(){},landSlot:()=>0,
 runRecoverableSourceAction,runFieldBattleAction,momSavingsActive,settleMomBattleMoney,phoneCall,ScriptVM:class{hooks:any;constructor(_data:any,_state:any,hooks:any){this.hooks=hooks;}text(value:string){return value;}},UnsupportedScript:class extends Error{},structuredClone,AbortController,DOMException,
 fieldInput,fieldInputFacing,useFieldBagItem,chooseFieldPartySwitchTarget,swapFieldPartySlots,partyRow,partySummary,NATIVE_EGG_ICON,esc,
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

// Actual host orchestration + actual native leaf + actual UI. An item is not
// durable merely because its target was selected or its records were updated.
test('Bag host keeps native Potion provisional until final acknowledgement, then commits one use',async()=>{
 const d=installUIDOM(),clock=installUIClock(),c=fixture(),priorFetch=globalThis.fetch;globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
 try{c.data=await loadData();c.nativeFieldMoveData=JSON.parse(await readFile(new URL('../../public/source/field-moves.json',import.meta.url),'utf8'));c.state.bag={ITEM_POTION:2};c.ui=new UI();c.$=(id:string)=>d.ids.get(id);const controller=new AbortController(),pending=c.useBagItem('ITEM_POTION',{state:c.state,signal:controller.signal});await flush();clock.flush();
  assert.equal(c.sourceActions.busy,true);assert.equal(c.save(),false);assert.equal(c.writes.length,0);assert.equal(c.state.party[0].hp,10);d.ids.get('panel-content')!.querySelector<any>('[data-bag-choice="party:0"]')!.click();await flush();clock.flush();d.buttons[0].click();await flush();clock.flush();assert.equal(c.state.party[0].hp,20);assert.equal(c.state.bag.ITEM_POTION,1);assert.equal(c.writes.length,0);assert.equal(c.save(),false);d.buttons[0].click();await pending;assert.equal(c.writes.length,1);assert.equal(c.writes[0].bag.ITEM_POTION,1);assert.equal(c.writes[0].party[0].hp,20);assert.equal(c.activeBagUse,null);
 }finally{globalThis.fetch=priorFetch;c.dispose();clock.restore();d.restore();}
});

test('Bag lifecycle interruption rolls provisional party/bag back; explicit Retry owns a fresh signal and does not double consume',async()=>{
 const d=installUIDOM(),clock=installUIClock(),c=fixture(),priorFetch=globalThis.fetch;globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
 try{c.data=await loadData();c.nativeFieldMoveData=JSON.parse(await readFile(new URL('../../public/source/field-moves.json',import.meta.url),'utf8'));c.state.bag={ITEM_POTION:2};c.ui=new UI();c.$=(id:string)=>d.ids.get(id);const controller=new AbortController(),pending=c.useBagItem('ITEM_POTION',{state:c.state,signal:controller.signal});await flush();clock.flush();
  d.ids.get('panel-content')!.querySelector<any>('[data-bag-choice="party:0"]')!.click();await flush();clock.flush();d.buttons[0].click();await flush();clock.flush();const first=c.activeBagUse;assert.equal(c.state.bag.ITEM_POTION,1);c.abortBagUse(new DOMException('Hidden','AbortError'));await flush();clock.flush();assert.equal(c.state.bag.ITEM_POTION,2);assert.equal(c.state.party[0].hp,10);assert.equal(c.writes.length,0);assert.match(d.ids.get('panel-content')!.innerHTML,/Scene not completed/);d.buttons[0].click();await flush();clock.flush();assert.notEqual(c.activeBagUse,first);assert.equal(c.activeBagUse.signal.aborted,false);d.ids.get('panel-content')!.querySelector<any>('[data-bag-choice="party:0"]')!.click();await flush();clock.flush();d.buttons[0].click();await flush();clock.flush();d.buttons[0].click();await pending;assert.equal(c.writes.length,1);assert.equal(c.writes[0].bag.ITEM_POTION,1);assert.equal(c.writes[0].party[0].hp,20);
 }finally{globalThis.fetch=priorFetch;c.dispose();clock.restore();d.restore();}
});

test('title Settings and cancelled replacement retain the exact saved adventure and call native Continue once',async()=>{
 const c=fixture();try{bind(c,['title']);const existing=saved(),choices=['settings','new','continue'],begins:string[]=[],created:any[]=[];c.started=false;c.ready=false;c.readSave=()=>existing;c.ui.startScreen=async(profile:any)=>{assert.equal(profile.name,'Ethan');return choices.shift();};c.unlockSound=()=>{};c.panels.settings=async()=>{c.preferences={...c.preferences,music:false,textSpeed:2};assert.equal(c.save(),false);};c.ui.choose=async(_title:string,_options:string[],_detail:string,_signal:any,behavior:any)=>{assert.equal(behavior.cancelIndex,0);return 0;};c.newState=(...args:any[])=>{created.push(args);throw Error('cancelled replacement must never create State');};c.begin=async(mode:string)=>{begins.push(mode);};await c.title();assert.deepEqual(begins,['continue']);assert.equal(c.state,existing);assert.equal(c.writes.length,0);assert.equal(created.length,0);assert.equal(c.preferences.music,false);assert.equal(c.preferences.textSpeed,2);}finally{c.dispose();}
});

test('native party Escape cancels only its owned prompt/target, keeps whole records, and removes its abort listener',async()=>{
 for(const target of[false,true]){const d=installUIDOM(),clock=installUIClock(),c=fixture();try{c.ui=new UI();c.$=(id:string)=>d.ids.get(id);const active=new Set<(event:any)=>void>();c.addEventListener=(type:string,handler:any)=>{assert.equal(type,'keydown');active.add(handler);d.listen(type,(event:any)=>{if(active.has(handler))handler(event);});};c.removeEventListener=(type:string,handler:any)=>{assert.equal(type,'keydown');active.delete(handler);};const original=c.state.party,before=structuredClone(original),pending=c.choosePartyAction(0);await flush();clock.flush();if(target){d.buttons[1].click();await flush();clock.flush();assert.match(d.ids.get('panel-content')!.innerHTML,/Move to where/);}assert.equal(c.sourceActions.busy,true);assert.equal(c.save(),false);d.key('Escape');const result=await pending;assert.equal(result.focused,0);assert.equal(c.state.party,original);assert.deepEqual(c.state.party,before);assert.equal(c.sourceActions.busy,false);assert.equal(c.ui.panelOpen,false);assert.equal(active.size,0);assert.equal(c.log.includes('transition-start'),false);}finally{c.dispose();clock.restore();d.restore();}}
});

test('field music cannot admit a failed-map cue while source hydration is incomplete',async()=>{
 const c=fixture();try{let plays=0;Object.assign(c,{music:{playMap:async()=>{plays++;return{status:'playing'};}},musicRequestPending:null,musicChanged(){},retryMusicRestores:async()=>{},clearMusicFailure(){},musicFailed(error:unknown){throw error;}});bind(c,['syncMusic']);c.recoveryPrompt=true;c.syncMusic();c.recoveryPrompt=false;c.state.map=2;c.syncMusic();c.state.map=1;c.ready=false;c.syncMusic();assert.equal(plays,0);c.ready=true;c.syncMusic();await flush();assert.equal(plays,1);}finally{c.dispose();}
});

// Native encounter.c SetupAndStartTrainerBattle creates BATTLE_TYPE_TRAINER
// without class-based critical suppression. Cherrygrove scr_seq0850 requests
// ordinary rival battles; tutorial-specific suppression belongs in its setup.
test('ordinary native Cherrygrove PASSERBY battle never requests the prototype noCritical override',async()=>{
 const priorFetch=globalThis.fetch,c=fixture();globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
 try{const data=await loadData(),id=data.constants.TRAINER_PASSERBY_BOY;assert.ok(Number.isInteger(id));assert.equal(data.trainers[id].class,'TRAINERCLASS_PASSERBY');c.data=data;await c.startBattle([{species:152,hp:19}],id);const options=c.log.find((row:any)=>row[0]==='battle')[3];assert.equal(Object.hasOwn(options,'noCritical'),false);assert.equal(options.weather,7);
  const encounter=await readFile(new URL('../../../src/encounter.c',import.meta.url),'utf8'),script=await readFile(new URL('../../../files/fielddata/script/scr_seq/scr_seq_0850_T21.s',import.meta.url),'utf8');assert.match(encounter,/battleType = BATTLE_TYPE_TRAINER;/);assert.match(script,/TrainerBattle TRAINER_PASSERBY_BOY, 0, 1, 0/);
 }finally{globalThis.fetch=priorFetch;c.dispose();}
});

test('actual battle host settles Mom against capped wallets and pre-battle message snapshot on win/cap/full-bank/zero/loss',async()=>{
 const priorFetch=globalThis.fetch;globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
 try{const data=await loadData();for(const kind of['win','wallet-cap','bank-full','zero','zero-prize','loss']){const c=fixture();try{c.data=data;c.state.flags.FLAG_SYS_MOMS_SAVINGS=true;c.state.momSavings={balance:800,normalGiftsGiven:0,gifts:[]};c.trainerPrize=async()=>400;
  if(kind==='wallet-cap'){c.state.money=999990;c.state.momSavings.balance=0;}if(kind==='bank-full'){c.state.momSavings.balance=999999;c.state.momSavings.normalGiftsGiven=511;}if(kind==='zero'||kind==='loss'){c.state.momSavings.balance=900;c.controls.battleResult=kind==='loss'?'lost':'ran';}if(kind==='zero-prize'){c.state.momSavings.balance=900;c.trainerPrize=async()=>0;}
  let blackout:any;c.whiteOut=async()=>{blackout={money:c.state.money,savings:readMomSavings(c.state),elapsed:c.fieldPhone.snapshot().ring.elapsedMinutes};c.state.map=3;c.map=mapFixture(3);};await c.startBattle([{species:19,hp:9}],kind==='zero'||kind==='loss'?null:0);const bank=readMomSavings(c.state),text=c.log.filter((r:any)=>r[0]==='message').map((r:any)=>r[1]).join('');
  if(kind==='win'){assert.equal(c.state.money,3300);assert.equal(bank.balance,300);assert.deepEqual(bank.gifts,[{item:data.constants.ITEM_SUPER_POTION,quantity:1}]);assert.match(text,/Sent some to Mom!/);assert.deepEqual(c.state.phoneTriggers,[12]);assert.equal(c.fieldPhone.snapshot().ring.elapsedMinutes,9);}
  if(kind==='wallet-cap'){assert.equal(c.state.money,999997);assert.equal(bank.balance,2);assert.match(text,/Sent some to Mom!/);assert.equal(bank.gifts.length,0);}
  if(kind==='bank-full'){assert.equal(c.state.money,3400);assert.equal(bank.balance,999999);assert.doesNotMatch(text,/Sent some to Mom!/);}
  if(kind==='zero'||kind==='zero-prize'){assert.equal(c.state.money,3000);assert.equal(bank.balance,300);assert.equal(bank.gifts.length,1);}
  if(kind==='loss'){assert.equal(c.state.money,2900);assert.equal(blackout.money,2900);assert.equal(blackout.savings.balance,300);assert.equal(blackout.savings.gifts.length,1);assert.equal(blackout.elapsed,9);}
  assert.equal(c.writes.at(-1).money,c.state.money);assert.deepEqual(c.writes.at(-1).momSavings,c.state.momSavings);
 }finally{c.dispose();}}}finally{globalThis.fetch=priorFetch;}
});

test('fresh Mom purchase accelerates even with pending12; reading/zero-event settlement never reboosts',async()=>{
 const priorFetch=globalThis.fetch;globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
 try{const data=await loadData(),c=fixture();try{c.data=data;c.state.flags.FLAG_SYS_MOMS_SAVINGS=true;c.state.momSavings={balance:900,normalGiftsGiven:0,gifts:[]};c.state.phoneTriggers=[12];assert.equal(c.fieldPhone.snapshot().ring.elapsedMinutes,0);c.controls.battleResult='ran';await c.startBattle([{species:19,hp:9}]);assert.deepEqual(c.state.phoneTriggers,[12]);assert.equal(c.fieldPhone.snapshot().ring.elapsedMinutes,9);const snapshot=c.fieldPhone.snapshot();snapshot.ring.elapsedMinutes=2;c.fieldPhone.restore(snapshot);await c.startBattle([{species:19,hp:9}]);assert.equal(c.fieldPhone.snapshot().ring.elapsedMinutes,2);assert.equal(readMomSavings(c.state).gifts.length,1);}finally{c.dispose();}}finally{globalThis.fetch=priorFetch;}
});

test('late Mom host failure Return restores wallet/store/pending/manager; explicit Retry purchases exactly once',async()=>{
 const priorFetch=globalThis.fetch;globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
 try{const data=await loadData();for(const retry of[false,true]){const c=fixture();try{c.data=data;c.state.flags.FLAG_SYS_MOMS_SAVINGS=true;c.state.momSavings={balance:800,normalGiftsGiven:0,gifts:[]};c.trainerPrize=async()=>400;c.controls.recoveryChoice=retry?0:1;const phone=c.fieldPhone.snapshot();let failed=false;c.updateHUD=()=>{if(!failed&&readMomSavings(c.state).gifts.length){failed=true;throw Error('HUD after Mom purchase/phone boost');}};await c.startBattle([{species:19,hp:9}],0);assert.equal(failed,true);assert.equal(c.state.money,retry?3300:3000);assert.equal(readMomSavings(c.state).balance,retry?300:800);assert.equal(readMomSavings(c.state).gifts.length,retry?1:0);assert.deepEqual(c.state.phoneTriggers,retry?[12]:[]);if(!retry)assert.deepEqual(c.fieldPhone.snapshot(),phone);assert.equal(c.writes.at(-1).money,c.state.money);}finally{c.dispose();}}}finally{globalThis.fetch=priorFetch;}
});

test('actual Mother indicator/answer pins27, rejects unsupported contexts, and rolls back late call failure before Retry',async()=>{
 const priorFetch=globalThis.fetch;globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
 try{const data=await loadData(),messages=JSON.parse(await readFile(new URL('../../public/source/messages/664.json',import.meta.url),'utf8'));for(const retry of[false,true]){const c=fixture();try{c.data=data;c.state.map=60;c.map=mapFixture(60);c.state.phoneTriggers=[12];c.state.momSavings={balance:100,gifts:[{item:data.constants.ITEM_SUPER_POTION,quantity:1}],normalGiftsGiven:1};const bank=structuredClone(c.state.momSavings),snapshot=c.fieldPhone.snapshot();snapshot.ring.active={trigger:12,contact:0,scripted:3,script:27,forcePickUp:false};snapshot.ring.activeSince=1000;c.fieldPhone.restore(snapshot);c.refreshPhoneIndicator();assert.equal(c.$('phone-ring').hidden,false);assert.match(c.$('phone-ring').innerHTML,/Mom is calling/);c.controls.recoveryChoice=retry?0:1;let attempts=0;c.ui.message=async(text:string)=>{assert.equal(c.sourceActions.busy,true);assert.equal(c.fieldPhone.current().kind,'busy');assert.deepEqual(c.state.phoneTriggers,[]);assert.equal(c.save(),false);assert.equal(text,'Mother: '+messages['29']);if(attempts++===0)throw Error('call UI after launch');};await c.answerPhone();assert.equal(attempts,retry?2:1);assert.deepEqual(c.state.momSavings,bank);assert.deepEqual(c.state.bag,{});assert.deepEqual(c.state.phoneTriggers,retry?[]:[12]);assert.equal(c.fieldPhone.current().kind,retry?'none':'mother');
  const unsupported=c.fieldPhone.snapshot();unsupported.ring.active={trigger:12,contact:0,scripted:3,script:28,forcePickUp:false};c.fieldPhone.restore(unsupported);c.state.phoneTriggers=[12];await c.answerPhone();assert.deepEqual(c.state.phoneTriggers,[12]);assert.equal(c.fieldPhone.current().kind,'unsupported');c.refreshPhoneIndicator();assert.equal(c.$('phone-ring').hidden,true);
 }finally{c.dispose();}}}finally{globalThis.fetch=priorFetch;}
});

test('Mom berry admission receives an exact raw16 draw and Retry reuses it without another selection',async()=>{
 const priorFetch=globalThis.fetch,c=fixture();globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
 try{c.data=await loadData();c.state.flags.FLAG_SYS_MOMS_SAVINGS=true;c.state.momSavings={balance:2999,normalGiftsGiven:511,gifts:[]};c.trainerPrize=async()=>8;c.controls.recoveryChoice=0;let draws=0,failed=false;c.Math=Object.create(Math);c.Math.random=()=>{draws++;return 65535/65536;};c.updateHUD=()=>{if(!failed&&readMomSavings(c.state).gifts.length){failed=true;throw Error('late berry acknowledgement');}};await c.startBattle([{species:19,hp:9}],0);assert.equal(draws,1);assert.equal(c.state.money,3006);assert.equal(readMomSavings(c.state).balance,2901);assert.deepEqual(readMomSavings(c.state).gifts,[{item:c.data.constants.ITEM_OCCA_BERRY,quantity:5}]);assert.deepEqual(c.state.phoneTriggers,[12]);assert.equal(c.writes.at(-1).momSavings.gifts.length,1);}finally{globalThis.fetch=priorFetch;c.dispose();}
});

test('native capture unlock excludes the global audio button while its focused field keys remain usable',async()=>{
 const c=fixture();try{let unlocks=0;c.unlockSound=()=>{unlocks++;};c.document=c.f.doc;c.addEventListener=(type:string,handler:any,options:any)=>c.f.win.addEventListener(type,handler,options);c.reportInputError=(error:unknown)=>{throw error;};createContext(c);runInContext(compile(events),c);
  const button=new c.f.Element('audio-toggle');button.closest=(selector:string)=>selector==='[data-global-audio]'?button:null;
  c.f.win.fire('pointerdown',{target:button});for(const code of['Enter','Space']){const event=c.f.win.fire('keydown',{target:button,code});assert.equal(event.defaultPrevented,false);assert.equal(c.keys.has(code),false);}assert.equal(unlocks,0);
  const move=c.f.win.fire('keydown',{target:button,code:'KeyW'});assert.equal(move.defaultPrevented,true);assert.equal(c.keys.has('KeyW'),true);assert.equal(unlocks,0);c.f.win.fire('pointerdown',{target:c.f.nodes.get('original-world')});assert.equal(unlocks,1,'ordinary trusted field gesture still reaches unlock');
 }finally{c.dispose();}
});

test('hatch blocks ordinary Settings admission while the independent global mute remains live',async()=>{
 const c=fixture();try{c.hatching=true;c.state.options.sound=false;c.preferences.music=false;let settings=0,playerChanges=0;c.unlockSound=()=>{};c.reportInputError=(error:unknown)=>{throw error;};c.panels.menu=async()=>{settings++;c.preferences.music=true;c.state.options.sound=true;playerChanges++;};c.document=c.f.doc;c.addEventListener=(type:string,handler:any,options:any)=>c.f.win.addEventListener(type,handler,options);createContext(c);runInContext(compile(events),c);
  const touchActions=runInContext(compile('('+((initializer('touch')as ts.NewExpression).arguments![1].getText(ast))+')'),c);c.f.calls.menu=touchActions.menu;
  const hud=ast.statements.find(node=>ts.isExpressionStatement(node)&&node.getText(ast).startsWith("$('open-menu').onclick="));assert.ok(hud);runInContext(compile(hud.getText(ast)),c);c.syncInputContext();c.f.win.fire('keydown',{code:'Escape',target:c.f.nodes.get('original-world')});c.f.send('touch-menu','pointerdown',3);c.$('open-menu').onclick();await c.menu();await flush();assert.equal(settings,0);assert.equal(playerChanges,0);assert.equal(c.state.options.sound,false);assert.equal(c.preferences.music,false);
  let audioChanges=0;c.musicPreferencePending=0;c.musicChanged=()=>{};c.musicFailed=(error:unknown)=>{throw error;};c.music={async setPreferences(value:any){audioChanges++;assert.equal(value.enabled,c.state.options.sound);}};bind(c,['updatePreferences']);const button=new c.f.Element('audio-toggle');
  const dispose=bindAudioControls({button,preferences:()=>c.preferences,updatePreferences:c.updatePreferences,storage:null,unlock:()=>{},setPageActive:()=>{},watch:()=>()=>{}},c.f.doc,c.f.win);
  try{button.fire('click');assert.equal(c.hatching,true);assert.equal(c.state.options.sound,true);assert.equal(audioChanges,1);button.fire('click');assert.equal(c.state.options.sound,false);assert.equal(audioChanges,2);await flush();assert.equal(settings,0);}finally{dispose();}
  c.hatching=false;await c.menu();assert.equal(settings,1,'positive control: ordinary Settings requires hatch release');assert.equal(playerChanges,1);
 }finally{c.dispose();}
});

test('actual hatch host fixes prior music jobs before ownership, forwards shared audio and retains failed restores',async()=>{
 const c=fixture();try{bind(c,['hatchEgg']);const oldMap=deferred(),oldUnlock=deferred(),newMap=deferred(),seen:any[]=[];c.musicRequestPending=oldMap.promise;c.unlockPending=oldUnlock.promise;c.pendingMusicRestores=new Set();c.MUSIC_WAIT_MS=1500;const shared={},cry=async()=>{},session={},retry=async()=>{};c.music={sharedAudioOutput:()=>shared};c.musicFailed=()=>{};c.WorldEggHatchView=class{constructor(_world:any,_field:any,ports:any){assert.equal(ports.cry,cry);seen.push(ports.signal);}};c.createHatchHostAudio=(ports:any)=>{assert.equal(c.hatching,true);assert.equal(ports.player,c.music);assert.equal(ports.sharedAudioOutput(),shared);assert.equal(ports.enabled(),true);c.preferences.music=false;assert.equal(c.state.options.sound,true);assert.equal(ports.enabled(),false);c.preferences.music=true;assert.equal(ports.timeoutMs,1500);c.audioPorts=ports;return{cry,music:session};};c.presentNativeEggHatch=async(_data:any,_state:any,_map:any,host:any)=>{assert.equal(host.music,session);const signal=new AbortController().signal;host.view(signal);assert.equal(seen[0],signal);await c.audioPorts.drainFieldWork(signal);c.audioPorts.retainRestore(retry);await host.resumeField();};const pending=c.hatchEgg();assert.equal(c.hatching,true);assert.equal(c.save(),false);c.musicRequestPending=newMap.promise;oldMap.resolve();oldUnlock.resolve();await pending;assert.equal(c.hatching,false);assert.equal(c.hatchFollowerPendingCommit,true);assert.equal(c.pendingMusicRestores.has(retry),true);assert.equal(c.log.at(-1),'sync-music');}finally{c.dispose();}
});

test('current global preferences survive actual source rollback and recovery Retry before native field hydration',async()=>{
 for(const retry of[false,true]){const c=fixture();try{let hydrations=0;const observed:any[]=[];const enter=c.world.enter;c.musicPreferencePending=0;c.musicChanged=()=>{};c.musicFailed=(error:unknown)=>{throw error;};c.music={async setPreferences(){}};bind(c,['updatePreferences']);c.preferences.textSpeed=1;const effect=async()=>{c.updatePreferences({...c.preferences,music:false,textSpeed:2});c.state.options.battleStyle='set';throw Error('source scene failed after mute');};c.world.enter=async(...args:any[])=>{hydrations++;observed.push(structuredClone(c.state.options));if(retry&&hydrations===1)throw Error('held native hydration');return enter(...args);};
  if(retry)await assert.rejects(c.sourceActions.run(effect),/source action failed/);else{const result=await c.executeSourceAction(effect);assert.equal(result.ok,false);}assert.equal(observed[0].sound,false);assert.equal(observed[0].textSpeed,2);assert.equal(observed[0].battleStyle,'shift');assert.equal(c.state.options.sound,false);assert.equal(c.state.options.textSpeed,2);assert.equal(c.state.options.battleStyle,'shift');
  if(retry){assert.equal(c.sourceActions.recovering,true);assert.equal(c.save(),false);c.updatePreferences({...c.preferences,music:true,textSpeed:0});await c.sourceActions.retryRecovery();assert.equal(c.state.options.sound,true);assert.equal(c.state.options.textSpeed,0);assert.equal(hydrations,2);assert.equal(observed[1].sound,true);assert.equal(observed[1].textSpeed,0);}assert.equal(c.sourceActions.busy,false);assert.equal(c.save(),true);assert.equal(c.writes.at(-1).options.sound,c.preferences.music);assert.equal(c.writes.at(-1).options.textSpeed,c.preferences.textSpeed);assert.equal(c.writes.at(-1).options.battleStyle,'shift');
 }finally{c.dispose();}}
});

test('hatch factory configuration failure always releases the main owner and reaches source recovery',async()=>{
 const c=fixture();try{bind(c,['hatchEgg']);c.musicRequestPending=c.unlockPending=null;c.createHatchHostAudio=()=>{throw Error('missing required shared mechanism');};c.pendingMusicRestores=new Set();c.music={sharedAudioOutput(){}};c.musicFailed=()=>{};c.MUSIC_WAIT_MS=1500;const result=await c.executeSourceAction(()=>c.hatchEgg());assert.equal(result.ok,false);assert.equal(c.hatching,false);assert.equal(c.sourceActions.busy,false);assert.equal(c.writes.length,1);assert.equal(c.writes[0].flags.FLAG_SYS_HATCHED_TOGEPI_EGG,undefined);}finally{c.dispose();}
});

test('native hatch core/presenter with actual shared adapter survives technical no-voice admission and commits real Togepi/phone flags',async()=>{
 const priorFetch=globalThis.fetch,c=fixture();globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
 try{c.data=await loadData();Object.assign(c.state,newState(c.data,'Ethan','boy',()=>.5));Object.assign(c.state,{map:60,x:10.5,z:10.5,trainerId:123,nativeEggSeed:1});c.state.options.sound=true;giveTogepiEgg(c.data,c.state,{now:()=>new Date(2026,9,17)});c.state.party[0].friendship=0;c.map=JSON.parse(await readFile(new URL('../../public/source/maps/60.json',import.meta.url),'utf8'));c.musicRequestPending=c.unlockPending=null;c.pendingMusicRestores=new Set();c.MUSIC_WAIT_MS=1500;const audioLog:string[]=[],failures:any[]=[];c.music={field:{capture:()=>({kind:'none'}),async suspend(){audioLog.push('suspend');return{kind:'none'};},async restore(){audioLog.push('restore');}},createHatchTransport:()=>({prepare:async()=>{},play:async()=>{throw Error('no voice prepared');},dispose:async()=>{audioLog.push('dispose');}}),sharedAudioOutput:()=>{throw Error('audio permission unavailable');}};c.musicFailed=(error:unknown)=>failures.push(error);c.createHatchHostAudio=(ports:any)=>createHatchHostAudio({...ports,timeoutMs:20,preparationTimeoutMs:20,loadManifest:async()=>{throw Error('network unavailable');},wait:async()=>{}});c.presentNativeEggHatch=presentNativeEggHatch;c.WorldEggHatchView=class{constructor(_world:any,_field:any,private ports:any){}async reveal(){audioLog.push('visual-reveal');}async cry(scene:any){await this.ports.cry(scene,this.ports.signal);}async finish(){audioLog.push('visual-finish');}cancel(){}};c.ui.printMessage=async()=>{audioLog.push('native-print');return()=>{};};c.ui.choose=async()=>1;bind(c,['hatchEgg']);const result=await c.executeSourceAction(()=>c.hatchEgg());assert.equal(result.ok,true);assert.equal(c.hatching,false);assert.equal(c.state.party[0].isEgg,false);assert.equal(c.state.party[0].species,175);assert.equal(c.state.flags.FLAG_SYS_HATCHED_TOGEPI_EGG,true);assert.deepEqual(c.state.phoneTriggers,[0]);assert.equal(c.fieldPhone.snapshot().ring.elapsedMinutes,9);assert.equal(c.writes.length,1);assert.equal(c.writes[0].party[0].isEgg,false);assert.ok(failures.length>=2);assert.ok(audioLog.includes('visual-reveal'));assert.ok(audioLog.includes('visual-finish'));assert.ok(audioLog.includes('native-print'));assert.ok(audioLog.indexOf('suspend')<audioLog.indexOf('visual-reveal'));assert.ok(audioLog.indexOf('restore')>audioLog.indexOf('visual-finish'));assert.equal(c.pendingMusicRestores.size,0);
 }finally{globalThis.fetch=priorFetch;c.dispose();}
});

// The real leaf can finish its last acknowledgement while a lifecycle abort
// is queued in its Promise handback. The host still owns that commit boundary.
test('Bag lifecycle abort in final leaf handback restores acknowledged provisional item before save',async()=>{
 const d=installUIDOM(),clock=installUIClock(),c=fixture(),priorFetch=globalThis.fetch;globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
 try{c.data=await loadData();c.nativeFieldMoveData=JSON.parse(await readFile(new URL('../../public/source/field-moves.json',import.meta.url),'utf8'));c.state.bag={ITEM_POTION:2};c.ui=new UI();c.$=(id:string)=>d.ids.get(id);
  c.useFieldBagItem=async(...args:any[])=>{const result=await useFieldBagItem(...args);queueMicrotask(()=>c.abortBagUse(new DOMException('lifecycle handback','AbortError')));return result;};
  const controller=new AbortController(),pending=c.useBagItem('ITEM_POTION',{state:c.state,signal:controller.signal});await flush();clock.flush();
  d.ids.get('panel-content')!.querySelector<any>('[data-bag-choice="party:0"]')!.click();await flush();clock.flush();d.buttons[0].click();await flush();clock.flush();assert.equal(c.state.party[0].hp,20);assert.equal(c.state.bag.ITEM_POTION,1);
  d.buttons[0].click();await flush();clock.flush();assert.match(d.ids.get('panel-content')!.innerHTML,/Scene not completed/);assert.equal(c.state.party[0].hp,10);assert.equal(c.state.bag.ITEM_POTION,2);assert.equal(c.writes.length,0);d.buttons[1].click();await pending;assert.equal(c.writes.length,1);assert.equal(c.writes[0].bag.ITEM_POTION,2);assert.equal(c.writes[0].party[0].hp,10);assert.equal(c.activeBagUse,null);
 }finally{globalThis.fetch=priorFetch;c.dispose();clock.restore();d.restore();}
});

// Native battle commands are ordinary buttons, outside UI's owned panels.
// Exercise their REAL menu/move/back handlers and the actual field gate; the
// DOM fixture supplies the browser's default button click only when unhandled.
test('focused real battle Fight/move/Back retain Enter and Space defaults while field HUD and owned UI keep key ownership',async()=>{
 const d=installUIDOM(),clock=installUIClock(),c=fixture(),priorFetch=globalThis.fetch;globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
 try{const data=await loadData(),state=newState(data,'Gold','boy',()=>.5);state.party=[createMon(data,155,5,state.name,()=>.5)];c.ui=new UI();c.$=(id:string)=>d.ids.get(id);c.document={...d.document,addEventListener(){}};c.addEventListener=(type:string,handler:any,options:any)=>d.listen(type,handler,!!options?.capture);const fieldActions:string[]=[];c.unlockSound=()=>{};c.interact=async()=>{fieldActions.push('interact');};c.menu=async()=>{fieldActions.push('menu');};c.reportInputError=(error:any)=>{throw error;};
  const screen=d.document.createElement('section');screen.id='battle-screen';d.document.body.appendChild(screen);const battle:any=new Battle(data,state,c.ui);battle.enemies=[createMon(data,19,3,'',()=>.5)];battle.active=true;c.battle=battle;const actions:any[]=[];battle.actions=(action:any)=>actions.push(action);runInContext(compile(events),c);
  const activate=(button:any,code:string)=>{assert.ok(button);button.focus();const event=d.key(code);assert.equal(event.defaultPrevented,false,code+' must retain native battle button activation');if(!event.defaultPrevented)button.click();return event;};
  for(const code of['Enter','Space']){battle.menu();assert.equal(c.ui.busy,false);assert.equal(c.fieldControlsAvailable(),false);activate(screen.querySelector('[data-action="fight"]'),code);assert.ok(screen.querySelector('[data-move="0"]'),'Fight opens actual move menu');activate(screen.querySelector('[data-move="0"]'),code);assert.deepEqual(actions.at(-1),{kind:'move',slot:0});activate(d.ids.get('battle-back'),code);assert.ok(screen.querySelector('[data-action="fight"]'),'Back returns to actual battle command menu');assert.deepEqual(fieldActions,[]);assert.equal(c.keys.size,0);}
  // A stale focused HUD button is still field-owned once the battle ends.
  battle.active=false;let hudClicks=0;const hud=d.ids.get('open-menu')!;hud.onclick=()=>{hudClicks++;};hud.focus();const field=d.key('Enter');if(!field.defaultPrevented)hud.click();assert.equal(field.defaultPrevented,true);assert.equal(hudClicks,0);assert.deepEqual(fieldActions,['interact']);c.keys.clear();
  battle.active=true;for(const code of['Enter','Space']){const owned=c.ui.choose('Required battle choice',['Yes','No']);clock.flush();const event=d.key(code);assert.equal(event.defaultPrevented,true);assert.equal(await owned,0);assert.deepEqual(fieldActions,['interact']);assert.equal(c.keys.size,0);}assert.equal(c.writes.length,0);
 }finally{globalThis.fetch=priorFetch;c.dispose();clock.restore();d.restore();}
});
