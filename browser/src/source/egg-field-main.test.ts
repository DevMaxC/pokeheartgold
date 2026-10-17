import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createContext,runInContext} from 'node:vm';
import {fileURLToPath,pathToFileURL} from 'node:url';

// Executes the host's actual function bodies and hook initializer, not a
// reconstructed event loop. HG_REVIEW_ROOT permits testing an integration tree
// before cherry-picking this test-only commit. World/audio/tween/UI are ports.
const root=process.env.HG_REVIEW_ROOT??fileURLToPath(new URL('../../../',import.meta.url)).replace(/\/$/,'');
const load=path=>import(pathToFileURL(root+'/'+path).href);
const ts=(await load('browser/node_modules/typescript/lib/typescript.js')).default;
const THREE=await load('browser/node_modules/three/build/three.module.js');
const {loadData,newState,createMon,giveMon}=await load('browser/src/source/data.ts');
const {giveTogepiEgg,firstFollowerMon,isUsableBattler}=await load('browser/src/source/eggs.ts');
const {advancePartyEggStep,recordEggHatchEvent}=await load('browser/src/source/egg-hatching.ts');
const {presentNativeEggHatch}=await load('browser/src/source/egg-hatch-presentation.ts');
const {createNativeHatchMusicSession}=await load('browser/src/source/hatch-music.ts');
const {ScriptVM,UnsupportedScript}=await load('browser/src/source/script.ts');
const {FieldObjects}=await load('browser/src/source/objects.ts');
const {SourceActionRecovery,SourceTriggerGate,runRecoverableSourceAction,runFieldBattleAction}=await load('browser/src/source/script-recovery.ts');
const {TrainerAttemptLatch,trainerEventPriority}=await load('browser/src/source/trainer-encounters.ts');
const {doorwayEntry}=await load('browser/src/source/terrain.ts');
const {ledgeDirection,jumpHeight}=await load('browser/src/source/ledges.ts');
const {pushWarp,stepWarpFacing,fieldEntryScripts}=await load('browser/src/source/field-transitions.ts');
const {NATIVE_GAME_STAT_RULES:statRules}=await load('browser/src/source/game-stat-rules.ts');
const {gymFieldEntry}=await load('browser/src/source/gym-violet.ts');
const {movementAction}=await load('browser/src/source/movement.ts');
const {sourceJSON}=await load('browser/src/source/types.ts');
globalThis.fetch=async input=>new Response(await readFile(root+'/browser/public'+String(input)));
const data=await loadData(),nativeMap=await sourceJSON('maps/73.json');
const main=await readFile(root+'/browser/src/source/main.ts','utf8');
const ast=ts.createSourceFile('main.ts',main,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const functions=new Map(ast.statements.filter(ts.isFunctionDeclaration).map(node=>[node.name?.text,node.getText(ast)]));
const names=['save','tweenPlayer','captureField','restoreField','executeSourceAction','runScript','checkFrameTriggers','checkEvents','step','moveActor','hatchEgg','startBattle','wildEncounter','runFieldEntry','enterMap'];
for(const name of names)assert.ok(functions.has(name),'actual main function missing: '+name);
const begin=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='begin');
let vmInitializer;function visit(node){if(ts.isBinaryExpression(node)&&node.left.getText(ast)==='vm'&&ts.isNewExpression(node.right)&&node.right.expression.getText(ast)==='ScriptVM')vmInitializer=node.right.getText(ast);ts.forEachChild(node,visit);}visit(begin);assert.ok(vmInitializer,'actual begin ScriptVM initializer');
let render;function findRender(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='render')render=node;ts.forEachChild(node,findRender);}findRender(ast);
const renderStatements=render.body.statements;
const leadIndex=renderStatements.findIndex(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>d.name.getText(ast)==='lead'));
assert.ok(leadIndex>0,'actual render follower block');
// Include the pending-commit release immediately before lead selection, then
// the actual lead/construction/visibility statements. No copied condition.
const release=renderStatements[leadIndex-1].getText(ast);
assert.ok(release.includes('hatchFollowerPendingCommit'),'host must retain hatch follower ownership through source commit');
const renderFollower=[release,...renderStatements.slice(leadIndex,leadIndex+3).map(node=>node.getText(ast))].join('\n');
assert.match(main,/addEventListener\('pagehide',save\)/,'pagehide uses the same tested save binding');
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const boundSource=names.map(name=>functions.get(name)).join('\n')+'\nfunction renderFollowerActual(){'+renderFollower+'}\n';
const sourceHash=createHash('sha256').update(boundSource+'\n'+vmInitializer).digest('hex');
const mainHash=createHash('sha256').update(main).digest('hex');
after(async()=>assert.equal(createHash('sha256').update(await readFile(root+'/browser/src/source/main.ts')).digest('hex'),mainHash,'actual main changed during binding tests; rerun against the settled host')); 
const copy=value=>JSON.parse(JSON.stringify(value));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
const fixedDate=new Date(2026,9,17,12);
class FieldDate extends Date{constructor(...args){super(...(args.length?args:[fixedDate.getTime()]));}}
const unexpected=()=>{throw Error('Unexpected unrelated main adapter');};
async function fixture({counter=4,readyEgg=false,fainted=false}={}){
 const state=newState(data,'Ethan','boy',()=>.5);Object.assign(state,{map:73,x:10.5,z:10.5,fieldHeight:3,trainerId:123,nativeEggSeed:1,eggCycleSteps:counter});state.options.sound=false;
 state.party=[createMon(data,155,5,state.name,()=>.5)];if(fainted)state.party[0].hp=0;
 giveTogepiEgg(data,state,{now:()=>fixedDate});state.party[1].friendship=readyEgg?0:2;
 const map=structuredClone(nativeMap);map.events.coords=[];map.events.warps=[];map.initTriggers=[];map.initScripts={};
 const actor={...structuredClone(nativeMap.events.objects[0]),id:'fixture_actor',x:2,z:3,eventFlag:'FLAG_NOTHING'};map.events.objects=[actor];
 const objects=new FieldObjects(data,state);objects.load(map.events.objects);
 const player={group:new THREE.Group()},follower={group:new THREE.Group()};player.group.position.set(state.x,3,state.z);follower.group.position.set(state.x,3,state.z+1);
 const log=[],writes=[],controls={blocked:false,behavior:0,permission:undefined,tween:undefined,reveal:undefined,cry:undefined,finish:undefined,choice:1,nickname:'Pip',failedChoices:[1],trainer:false,warp:undefined,afterMessage:undefined};
 const world={scene:new THREE.Scene(),npcSprites:new Map(),yaw:1.2,pitch:.5,distance:17,sky:{currentWeather:7},violetGym:{riderHeight:null},height:()=>3,permission:(x,z)=>controls.permission?.(x,z)??controls.behavior,walkable:()=>!controls.blocked,terrainWalkable:()=>!controls.blocked,owner:()=>state.map,beginFieldTransition(){log.push('transition-begin');},endFieldTransition(){log.push('transition-end');},clearScriptCameraTarget(){log.push('clear-camera');},map:async()=>map,enter:async(_id,x,z,weather,height)=>{log.push(['restore',x,z,weather,height]);return map;},clearNPCs(){},removePaper:actor=>{actor.group.removeFromParent();log.push('remove-paper');return true;},paper:key=>{log.push(['paper',key]);return{group:new THREE.Group()};},animate(){}};
 const ui={busy:false,loading(){},message:async(text,_wait,signal)=>{log.push(['message',text]);await controls.afterMessage?.(text,signal);return()=>{};},choose:async(title,options,_detail,signal)=>{log.push(['choice',title]);if(title==='The area could not be restored.')throw Error('fixture hydration failed');if(title==='Scene not completed'){await controls.failedPrompt?.();return controls.failedChoices.shift()??1;}return typeof controls.choice==='function'?controls.choice(title,options,signal):controls.choice;},input:async()=>controls.nickname};
 ui.printMessage=ui.message;
 class HatchView{constructor(_world,actors,options){this.actors=actors;this.signal=options.signal;log.push(['hatch-view-cry',options.cry]);}async reveal(scene){log.push('reveal');assert.equal(state.party[1].isEgg,false);await controls.reveal?.(scene,this.signal);}async cry(scene){log.push('cry');log.push(['cry-request',scene.cry]);await controls.cry?.(scene,this.signal);}async finish(){log.push('finish');await controls.finish?.();}cancel(){log.push('cancel');}}
 const c={state,data,map,objects,world,player,follower,ui,battle:{active:false,start:unexpected},ready:true,started:true,walking:false,transitioning:false,recoveryPrompt:false,hatching:false,hatchFollowerPendingCommit:false,followSpecies:155,followMon:state.party[0],followerSuppressed:false,playerDirectionLocked:false,followerFacing:1,followerMoving:false,followerStep:-1,followerPrevious:null,playerTweenY:undefined,previousStepJump:false,stepFrame:-1,restoringGym:false,lastWarp:'',lastCoord:'',lastError:'',keys:new Set(),drag:false,npcTweenY:new Map(),trainerApproachTasks:new Map(),frameTriggerGate:new SourceTriggerGate(),trainerAttempts:new TrainerAttemptLatch(),deltas:[{x:0,z:-1},{x:0,z:1},{x:-1,z:0},{x:1,z:0}],Date:FieldDate,Promise,AbortController,structuredClone,console:{error(){},warn:console.warn},SAVE_KEY:'test-native-save',localStorage:{setItem:(_key,text)=>writes.push(JSON.parse(text))},ScriptVM,UnsupportedScript,SourceActionRecovery,runRecoverableSourceAction,runFieldBattleAction,trainerEventPriority,firstFollowerMon,isUsableBattler,advancePartyEggStep,recordEggHatchEvent,presentNativeEggHatch,createNativeHatchMusicSession,WorldEggHatchView:HatchView,doorwayEntry,ledgeDirection,jumpHeight,pushWarp,stepWarpFacing,fieldEntryScripts,movementAction,gymFieldEntry,createMon,giveMon,
  tween:async(seconds,frame)=>{log.push(['tween',seconds,state.x,state.z,c.sourceActions.busy]);frame(.5);await controls.tween?.();frame(1);},encounterChecks:{step(){log.push('encounter-step');},reset(){},roll(){assert.equal(c.sourceActions.busy,false,'wild admission must follow committed step');return true;}},landSlot:()=>0,
  tryTrainerEncounter:async()=>{log.push('trainer');return controls.trainer;},warp:async(...args)=>{log.push(['warp',...args]);await controls.warp?.();},enterMap:unexpected,
  scriptCameraMovement:()=>null,setScriptCameraTarget:unexpected,SCRIPT_CAMERA_ACTOR:241,beginTrainerPath:unexpected,finishTrainerPath:unexpected,whiteOut:unexpected,setPosition:unexpected,face:unexpected,showPerson:unexpected,chooseStarter:unexpected,trainerBattle:unexpected,mapWeather:()=>7,refreshNPCs(){log.push('refresh');},updateHUD(){},requestAnimationFrame:unexpected};
 createContext(c);runInContext(compile(boundSource+'\nvm='+vmInitializer+';'),c);c.sourceActions=new SourceActionRecovery(state,{capture:()=>c.captureField(),restore:(snapshot,error)=>c.restoreField(snapshot,error)});
 const wildActual=c.wildEncounter;c.wildEncounter=async()=>{log.push('wild-admission');return wildActual();};
 return Object.assign(c,{log,writes,controls});
}
function stat(c){return c.state.gameStats?.[data.constants.GAME_STAT_EGGS_HATCHED]??0;}
function counts(c){return c.log.filter(v=>Array.isArray(v)&&v[0]==='tween');}

 test('actual production functions/hooks are bound and ordinary/ledge completed movement counts once',async t=>{
 t.diagnostic('main SHA256 '+mainHash+'; extracted bindings SHA256 '+sourceHash);
 for(const jumping of[false,true]){const c=await fixture();if(jumping)c.controls.permission=(_x,z)=>Math.floor(z)===11?59:0;await c.step(1);assert.equal(c.state.eggCycleSteps,5);assert.equal(c.state.z,jumping?12.5:11.5);assert.equal(counts(c).length,1);assert.equal(counts(c)[0][1],jumping?.42:.25);assert.equal(counts(c)[0][4],true);assert.equal(c.log.filter(v=>v==='encounter-step').length,1);assert.equal(c.log.filter(v=>v==='wild-admission').length,1);}
 });

 test('blocked, occupied, exit push and real scripted player/camera movement do not tick daycare',async()=>{
 const blocked=await fixture();blocked.controls.blocked=true;await blocked.step(1);assert.equal(blocked.state.eggCycleSteps,4);assert.equal(counts(blocked).length,0);
 const occupied=await fixture();const group=new THREE.Group();group.position.set(10.5,3,11.5);occupied.world.npcSprites.set('blocking',{group});await occupied.step(1);assert.equal(occupied.state.eggCycleSteps,4);
 const exit=await fixture();exit.map.events.warps=[{x:10,z:10}];exit.controls.behavior=61;await exit.step(1);assert.equal(exit.state.eggCycleSteps,4);assert.equal(counts(exit).length,0);assert.ok(exit.log.some(v=>Array.isArray(v)&&v[0]==='warp'));
 const scripted=await fixture();const source={...scripted.map,scripts:{labels:{walk:0},instructions:[['WalkSouth',['1']],['EndMovement',[]]]}};await scripted.moveActor('obj_player','walk',source);assert.equal(scripted.state.z,11.5);assert.equal(scripted.state.eggCycleSteps,4);let cameraMoves=0;scripted.scriptCameraMovement=async()=>{cameraMoves++;};await scripted.moveActor('241','walk',source);assert.equal(cameraMoves,1);assert.equal(scripted.state.eggCycleSteps,4);
 });

 test('actual step event arbitration consumes frame, trainer, coordinate and warp before ready Egg/wild',async()=>{
 for(const priority of['frame','trainer','coord','warp']){const c=await fixture({counter:254,readyEgg:true});
  if(priority==='frame'||priority==='coord'){c.map.scripts={labels:{priority:0},entries:['priority'],instructions:[['SetFlag',['FLAG_GOT_BAG']],['SetVar',['VAR_SPECIAL_RESULT','1']],['End',[]]]};if(priority==='frame')c.map.initTriggers=[{var:'VAR_SPECIAL_RESULT',value:0,script:'priority'}];else c.map.events.coords=[{x:10,z:11,w:1,h:1,var:'0',val:0,scriptId:'priority'}];}
  if(priority==='trainer')c.controls.trainer=true;
  if(priority==='frame'||priority==='trainer'){c.map.events.coords=[{x:10,z:11,w:1,h:1,var:'0',val:0,scriptId:'lower-priority-coordinate'}];}
  if(priority!=='warp')c.map.events.warps=[{x:10,z:11}];c.controls.behavior=103;
  if(priority==='warp'){c.map.events.warps=[{x:10,z:11}];c.controls.behavior=103;}
  await c.step(1);assert.equal(c.state.eggCycleSteps,254,priority);assert.equal(c.state.party[1].isEgg,true);assert.equal(stat(c),0);assert.ok(!c.log.includes('reveal'));assert.ok(!c.log.includes('wild-admission'));assert.equal(c.log.filter(v=>Array.isArray(v)&&v[0]==='warp').length,priority==='warp'?1:0);if(priority==='frame')assert.equal(c.log.filter(v=>v==='trainer').length,0);if(priority==='frame'||priority==='coord')assert.equal(c.state.flags.FLAG_GOT_BAG,true);
 }
 // Cross a real enterMap connection with OnTransition and a one-shot frame
 // condition. If enterMap consumes the frame result internally, checkEvents
 // sees the cleared condition and incorrectly permits daycare/wild admission.
 for(const readyEgg of[false,true]){const c=await fixture({counter:readyEgg?254:4,readyEgg}),destination=structuredClone(await sourceJSON('maps/74.json'));
  destination.events={...destination.events,objects:[],coords:[],warps:[]};destination.initScripts={OnTransition:'transition'};destination.initTriggers=[{var:'VAR_SPECIAL_RESULT',value:0,script:'arrival-frame'}];
  destination.scripts={labels:{transition:0,'arrival-frame':2},entries:['transition','arrival-frame'],instructions:[['SetFlag',['FLAG_GOT_BAG']],['End',[]],['SetVar',['VAR_SPECIAL_RESULT','1']],['Message',['connection-frame-consumed']],['End',[]]]};
  c.world.owner=(_x,z)=>Math.floor(z)===11?destination.id:73;c.world.map=async id=>id===destination.id?destination:c.map;c.world.connect=async(id,x,z)=>{c.log.push(['connect',id,x,z]);return destination;};
  await c.step(1);assert.equal(c.state.map,destination.id);assert.equal(c.state.flags.FLAG_GOT_BAG,true,'real OnTransition ran');assert.equal(c.vm.value('VAR_SPECIAL_RESULT',destination),1,'frame script cleared its condition');assert.equal(c.log.filter(v=>Array.isArray(v)&&v[0]==='message'&&v[1]==='connection-frame-consumed').length,1);assert.equal(c.log.filter(v=>Array.isArray(v)&&v[0]==='connect').length,1);assert.equal(c.state.eggCycleSteps,readyEgg?254:4,'consumed connection frame precedes daycare');assert.equal(c.state.party[1].isEgg,true);assert.equal(stat(c),0);assert.ok(!c.log.includes('reveal'));assert.ok(!c.log.includes('wild-admission'),'consumed connection frame cannot launch wild');assert.equal(c.log.filter(v=>v==='trainer').length,0);
 }
 });

 test('eligible step executes real standard2021 Oh, hatch hook, memo/Dex/Elm and one event award before commit',async()=>{
 const c=await fixture({counter:254,readyEgg:true});await c.step(1);
 assert.equal(c.vm.lastUnsupported,null);assert.ok(c.vm.supported.has('EggHatchAnim'));assert.ok(c.log.some(v=>Array.isArray(v)&&v[0]==='message'&&v[1].includes('Oh?')));assert.equal(c.state.eggCycleSteps,0);assert.equal(stat(c),1);assert.equal(c.state.gameStats[statRules.scoreStat],statRules.scoreModifiers[data.constants.SCORE_EVENT_HATCHED_EGG]+statRules.scoreModifiers[data.constants.SCORE_EVENT_REGISTER_SPECIES_CAUGHT]);assert.equal(c.state.party[1].isEgg,false);assert.equal(c.state.party[1].provenance.metLocation,data.constants.MAPSEC_VIOLET_CITY);assert.deepEqual(c.state.caught,[175]);assert.equal(c.state.flags.FLAG_SYS_HATCHED_TOGEPI_EGG,true);assert.deepEqual(c.state.phoneTriggers,[data.constants.CALL_TRIGGER_ELM_EGG_HATCHED]);assert.equal(c.sourceActions.busy,false);assert.ok(c.writes.length);assert.equal(c.writes.at(-1).party[1].isEgg,false);
 // The real main audio factory is called per invocation: a failed reveal,
 // its explicit Retry and a later second Egg must not reuse a closed session.
 const audio=await fixture({counter:254,readyEgg:true}),sessions=[];audio.state.options.sound=true;audio.controls.failedChoices=[0];let reveals=0;
 audio.createNativeHatchMusicSession=options=>{const record={enabled:options.enabled,prepared:[],tracks:[],disposed:false,session:null};const transport={prepare:async(asset,signal)=>{assert.equal(signal.aborted,false);record.prepared.push(asset.id);},play:async(asset,signal)=>{assert.equal(signal.aborted,false);assert.deepEqual(record.prepared,[1011,1188],'both original tracks are ready before playback');record.tracks.push([asset.id,asset.key]);return{ended:Promise.resolve(),pause(){},resume(){},stop(){}};},dispose:async()=>{record.disposed=true;}};record.session=createNativeHatchMusicSession({...options,transport,wait:async()=>{}});sessions.push(record);return record.session;};
 audio.controls.reveal=async()=>{if(++reveals===1)throw Error('retry enabled hatch after music started');};await audio.step(1);
 assert.equal(sessions.length,2);assert.notEqual(sessions[0].session,sessions[1].session);assert.deepEqual(sessions.map(row=>row.tracks),[[[1011,'SEQ_GS_SHINKA']],[[1011,'SEQ_GS_SHINKA'],[1188,'SEQ_ME_SHINKAOME']]]);assert.ok(sessions.every(row=>row.enabled&&row.disposed));
 giveTogepiEgg(data,audio.state,{now:()=>fixedDate});audio.state.party[2].friendship=0;audio.state.eggCycleSteps=254;await audio.step(1);
 assert.equal(sessions.length,3);assert.equal(new Set(sessions.map(row=>row.session)).size,3);assert.deepEqual(sessions[2].tracks,[[1011,'SEQ_GS_SHINKA'],[1188,'SEQ_ME_SHINKAOME']]);assert.equal(sessions[2].disposed,true);assert.equal(stat(audio),2);assert.equal(audio.state.party[2].isEgg,false);
 const viewCryOptions=audio.log.filter(row=>Array.isArray(row)&&row[0]==='hatch-view-cry');assert.equal(viewCryOptions.length,3);assert.ok(viewCryOptions.every(row=>row[1]===undefined),'enabled main requests the native view cry default');assert.deepEqual(audio.log.filter(row=>Array.isArray(row)&&row[0]==='cry-request').map(row=>copy(row[1])),[{species:175,form:0},{species:175,form:0}]);
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'AudioContext');let allocations=0;Object.defineProperty(globalThis,'AudioContext',{configurable:true,value:class{constructor(){allocations++;throw Error('muted host must never allocate audio');}}});
 try{const muted=await fixture({counter:254,readyEgg:true});await muted.step(1);assert.equal(muted.state.party[1].isEgg,false);assert.equal(allocations,0);const cry=muted.log.find(row=>Array.isArray(row)&&row[0]==='hatch-view-cry')[1];assert.equal(typeof cry,'function');await cry({cry:{species:175,form:0}},new AbortController().signal);assert.equal(allocations,0);}finally{if(descriptor)Object.defineProperty(globalThis,'AudioContext',descriptor);else delete globalThis.AudioContext;}
 });

 test('Return after hatch failure restores pre-tween position, source state, live actor, height and orbit',async()=>{
 const c=await fixture({counter:254,readyEgg:true});c.objects.position('fixture_actor',4,5);const before=copy(c.state),actors=copy(c.objects.save(c.state.map));
 c.controls.reveal=async()=>{c.objects.position('fixture_actor',20,20);c.world.yaw=2;c.world.pitch=.8;c.world.distance=8;c.player.group.position.y=40;c.state.vars.FAILURE=1;c.state.phoneTriggers=[999];throw Error('interrupt reveal');};
 await c.step(1);assert.deepEqual(copy(c.state.party),before.party);for(const key of['x','z','eggCycleSteps','nativeEggSeed','flags','vars','phoneTriggers','seen','caught','gameStats'])assert.deepEqual(copy(c.state[key]??null),before[key]??null,key);assert.deepEqual(copy(c.objects.save(c.state.map)),actors);assert.deepEqual([c.player.group.position.y,c.world.yaw,c.world.pitch,c.world.distance],[3,1.2,.5,17]);assert.equal(c.sourceActions.busy,false);assert.equal(c.hatching,false);assert.equal(c.writes.at(-1).x,10.5);assert.equal(c.writes.at(-1).z,10.5);
 });

 test('explicit Retry replays the captured movement/date once and awards only the successful hatch',async()=>{
 const c=await fixture({counter:254,readyEgg:true});c.controls.failedChoices=[0];let attempts=0;
 c.controls.reveal=async()=>{if(++attempts===1){c.state.x=999;c.state.z=999;c.state.facing=0;fixedDate.setMonth(11,25);throw Error('first reveal failed');}};
 try{await c.step(1);}finally{fixedDate.setMonth(9,17);}
 assert.equal(attempts,2);assert.deepEqual(counts(c).map(v=>v.slice(1,4)),[[.25,10.5,10.5],[.25,10.5,10.5]]);assert.equal(c.state.z,11.5);assert.equal(c.state.facing,1);assert.equal(c.state.eggCycleSteps,0);assert.equal(stat(c),1);assert.equal(c.state.party[1].isEgg,false);assert.equal(c.sourceActions.busy,false);
 });

 test('actual save/pagehide binding excludes reveal, cry, nickname and resume until source ownership ends',async()=>{
 for(const phase of['reveal','cry','nickname','finish']){const c=await fixture({counter:254,readyEgg:true}),entered=deferred(),release=deferred();c.controls.choice=0;
  const pause=async()=>{entered.resolve();await release.promise;return'Pip';};if(phase==='nickname')c.ui.input=pause;else c.controls[phase]=pause;
  const pending=c.step(1);await entered.promise;const writes=c.writes.length;c.save();assert.equal(c.writes.length,writes,phase);assert.equal(c.sourceActions.busy,true);assert.equal(c.state.party[1].isEgg,false);assert.ok(c.state.gameStats);release.resolve();await pending;assert.equal(c.sourceActions.busy,false);assert.ok(c.writes.length>writes);assert.equal(c.writes.at(-1).party[1].isEgg,false);
 }
 });

 test('actual render freezes provisional replacement follower through hatch and post-view source tail',async()=>{
 const c=await fixture({counter:254,readyEgg:true,fainted:true}),entered=deferred(),release=deferred();c.controls.finish=async()=>{entered.resolve();await release.promise;};const pending=c.step(1);await entered.promise;
 c.renderFollowerActual();assert.equal(c.log.filter(v=>Array.isArray(v)&&v[0]==='paper').length,0);assert.equal(c.followSpecies,155);
 // A source command/tail may still own the action after the view's finally.
 c.hatching=false;c.renderFollowerActual();assert.equal(c.followSpecies,155);assert.equal(c.hatchFollowerPendingCommit,true);release.resolve();await pending;c.renderFollowerActual();assert.equal(c.hatchFollowerPendingCommit,false);assert.equal(c.followSpecies,175);assert.equal(c.log.filter(v=>Array.isArray(v)&&v[0]==='paper').length,1);
 });

 test('actual wild admission runs after step commit and completed catch survives failed field resume',async()=>{
 const c=await fixture();const bank=data.encounters.find(e=>e.land?.rate&&e.land.mons[0]);assert.ok(bank);c.map.fields.wildEncounterBank='ENCDATA_'+bank.map;c.controls.behavior=2;
 const caught=[];c.battle.start=async enemies=>{assert.equal(c.state.z,11.5);assert.equal(c.state.eggCycleSteps,5);assert.ok(c.writes.some(save=>save.z===11.5&&save.eggCycleSteps===5),'completed step durable before fight');giveMon(c.state,enemies[0]);caught.push(enemies[0].species);return'caught';};
 c.map.initScripts.OnResume='bad_resume';c.map.scripts={labels:{bad_resume:0},entries:['bad_resume'],instructions:[['SetFlag',['FLAG_GOT_BAG']],['UnportedAfterWildCatch',[]],['End',[]]]};await c.step(1);
 assert.equal(caught.length,1);assert.equal(c.state.party.length,3);assert.equal(c.state.party[2].species,caught[0]);assert.ok(c.state.caught.includes(caught[0]));assert.equal(c.state.flags.FLAG_GOT_BAG,undefined);assert.equal(c.state.z,11.5);assert.equal(c.sourceActions.busy,false);assert.equal(c.writes.at(-1).party.length,3);assert.equal(c.vm.lastUnsupported.command,'UnportedAfterWildCatch');
 });

 test('actual Return merges trainer pauses only at the restored pre-step tile, preserving new local failures',async()=>{
 for(const newLocalFailure of[false,true]){const c=await fixture({counter:254,readyEgg:true});assert.equal(c.trainerAttempts.admit(c.state,'blocked-before-step'),true);
  c.controls.reveal=async()=>{assert.equal(c.state.z,11.5);assert.equal(c.trainerAttempts.admit(c.state,'failed-at-destination'),true);throw Error('hatch after crossing tile');};
  if(newLocalFailure)c.controls.failedPrompt=async()=>{assert.equal(c.state.z,10.5);c.trainerAttempts.admit(c.state,'new-failure-at-restored-tile');};
  await c.step(1);assert.deepEqual([c.state.x,c.state.z],[10.5,10.5]);assert.equal(c.trainerAttempts.admit(c.state,'blocked-before-step'),false,'next poll must retain the pre-step pause');if(newLocalFailure)assert.equal(c.trainerAttempts.admit(c.state,'new-failure-at-restored-tile'),false);assert.equal(c.trainerAttempts.admit(c.state,'failed-at-destination'),true,'destination failures must not leak to restored tile');assert.equal(c.state.eggCycleSteps,254);
 }
 });
