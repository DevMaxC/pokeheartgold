import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createContext,runInContext,runInNewContext} from 'node:vm';
import ts from 'typescript';
import {TouchControls,TOUCH_PREFERENCES_KEY} from './touch-controls.ts';
import {CameraInput} from './camera-input.ts';
import {fieldInput,fieldInputFacing} from './field-input.ts';
import {defaultInterfacePreferences,writeInterfacePreferences} from './interface-preferences.ts';
import {UI} from './ui.ts';
import {installUIDOM,installUIClock} from './ui-test-dom.ts';

// Execute the actual main functions/ports, with WebGL, audio, script execution
// and time as explicit ports. The touch and camera controllers are real.
const source=await readFile(new URL('main.ts',import.meta.url),'utf8');
const parse=(text:string)=>ts.createSourceFile('main.ts',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const ast=parse(source),functions=new Map(ast.statements.filter(ts.isFunctionDeclaration).map(node=>[node.name?.text,node.getText(ast)]));
const names=['resetFieldInput','syncInputContext','running','textDelay','save','readSave','runScript','runFieldEntry','enterMap','warp','checkFrameTriggers','checkEvents','wildEncounter','step','menu','title','tweenPlayer','startBattle'];
for(const name of names)assert.ok(functions.has(name),'Actual main binding moved: '+name);
const compile=(text:string)=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function initializer(name:string){for(const statement of ast.statements)if(ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations)if(declaration.name.getText(ast)===name)return declaration.initializer!;throw Error('Missing main initializer '+name);}
const cameraPorts=(initializer('camera')as ts.NewExpression).arguments![1].getText(ast);
const touchActions=(initializer('touch')as ts.NewExpression).arguments![1].getText(ast);
let render:ts.FunctionDeclaration|undefined,interfacePorts:ts.ObjectLiteralExpression|undefined;
function visit(node:ts.Node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='render')render=node;if(ts.isNewExpression(node)&&node.expression.getText(ast)==='InterfacePanels')interfacePorts=node.arguments![2]as ts.ObjectLiteralExpression;ts.forEachChild(node,visit);}visit(ast);
assert.ok(render&&interfacePorts);
const renderInput=render.body!.statements.filter(node=>/^(syncInputContext\(\)|if\(!started\))/.test(node.getText(ast))||node.getText(ast).includes("keys.has('KeyQ')")||node.getText(ast).includes('fieldInputFacing(')).map(node=>node.getText(ast)).join('\n');
assert.match(renderInput,/fieldInputFacing/);assert.match(renderInput,/keys.has\('KeyQ'\)/);
const preferenceUpdate=(interfacePorts.properties.find(property=>property.name?.getText(ast)==='updatePreferences')as ts.PropertyAssignment).initializer.getText(ast);
const begin=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='begin')as ts.FunctionDeclaration;
const beginPreferences=begin.body!.statements.filter(node=>/^state\.options\.(sound|textSpeed)=/.test(node.getText(ast))).map(node=>node.getText(ast)).join('\n');
assert.match(beginPreferences,/sound/);assert.match(beginPreferences,/textSpeed/);
const eventBindings=ast.statements.filter(node=>ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)&&['addEventListener','document.addEventListener'].includes(node.expression.expression.getText(ast))).map(node=>node.getText(ast)).join('\n');
const bindingSource=names.map(name=>functions.get(name)).join('\n')+'\nfunction renderInputActual(dt){'+renderInput+'}\nfunction beginPreferencesActual(){'+beginPreferences+'}\nglobalThis.preferencesUpdateActual='+preferenceUpdate+';';
const mainHash=createHash('sha256').update(source).digest('hex'),bindingHash=createHash('sha256').update(bindingSource+eventBindings+cameraPorts+touchActions).digest('hex');

