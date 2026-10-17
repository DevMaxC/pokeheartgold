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
const {createHatchHostAudio}=await load('browser/src/source/hatch-host-audio.ts');
const {fieldInput,fieldInputFacing}=await load('browser/src/source/field-input.ts');
const {momSavingsActive,settleMomBattleMoney}=await load('browser/src/source/mom-savings.ts');
const {FieldPhoneHost}=await load('browser/src/source/phone-field-host.ts');
const {phoneCall}=await load('browser/src/source/phone.ts');
const {ScriptVM,UnsupportedScript}=await load('browser/src/source/script.ts');
const {findCoordinateTrigger}=await load('browser/src/source/coordinate-triggers.ts');
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
const phoneRules=await sourceJSON('phone-triggers.json');
const data=await loadData(),nativeMap=await sourceJSON('maps/73.json');
const main=await readFile(root+'/browser/src/source/main.ts','utf8');
const ast=ts.createSourceFile('main.ts',main,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const functions=new Map(ast.statements.filter(ts.isFunctionDeclaration).map(node=>[node.name?.text,node.getText(ast)]));
const names=['abortBagUse','resetFieldInput','running','retainFieldInput','textDelay','save','tweenPlayer','captureField','restoreField','executeSourceAction','runScript','checkFrameTriggers','checkEvents','step','moveActor','hatchEgg','startBattle','wildEncounter','runFieldEntry','enterMap','pollFieldInput','refreshPhoneIndicator','answerPhone','fieldRTCObservation','pollPhoneAdmission','scriptWarp'];
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
const pagehideListeners=ast.statements.flatMap(statement=>{const found=[];function scan(node){if(ts.isCallExpression(node)&&node.expression.getText(ast)==='addEventListener'&&ts.isStringLiteral(node.arguments[0])&&node.arguments[0].text==='pagehide')found.push(node.arguments[1]);ts.forEachChild(node,scan);}scan(statement);return found;});
assert.equal(pagehideListeners.length,1,'one actual pagehide callback');const pagehideCallback=pagehideListeners[0].getText(ast);
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const renderPhone=renderStatements.filter(node=>(ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>d.name.getText(ast)==='rtc'))||(ts.isExpressionStatement(node)&&(/^(fieldPhone\.advanceRTC|refreshPhoneIndicator)/).test(node.getText(ast)))).map(node=>node.getText(ast)).join('\n');
assert.match(functions.get('fieldRTCObservation'),/Date.now\(\)/,'phone seconds use one explicit browser RTC observation');
const boundSource=names.map(name=>functions.get(name)).join('\n')+'\nfunction pagehideActual(){return ('+pagehideCallback+')();}\nfunction renderFollowerActual(){'+renderFollower+'}\nfunction renderPhoneActual(){'+renderPhone+'}\n';
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
 const log=[],writes=[],controls={blocked:false,behavior:0,permission:undefined,tween:undefined,reveal:undefined,cry:undefined,finish:undefined,choice:1,nickname:'Pip',failedChoices:[1],trainer:false,warp:undefined,afterMessage:undefined,rtcSeconds:1000};
 const world={scene:new THREE.Scene(),npcSprites:new Map(),yaw:1.2,pitch:.5,distance:17,sky:{currentWeather:7},violetGym:{riderHeight:null},height:()=>3,permission:(x,z)=>controls.permission?.(x,z)??controls.behavior,walkable:()=>!controls.blocked,terrainWalkable:()=>!controls.blocked,owner:()=>state.map,beginFieldTransition(){log.push('transition-begin');},endFieldTransition(){log.push('transition-end');},clearScriptCameraTarget(){log.push('clear-camera');},map:async()=>map,enter:async(_id,x,z,weather,height)=>{log.push(['restore',x,z,weather,height]);return map;},clearNPCs(){},removePaper:actor=>{actor.group.removeFromParent();log.push('remove-paper');return true;},paper:key=>{log.push(['paper',key]);return{group:new THREE.Group()};},animate(){}};
 const ui={busy:false,loading(){},message:async(text,_wait,signal)=>{log.push(['message',text]);await controls.afterMessage?.(text,signal);return()=>{};},choose:async(title,options,_detail,signal)=>{log.push(['choice',title]);if(title==='The area could not be restored.')throw Error('fixture hydration failed');if(title==='This area could not load.')throw Error('fixture map load failed');if(title==='Scene not completed'){await controls.failedPrompt?.();return controls.failedChoices.shift()??1;}return typeof controls.choice==='function'?controls.choice(title,options,signal):controls.choice;},input:async()=>controls.nickname};
 ui.printMessage=ui.message;
 class HatchView{constructor(_world,actors,options){this.actors=actors;this.signal=options.signal;this.audioCry=options.cry;log.push(['hatch-view-cry',options.cry]);}async reveal(scene){log.push('reveal');assert.equal(state.party[1].isEgg,false);await controls.reveal?.(scene,this.signal);}async cry(scene){log.push('cry');log.push(['cry-request',scene.cry]);await controls.cry?.(scene,this.signal);await this.audioCry(scene,this.signal);}async finish(){log.push('finish');await controls.finish?.();}cancel(){log.push('cancel');}}
 const phoneButton={hidden:true,dataset:{},setAttribute(name,value){this[name]=value;}},fieldPhone=new FieldPhoneHost(phoneRules,controls.rtcSeconds,12);
 const audioNodes=[],audioGains=[],audioTransports=[],audioFactories=[],audioLifetime=new AbortController();
 const context={state:'running',sampleRate:48000,createGain(){const gain={context,gain:{value:1},connect(){},disconnect(){this.disconnected=true;}};audioGains.push(gain);return gain;},createBufferSource(){const node={buffer:null,onended:null,started:false,stopped:false,disconnected:false,connect(){},disconnect(){this.disconnected=true;},start(){this.started=true;queueMicrotask(()=>this.onended?.());},stop(){this.stopped=true;}};audioNodes.push(node);return node;},async decodeAudioData(bytes){const view=new DataView(bytes);return{duration:view.getUint32(40,true)/view.getUint32(24,true),numberOfChannels:view.getUint16(22,true)};}};
 const music={field:{capture(){return{kind:'none'};},async suspend(saved){log.push('music-suspend');return saved;},async restore(){log.push('music-restore');}},sharedAudioOutput(){log.push('shared-audio-output');assert.equal(state.options.sound,true,'muted native adapter must never request output');return{context,output:{context},signal:audioLifetime.signal};},createHatchTransport(){const record={prepared:[],tracks:[],disposed:false};audioTransports.push(record);return{async prepare(asset,signal){assert.equal(signal.aborted,false);record.prepared.push(asset.id);},async play(asset,signal){assert.equal(signal.aborted,false);assert.deepEqual(record.prepared,[1011,1188],'both original cues prepare before playback');record.tracks.push([asset.id,asset.key]);const ended=deferred();void ended.promise.catch(()=>{});if(asset.id===1188)ended.resolve();return{ended:ended.promise,pause(){},resume(){},stop(){ended.resolve();}};},async dispose(){record.disposed=true;}};}};
 const c={fieldActors:undefined,state,data,map,objects,ordinaryInputOwners:0,preservedControlScripts:0,sourceSceneOwners:0,connecting:false,battleSoundOwned:false,activeBagUse:null,preferences:{textSpeed:1,music:false,volume:.37},music,MUSIC_WAIT_MS:1500,musicRequestPending:null,unlockPending:null,musicRequestSerial:0,musicKey:'',pendingMusicRestores:new Set(),syncMusic(){log.push('sync-music');},musicFailed(error){log.push(['music-error',String(error)]);},touch:{read:()=>({horizontal:0,forward:0,run:false}),reset(){log.push('touch-reset');}},camera:{reset(){log.push('camera-reset');}},fieldInput,fieldInputFacing,momSavingsActive,settleMomBattleMoney,withBattleMusic:async(_enemies,_trainer,action)=>action(),createHatchHostAudio:ports=>{const audio=createHatchHostAudio({...ports,wait:async milliseconds=>{log.push(['hatch-audio-wait',milliseconds]);}});audioFactories.push({enabled:ports.enabled,audio});return audio;},DOMException,fieldPhone,fieldPolling:false,phoneCall,$:id=>{assert.equal(id,'phone-ring');return phoneButton;},world,player,follower,ui,battle:{active:false,start:unexpected},ready:true,started:true,walking:false,transitioning:false,recoveryPrompt:false,hatching:false,hatchFollowerPendingCommit:false,followSpecies:155,followMon:state.party[0],followerSuppressed:false,playerDirectionLocked:false,followerFacing:1,followerMoving:false,followerStep:-1,followerPrevious:null,playerTweenY:undefined,previousStepJump:false,stepFrame:-1,restoringGym:false,lastWarp:'',lastCoord:'',lastError:'',keys:new Set(),drag:false,npcTweenY:new Map(),trainerApproachTasks:new Map(),frameTriggerGate:new SourceTriggerGate(),phoneAdmissionGate:new SourceTriggerGate(),trainerAttempts:new TrainerAttemptLatch(),deltas:[{x:0,z:-1},{x:0,z:1},{x:-1,z:0},{x:1,z:0}],Date:class extends FieldDate{static now(){return controls.rtcSeconds*1000;}},Promise,AbortController,structuredClone,console:{error(){},warn:console.warn},SAVE_KEY:'test-native-save',localStorage:{setItem:(_key,text)=>writes.push(JSON.parse(text))},findCoordinateTrigger,ScriptVM,UnsupportedScript,SourceActionRecovery,runRecoverableSourceAction,runFieldBattleAction,trainerEventPriority,firstFollowerMon,isUsableBattler,advancePartyEggStep,recordEggHatchEvent,presentNativeEggHatch,WorldEggHatchView:HatchView,doorwayEntry,ledgeDirection,jumpHeight,pushWarp,stepWarpFacing,fieldEntryScripts,movementAction,gymFieldEntry,createMon,giveMon,
  tween:async(seconds,frame)=>{log.push(['tween',seconds,state.x,state.z,c.sourceActions.busy]);frame(.5);await controls.tween?.();frame(1);},encounterChecks:{step(){log.push('encounter-step');},reset(){},roll(){assert.equal(c.sourceActions.busy,false,'wild admission must follow committed step');return true;}},landSlot:()=>0,
  tryTrainerEncounter:async()=>{log.push('trainer');return controls.trainer;},warp:async(...args)=>{log.push(['warp',...args]);await controls.warp?.();},enterMap:unexpected,
  scriptCameraMovement:()=>null,setScriptCameraTarget:unexpected,SCRIPT_CAMERA_ACTOR:241,beginTrainerPath:unexpected,finishTrainerPath:unexpected,whiteOut:unexpected,setPosition:unexpected,face:unexpected,showPerson:unexpected,chooseStarter:unexpected,trainerBattle:unexpected,mapWeather:()=>7,refreshNPCs(){log.push('refresh');},updateHUD(){},requestAnimationFrame:unexpected};
 createContext(c);runInContext(compile(boundSource+'\nvm='+vmInitializer+';'),c);c.sourceActions=new SourceActionRecovery(state,{capture:()=>c.captureField(),restore:(snapshot,error)=>c.restoreField(snapshot,error)});
 const wildActual=c.wildEncounter;c.wildEncounter=async()=>{log.push('wild-admission');return wildActual();};
 return Object.assign(c,{log,writes,controls,phoneButton,audioFactories,audioTransports,audioNodes,audioGains});
}
function stat(c){return c.state.gameStats?.[data.constants.GAME_STAT_EGGS_HATCHED]??0;}
function counts(c){return c.log.filter(v=>Array.isArray(v)&&v[0]==='tween');}

