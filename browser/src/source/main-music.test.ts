import {UnsupportedBattleEvolution} from './battle-evolution.ts';
import {noLevelUpHostFixture,noLevelUpBattleFixture} from './main-evolution-fixture.test.ts';
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createContext,runInContext,runInNewContext} from 'node:vm';
import ts from 'typescript';
import {createNativeFieldMusicPlayer,UnsupportedNativeMusic,type EffectiveMusic} from './field-music.ts';
import {nativeBattleMusic} from './battle-music.ts';
import {readInterfacePreferences,writeInterfacePreferences,INTERFACE_PREFERENCES_KEY} from './interface-preferences.ts';
import {fieldInput,fieldInputFacing} from './field-input.ts';
import * as THREE from 'three';
import {SourceActionRecovery,SourceTriggerGate,runRecoverableSourceAction,runFieldBattleAction} from './script-recovery.ts';
import {TrainerAttemptLatch,trainerEventPriority} from './trainer-encounters.ts';
import {FieldPhoneHost} from './phone-field-host.ts';
import {momSavingsActive,settleMomBattleMoney} from './mom-savings.ts';
import {UnsupportedScript} from './script.ts';

// Execute production host bindings. Real music selection, voice/session ownership
// and map intent handling run against the existing synthetic AudioContext adapter;
// this does not claim browser decoding or an audible rendition of those fixtures.
const parse=(text:string)=>ts.createSourceFile('fixture.ts',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const compile=(text:string)=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const read=(name:string)=>readFileSync(new URL(name,import.meta.url),'utf8');
const source=read('main.ts'),ast=parse(source),functions=new Map(ast.statements.filter(ts.isFunctionDeclaration).map(node=>[node.name?.text,node.getText(ast)]));
const names=['abortBagUse','fieldControlsAvailable','cameraControlsAvailable','retainFieldInput','captureField','restoreField','cancelEvolutionField','executeSourceAction','pollFieldInput','runScript','musicChanged','watchMusic','musicFailed','clearMusicFailure','musicStatus','musicDeadline','finishMusicUnlock','retryMusic','retryMusicRestores','unlockSound','syncMusic','resetFieldInput','syncInputContext','save','checkFrameTriggers','withBattleMusic','startBattle','drainBattleEvolution','step','menu','interact'];
for(const name of names)assert.ok(functions.has(name),'Main music binding moved: '+name);
function initializer(name:string){for(const statement of ast.statements)if(ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations)if(declaration.name.getText(ast)===name)return declaration.initializer!;throw Error('Main initializer moved: '+name);}
const cameraPorts=(initializer('camera')as ts.NewExpression).arguments![1].getText(ast),touchActions=(initializer('touch')as ts.NewExpression).arguments![1].getText(ast);
let tutorial:ts.Expression|undefined,preferenceUpdate:string|undefined,render:ts.FunctionDeclaration|undefined;
function visit(node:ts.Node){
 if(ts.isNewExpression(node)&&node.expression.getText(ast)==='ScriptVM'&&node.arguments?.[2]&&ts.isObjectLiteralExpression(node.arguments[2]))tutorial=(node.arguments[2].properties.find(p=>p.name?.getText(ast)==='catchingTutorial')as ts.PropertyAssignment)?.initializer;
 if(ts.isNewExpression(node)&&node.expression.getText(ast)==='InterfacePanels'){const port=(node.arguments![2]as ts.ObjectLiteralExpression).properties.find(p=>p.name?.getText(ast)==='updatePreferences')!;preferenceUpdate=ts.isShorthandPropertyAssignment(port)?'('+functions.get('updatePreferences')!+')':(port as ts.PropertyAssignment).initializer.getText(ast);}
 if(ts.isFunctionDeclaration(node)&&node.name?.text==='render')render=node;ts.forEachChild(node,visit);
}visit(ast);assert.ok(tutorial&&preferenceUpdate&&render);
const begin=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='begin')as ts.FunctionDeclaration;
const beginPreferences=begin.body!.statements.filter(node=>/^state\.options\.(sound|textSpeed)=/.test(node.getText(ast))).map(node=>node.getText(ast)).join('\n');assert.match(beginPreferences,/sound/);
const renderInput=render.body!.statements.filter(node=>node.getText(ast).includes("keys.has('KeyQ')")||node.getText(ast).includes('fieldInputFacing(')).map(node=>node.getText(ast)).join('\n');assert.match(functions.get('pollFieldInput')!,/fieldInputFacing/);assert.match(renderInput,/keys.has\('KeyQ'\)/);
const bindings=names.map(name=>functions.get(name)).join('\n')+'\nfunction renderInputActual(dt){'+renderInput+'}\nfunction beginPreferencesActual(){'+beginPreferences+'}\nglobalThis.updatePreferencesActual='+preferenceUpdate+';\nglobalThis.tutorialActual='+tutorial.getText(ast)+';';
const events=ast.statements.filter(node=>ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)&&['addEventListener','document.addEventListener'].includes(node.expression.expression.getText(ast))).map(node=>node.getText(ast)).join('\n');
const mainHash=createHash('sha256').update(source).digest('hex'),bindingHash=createHash('sha256').update(bindings+events+cameraPorts+touchActions).digest('hex');

after(()=>assert.equal(createHash('sha256').update(read('main.ts')).digest('hex'),mainHash,'main changed during bound music tests'));
const phoneRules=JSON.parse(readFileSync(new URL('../../public/source/phone-triggers.json',import.meta.url),'utf8'));