// Reuse the independent controller test's DOM adapter without reimplementing
// either the held-pointer state machine or the host's permission conditions.
const touchSource=await readFile(new URL('touch-controls.test.ts',import.meta.url),'utf8'),touchAst=parse(touchSource);
const fixtureSource=touchAst.statements.filter(node=>ts.isFunctionDeclaration(node)&&['storage','fixture'].includes(node.name?.text??'')).map(node=>node.getText(touchAst)).join('\n');
const makeTouch=runInNewContext(compile(fixtureSource+'\nfixture;'),{TouchControls,TOUCH_PREFERENCES_KEY})as()=>any;
const copy=(value:any)=>JSON.parse(JSON.stringify(value));
function deferred(){let resolve!:(value?:any)=>void,reject!:(reason:unknown)=>void;const promise=new Promise<any>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
function mapFixture(id=1){return{id,code:'T20',mapType:'MAP_TYPE_CITY_TOWN',key:'MAP_NEW_BARK',fields:{},events:{objects:[],coords:[],warps:[]},initTriggers:[],initScripts:{},scripts:{instructions:[],entries:[],labels:{}}};}
function saved(){return{version:2,name:'Existing',map:1,x:10.5,z:10.5,facing:1,gender:'boy',money:3000,party:[{species:155,hp:10,name:'Cyndaquil',gender:'male'}],bag:{},vars:{},flags:{},badges:[],seen:[],caught:[],playSeconds:5,options:{sound:false,textSpeed:0,battleStyle:'shift'},lastHeal:{map:1,x:10.5,z:10.5}};}
function fixture(){
 const f=makeTouch(),log:any[]=[],writes:any[]=[],values=new Map<string,string>(),controls:any={behavior:0,blocked:false,owner:undefined,destination:mapFixture(2),mapGate:undefined,tweenGate:undefined,battleGate:undefined,scriptGate:undefined,menuGate:undefined};
 const state:any=saved();state.runningShoes=true;
 const world:any={yaw:0,pitch:.5,distance:10,fieldTransitionActive:false,npcSprites:new Map(),sky:{currentWeather:0},height:()=>0,permission:()=>controls.behavior,walkable:()=>!controls.blocked,terrainWalkable:()=>!controls.blocked,owner:()=>controls.owner??state.map,
  async map(id:number){log.push(['map',id]);controls.mapEntered?.resolve();await controls.mapGate?.promise;return controls.destination;},async connect(id:number){log.push(['connect',id]);return controls.destination;},async enter(id:number){log.push(['enter',id]);return controls.destination;},beginFieldTransition(){this.fieldTransitionActive=true;log.push('transition-begin');},endFieldTransition(){this.fieldTransitionActive=false;},clearNPCs(){}};
 const cameraCanvas=new f.Element('original-world','canvas');cameraCanvas.parent=f.doc;new f.Element('game','div');
 const ui:any={busy:false,dialogueOpen:false,panelOpen:false,loading(){},toast(text:string){log.push(['toast',text]);},message:async()=>{},choose:async()=>0,input:async()=> 'Ethan'};
 const vm:any={busy:false,hooks:{},value:()=>0,async run(){this.busy=true;try{await controls.scriptGate?.promise;}finally{this.busy=false;}}};
 const c:any={state,map:mapFixture(),world,vm,ui,keys:new Set(),touch:f.controls,camera:null,started:true,ready:true,walking:false,transitioning:false,connecting:false,pickupRecoveryBlocked:false,battleSoundOwned:false,soundUnlocked:false,musicKey:'',musicError:'',player:{group:{visible:true,position:{x:state.x,y:0,z:state.z,set(x:number,y:number,z:number){Object.assign(this,{x,y,z});}}}},follower:null,followerSuppressed:false,followerFacing:1,followerMoving:false,followerStep:-1,previousStepJump:false,playerDirectionLocked:false,playerTweenY:undefined,stepFrame:-1,lastWarp:'',lastCoord:'',lastError:'',deltas:[{x:0,z:-1},{x:0,z:1},{x:-1,z:0},{x:1,z:0}],preferences:defaultInterfacePreferences(),preferenceStorage:null,
  data:{index:{maps:{1:{name:'New Bark'},2:{name:'Route29'}},mapIds:{DEST:2}},intro:{msg_0219:{}},encounters:[],constants:{},trainers:[]},encounterChecks:{reset(){log.push('encounter-reset');},step(){log.push('encounter-step');},roll(...args:any[]){log.push(['encounter-roll',...args]);return false;}},fieldInput,fieldInputFacing,
  battle:{active:false,async start(){this.active=true;try{await controls.battleGate?.promise;return'won';}finally{this.active=false;}}},panels:{async menu(){log.push('menu');await controls.menuGate?.promise;},async settings(){}},objects:{load(){},restore(){},save(){return{map:state.map,actors:[]};}},
  async tween(seconds:number,frame:(t:number)=>void){log.push(['tween',seconds]);frame(.5);c.syncInputContext();await controls.tweenGate?.promise;frame(1);},refreshNPCs(){},updateHUD(){},mapWeather:()=>0,mapBlackoutSpawn:async()=>null,fieldEntryScripts:()=>[],ledgeDirection:()=>null,doorwayEntry:()=>false,pushWarp:()=>false,stepWarpFacing:()=>null,arrivalFacing:(_permission:number,facing:number)=>facing,arrivalStep:()=>null,healParty(){},whiteOut:async()=>{},trainerPrize:async()=>0,battleMoneyLoss:()=>0,createMon(){},landSlot:()=>0,
  music:{capture:()=>({}),setPreferences:async(value:any)=>{log.push(['audio-preferences',value]);},field:{suspend:async()=>({}),restore:async()=>{}}},withBattleMusic:async(_enemies:any,_trainer:any,action:()=>Promise<any>)=>action(),syncMusic(){log.push('music-sync');},isItemBallObject:()=>false,ScriptVM:class{},UnsupportedScript:class extends Error{},console:{error(){},warn(){}},SAVE_KEY:'test-save',localStorage:{getItem:(key:string)=>values.get(key)??null,setItem(key:string,text:string){values.set(key,text);writes.push(JSON.parse(text));}},writeInterfacePreferences,unlockSound(){log.push('gesture');},reportInputError(error:unknown){log.push(['error',String(error)]);},$: (id:string)=>f.nodes.get(id),DOMException,
 };
 createContext(c);runInContext(compile(bindingSource),c);c.camera=new CameraInput(cameraCanvas,cameraPortsObject(),f.win,f.doc);
 function cameraPortsObject(){return runInContext(compile('('+cameraPorts+')'),c);}
 const actions=runInContext(compile('('+touchActions+')'),c);f.calls.menu=actions.menu;f.calls.interact=actions.interact;c.interact=async()=>{log.push('interact');};c.syncInputContext();
 return Object.assign(c,{f,log,writes,values,controls,dispose(){c.camera.dispose();f.controls.dispose();}});
}

test('actual main bindings retain a held joystick/camera across a tile tween and a deferred seamless connection',async t=>{
 t.diagnostic('main SHA256 '+mainHash+'; selected actual bindings '+bindingHash);const c=fixture();try{c.f.send('touch-stick','pointerdown',1,152,180);c.f.send('original-world','pointerdown',99,20,20);c.controls.tweenGate=deferred();const first=c.step(3);assert.equal(c.walking,true);assert.equal(c.touch.read().horizontal,1);assert.equal(c.f.captures.has(1),true);assert.equal(c.f.captures.has(99),true);c.renderInputActual(.016);assert.equal(c.touch.read().horizontal,1);assert.equal(c.log.filter((v:any)=>Array.isArray(v)&&v[0]==='tween').length,1);
  c.controls.tweenGate.resolve();await first;c.controls.tweenGate=undefined;c.controls.owner=2;c.controls.mapGate=deferred();c.controls.mapEntered=deferred();const crossing=c.step(3);await c.controls.mapEntered.promise;assert.equal(c.transitioning,true);assert.equal(c.connecting,true);c.renderInputActual(.016);assert.equal(c.touch.read().horizontal,1);assert.equal(c.f.captures.has(99),true);c.controls.mapGate.resolve();await crossing;assert.equal(c.state.map,2);assert.equal(c.f.captures.has(1),true);assert.equal(c.f.captures.has(99),true);assert.equal(c.log.filter((v:any)=>v==='transition-begin').length,0);
 }finally{c.dispose();}
});

test('actual source script, room entry, menu and battle release all held field inputs before awaited work',async()=>{
 for(const kind of['script','room','menu','battle']){const c=fixture();try{c.f.send('touch-stick','pointerdown',1,152,180);c.f.send('touch-run','pointerdown',2);c.f.send('original-world','pointerdown',99,20,20);c.keys.add('KeyW');const gate=deferred();let pending:Promise<any>;
  if(kind==='script'){c.controls.scriptGate=gate;pending=c.runScript(1);}else if(kind==='room'){c.controls.mapGate=gate;pending=c.enterMap(2,20.5,20.5,false);}else if(kind==='menu'){c.controls.menuGate=gate;pending=c.menu();}else{c.controls.battleGate=gate;pending=c.startBattle([]);}
  assert.equal(c.f.captures.size,0,kind);assert.equal(c.keys.size,0,kind);assert.deepEqual(c.touch.read(),{horizontal:0,forward:0,run:false});gate.resolve();await pending;
 }finally{c.dispose();}}
});

test('room warp resets touch/camera immediately even when destination metadata rejects before entry',async()=>{
 const c=fixture();try{c.map.events.warps=[{x:10,z:10,header:'DEST',anchor:0}];c.f.send('touch-stick','pointerdown',1,152,180);c.f.send('original-world','pointerdown',99,20,20);c.controls.mapGate=deferred();const warp=c.warp(0),rejected=assert.rejects(warp,/header failed/);
  const captured=c.f.captures.size;c.controls.mapGate.reject(Error('header failed'));await rejected;assert.equal(captured,0,'warp must release ownership before awaiting destination metadata');assert.equal(c.transitioning,false);c.syncInputContext();assert.equal(c.touch.read().horizontal,0);
 }finally{c.dispose();}
});

test('touch Run drives the real .14 movement and encounter flag only when running shoes are enabled',async()=>{
 for(const shoes of[false,true])for(const run of[false,true]){const c=fixture();try{c.state.runningShoes=shoes;c.syncInputContext();c.controls.behavior=2;c.map.fields.wildEncounterBank='ENCDATA_TEST';c.data.encounters=[{map:'TEST',land:{rate:20,mons:[]}}];c.f.send('touch-stick','pointerdown',1,152,180);if(run)c.f.send('touch-run','pointerdown',2);if(!shoes)c.keys.add('ShiftLeft');await c.step(3);assert.equal(c.log.find((v:any)=>Array.isArray(v)&&v[0]==='tween')[1],shoes&&run?.14:.25);assert.equal(c.log.find((v:any)=>Array.isArray(v)&&v[0]==='encounter-roll')[3],shoes&&run);assert.equal(c.f.captures.has(1),true);
 }finally{c.dispose();}}
});

test('actual UI capture consumes choice/dialogue confirmation before the main field handler, including after modal close',async()=>{
 const d=installUIDOM(),clock=installUIClock();try{const ui=new UI(),keys=new Set<string>();let interactions=0,menus=0;const c:any={ui,keys,started:true,transitioning:false,connecting:false,pickupRecoveryBlocked:false,battleSoundOwned:false,vm:{busy:false},battle:{active:false},unlockSound(){},menu:async()=>{menus++;},interact:async()=>{interactions++;},reportInputError(){},resetFieldInput(){keys.clear();},save(){},addEventListener:(type:string,handler:(event:any)=>void)=>d.listen(type,handler),document:{...d.document,addEventListener(){}}};createContext(c);runInContext(compile(eventBindings),c);
  const choice=ui.choose('Mandatory',['Yes','No']);clock.flush();d.key('KeyW');assert.equal(keys.size,0);d.key('KeyF');assert.equal(await choice,0);assert.equal(interactions,0);assert.equal(keys.size,0);assert.equal(menus,0);
  const dialogue=ui.message('Native dialogue');d.key('Escape');d.key('KeyB');assert.equal(ui.dialogueOpen,true);d.key('Enter');await dialogue;assert.equal(interactions,0);d.key('Escape');await Promise.resolve();assert.equal(menus,1);
 }finally{clock.restore();d.restore();}
});

test('actual root hidden/blur/pagehide bindings clear keyboard, joystick and camera ownership',()=>{
 for(const reason of['blur','pagehide','hidden']){const c=fixture();try{c.document=c.f.doc;c.addEventListener=(type:string,handler:any)=>c.f.win.addEventListener(type,handler);runInContext(compile(eventBindings),c);c.f.send('touch-stick','pointerdown',1,152,180);c.f.send('original-world','pointerdown',99,20,20);c.keys.add('KeyQ');if(reason==='hidden'){c.f.doc.visibilityState='hidden';c.f.doc.fire('visibilitychange');}else c.f.win.fire(reason);assert.equal(c.keys.size,0);assert.equal(c.f.captures.size,0);assert.deepEqual(c.touch.read(),{horizontal:0,forward:0,run:false});
 }finally{c.dispose();}}
});

test('actual context sync disables held input for UI, script, battle, transition and pickup recovery locks',()=>{
 for(const lock of['ui','script','battle','transition','world-transition','pickup']){const c=fixture();try{c.f.send('touch-stick','pointerdown',1,152,180);c.f.send('touch-run','pointerdown',2);c.f.send('original-world','pointerdown',99,20,20);
  if(lock==='ui'){c.ui.busy=true;c.ui.dialogueOpen=true;}else if(lock==='script')c.vm.busy=true;else if(lock==='battle')c.battle.active=true;else if(lock==='transition')c.transitioning=true;else if(lock==='world-transition')c.world.fieldTransitionActive=true;else c.pickupRecoveryBlocked=true;
  c.syncInputContext();assert.equal(c.f.captures.size,0,lock);assert.deepEqual(c.touch.read(),{horizontal:0,forward:0,run:false});if(lock==='ui')assert.equal(c.f.nodes.get('touch-interact').disabled,false,'dialogue keeps its touch confirm button');
 }finally{c.dispose();}}
});

test('keyboard admission and Q/E camera polling respect the same pickup recovery lock as touch and drag',()=>{
 const c=fixture();try{c.document=c.f.doc;c.addEventListener=(type:string,handler:any)=>c.f.win.addEventListener(type,handler);runInContext(compile(eventBindings),c);c.pickupRecoveryBlocked=true;c.f.win.fire('keydown',{code:'KeyQ'});assert.equal(c.keys.has('KeyQ'),false,'a locked field must not enqueue camera controls');c.keys.add('KeyQ');const before=c.world.yaw;c.renderInputActual(.02);assert.equal(c.world.yaw,before,'camera keyboard path must share the recovery guard');
 }finally{c.dispose();}
});

test('frame scenes cannot start during a pickup recovery or another owned modal action',async()=>{
 const c=fixture();try{const scripts:any[]=[];c.map.initTriggers=[{var:'0x4000',value:0,script:42}];c.runScript=async(script:any)=>{scripts.push(script);};
  for(const owner of['pickup','script','dialogue','battle']){c.pickupRecoveryBlocked=owner==='pickup';c.vm.busy=owner==='script';c.ui.busy=owner==='dialogue';c.battle.active=owner==='battle';assert.equal(await c.checkFrameTriggers(),false,owner);assert.equal(scripts.length,0,owner);}
  c.pickupRecoveryBlocked=c.vm.busy=c.ui.busy=c.battle.active=false;assert.equal(await c.checkFrameTriggers(),true);assert.deepEqual(scripts,[42]);
 }finally{c.dispose();}
});

test('actual save reports blocked or unavailable persistence without replacing the existing slot',()=>{
 const c=fixture();try{const previous=JSON.stringify(saved());c.values.set(c.SAVE_KEY,previous);
  for(const lock of['startup','transition','script','battle','step','pickup']){c.started=lock!=='startup';c.transitioning=lock==='transition';c.vm.busy=lock==='script';c.battle.active=lock==='battle';c.walking=lock==='step';c.pickupRecoveryBlocked=lock==='pickup';assert.equal(c.save(),false,lock);assert.equal(c.values.get(c.SAVE_KEY),previous);assert.equal(c.writes.length,0);}
  c.started=true;c.transitioning=c.vm.busy=c.battle.active=c.walking=c.pickupRecoveryBlocked=false;const put=c.localStorage.setItem;c.localStorage.setItem=()=>{throw Error('Storage is full');};assert.equal(c.save(),false);assert.equal(c.values.get(c.SAVE_KEY),previous);c.localStorage.setItem=put;assert.equal(c.save(),true);assert.equal(c.writes.length,1);
 }finally{c.dispose();}
});

function titleFixture(){
 const c=fixture(),existing=saved(),profiles:any[]=[],actions:string[]=[],choices:any[]=[],names:string[]=[],created:any[]=[];c.started=false;c.ready=false;c.state=undefined;c.values.set(c.SAVE_KEY,JSON.stringify(existing));
 c.ui.startScreen=async(profile:any,_signal:any,onGesture:()=>void)=>{profiles.push(copy(profile));onGesture?.();const action=actions.shift();assert.ok(action,'Unexpected extra title loop');return action;};
 c.ui.choose=async(title:string,options:string[],detail:string,signal:any,behavior:any)=>{c.log.push(['choice',title,options,detail,behavior]);assert.ok(choices.length,'Unexpected source choice '+title);const response=choices.shift();return typeof response==='function'?response():response;};
 c.ui.input=async(title:string,max:number)=>{c.log.push(['input',title,max]);assert.ok(names.length);return names.shift();};c.ui.message=async(text:string)=>{c.log.push(['message',text]);};
 c.newState=(_data:any,name:string,gender:string)=>{created.push({name,gender});return{...saved(),name,gender,playSeconds:0};};
 c.begin=async()=>{c.beginPreferencesActual();c.started=true;c.ready=true;c.log.push('begin');c.save();};
 return Object.assign(c,{existing,profiles,actions,choices,names,created});
}

test('title Settings loops retain the existing save, then Continue synchronizes current preferences into gameplay',async()=>{
 const c=titleFixture();try{c.actions.push('settings','settings','continue');let settings=0;c.panels.settings=async()=>{settings++;assert.equal(c.state,undefined);assert.equal(c.writes.length,0);c.preferencesUpdateActual({...c.preferences,music:settings===2,volume:settings===2?.7:.2,cameraSensitivity:1.2,textSpeed:settings===2?2:0});};await c.title();
  assert.equal(settings,2);assert.equal(c.profiles.length,3);assert.ok(c.profiles.every((profile:any)=>profile.name==='Existing'));assert.equal(c.created.length,0);assert.equal(c.state.name,'Existing');assert.equal(c.state.options.sound,true);assert.equal(c.state.options.textSpeed,2);assert.equal(c.state.options.battleStyle,'shift');assert.equal(c.preferences.volume,.7);assert.equal(c.log.filter((v:any)=>v==='begin').length,1);assert.equal(c.writes.length,1);assert.equal(c.log.filter((v:any)=>Array.isArray(v)&&v[0]==='audio-preferences').length,2);
 }finally{c.dispose();}
});

test('Keep existing adventure is explicit cancelIndex0 and returns to title without replacing the save or creating a character',async()=>{
 const c=titleFixture();try{c.actions.push('new','continue');const confirmation=deferred(),entered=deferred();c.choices.push(()=>{entered.resolve();return confirmation.promise;});const pending=c.title();await entered.promise;assert.equal(c.writes.length,0);assert.equal(c.values.get(c.SAVE_KEY),JSON.stringify(c.existing));assert.equal(c.created.length,0);const choice=c.log.find((v:any)=>Array.isArray(v)&&v[0]==='choice');assert.equal(choice[1],'Start a new adventure?');assert.deepEqual(copy(choice[4]),{cancelIndex:0});confirmation.resolve(0);await pending;assert.equal(c.profiles.length,2);assert.equal(c.created.length,0);assert.equal(c.state.name,'Existing');
 }finally{c.dispose();}
});

test('confirmed New Game and rejected names do not overwrite the old slot until identity completes and gameplay begins',async()=>{
 const c=titleFixture();try{c.actions.push('new');c.choices.push(1,1,1,0);c.names.push('Rejected','Chosen');const finalText=deferred(),release=deferred();c.ui.message=async(text:string)=>{c.log.push(['message',text]);if(text.includes('very own tale')){finalText.resolve();await release.promise;}};
  const pending=c.title();await finalText.promise;assert.deepEqual(copy(c.created),[{name:'Chosen',gender:'girl'}]);assert.equal(c.log.filter((v:any)=>Array.isArray(v)&&v[0]==='input').length,2);assert.ok(c.log.filter((v:any)=>Array.isArray(v)&&v[0]==='input').every((v:any)=>v[2]===7));c.save();assert.equal(c.writes.length,0);assert.equal(c.values.get(c.SAVE_KEY),JSON.stringify(c.existing));assert.equal(c.started,false);release.resolve();await pending;assert.equal(c.writes.length,1);assert.equal(c.writes[0].name,'Chosen');assert.equal(c.writes[0].options.sound,c.preferences.music);assert.equal(c.writes[0].options.textSpeed,c.preferences.textSpeed);
 }finally{c.dispose();}
});

test('live preference update uses actual normalization/persistence callback and keeps battle style intact',async()=>{
 const c=fixture();try{const stored=new Map<string,string>();c.preferenceStorage={getItem:(key:string)=>stored.get(key)??null,setItem:(key:string,value:string)=>stored.set(key,value)};c.preferencesUpdateActual({music:false,volume:.25,cameraSensitivity:1.4,textSpeed:2});await Promise.resolve();assert.equal(c.state.options.sound,false);assert.equal(c.state.options.textSpeed,2);assert.equal(c.state.options.battleStyle,'shift');assert.equal(c.preferences.cameraSensitivity,1.4);assert.equal(JSON.parse([...stored.values()][0]).volume,.25);assert.equal(c.log.find((v:any)=>Array.isArray(v)&&v[0]==='audio-preferences')[1].enabled,false);
 }finally{c.dispose();}
});