test('ordinary Passerby trainer admission does not request the special first-battle critical suppression',async()=>{
 const ids=Object.keys(data.trainers).map(Number).filter(id=>data.trainers[id].class==='TRAINERCLASS_PASSERBY');assert.ok(ids.length>0);
 for(const id of ids){const c=await fixture(),requests=[];c.battle.start=async(_enemy,trainer,options)=>{requests.push({trainer,options});return'ran';};
  await c.startBattle([createMon(data,152,5,'Silver',()=>.5)],id,true);
  assert.deepEqual(copy(requests),[{trainer:id,options:{weather:7}}]);
 }
});

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
 const audio=await fixture({counter:254,readyEgg:true});audio.state.options.sound=true;audio.preferences.music=true;audio.controls.failedChoices=[0];let reveals=0;
 audio.controls.reveal=async()=>{if(++reveals===1)throw Error('retry enabled hatch after music started');};await audio.step(1);
 assert.equal(audio.audioFactories.length,2);assert.notEqual(audio.audioFactories[0].audio,audio.audioFactories[1].audio);assert.deepEqual(audio.audioTransports.map(row=>row.tracks),[[[1011,'SEQ_GS_SHINKA']],[[1011,'SEQ_GS_SHINKA'],[1188,'SEQ_ME_SHINKAOME']]]);assert.ok(audio.audioFactories.every(row=>row.enabled()));assert.ok(audio.audioTransports.every(row=>row.disposed));
 giveTogepiEgg(data,audio.state,{now:()=>fixedDate});audio.state.party[2].friendship=0;audio.state.eggCycleSteps=254;await audio.step(1);
 assert.equal(audio.audioFactories.length,3);assert.equal(new Set(audio.audioFactories.map(row=>row.audio)).size,3);assert.deepEqual(audio.audioTransports[2].tracks,[[1011,'SEQ_GS_SHINKA'],[1188,'SEQ_ME_SHINKAOME']]);assert.equal(audio.audioTransports[2].disposed,true);assert.equal(stat(audio),2);assert.equal(audio.state.party[2].isEgg,false);
 const viewCryOptions=audio.log.filter(row=>Array.isArray(row)&&row[0]==='hatch-view-cry');assert.equal(viewCryOptions.length,3);assert.deepEqual(viewCryOptions.map(row=>row[1]),audio.audioFactories.map(row=>row.audio.cry),'each actual view receives its fresh shared-adapter cry');assert.deepEqual(audio.log.filter(row=>Array.isArray(row)&&row[0]==='cry-request').map(row=>copy(row[1])),[{species:175,form:0},{species:175,form:0}]);assert.equal(audio.audioNodes.length,2);assert.ok(audio.audioNodes.every(node=>node.started&&node.stopped&&node.disconnected&&node.buffer.numberOfChannels===1&&node.buffer.duration===5380/10512));assert.ok(audio.audioGains.every(gain=>gain.gain.value===120/127));assert.ok(!audio.log.some(row=>Array.isArray(row)&&row[0]==='music-error'));
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'AudioContext');let allocations=0;Object.defineProperty(globalThis,'AudioContext',{configurable:true,value:class{constructor(){allocations++;throw Error('muted host must never allocate audio');}}});
 try{const muted=await fixture({counter:254,readyEgg:true});await muted.step(1);assert.equal(muted.state.party[1].isEgg,false);assert.equal(allocations,0);assert.equal(muted.audioFactories.length,1);assert.equal(muted.audioFactories[0].enabled(),false);assert.equal(muted.audioTransports.length,0);assert.equal(muted.audioNodes.length,0);assert.ok(!muted.log.includes('shared-audio-output'));assert.equal(muted.log.find(row=>Array.isArray(row)&&row[0]==='hatch-view-cry')[1],muted.audioFactories[0].audio.cry);assert.equal(allocations,0);}finally{if(descriptor)Object.defineProperty(globalThis,'AudioContext',descriptor);else delete globalThis.AudioContext;}
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
  const pending=c.step(1);await entered.promise;const writes=c.writes.length,bag=new AbortController();c.activeBagUse=bag;c.keys.add('KeyW');const resets=c.log.filter(row=>row==='touch-reset'||row==='camera-reset').length;c.pagehideActual();assert.equal(bag.signal.aborted,true,phase);assert.equal(c.keys.size,0,phase);assert.equal(c.log.filter(row=>row==='touch-reset'||row==='camera-reset').length,resets+2,phase);assert.equal(c.writes.length,writes,phase);assert.equal(c.sourceActions.busy,true);assert.equal(c.state.party[1].isEgg,false);assert.ok(c.state.gameStats);release.resolve();await pending;assert.equal(c.sourceActions.busy,false);assert.ok(c.writes.length>writes);assert.equal(c.writes.at(-1).party[1].isEgg,false);
 }
 });

 test('actual AST pagehide callback aborts Bag input, resets both controllers and saves only an idle stable field',async()=>{
 const c=await fixture(),bag=new AbortController();c.activeBagUse=bag;c.keys.add('KeyS');const before=c.writes.length;c.pagehideActual();assert.equal(bag.signal.aborted,true);assert.equal(bag.signal.reason.name,'AbortError');assert.equal(c.keys.size,0);assert.deepEqual(c.log.slice(-2),['touch-reset','camera-reset']);assert.equal(c.writes.length,before+1);assert.equal(c.writes.at(-1).fieldHeight,3);assert.deepEqual(copy(c.writes.at(-1).objectEvents),copy(c.objects.save(c.state.map)));
 for(const key of['walking','transitioning','recoveryPrompt','battleSoundOwned']){c[key]=true;const writes=c.writes.length;c.pagehideActual();assert.equal(c.writes.length,writes,key);c[key]=false;}
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

function queueElm(c){c.state.phoneTriggers=[0];c.state.flags.FLAG_SYS_HATCHED_TOGEPI_EGG=true;c.fieldPhone.triggerQueued(0,true);c.controls.rtcSeconds=1060;c.renderPhoneActual();}
async function ringElm(c){queueElm(c);await c.pollFieldInput();c.refreshPhoneIndicator();assert.equal(c.fieldPhone.current().kind,'elm');assert.equal(c.phoneButton.hidden,false);}

test('actual hatch event boosts fresh phone timing; explicit render RTC then native idle poll rings without immediate dialogue',async()=>{
 const c=await fixture({counter:254,readyEgg:true});await c.step(1);assert.equal(c.fieldPhone.snapshot().ring.elapsedMinutes,9);assert.equal(c.fieldPhone.current().kind,'none');
 await c.pollFieldInput();assert.equal(c.fieldPhone.current().kind,'none');c.controls.rtcSeconds=1059;c.renderPhoneActual();await c.pollFieldInput();assert.equal(c.fieldPhone.current().kind,'none');
 c.controls.rtcSeconds=1060;c.renderPhoneActual();await c.pollFieldInput();c.refreshPhoneIndicator();assert.equal(c.fieldPhone.current().kind,'elm');assert.equal(c.phoneButton.hidden,false);assert.deepEqual(c.state.phoneTriggers,[0]);
 assert.equal(c.log.filter(row=>Array.isArray(row)&&row[0]==='message'&&row[1].startsWith('Professor Elm:')).length,0,'ringing is optional, not an automatic phone dialogue');
});

test('actual answer consumes only Elm0 with native incoming13 text and gates save until dialogue commits',async()=>{
 const c=await fixture({counter:254,readyEgg:true});await c.step(1);c.controls.rtcSeconds=1060;c.renderPhoneActual();await c.pollFieldInput();c.state.phoneTriggers.push(12);
 const entered=deferred(),release=deferred();c.controls.afterMessage=async text=>{entered.resolve(text);await release.promise;};const before=c.writes.length,pending=c.answerPhone();const text=await entered.promise;assert.ok(text.startsWith('Professor Elm:'));assert.ok(text.includes('show me'));assert.ok(!text.includes('{STRVAR'));
 assert.deepEqual(c.state.phoneTriggers,[12]);assert.equal(c.sourceActions.busy,true);c.save();assert.equal(c.writes.length,before);c.controls.rtcSeconds=5000;c.renderPhoneActual();assert.equal(c.fieldPhone.snapshot().rtcAnchor,1060,'answer owns the RTC observation until its transaction resolves');
 release.resolve();await pending;assert.equal(c.fieldPhone.current().kind,'none');assert.equal(c.phoneButton.hidden,true);assert.equal(c.state.party[1].isEgg,false);assert.equal(stat(c),1);assert.deepEqual(c.writes.at(-1).phoneTriggers,[12]);assert.equal(c.sourceActions.busy,false);
});

test('actual failed answer restores ringing/pending and earlier hatch; explicit Retry replays the same call once',async()=>{
 for(const retry of[false,true]){const c=await fixture({counter:254,readyEgg:true});await c.step(1);c.controls.rtcSeconds=1060;c.renderPhoneActual();await c.pollFieldInput();const checkpoint=c.fieldPhone.snapshot();let messages=0;c.controls.failedChoices=[retry?0:1];
  c.controls.afterMessage=async()=>{if(++messages===1)throw Error('phone text failed');};await c.answerPhone();assert.equal(c.state.party[1].isEgg,false);assert.equal(stat(c),1);assert.equal(c.state.flags.FLAG_SYS_HATCHED_TOGEPI_EGG,true);assert.equal(messages,retry?2:1);assert.equal(c.sourceActions.busy,false);
  if(retry){assert.deepEqual(c.state.phoneTriggers,[]);assert.equal(c.fieldPhone.current().kind,'none');}else{assert.deepEqual(c.state.phoneTriggers,[0]);assert.deepEqual(c.fieldPhone.snapshot(),checkpoint);assert.equal(c.fieldPhone.current().kind,'elm');assert.equal(c.phoneButton.hidden,false);}
 }
});

test('actual post-memo hatch failure rolls back the fresh boost with the whole preceding step',async()=>{
 const c=await fixture({counter:254,readyEgg:true}),before=c.fieldPhone.snapshot();c.controls.choice=0;c.ui.input=async()=>{assert.equal(c.fieldPhone.snapshot().ring.elapsedMinutes,9);throw Error('nickname failed after fresh native phone event');};await c.step(1);
 assert.equal(c.state.party[1].isEgg,true);assert.equal(stat(c),0);assert.deepEqual(c.state.phoneTriggers??[],[]);assert.deepEqual(c.fieldPhone.snapshot(),before);assert.equal(c.state.z,10.5);
});

test('actual render clock expires only after native30 seconds, leaves pending, and Continue does not freshly boost',async()=>{
 const c=await fixture();await ringElm(c);c.controls.rtcSeconds=1061;c.renderPhoneActual();c.controls.rtcSeconds=1091;c.renderPhoneActual();assert.equal(c.phoneButton.hidden,false);c.controls.rtcSeconds=1092;c.renderPhoneActual();assert.equal(c.phoneButton.hidden,true);assert.deepEqual(c.state.phoneTriggers,[0]);
 const saved=JSON.parse(JSON.stringify(c.state));c.fieldPhone=new FieldPhoneHost(phoneRules,1092,12);Object.assign(c.state,saved);c.controls.rtcSeconds=1152;c.renderPhoneActual();await c.pollFieldInput();assert.equal(c.fieldPhone.snapshot().ring.elapsedMinutes,1);assert.equal(c.fieldPhone.current().kind,'none');
});

test('actual idle admission waits behind frame/trainer/coordinate/warp/Egg/wild events, but blocked movement can ring',async()=>{
 for(const priority of['frame','trainer','coord','warp','egg','wild','blocked','ordinary']){const c=await fixture({counter:priority==='egg'?254:4,readyEgg:priority==='egg'});queueElm(c);c.world.yaw=0;c.keys.add('KeyS');
  if(priority==='frame'||priority==='coord'){c.map.scripts={labels:{priority:0},entries:['priority'],instructions:[['SetVar',['VAR_SPECIAL_RESULT','1']],['End',[]]]};if(priority==='frame')c.map.initTriggers=[{var:'VAR_SPECIAL_RESULT',value:0,script:'priority'}];else c.map.events.coords=[{x:10,z:11,w:1,h:1,var:'0',val:0,scriptId:'priority'}];}
  if(priority==='trainer')c.controls.trainer=true;if(priority==='warp'){c.map.events.warps=[{x:10,z:11}];c.controls.behavior=103;}
  if(priority==='wild'){const bank=data.encounters.find(e=>e.land?.rate&&e.land.mons[0]);c.map.fields.wildEncounterBank='ENCDATA_'+bank.map;c.controls.behavior=2;c.battle.start=async()=> 'won';}
  if(priority==='blocked')c.controls.blocked=true;await c.pollFieldInput();assert.equal(c.fieldPhone.current().kind,['blocked','ordinary'].includes(priority)?'elm':'none',priority);assert.equal(c.fieldPolling,false);
 }
});

test('actual native scenes reset only active rings and answer respects trainer/UI admission',async()=>{
 const c=await fixture();await ringElm(c);c.controls.trainer=true;await c.answerPhone();assert.deepEqual(c.state.phoneTriggers,[0]);assert.equal(c.fieldPhone.current().kind,'elm');c.controls.trainer=false;c.ui.busy=true;await c.answerPhone();assert.equal(c.fieldPhone.current().kind,'elm');c.ui.busy=false;
 c.map.scripts={labels:{scene:0},entries:['scene'],instructions:[['End',[]]]};await c.runScript('scene','obj_player',false,false,true);assert.equal(c.fieldPhone.current().kind,'none');assert.deepEqual(c.state.phoneTriggers,[0]);
 c.fieldPhone.triggerQueued(0,true);await c.runScript('scene','obj_player',false,false,true);assert.equal(c.fieldPhone.snapshot().ring.elapsedMinutes,9,'inactive interval survives scene reset');
});

test('actual HUD and answer keep unsupported forced callers explicit and unconsumed',async()=>{
 const c=await fixture();c.state.phoneTriggers=[2];c.fieldPhone.triggerQueued(2,true);c.controls.rtcSeconds=1060;c.renderPhoneActual();await c.pollFieldInput();c.refreshPhoneIndicator();assert.equal(c.fieldPhone.current().kind,'unsupported');assert.equal(c.phoneButton.hidden,true);await c.answerPhone();assert.deepEqual(c.state.phoneTriggers,[2]);assert.ok(!c.log.some(row=>Array.isArray(row)&&row[0]==='message'));
});

function phoneDraws(c,values){const math=Object.create(Math);let draws=0;math.random=()=>{assert.equal(c.sourceActions.busy,true,'due caller admission owns the save gate');assert.ok(draws<values.length,'unexpected caller RNG draw');const value=values[draws++];if(value instanceof Error)throw value;return value;};c.Math=math;return()=>draws;}
function advanceEmptyPhoneInterval(c){c.controls.rtcSeconds=1060;c.renderPhoneActual();c.controls.rtcSeconds=1600;c.renderPhoneActual();assert.equal(c.fieldPhone.snapshot().ring.elapsedMinutes,10);}

test('actual due empty admission resets its interval once; a later hatch waits for the next native minute',async()=>{
 const c=await fixture({counter:254,readyEgg:true});c.state.pokegear={contacts:['PHONE_CONTACT_MOTHER','PHONE_CONTACT_PROF__ELM','PHONE_CONTACT_PROF__OAK'],cards:[]};const draws=phoneDraws(c,[0,0,0]);advanceEmptyPhoneInterval(c);const before=c.writes.length;await c.pollFieldInput();assert.equal(c.fieldPhone.snapshot().ring.elapsedMinutes,0);assert.equal(c.fieldPhone.current().kind,'none');assert.equal(draws(),2);assert.equal(c.writes.length,before+1);
 await c.pollFieldInput();assert.equal(draws(),2);assert.equal(c.writes.length,before+1,'idle render polling must not repeatedly save');await c.step(1);assert.equal(c.fieldPhone.snapshot().ring.elapsedMinutes,9);await c.pollFieldInput();assert.equal(c.fieldPhone.current().kind,'none');c.controls.rtcSeconds=1660;c.renderPhoneActual();await c.pollFieldInput();assert.equal(c.fieldPhone.current().kind,'elm');assert.equal(draws(),3);
});

test('actual selected random caller retains its native active interval until the hatch scene resets it',async()=>{
 const c=await fixture({counter:254,readyEgg:true}),joey=phoneRules.randomCallers.find(row=>row.key==='PHONE_CONTACT_JOEY');assert.equal(joey.group,1);c.state.pokegear={contacts:[joey.key],cards:[]};const draws=phoneDraws(c,[0,500/65536,0,0]);advanceEmptyPhoneInterval(c);await c.pollFieldInput();const call=c.fieldPhone.current();assert.equal(call.kind,'unsupported');assert.equal(call.call.scripted,0);assert.equal(call.call.contact,joey.id);assert.equal(draws(),3);await c.pollFieldInput();assert.equal(draws(),3);assert.equal(c.state.phoneRecentCallers,undefined,'unanswered random calls do not add recent history');
 await c.step(1);assert.equal(c.fieldPhone.current().kind,'none');assert.equal(c.fieldPhone.snapshot().ring.elapsedMinutes,9);await c.pollFieldInput();assert.equal(c.fieldPhone.current().kind,'none');c.controls.rtcSeconds=1660;c.renderPhoneActual();await c.pollFieldInput();assert.equal(c.fieldPhone.current().kind,'elm');assert.equal(draws(),4);
});

test('actual due rotation clearing rolls back on caller selection failure and Retry reuses its earlier draws',async()=>{
 for(const retry of[false,true]){const c=await fixture(),joey=phoneRules.randomCallers.find(row=>row.key==='PHONE_CONTACT_JOEY'),chunk=phoneRules.recentCallerChunks[joey.group];c.state.pokegear={contacts:[joey.key],cards:[]};c.state.phoneRecentCallers=Array(8).fill(255);c.state.phoneRecentCallers[chunk.offset]=joey.id;const before=[...c.state.phoneRecentCallers],draws=phoneDraws(c,retry?[0,500/65536,Error('MT caller selection failed'),0]:[0,500/65536,Error('MT caller selection failed')]);advanceEmptyPhoneInterval(c);c.controls.failedChoices=[retry?0:1];c.controls.failedPrompt=async()=>{assert.deepEqual(c.state.phoneRecentCallers,before);c.save();assert.equal(c.writes.length,0);};await c.pollFieldInput();
  assert.equal(draws(),retry?4:3,'Retry must reuse the original chance/category draws');assert.equal(c.sourceActions.busy,false);assert.deepEqual(c.state.phoneRecentCallers,retry?Array(8).fill(255):before);assert.deepEqual(c.writes.at(-1).phoneRecentCallers,c.state.phoneRecentCallers);assert.equal(c.fieldPhone.current().kind,retry?'unsupported':'none');
 }
});

test('actual New Bark to Route29 connection and native OnTransition retain Elm and random rings',async()=>{
 for(const kind of['elm','random']){
  const c=await fixture(),origin=await sourceJSON('maps/60.json'),destination=await sourceJSON('maps/33.json');
  c.map=structuredClone(origin);c.state.map=60;c.state.x=671.5;c.state.z=390.5;c.objects.load(c.map.events.objects);
  if(kind==='elm'){c.state.phoneTriggers=[0];c.fieldPhone.triggerQueued(0,true);c.fieldPhone.advanceRTC(1060,12);}
  else{c.state.pokegear={contacts:['PHONE_CONTACT_JOEY'],cards:[]};c.fieldPhone.advanceRTC(1060,12);c.fieldPhone.advanceRTC(1600,12);}
  const admitted=c.fieldPhone.poll(c.state,c.map,()=>500,()=>0);assert.equal(admitted.kind,kind==='elm'?'elm':'unsupported');
  c.fieldPhone.advanceRTC(kind==='elm'?1061:1601,12);const clock=c.fieldPhone.snapshot(),pending=copy(c.state.phoneTriggers??[]);
  c.world.owner=()=>33;c.world.map=async id=>id===33?destination:origin;c.world.connect=async()=>destination;
  await c.checkEvents();assert.equal(c.state.map,33);assert.equal(c.state.flags.FLAG_UNK_207,true,'actual Route29 OnTransition ran');
  assert.deepEqual(c.fieldPhone.snapshot(),clock,kind);assert.deepEqual(copy(c.state.phoneTriggers??[]),pending);assert.equal(c.vm.lastUnsupported,null);
 }
});

test('ordinary warp, NPC/frame/trainer scene admission still resets active rings and failure restores them',async()=>{
 for(const event of['warp','npc','frame','trainer','failed-scene']){
  const c=await fixture();await ringElm(c);const before=c.fieldPhone.snapshot();
  if(event==='warp'){c.mapBlackoutSpawn=async()=>null;c.world.map=async()=>c.map;c.world.enter=async()=>c.map;await c.enterMap(c.state.map,c.state.x,c.state.z,false);}
  else{
   c.map.scripts={labels:{scene:0},entries:['scene'],instructions:event==='failed-scene'?[['UnportedPhoneScene',[]],['End',[]]]:[['End',[]]]};
   if(event==='frame'){c.map.scripts.instructions=[['SetVar',['VAR_SPECIAL_RESULT','1']],['End',[]]];c.map.initTriggers=[{var:'VAR_SPECIAL_RESULT',value:0,script:'scene'}];await c.checkFrameTriggers();}
   else if(event==='trainer'){c.vm.runTrainerApproach=async()=>{assert.equal(c.fieldPhone.current().kind,'none','actual main trainer branch resets before approach');};await c.runScript('scene','fixture_actor',false,false,true,{eyeType:0});}
   else await c.runScript('scene','fixture_actor',false,false,true);
  }
  const failed=event==='failed-scene';assert.equal(c.fieldPhone.current().kind,failed?'elm':'none',event);
  if(failed)assert.deepEqual(c.fieldPhone.snapshot(),before);assert.deepEqual(c.state.phoneTriggers,[0]);
 }
});

test('retained Elm ring on a no-reception map launches/consumes without fabricated dialogue',async()=>{
 const c=await fixture();await ringElm(c);c.map.fields.incomingCalls='FALSE';const count=c.log.filter(row=>Array.isArray(row)&&row[0]==='message').length;
 await c.answerPhone();assert.deepEqual(c.state.phoneTriggers,[]);assert.equal(c.fieldPhone.current().kind,'none');
 assert.equal(c.log.filter(row=>Array.isArray(row)&&row[0]==='message').length,count);assert.deepEqual(c.writes.at(-1).phoneTriggers,[]);
});

test('Return pauses identical failed phone input, while changed input/map re-admit without clearing bad state or timer',async()=>{
 const c=await fixture();c.state.phoneTriggers=[999];advanceEmptyPhoneInterval(c);const before=c.fieldPhone.snapshot();
 const failures=()=>c.log.filter(row=>Array.isArray(row)&&row[0]==='choice'&&row[1]==='Scene not completed').length;
 await c.pollFieldInput();assert.equal(failures(),1);assert.deepEqual(c.state.phoneTriggers,[999]);assert.deepEqual(c.fieldPhone.snapshot(),before);
 for(let i=0;i<3;i++)await c.pollFieldInput();assert.equal(failures(),1,'ordinary polling must not reopen the same failure');
 // The ephemeral pause participates in another source action's rollback.
 await c.executeSourceAction(async()=>{c.phoneAdmissionGate.visit('temporary');throw Error('unrelated scene failure');});assert.equal(failures(),2);
 await c.pollFieldInput();assert.equal(failures(),2);
 c.state.phoneTriggers=[998];await c.pollFieldInput();assert.equal(failures(),3);await c.pollFieldInput();assert.equal(failures(),3);
 Object.assign(c.map,{id:34});c.state.map=34;await c.pollFieldInput();assert.equal(failures(),4);await c.pollFieldInput();assert.equal(failures(),4);
 c.state.phoneTriggers=[];const draws=phoneDraws(c,[0,0]);await c.pollFieldInput();assert.equal(failures(),4);assert.equal(draws(),2);assert.equal(c.fieldPhone.snapshot().ring.elapsedMinutes,0);
});

test('actual checkEvents admits original Ilex STICKS_ACTIVE named literal through the shared matcher',async()=>{
 const c=await fixture(),ilex=JSON.parse(await readFile(root+'/browser/public/source/maps/117.json','utf8'));
 const event=ilex.events.coords.find(row=>row.val==='STICKS_ACTIVE');assert.ok(event,'literal original named coordinate event');
 c.map=ilex;c.state.map=ilex.id;c.state.x=event.x+.5;c.state.z=event.z+.5;c.vm.set(event.var,ilex.constants.STICKS_ACTIVE);
 const scripts=[];c.runScript=async script=>{scripts.push(script);return true;};c.checkFrameTriggers=async()=>false;
 await c.checkEvents();assert.deepEqual(scripts,[event.scriptId]);
 c.lastCoord='';c.vm.set(event.var,ilex.constants.STICKS_ACTIVE+1);scripts.length=0;c.wildEncounter=async()=>false;
 await c.checkEvents();assert.deepEqual(scripts,[],'a named source literal must not turn the stick event unconditional');
});

test('actual VM warp hook forwards original direction before tile-centered map entry and preserves omitted direction',async()=>{
 const c=await fixture(),entries=[];c.enterMap=async(...args)=>{entries.push({args,facing:c.state.facing});};c.state.facing=3;
 await c.vm.hooks.warp(117,15,65,0);assert.deepEqual(entries,[{args:[117,15.5,65.5],facing:0}]);
 c.state.facing=2;await c.vm.hooks.warp(164,4,5);assert.deepEqual(entries[1],{args:[164,4.5,5.5],facing:2});
});