// Reuse fixture setup only, never the assertions in the independent player and
// selector tests. Source-owned battle tables and the real selector are retained.
function fixtureDeclarations(text:string,variables:string[],functions:string[]=[]){const tree=parse(text);return tree.statements.filter(node=>ts.isFunctionDeclaration(node)?functions.includes(node.name?.text??''):ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>variables.includes(d.name.getText(tree)))).map(node=>node.getText(tree)).join('\n');}
const playerFixture=fixtureDeclarations(read('field-music.test.ts'),['A','B','SURF','clone','hash'],['body','deferred','fixture']);
const makePlayer=runInNewContext(compile(playerFixture+'\nfixture;'),{createNativeFieldMusicPlayer,createHash,Buffer,structuredClone,AbortController,setTimeout,clearTimeout,crypto})as()=>any;
const selectorFixture=fixtureDeclarations(read('battle-music.test.ts'),['text','definitions','ids','original','body','pairs','rules','catalog']);
const native=runInNewContext(compile(selectorFixture+'\n({catalog,ids});'),{readFileSync,URL,root:new URL('../../../',import.meta.url)});
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
function deferred(){let resolve!:(value?:any)=>void,reject!:(error:unknown)=>void;const promise=new Promise<any>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
function deadlineClock(c:any){
 const originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout,tasks=new Map<number,{at:number;run:()=>void}>();let now=0,serial=0;
 const set=((run:(...args:any[])=>void,delay=0,...args:any[])=>{const id=++serial;tasks.set(id,{at:now+Number(delay),run:()=>run(...args)});return id;})as unknown as typeof setTimeout;
 const clear=((id:number)=>{tasks.delete(Number(id));})as unknown as typeof clearTimeout;
 globalThis.setTimeout=set;globalThis.clearTimeout=clear;c.setTimeout=set;c.clearTimeout=clear;
 return{async advance(ms:number){const end=now+ms;for(;;){const first=[...tasks].sort((a,b)=>a[1].at-b[1].at)[0];if(!first||first[1].at>end)break;now=first[1].at;tasks.delete(first[0]);first[1].run();await flush();}now=end;await flush();},restore(){globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;c.setTimeout=originalSet;c.clearTimeout=originalClear;},get pending(){return tasks.size;}};
}
function map(id=60){return{id,events:{objects:[],coords:[],warps:[],bgs:[]},initTriggers:[],fields:{}};}
function mon(species=155,hp=10){return{species,hp,name:'Fixture',gender:'male',level:5};}
function fixture(){
 const f=makePlayer(),log:any[]=[],controls:any={},writes:any[]=[],listeners=new Map<string,any>(),music=f.player;
 f.catalog.battle={...native.catalog.battle,mapRegions:{...native.catalog.battle.mapRegions,73:JSON.parse(read('../../public/source/music/catalog.json')).battle.mapRegions['73']}};
 // Distinct native cue IDs/paths use the adapter's checksummed synthetic audio.
 const sample=f.catalog.tracks['1019'];for(const {cue}of native.catalog.battle.parameters){if(f.catalog.tracks[cue.id])continue;f.catalog.tracks[cue.id]={...structuredClone(sample),...cue,formats:sample.formats.map((format:any)=>{const file=cue.id+'-'+cue.key+(format.codec==='aac'?'.m4a':'.mp3');f.files.set('/source/music/'+file,f.files.get('/source/music/'+format.file));return{...format,file};})};}
 const realPlayMap=music.playMap.bind(music);music.playMap=async(m:any,s:any,signal?:AbortSignal)=>{log.push(['map-music',m.id]);if(controls.playMap)return controls.playMap(m,s,signal);return realPlayMap(m,s,signal);};
 const session=music.createCueSession.bind(music);music.createCueSession=()=>{const owned=session();return{...owned,start(cue:any,signal:AbortSignal){log.push(['cue',cue]);return owned.start(cue,signal);},restore(signal?:AbortSignal){log.push(['restore',c.map.id]);return owned.restore(signal);}};};
 const suspend=music.field.suspend.bind(music.field);music.field.suspend=async(snapshot:EffectiveMusic)=>{log.push(['suspend',snapshot]);return suspend(snapshot);};
 const preferences=readInterfacePreferences(null),state:any={name:'Ethan',map:60,x:10.5,z:10.5,facing:1,playSeconds:0,boxes:[],phoneTriggers:[],pokegear:{contacts:[0,1,2]},runningShoes:true,money:3000,badges:[],party:[mon()],flags:{},vars:{},bag:{},options:{sound:false,textSpeed:0,battleStyle:'shift'}};
 const c:any={music,preferences,state,map:map(),data:{personal:{155:{species:'CYNDAQUIL'}},sprites:{},constants:native.ids,trainers:[{class:'TRAINERCLASS_LEADER_FALKNER'},{class:'TRAINERCLASS_PASSERBY'}]},musicKey:'',musicError:'',musicNotice:'',musicRetryable:true,musicPreferencePending:0,musicListeners:new Set(),MUSIC_WAIT_MS:Number(initializer('MUSIC_WAIT_MS').getText(ast)),soundUnlocked:false,unlockPending:null,battleSoundOwned:false,musicRequestPending:null,musicRequestSerial:0,musicSettledRequest:0,musicSettledLocked:false,pendingMusicRestores:new Set(),sourceActions:null,recoveryPrompt:false,hatching:false,sourceSceneOwners:0,preservedControlScripts:0,ordinaryInputOwners:0,fieldPolling:false,activeBagUse:null,restoringGym:false,hatchFollowerPendingCommit:false,playerDirectionLocked:false,followerSuppressed:false,followerFacing:1,followerMoving:false,followerStep:-1,followerPrevious:null,followMon:null,followSpecies:0,playerTweenY:undefined,previousStepJump:false,stepFrame:-1,npcTweenY:new Map(),lastCoord:'',fieldPhone:new FieldPhoneHost(phoneRules,1000,12),frameTriggerGate:new SourceTriggerGate(),phoneAdmissionGate:new SourceTriggerGate(),trainerAttempts:new TrainerAttemptLatch(),trainerApproachTasks:new Map(),started:true,ready:true,walking:false,transitioning:false,connecting:false,keys:new Set(),lastError:'',lastWarp:'',deltas:[{x:0,z:-1},{x:0,z:1},{x:-1,z:0},{x:1,z:0}],preferenceStorage:null,
  ui:{busy:false,dialogueOpen:false,panelOpen:false,loading(){},toast(text:string){log.push(['toast',text]);},choose:async(title:string)=>{log.push(['choice',title]);return controls.recoveryChoice??1;},input:async()=> 'Name',message:async()=>{}},world:{clearScriptCameraTarget(){log.push('clear-camera');},map:async()=>c.map,enter:async()=>c.map,clearNPCs(){},beginFieldTransition(){},endFieldTransition(){},removePaper(){},height:()=>0,yaw:0,pitch:.5,distance:10,fieldTransitionActive:false,sky:{currentWeather:3},npcSprites:new Map(),permission:()=>0,terrainWalkable:()=>true,walkable:()=>true},vm:{busy:false,hooks:{},value:(token:string)=>state.vars[token]??0,async run(_map:any,script:any){log.push(['script',script,c.battleSoundOwned]);if(script===90)state.vars.VAR_MUSIC_FRAME=1;this.busy=true;try{await controls.script?.();}finally{this.busy=false;}}},camera:{reset(){log.push('camera-reset');},sync(){}},touch:{reset(){log.push('touch-reset');},setContext(value:any){log.push(['touch-context',value]);},read:()=>({horizontal:1,forward:0,run:false})},objects:{load(){},restore(){},save:()=>({map:state.map,actors:[]})},SAVE_KEY:'test-save',localStorage:{setItem(_key:string,value:string){writes.push(JSON.parse(value));}},$:()=>({dataset:{}}),panels:{async menu(){log.push('menu');}},
  battle:{active:false,async start(enemies:any,trainer:any,options:any){log.push(['battle',enemies,trainer,options]);this.active=true;controls.battleEntered?.resolve();try{await controls.battleGate?.promise;if(controls.battleError)throw controls.battleError;return controls.result??'won';}finally{this.active=false;}}},
  nativeBattleMusic(catalog:any,setup:any){log.push(['setup',structuredClone(setup)]);return nativeBattleMusic(catalog,setup);},encounterChecks:{reset(){log.push('encounter-reset');},step(){}},async tweenPlayer(){log.push('step');},running:()=>false,ledgeDirection:()=>null,pushWarp:()=>false,doorwayEntry:()=>false,
  async whiteOut(){log.push('blackout');controls.blackoutEntered?.resolve();await controls.blackoutGate?.promise;state.map=73;c.map=map(73);if(controls.blackoutTrigger)c.map.initTriggers=[{var:'VAR_MUSIC_FRAME',value:0,script:90}];},healParty(){log.push('heal');},battleMoneyLoss:()=>10,trainerPrize:async()=>0,async runFieldEntry(kind:string){log.push(['entry',kind,c.battleSoundOwned]);},updateHUD(){},refreshNPCs(){},mapWeather:()=>3,firstFollowerMon:(party:any[])=>party.find(mon=>!mon.isEgg),runRecoverableSourceAction,runFieldBattleAction,trainerEventPriority,tryTrainerEncounter:async()=>false,pollPhoneAdmission:async()=>false,momSavingsActive,settleMomBattleMoney,UnsupportedScript,ScriptVM:class{hooks:any;busy=false;constructor(_data:any,_state:any,hooks:any){this.hooks=hooks;}value(){return 0;}},structuredClone,reportInputError(error:unknown){log.push(['error',String(error)]);},fieldInput,fieldInputFacing,writeInterfacePreferences,
  catchingTutorialState:()=>({state:{...state,gender:'girl'},enemy:mon(19)}),Battle:class{async start(enemies:any,trainer:any,options:any){log.push(['tutorial-battle',enemies,trainer,options]);controls.tutorialEntered?.resolve();await controls.tutorialGate?.promise;if(controls.tutorialError)throw controls.tutorialError;return'won';}},WorldBattleView:class{},player:{group:new THREE.Group()},follower:null,displayMapName:()=> 'New Bark',console:{warn(error:any){log.push(['warn',String(error)]);},error(){}},DOMException,AbortController,UnsupportedNativeMusic,setTimeout,clearTimeout,Date:class extends Date{getHours(){return 12;}},
  addEventListener(type:string,handler:any){listeners.set(type,handler);},document:{addEventListener(){}},
 };
 c.fieldActors=undefined;Object.assign(c,{UnsupportedBattleEvolution,evolutionHost:noLevelUpHostFixture(c.state),battleMusicParent:undefined});if(c.battle)noLevelUpBattleFixture(c.battle,c.state);createContext(c);runInContext(compile(bindings+events),c);c.sourceActions=new SourceActionRecovery(state,{capture:()=>c.captureField(),restore:(snapshot:any,error:any)=>c.restoreField(snapshot,error)});c.cameraAllowed=runInContext(compile('('+cameraPorts+').allowed'),c);c.touchActions=runInContext(compile('('+touchActions+')'),c);
 return Object.assign(c,{f,log,controls,writes,listeners,async prepare(){await music.playMap(c.map,{hour:12,flags:state.flags});await music.unlock();c.soundUnlocked=true;f.contexts[0].currentTime=6;log.length=0;},async dispose(){await music.dispose();}});
}

test('actual gesture handler invokes unlock synchronously, deduplicates pending gestures and permits retry after rejection',async t=>{
 t.diagnostic('main SHA256 '+mainHash+'; actual music bindings '+bindingHash);const c=fixture();try{const gate=deferred();c.f.controls.resume=()=>gate.promise;c.interact=async()=>{c.log.push('interaction');};c.touchActions.interact();assert.deepEqual(Array.from(c.f.log),['context','resume']);assert.equal(c.log.at(-1),'interaction');c.touchActions.interact();assert.deepEqual(Array.from(c.f.log),['context','resume']);assert.equal(c.soundUnlocked,false);gate.reject(Error('User must tap again'));await flush();assert.equal(c.unlockPending,null);assert.equal(c.soundUnlocked,false);assert.match(c.musicError,/tap again/);c.f.controls.resume=async()=>{c.f.contexts[0].state='running';};c.unlockSound();const retry=c.unlockPending;assert.equal(c.f.contexts.length,1);assert.equal(c.f.log.filter((entry:string)=>entry==='resume').length,2);await retry;await flush();assert.equal(c.soundUnlocked,true);c.unlockSound();assert.equal(c.f.log.filter((entry:string)=>entry==='resume').length,2);
 }finally{await c.dispose();}
});

test('actual preference construction migrates defaults and preserves explicit mute through gameplay entry and gesture unlock',async()=>{
 for(const saved of[null,{version:1,music:false,volume:.2,textSpeed:2,cameraSensitivity:1}]){const values=new Map<string,string>();if(saved)values.set(INTERFACE_PREFERENCES_KEY,JSON.stringify(saved));const preferences=readInterfacePreferences({getItem:key=>values.get(key)??null});let options:any;runInNewContext(compile(initializer('music').getText(ast)),{preferences,createNativeFieldMusicPlayer:(value:any)=>{options=value;}});assert.equal(options.enabled,saved?false:true);assert.equal(options.volume,saved?.volume??.55);
  const c=fixture();try{c.preferences=preferences;c.beginPreferencesActual();assert.equal(c.state.options.sound,preferences.music);assert.equal(c.state.options.battleStyle,'shift');await c.music.setPreferences({enabled:preferences.music,volume:preferences.volume});await c.music.playMap(c.map,{hour:12,flags:{}});c.unlockSound();await c.unlockPending;await flush();assert.equal(c.preferences.music,preferences.music);assert.equal(c.f.sources.length,saved?0:1);if(saved){assert.equal(c.f.requests.length,0);c.updatePreferencesActual({...preferences,textSpeed:1});await flush();await c.musicRequestPending;assert.equal(c.state.options.sound,false);assert.equal(c.state.options.textSpeed,1);assert.equal(c.f.sources.length,0);assert.equal(c.log.filter((v:any)=>Array.isArray(v)&&v[0]==='toast').length,0,'a successful muted preference update must not report superseded request errors');await c.startBattle([mon(16)]);assert.equal(c.f.requests.length,0);assert.equal(c.state.options.sound,false);}
  }finally{await c.dispose();}
 }
});

test('actual map music synchronization deduplicates intent and suppresses failures from a replaced map request',async()=>{
 const c=fixture();try{const old=deferred(),latest=deferred();c.controls.playMap=(m:any)=>m.id===60?old.promise:latest.promise;c.syncMusic();c.syncMusic();assert.equal(c.log.filter((v:any)=>Array.isArray(v)&&v[0]==='map-music').length,1);c.state.map=73;c.map=map(73);c.syncMusic();latest.resolve({status:'playing'});await flush();old.reject(Error('map60 replaced'));await flush();assert.equal(c.musicError,'');assert.equal(c.log.some((v:any)=>Array.isArray(v)&&v[0]==='toast'),false);
 }finally{await c.dispose();}
});

test('ordinary field gestures and key repeats do not retry a failed song or repeat its error toast',async()=>{
 const c=fixture();try{await c.prepare();let requests=0;c.controls.playMap=async()=>{requests++;throw Error('Network offline');};c.syncMusic();await c.musicRequestPending;assert.equal(requests,1);
  for(let i=0;i<20;i++){c.listeners.get('keydown')({code:'KeyW',repeat:i>0,preventDefault(){}});await c.musicRequestPending;}
  c.touchActions.interact();await c.musicRequestPending;assert.equal(requests,1,'unlocked field gestures must not become implicit song retries');assert.equal(c.log.filter((v:any)=>Array.isArray(v)&&v[0]==='toast').length,1);
 }finally{await c.dispose();}
});

test('a resumed Context with a failed initial song remains unlocked without gesture retries and recovers through Settings Retry',async()=>{
 const c=fixture();try{
  await c.music.playMap(c.map,{hour:12,flags:{}});c.f.controls.badDuration=true;c.unlockSound();assert.equal(c.f.contexts.length,1);assert.equal(c.f.contexts[0].state,'running');const initial=c.unlockPending;await assert.rejects(initial,/None of/);await flush();assert.equal(c.music.isUnlocked(),true);assert.equal(c.soundUnlocked,true);assert.equal(c.f.sources.length,0);const requests=c.f.requests.length,resumes=c.f.log.filter((value:string)=>value==='resume').length;
  for(let i=0;i<5;i++)c.unlockSound();await flush();assert.equal(c.f.requests.length,requests);assert.equal(c.f.log.filter((value:string)=>value==='resume').length,resumes);assert.equal(c.log.filter((v:any)=>Array.isArray(v)&&v[0]==='toast').length,1);
  c.f.controls.badDuration=false;await c.retryMusic();assert.equal(c.f.sources.length,1);assert.equal(c.musicError,'');assert.equal(c.musicStatus().canRetry,false);
 }finally{await c.dispose();}
});

test('a first gesture song load replaced by a successful new map does not report an outage or replace that map',async()=>{
 const c=fixture(),gate=deferred(),entered=deferred();try{
  await c.music.playMap(c.map,{hour:12,flags:{}});c.f.controls.fetch=async(url:string)=>{if(url.includes('1018-')){entered.resolve();return gate.promise;}return c.f.files.get(url).slice(0);};
  c.unlockSound();await entered.promise;assert.equal(c.music.isUnlocked(),true);c.state.map=73;c.map=map(73);c.syncMusic();await c.musicRequestPending;await flush();assert.equal(c.soundUnlocked,true);assert.equal(c.musicError,'');assert.equal(c.log.filter((v:any)=>Array.isArray(v)&&v[0]==='toast').length,0);assert.equal((c.music.capture()as any).cue.id,1019);const requests=c.f.requests.length;gate.resolve(c.f.files.values().next().value);await flush();assert.equal(c.f.requests.length,requests);assert.equal((c.music.capture()as any).cue.id,1019);
 }finally{gate.resolve(c.f.files.values().next().value);await c.dispose();}
});

test('a newer map does not hide a genuine Context permission rejection from the first gesture',async()=>{
 const c=fixture(),permission=deferred();try{
  await c.music.playMap(c.map,{hour:12,flags:{}});c.f.controls.resume=()=>permission.promise;c.unlockSound();c.state.map=73;c.map=map(73);c.syncMusic();await c.musicRequestPending;permission.reject(Error('Permission remains blocked'));await flush();assert.equal(c.music.isUnlocked(),false);assert.equal(c.soundUnlocked,false);assert.match(c.musicError,/Permission remains blocked/);assert.equal(c.log.filter((v:any)=>Array.isArray(v)&&v[0]==='toast').length,1);
 }finally{permission.resolve();await c.dispose();}
});

for(const holdResponse of[false,true])test('a failed first song after delayed Context resume stays retryable when the newer locked map response is '+(holdResponse?'pending':'settled'),async()=>{
 const c=fixture(),permission=deferred(),response=deferred(),entered=deferred();try{
  await c.music.playMap(c.map,{hour:12,flags:{}});c.f.controls.resume=async()=>{await permission.promise;c.f.contexts[0].state='running';};c.unlockSound();const unlocking=c.unlockPending;
  if(holdResponse){const play=c.music.playMap.bind(c.music);let hold=true;c.music.playMap=async(...args:any[])=>{const result=await play(...args);if(hold&&args[0].id===73){hold=false;entered.resolve();await response.promise;}return result;};}
  c.state.map=73;c.map=map(73);c.syncMusic();if(holdResponse)await entered.promise;else await c.musicRequestPending;
  c.f.controls.fetch=async()=>{throw Error('Offline after permission succeeded');};permission.resolve();await assert.rejects(unlocking,/None of the original audio formats/);await flush();response.resolve();await c.musicRequestPending;await flush();await c.musicRequestPending;assert.equal(c.music.isUnlocked(),true);assert.notEqual(c.musicError,'');assert.equal(c.musicStatus().canRetry,true);assert.equal(c.log.filter((v:any)=>Array.isArray(v)&&v[0]==='toast').length,1);assert.equal(c.f.requests.length,2,'failed current song is reported without automatic re-download');c.unlockSound();await flush();assert.equal(c.f.requests.length,2);c.f.controls.fetch=undefined;await c.retryMusic();assert.equal((c.music.capture()as any).cue.id,1019);
 }finally{permission.resolve();response.resolve();await c.dispose();}
});

test('text/camera preferences do not touch audio, and explicit Retry exposes observable retryability',async()=>{
 const c=fixture();try{await c.prepare();let preferences=0,requests=0;const original=c.music.setPreferences.bind(c.music);c.music.setPreferences=(value:any)=>{preferences++;return original(value);};c.controls.playMap=async()=>{requests++;throw Error('offline');};c.updatePreferencesActual({...c.preferences,textSpeed:2,cameraSensitivity:1.3});await flush();assert.equal(preferences,0);assert.equal(requests,0);assert.equal(c.state.options.textSpeed,2);
  const statuses:any[]=[],unwatch=c.watchMusic(()=>statuses.push({...c.musicStatus()}));c.syncMusic();await c.musicRequestPending;assert.equal(c.musicStatus().canRetry,true);assert.equal(c.musicStatus().pending,false);assert.ok(statuses.some(s=>s.pending));const notices=c.log.filter((v:any)=>Array.isArray(v)&&v[0]==='toast').length;await c.retryMusic();assert.equal(requests,2);assert.equal(c.log.filter((v:any)=>Array.isArray(v)&&v[0]==='toast').length,notices);unwatch();const length=statuses.length;await c.retryMusic();assert.equal(statuses.length,length);
  c.musicFailed(new UnsupportedNativeMusic('Source cue unavailable'));assert.equal(c.musicStatus().canRetry,false);const before=requests;await c.retryMusic();assert.equal(requests,before);
 }finally{await c.dispose();}
});

test('late map success cannot erase a newer map failure diagnostic',async()=>{
 const c=fixture();try{const old=deferred(),latest=deferred();c.controls.playMap=(m:any)=>m.id===60?old.promise:latest.promise;c.syncMusic();c.state.map=73;c.map=map(73);c.syncMusic();latest.reject(Error('current map unavailable'));await flush();assert.match(c.musicError,/current map unavailable/);old.resolve({status:'playing'});await flush();assert.match(c.musicError,/current map unavailable/);assert.equal(c.log.filter((v:any)=>Array.isArray(v)&&v[0]==='toast').length,1);
 }finally{await c.dispose();}
});

test('rapid volume changes ignore a superseded request even when the final content key is unchanged',async()=>{
 const c=fixture();try{await c.prepare();const old=deferred(),latest=deferred();let requests=0;c.controls.playMap=()=>++requests===1?old.promise:latest.promise;c.syncMusic();c.updatePreferencesActual({...c.preferences,volume:.2});c.updatePreferencesActual({...c.preferences,volume:.55});await flush();assert.ok(requests>=2);assert.equal(c.preferences.volume,.55);latest.resolve({status:'playing'});await c.musicRequestPending;old.reject(Error('same-map request replaced'));await flush();assert.equal(c.musicError,'');assert.equal(c.log.filter((v:any)=>Array.isArray(v)&&v[0]==='toast').length,0);
 }finally{await c.dispose();}
});

test('actual battle setup uses the source trainer class, first living wild species and native cue selector',async()=>{
 for(const sample of[{trainer:0,enemies:[mon(16)],cue:'SEQ_GS_VS_GYMREADER'},{trainer:1,enemies:[mon(16)],cue:'SEQ_GS_VS_RIVAL'},{trainer:null,enemies:[mon(native.ids.SPECIES_RAIKOU,0),mon(155)],cue:'SEQ_GS_VS_NORAPOKE'},{trainer:null,enemies:[mon(native.ids.SPECIES_RAIKOU)],cue:'SEQ_GS_VS_RAIKOU'}]){const c=fixture();try{await c.prepare();await c.startBattle(sample.enemies,sample.trainer);const setup=c.log.find((v:any)=>Array.isArray(v)&&v[0]==='setup')[1],cue=c.log.find((v:any)=>Array.isArray(v)&&v[0]==='cue')[1];assert.equal(setup.battleType,sample.trainer===null?0:1);assert.equal(setup.trainerClass,sample.trainer===null?undefined:native.ids[c.data.trainers[sample.trainer].class]);assert.equal(setup.leadSpecies,sample.enemies.find(m=>m.hp>0)?.species);assert.equal(cue.key,sample.cue);const battle=c.log.find((v:any)=>Array.isArray(v)&&v[0]==='battle');assert.equal(battle[3].weather,3);assert.equal(battle[3].noCritical,undefined,'ordinary rival battles retain native critical hits');
 }finally{await c.dispose();}}
});

test('awaited cue preparation locks movement, menu, save, source frames and keyboard/drag camera before Battle.active',async()=>{
 const c=fixture();try{await c.prepare();const gate=deferred(),fetchEntered=deferred(),actualFetch=c.f.files;c.f.controls.fetch=async(url:string)=>{fetchEntered.resolve();await gate.promise;return actualFetch.get(url).slice(0);};c.controls.battleGate=deferred();c.controls.battleEntered=deferred();const pending=c.startBattle([mon(16)]);await fetchEntered.promise;assert.equal(c.battle.active,false);assert.equal(c.battleSoundOwned,true);c.keys.add('KeyQ');c.keys.add('KeyW');const yaw=c.world.yaw;c.syncInputContext();c.renderInputActual(.02);await c.step(3);await c.menu();assert.equal(c.save(),false);c.map.initTriggers=[{var:'VAR_MUSIC_FRAME',value:0,script:90}];assert.equal(await c.checkFrameTriggers(),false);assert.equal(c.cameraAllowed(),false);c.listeners.get('keydown')({code:'KeyE',preventDefault(){}});assert.equal(c.keys.has('KeyE'),false);assert.equal(c.world.yaw,yaw);assert.equal(c.log.some((v:any)=>v==='menu'||v==='step'||Array.isArray(v)&&v[0]==='script'),false);assert.equal(c.log.findLast((v:any)=>Array.isArray(v)&&v[0]==='touch-context')[1].movement,false);c.map.initTriggers=[];gate.resolve();await c.controls.battleEntered.promise;assert.equal(c.battle.active,true);assert.equal(c.battleSoundOwned,true);c.controls.battleGate.resolve();await pending;assert.equal(c.battleSoundOwned,false);assert.equal(c.cameraAllowed(),true);assert.equal((c.music.capture()as any).positionSeconds,6);assert.equal(c.f.sources.at(-1).offset,6);
 }finally{await c.dispose();}
});

test('a stalled shared catalog yields to the battle deadline without starting a late cue',async()=>{
 const c=fixture(),gate=deferred(),entered=deferred();let clock:ReturnType<typeof deadlineClock>|undefined,pending:Promise<any>|undefined;
 try{await c.music.unlock();clock=deadlineClock(c);c.f.controls.load=()=>{entered.resolve();return gate.promise;};c.controls.battleGate=deferred();pending=c.startBattle([mon(16)]);await entered.promise;await clock.advance(1500);assert.equal(c.battle.active,true);assert.equal(c.f.sources.length,0);gate.resolve(c.f.catalog);await flush();assert.equal(c.f.sources.length,0,'the shared catalog may finish, but its cancelled battle caller cannot start a cue');c.controls.battleGate.resolve();await pending;assert.equal(c.battleSoundOwned,false);assert.equal((c.music.capture()as any).cue.id,1018);
 }finally{gate.resolve(c.f.catalog);c.controls.battleGate?.resolve();try{await pending?.catch(()=>{});await c.dispose();await flush();}finally{clock?.restore();}}
});

for(const stage of['fetch','decode']as const)test('a stalled '+stage+' cannot delay battle past the preparation deadline or start a late cue',async()=>{
 const c=fixture(),gate=deferred(),entered=deferred();let clock:ReturnType<typeof deadlineClock>|undefined,pending:Promise<any>|undefined;
 try{await c.prepare();clock=deadlineClock(c);c.controls.battleGate=deferred();
  if(stage==='fetch')c.f.controls.fetch=async(url:string)=>{entered.resolve();await gate.promise;return c.f.files.get(url).slice(0);};else c.f.controls.decode=async()=>{entered.resolve();await gate.promise;return{numberOfChannels:2,duration:10};};
  pending=c.startBattle([mon(16)]);await entered.promise;await clock.advance(1499);assert.equal(c.battle.active,false);await clock.advance(1);assert.equal(c.battle.active,true,'optional music preparation must yield to the battle at1500ms');assert.equal(c.f.sources.length,1);gate.resolve();await flush();assert.equal(c.f.sources.length,1,'late preparation cannot publish a battle voice');c.f.controls.fetch=undefined;c.f.controls.decode=undefined;c.controls.battleGate.resolve();await pending;assert.equal(c.battleSoundOwned,false);assert.equal((c.music.capture()as any).cue.id,1018);
 }finally{gate.resolve();c.controls.battleGate?.resolve();c.f.controls.fetch=undefined;c.f.controls.decode=undefined;try{await pending?.catch(()=>{});await c.dispose();await flush();}finally{clock?.restore();}}
});

test('a stalled blackout restore releases gameplay at the return deadline and late bytes cannot beat a newer map',async()=>{
 const c=fixture(),gate=deferred(),entered=deferred();let clock:ReturnType<typeof deadlineClock>|undefined,pending:Promise<any>|undefined;
 try{await c.prepare();clock=deadlineClock(c);c.controls.result='lost';const blackout=c.whiteOut;c.whiteOut=async()=>{await blackout();c.f.controls.fetch=async(url:string)=>{entered.resolve();await gate.promise;return c.f.files.get(url).slice(0);};};pending=c.startBattle([mon(16)]);await entered.promise;assert.equal(c.battleSoundOwned,true);assert.equal(c.f.sources[1].stopped,true);await clock.advance(1500);assert.equal(c.battleSoundOwned,false,'return music must not hold gameplay beyond1500ms');await pending;await c.menu();assert.ok(c.log.includes('menu'));assert.ok(c.pendingMusicRestores.size);
  await clock.advance(4000);await c.musicRequestPending;c.f.controls.fetch=undefined;c.state.map=61;c.map=map(61);c.syncMusic();await c.musicRequestPending;assert.equal((c.music.capture()as any).cue.id,1018);const voices=c.f.sources.length;gate.resolve();await flush();assert.equal(c.f.sources.length,voices);assert.equal((c.music.capture()as any).cue.id,1018);assert.equal(c.pendingMusicRestores.size,0);
 }finally{gate.resolve();c.f.controls.fetch=undefined;try{await pending?.catch(()=>{});await c.dispose();await flush();}finally{clock?.restore();}}
});

test('unreleased prior interruption fails new combat closed; retry after real cleanup owns exactly one parent',async()=>{
 const c=fixture(),gate=deferred(),entered=deferred();let clock:ReturnType<typeof deadlineClock>|undefined,pending:Promise<any>|undefined;
 try{await c.prepare();clock=deadlineClock(c);
  const session=c.music.createCueSession(),signal=new AbortController();await session.start({id:1019,key:'SEQ_GS_C_YOSHINO'},signal.signal);const saved=c.music.capture();signal.abort();c.state.map=73;c.map=map(73);
  c.f.catalog.maps['73']={day:{id:1014,key:'SEQ_GS_NAMINORI'},night:{id:1014,key:'SEQ_GS_NAMINORI'}};
  c.f.controls.fetch=async(url:string)=>{entered.resolve();await gate.promise;return c.f.files.get(url).slice(0);};c.pendingMusicRestores.add((signal?:AbortSignal)=>session.restore(signal));c.pendingMusicRestores.add((signal?:AbortSignal)=>c.music.field.restore(saved,signal));c.syncMusic();await entered.promise;
  pending=c.startBattle([mon(16)]);await clock.advance(1500);assert.equal(c.battle.active,false,'cannot fabricate a battle parent through retained ownership');await clock.advance(1500);await pending;
  assert.equal(c.battleSoundOwned,false);assert.equal(c.sourceActions.busy,false);assert.equal(c.log.some((row:any)=>Array.isArray(row)&&row[0]==='battle'),false);assert.equal(c.state.money,3000);assert.ok(c.log.some((row:any)=>Array.isArray(row)&&row[0]==='choice'&&row[1]==='Scene not completed'));assert.ok(c.pendingMusicRestores.size);assert.notEqual(c.musicError,'');
  c.f.controls.fetch=undefined;gate.resolve();await flush();await c.musicRequestPending;await c.retryMusicRestores();await c.startBattle([mon(16)]);
  assert.equal(c.log.filter((row:any)=>Array.isArray(row)&&row[0]==='battle').length,1,JSON.stringify({log:c.log.slice(-30),lastError:c.lastError,musicError:c.musicError}));assert.equal(c.battleSoundOwned,false);assert.equal((c.music.capture()as any).cue.id,1014);assert.equal(c.pendingMusicRestores.size,0);
 }finally{gate.resolve();c.f.controls.fetch=undefined;try{await pending?.catch(()=>{});await c.dispose();await flush();}finally{clock?.restore();}}
});

test('failed cue decoding still runs the battle with old field phase paused, then restores it',async()=>{
 const c=fixture();try{await c.prepare();const entered=deferred();c.f.controls.fetch=async()=>{throw Error('audio decoder unavailable');};c.controls.battleGate=deferred();const start=c.battle.start.bind(c.battle);c.battle.start=async(...args:any[])=>{entered.resolve();return start(...args);};const pending=c.startBattle([mon(16)]);await entered.promise;assert.equal(c.battleSoundOwned,true);assert.equal(c.battle.active,true);assert.equal(c.f.sources.length,1);c.f.contexts[0].currentTime=50;assert.equal((c.music.capture()as any).positionSeconds,6);assert.ok(c.log.some((v:any)=>Array.isArray(v)&&v[0]==='suspend'));c.controls.battleGate.resolve();await pending;assert.equal(c.battleSoundOwned,false);assert.equal(c.f.sources.at(-1).offset,6);assert.equal(c.music.capture().kind,'playing');
 }finally{await c.dispose();}
});

test('battle throw restores its actual field phase and releases the audio host lock without saving a battle result',async()=>{
 const c=fixture();try{await c.prepare();c.controls.battleError=Error('Battle view failed');const before=structuredClone(c.state);const result=await c.startBattle([mon(16)]);assert.equal(result,false);assert.equal(c.state.money,before.money);assert.deepEqual(c.state.party,before.party);assert.ok(c.log.some((row:any)=>row[0]==='choice'&&row[1]==='Scene not completed'));assert.equal(c.sourceActions.busy,false);assert.equal(c.battleSoundOwned,false);assert.equal(c.battle.active,false);assert.equal((c.music.capture()as any).positionSeconds,6);assert.equal(c.f.sources.at(-1).offset,6);assert.equal(c.writes.length,1,'Return saves the recovered checkpoint, not a battle result');assert.equal(c.writes[0].money,before.money);assert.equal(c.log.some((v:any)=>Array.isArray(v)&&v[0]==='entry'),false);
 }finally{await c.dispose();}
});

test('blackout retains music ownership until the desired spawn map is known, then restores only that map and resumes its frame scene once',async()=>{
 const c=fixture();try{await c.prepare();c.controls.result='lost';c.controls.blackoutGate=deferred();c.controls.blackoutEntered=deferred();c.controls.blackoutTrigger=true;const pending=c.startBattle([mon(16)]);await c.controls.blackoutEntered.promise;assert.equal(c.battleSoundOwned,true);assert.equal(c.f.sources.length,2,'old field voice must not restart while blackout destination is loading');assert.equal(c.log.some((v:any)=>Array.isArray(v)&&v[0]==='restore'),false);c.controls.blackoutGate.resolve();await pending;assert.equal(c.state.map,73);assert.equal(c.state.money,2990);assert.equal(c.battleSoundOwned,false);assert.equal((c.music.capture()as any).cue.id,1019);assert.equal(c.f.sources.at(-1).offset,0);assert.ok(c.log.filter((v:any)=>Array.isArray(v)&&v[0]==='map-music').every((v:any)=>v[1]===73));assert.deepEqual(c.log.filter((v:any)=>Array.isArray(v)&&v[0]==='script'),[['script',90,false]]);assert.deepEqual(c.log.filter((v:any)=>Array.isArray(v)&&v[0]==='entry'),[['entry','warp',false]],'standalone blackout defers real warp entry until ownership releases');
 }finally{await c.dispose();}
});

test('retained destination restore ownership recovers only through explicit Retry or a newer map intent',async()=>{
 for(const retry of['explicit-retry','new-map']){const c=fixture();try{await c.prepare();c.controls.result='lost';const blackout=c.whiteOut;c.whiteOut=async()=>{await blackout();c.f.controls.badDuration=true;};await c.startBattle([mon(16)]);await c.musicRequestPending;assert.ok(c.pendingMusicRestores.size);assert.notEqual(c.musicError,'');c.f.controls.badDuration=false;
   c.unlockSound();assert.ok(c.pendingMusicRestores.size,'ordinary gestures do not retry the failed song');if(retry==='explicit-retry')await c.retryMusic();else{c.state.map=61;c.map=map(61);c.syncMusic();}
   await c.musicRequestPending;assert.equal((c.music.capture()as any).cue?.id,retry==='new-map'?1018:1019,'retry must resume the current intended cue');assert.equal(c.pendingMusicRestores.size,0);assert.equal(c.musicError,'');
  }finally{await c.dispose();}
 }
});

test('an unavailable return-map music selection never leaves the completed battle cue looping in the field',async()=>{
 const c=fixture();try{await c.prepare();c.controls.result='lost';delete c.f.catalog.maps['73'];await c.startBattle([mon(16)]);await c.musicRequestPending;assert.equal(c.battleSoundOwned,false);assert.ok(c.pendingMusicRestores.size,'a later valid map can still retry restoration');assert.equal(c.f.sources[1].stopped,true,'battle cue must stop even when return-map selection fails');
 }finally{await c.dispose();}
});

test('actual catching-tutorial hook uses the shared native cue owner and battleType 1<<10, then resumes source entry after release',async()=>{
 const c=fixture();try{await c.prepare();c.controls.tutorialGate=deferred();c.controls.tutorialEntered=deferred();const pending=c.tutorialActual();await c.controls.tutorialEntered.promise;assert.equal(c.battleSoundOwned,true);const setup=c.log.find((v:any)=>Array.isArray(v)&&v[0]==='setup')[1];assert.equal(setup.battleType,1<<10);assert.equal(setup.leadSpecies,19);assert.equal(setup.trainerClass,undefined);assert.equal(c.log.find((v:any)=>Array.isArray(v)&&v[0]==='cue')[1].key,'SEQ_GS_VS_NORAPOKE');assert.deepEqual({...c.log.find((v:any)=>Array.isArray(v)&&v[0]==='tutorial-battle')[3]},{tutorial:true});c.controls.tutorialGate.resolve();await pending;assert.equal(c.battleSoundOwned,false);assert.deepEqual(c.log.filter((v:any)=>Array.isArray(v)&&v[0]==='entry'),[['entry','resume',false]]);assert.equal((c.music.capture()as any).positionSeconds,6);
 }finally{await c.dispose();}
});
