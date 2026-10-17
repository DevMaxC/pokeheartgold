import './style.css';
import {loadData,newState,titleCase,speciesName,createMon,giveMon,healParty,itemName,moveName} from './data.ts';
import {OriginalWorld} from './world.ts';
import {mapWeather} from './atmosphere.ts';
import {UI,$,escapeHTML as esc} from './ui.ts';
import {runOpeningSession} from './opening.ts';
import {OpeningView} from './opening-view.ts';
import {ScriptVM,UnsupportedScript} from './script.ts';
import {Battle} from './battle.ts';
import {WorldBattleView} from './battle-stage.ts';
import {EncounterChecks,landSlot} from './encounter.ts';
import {doorwayEntry} from './terrain.ts';
import {ledgeDirection,jumpHeight} from './ledges.ts';
import {stepWarpFacing,pushWarp,fieldEntryScripts,arrivalStep,arrivalFacing} from './field-transitions.ts';
import {FieldObjects} from './objects.ts';
import {SourceActionRecovery,SourceTriggerGate,runRecoverableSourceAction,runFieldBattleAction} from './script-recovery.ts';
import {furnitureBlocksStep} from './furniture-collision.ts';
import {movementAction} from './movement.ts';
import {findTrainerEncounter,fieldTrainerCollision,trainerEventPriority,approachTrainer,MissingTrainerPartner,TrainerAttemptLatch,type TrainerEncounter} from './trainer-encounters.ts';
import {SCRIPT_CAMERA_ACTOR,setScriptCameraTarget,scriptCameraMovement} from './script-camera.ts';
import {mapBlackoutSpawn} from './spawns.ts';
import {originalTrainerParty,battleMoneyLoss,trainerPrize} from './trainers.ts';
import {catchingTutorialState} from './tutorial.ts';
import {gymFieldEntry} from './gym-violet.ts';
import {isUsableBattler,firstFollowerMon,NATIVE_EGG_ICON} from './eggs.ts';
import {partyHUD,partyRow,partySummary} from './party-display.ts';
import {chooseFieldPartySwitchTarget,swapFieldPartySlots} from './party-order.ts';
import {advancePartyEggStep,recordEggHatchEvent,type EggStepClock} from './egg-hatching.ts';
import {presentNativeEggHatch} from './egg-hatch-presentation.ts';
import {WorldEggHatchView} from './egg-hatch-view.ts';
import {createNativeHatchMusicSession} from './hatch-music.ts';
import {sourceJSON,type State,type SourceMap,type NPC,type Mon,type GameData} from './types.ts';

const SAVE_KEY=new URLSearchParams(location.search).has('qa')?'heartgold-3d-v2-qa':'heartgold-3d-v2';
const keys=new Set<string>();const ui=new UI();
const encounterChecks=new EncounterChecks();
const frameTriggerGate=new SourceTriggerGate();
let state:State,world:OriginalWorld,map:SourceMap,vm:ScriptVM,battle:Battle,data:GameData,objects:FieldObjects;
let ready=false,transitioning=false,walking=false,started=false,stepFrame=0,elapsed=0,saveClock=0;
let openingView:OpeningView|null=null;
let player:ReturnType<OriginalWorld['paper']>,follower:ReturnType<OriginalWorld['paper']>|null=null,followSpecies=0;
let followMon:Mon|null=null;
let lastWarp='',lastCoord='',lastError='';
let fieldPolling=false;const trainerAttempts=new TrainerAttemptLatch();let activeTrainerEncounter:TrainerEncounter|null=null;
const trainerApproachTasks=new Map<number,Promise<void>>();
let sourceActions:SourceActionRecovery<ReturnType<typeof captureField>>|undefined,recoveryPrompt=false;
let followerSuppressed=false;let playerDirectionLocked=false;let followerFacing=1,followerMoving=false,followerStep=-1;
let followerPrevious:{x:number;z:number;height:number}|null=null;let playerTweenY:number|undefined;let previousStepJump=false;let restoringGym=false;
let hatching=false,hatchFollowerPendingCommit=false;
const npcTweenY=new Map<string,number>();
const deltas=[{x:0,z:-1},{x:0,z:1},{x:-1,z:0},{x:1,z:0}];
function save(){if(!ready||!started||sourceActions?.busy||recoveryPrompt||transitioning||vm?.busy||battle?.active||walking)return;try{state.fieldHeight=player.group.position.y;state.objectEvents=objects.save(state.map);localStorage.setItem(SAVE_KEY,JSON.stringify(state));}catch{console.warn('Local save is unavailable');}}
function readSave():State|null{try{const s=JSON.parse(localStorage.getItem(SAVE_KEY)||'null');return s?.version===2&&typeof s.name==='string'&&Number.isFinite(s.x)&&Number.isFinite(s.z)&&data.index.maps[s.map]&&Array.isArray(s.party)&&s.flags&&s.vars&&s.bag?s:null;}catch{return null;}}
function displayMapName(m:SourceMap){const names:Record<string,string>={T20:'New Bark Town',T20R0202:'Your room',T20R0201:'Home',T20R0101:'Professor Elm’s Lab',T20R0102:'Elm’s home',T21:'Cherrygrove City',T22:'Violet City'};if(names[m.code])return names[m.code];return m.key.replace('MAP_','').split('_').map(word=>/^\d+$/.test(word)?word:word[0]+word.slice(1).toLowerCase()).join(' ');}
function updateHUD(){
  $('map-name').textContent=displayMapName(map);$('map-detail').textContent=state.name?`${state.name} · ${state.badges.length} Badges · ₽${state.money.toLocaleString()}`:'';
  $('party-hud').innerHTML=state.party.map(mon=>partyHUD(mon,NATIVE_EGG_ICON)).join('');
}
function refreshNPCs(){world.updateNPCs(objects.snapshot());for(const[id,y]of npcTweenY){const actor=world.npcSprites.get(id);if(actor)actor.group.position.y=y;}}
function showPerson(object:string,value:boolean){objects.show(object,value);refreshNPCs();}
function trainerCollision(){return fieldTrainerCollision({permission:(x,z)=>world.permission(x,z),height:(...args)=>world.height(...args),obstructed:(x,z,fromX,fromZ,fromY)=>{const toY=world.height(x,z,fromY,fromX,fromZ);return[...world.cells.values()].some(cell=>furnitureBlocksStep(cell.furniture??[],fromX,fromZ,x,z,fromY,toY));},actorHeight:actor=>world.npcSprites.get(actor.id)?.group.position.y??world.height(actor.x+.5,actor.z+.5,actor.y/16),playerHeight:()=>player.group.position.y,occupants:()=>follower?.group.visible&&!followerSuppressed?[{x:follower.group.position.x,z:follower.group.position.z,height:follower.group.position.y},...(followerPrevious?[followerPrevious]:[])]:[]},state,objects.snapshot());}
async function tryTrainerEncounter(){
  if(vm.busy||ui.busy||battle.active||transitioning)return false;
  trainerAttempts.observe(state);
  let encounter:TrainerEncounter|null;try{encounter=findTrainerEncounter(data,state,map,objects.snapshot(),trainerCollision());}catch(error){if(!(error instanceof MissingTrainerPartner))throw error;if(!trainerAttempts.admit(state,'missing:'+error.object))return false;await runScript(3739,error.object,false,false,false,undefined,new UnsupportedScript(map.code,'TrainerPartner',-1));return true;}if(!encounter)return false;
  if(!trainerAttempts.admit(state,encounter.trainers.map(t=>t.object).join(',')))return false;activeTrainerEncounter=encounter;trainerApproachTasks.clear();
  try{await runScript(3739,encounter.trainers[0].object,false,false,false,encounter);}
  finally{await Promise.allSettled(trainerApproachTasks.values());trainerApproachTasks.clear();activeTrainerEncounter=null;}
  return true;
}
async function trainerNotice(plan:TrainerEncounter['trainers'][number],hidden:boolean){
  if(hidden)throw new UnsupportedScript(map.code,'RevealTrainer',vm.current?.pc??-1);
  face(plan.object,plan.direction);const actor=world.npcSprites.get(plan.object);if(!actor)throw Error('Trainer actor is not rendered');
  const notice=document.createElement('div');notice.textContent='!';notice.setAttribute('aria-hidden','true');Object.assign(notice.style,{position:'fixed',pointerEvents:'none',zIndex:'20',font:'bold 24px monospace',color:'#25394b',background:'#fffef2',border:'2px solid #25394b',padding:'1px 7px',transform:'translate(-50%,-100%)'});document.body.append(notice);
  try{await tween(.5,()=>{const point=actor.group.position.clone();point.y+=2.8;point.project(world.camera);const rect=$('original-world').getBoundingClientRect();notice.style.left=`${rect.left+(point.x+1)*rect.width/2}px`;notice.style.top=`${rect.top+(1-point.y)*rect.height/2}px`;});await tween(.5,()=>{});}finally{notice.remove();}
}
async function beginTrainerPath(index:number,trainer:{trainer:number;object:string}){
  const encounter=activeTrainerEncounter,plan=encounter?.trainers[index],actor=objects.get(trainer.object);if(!encounter||!plan||plan.object!==trainer.object||plan.trainer!==trainer.trainer||!actor)throw Error('Missing native trainer approach plan');
  const collision=trainerCollision(),task=approachTrainer(plan,index,encounter.eyeType,actor,state,collision,{notice:trainerNotice,step:async(plan,x,z)=>{const npc=objects.get(plan.object);if(!npc)throw Error('Trainer disappeared during approach');await tweenNPC(npc,x,z,.25);},facePlayer:direction=>{state.facing=direction;},finish:plan=>{objects.movement(plan.object,0);refreshNPCs();}});
  // Native path creation starts a task; the following TrainerStep command
  // awaits its completion. Observe rejection immediately to avoid an orphan.
  trainerApproachTasks.set(index,task);void task.catch(()=>{});
}
async function finishTrainerPath(index:number){const task=trainerApproachTasks.get(index);if(!task)throw Error('Native trainer approach task was not started');await task;trainerApproachTasks.delete(index);return true;}
async function pollFieldInput(){
  if(fieldPolling||sourceActions?.busy||recoveryPrompt||walking||transitioning||vm.busy||ui.busy||battle.active)return;fieldPolling=true;
  try{if(await trainerEventPriority(checkFrameTriggers,tryTrainerEncounter))return;const horizontal=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft')),forward=Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'));if(horizontal||forward){const x=horizontal*Math.cos(world.yaw)-forward*Math.sin(world.yaw),z=-horizontal*Math.sin(world.yaw)-forward*Math.cos(world.yaw);await step(Math.abs(x)>Math.abs(z)?x>0?3:2:z>0?1:0);}}
  finally{fieldPolling=false;}
}
async function tweenNPC(npc:NPC&{step:number;previousX?:number;previousZ?:number;previousY?:number},x:number,z:number,seconds:number,jump=false){
  const from={x:npc.x,z:npc.z},fromY=world.npcSprites.get(npc.id)?.group.position.y??world.height(from.x+.5,from.z+.5),toY=world.height(x+.5,z+.5,fromY,from.x+.5,from.z+.5);
  npc.previousX=from.x;npc.previousZ=from.z;npc.previousY=fromY;
  try{await tween(seconds,t=>{npc.x=from.x+(x-from.x)*t;npc.z=from.z+(z-from.z)*t;npc.step=t*4;if(jump)npcTweenY.set(npc.id,jumpHeight(fromY,toY,t));refreshNPCs();});}
  finally{npcTweenY.delete(npc.id);npc.previousX=npc.previousZ=npc.previousY=undefined;npc.step=-1;refreshNPCs();}
}
async function moveActor(object:string,label:string,source:SourceMap){
  const cameraMovement=scriptCameraMovement(world,object,label,source,tween);if(cameraMovement){await cameraMovement;return;}
  const start=source.scripts.labels[label];if(start===undefined)return;let index=start;
  while(index<source.scripts.instructions.length){const [command,args]=source.scripts.instructions[index++];if(command==='EndMovement')break;
    const action=movementAction(command,args),facing=action.facing;
    const isPlayer=object==='obj_player',npc=objects.get(object);if(!isPlayer&&!npc){if(object==='obj_partner_poke')continue;throw Error(`Missing original movement object ${object}`);}
    if(action.invisible!==null){if(isPlayer)player.group.visible=!action.invisible;else npc!.invisible=action.invisible;refreshNPCs();continue;}
    if(action.lockFacing!==null){if(isPlayer)playerDirectionLocked=action.lockFacing;else npc!.directionLocked=action.lockFacing;continue;}
    if(facing!==null){if(isPlayer){if(!playerDirectionLocked||!action.distance)state.facing=facing;}else if(!npc!.directionLocked||!action.distance)npc!.facingDirection=facing;}
    if(action.distance){
      if(facing===null)continue;const repeats=action.repeats;
      for(let i=0;i<repeats;i++){
        const d={x:deltas[facing].x*action.distance,z:deltas[facing].z*action.distance};if(isPlayer)await tweenPlayer(state.x+d.x,state.z+d.z,action.seconds,action.jump);else{
          await tweenNPC(npc!,npc!.x+d.x,npc!.z+d.z,action.seconds,action.jump);
        }
      }
    }else if(action.delay)await new Promise(resolve=>setTimeout(resolve,action.delay*1000));
    refreshNPCs();
  }
}
async function tween(seconds:number,fn:(t:number)=>void){const start=performance.now();await new Promise<void>(resolve=>{function frame(){const t=Math.min(1,(performance.now()-start)/(seconds*1000));fn(t);if(t<1)requestAnimationFrame(frame);else resolve();}frame();});}
async function tweenPlayer(x:number,z:number,seconds:number,jump=false){
  const from={x:state.x,z:state.z},followFrom=follower?.group.position.clone();
  const fromY=world.height(from.x,from.z,player.group.position.y),toY=world.height(x,z,fromY,from.x,from.z),followerJump=followFrom&&previousStepJump&&Math.hypot(from.x-followFrom.x,from.z-followFrom.z)>.001;
  followerPrevious=followFrom?{x:followFrom.x,z:followFrom.z,height:followFrom.y}:null;
  if(followFrom){const dx=from.x-followFrom.x,dz=from.z-followFrom.z;followerMoving=Math.hypot(dx,dz)>.001;if(followerMoving)followerFacing=Math.abs(dx)>Math.abs(dz)?dx>0?3:2:dz>0?1:0;}
  try{await tween(seconds,t=>{state.x=from.x+(x-from.x)*t;state.z=from.z+(z-from.z)*t;stepFrame=t*4;if(jump)playerTweenY=jumpHeight(fromY,toY,t);
    if(follower&&followFrom){const fx=followFrom.x+(from.x-followFrom.x)*t,fz=followFrom.z+(from.z-followFrom.z)*t;follower.group.position.set(fx,followerJump?jumpHeight(followFrom.y,fromY,t):world.height(fx,fz,follower.group.position.y,follower.group.position.x,follower.group.position.z),fz);followerStep=t*4;}
  });}finally{followerPrevious=null;playerTweenY=undefined;previousStepJump=jump;stepFrame=-1;followerMoving=false;followerStep=-1;}
}

function face(object:string,facing?:number){const actor=objects.get(object);if(!actor)return;if(facing===undefined){const dx=state.x-actor.x-.5,dz=state.z-actor.z-.5;facing=Math.abs(dx)>Math.abs(dz)?dx>0?3:2:dz>0?1:0;}actor.facingDirection=facing;refreshNPCs();}
function setPosition(object:string,x:number,z:number,facing?:number){if(object==='obj_player'){state.x=x+.5;state.z=z+.5;if(facing!==undefined)state.facing=facing;return;}objects.position(object,x,z,facing);refreshNPCs();}
async function chooseStarter(){
  let chosen=0;while(!chosen){ui.panel('<span class="eyebrow">PROFESSOR ELM’S LAB</span><h2>Choose a Pokémon.</h2><p>Touch a Poké Ball to see what Pokémon is inside.</p><div class="select-row">'+[152,155,158].map(id=>`<button data-starter-id="${id}"><img src="/source/pokemon/${id}-male-front.png" alt="${speciesName(data,id)}">${speciesName(data,id)}<small class="tag">${titleCase(data.personal[id].types[0])}</small></button>`).join('')+'</div>');
    ui.canDismiss=false;const id=await new Promise<number>(resolve=>document.querySelectorAll<HTMLButtonElement>('[data-starter-id]').forEach(b=>b.onclick=()=>resolve(Number(b.dataset.starterId))));ui.close();
    if(await ui.choose(`You’ll take ${speciesName(data,id)}, the ${titleCase(data.personal[id].types[0])}-type Pokémon?`,['Yes','No'])===0)chosen=id;
  }
  const mon=createMon(data,chosen,5,state.name);giveMon(state,mon);state.starter=chosen;updateHUD();
}
async function hatchEgg(){
  if(hatching)throw Error('An Egg hatch already owns the field');
  // Every attempt owns a fresh native-music session and effective field state.
  // A deliberate muted setting skips all audio, including the original cry.
  const sound=state.options.sound;
  hatching=true;hatchFollowerPendingCommit=true;keys.clear();drag=false;
  try{await presentNativeEggHatch(data,state,map,{
    view:signal=>new WorldEggHatchView(world,()=>({map:state.map,x:state.x,y:player.group.position.y,z:state.z,hideActors:[player.group,...(follower?[follower.group]:[])]}),{signal,cry:sound?undefined:async()=>{}}),
    music:createNativeHatchMusicSession({enabled:sound}),
    message:(text,signal)=>ui.printMessage(text,(state.options.textSpeed===0?8:state.options.textSpeed===1?4:1)*1000/60,signal),
    choose:(text,options,signal)=>ui.choose(text,options,'',signal),
    nickname:(scene,signal)=>ui.input('Pokémon nickname',10,scene.speciesName,signal),
    resumeField:async()=>{refreshNPCs();updateHUD();keys.clear();},
  });}finally{hatching=false;}
}
// Live actors are newer than state.objectEvents until the next durable save.
function captureField(){return{actors:map?objects.save(state.map):state.objectEvents,playerHeight:map?player.group.position.y:(state as State&{fieldHeight?:number}).fieldHeight,playerVisible:player.group.visible,playerDirectionLocked,followerSuppressed,followerFacing,followerPosition:follower?.group.position.toArray(),lastWarp,lastCoord,previousStepJump,weather:map?world.sky.currentWeather:undefined,camera:{yaw:world.yaw,pitch:world.pitch,distance:world.distance}};}
async function restoreField(snapshot:ReturnType<typeof captureField>,error:unknown){
  // Hydrate directly: enterMap would rerun source entry scripts, clear Flash and
  // update the blackout spawn. Those mutations belong to the failed action.
  followerPrevious=null;keys.clear();drag=false;transitioning=true;world.beginFieldTransition();ui.loading('Restoring the area…');
  try{
    Object.assign(world,snapshot.camera);
    // Optional height/lift parameters are also understood by the gym hydration
    // port. Older field worlds accept this compatible superset and ignore them.
    const field:{enter:(id:number,x:number,z:number,weather?:number,initialHeight?:number,violetLift?:0|1)=>Promise<SourceMap>;clearScriptCameraTarget?:()=>void}=world;
    field.clearScriptCameraTarget?.();
    const gym=(state as State&{gymmick?:{kind:string;liftState:0|1}}).gymmick,source=await world.map(state.map);
    const restored=await field.enter(state.map,state.x,state.z,snapshot.weather??mapWeather(source,state),snapshot.playerHeight,gym?.kind==='violet'?gym.liftState:0);
    map=restored;world.clearNPCs();objects.load(map.events.objects);objects.restore(state.map,snapshot.actors);
    npcTweenY.clear();playerTweenY=undefined;stepFrame=-1;followerMoving=false;followerStep=-1;
    playerDirectionLocked=snapshot.playerDirectionLocked;followerSuppressed=snapshot.followerSuppressed;followerFacing=snapshot.followerFacing;previousStepJump=snapshot.previousStepJump;
    lastWarp=snapshot.lastWarp;lastCoord=snapshot.lastCoord;player.group.visible=snapshot.playerVisible;player.group.position.set(state.x,world.height(state.x,state.z,snapshot.playerHeight),state.z);
    // A failed starter/gift can have created a follower for a now-absent species.
    if(follower)world.removePaper(follower);follower=null;followSpecies=0;followMon=null;
    const lead=firstFollowerMon(state.party),key=lead?'SPRITE_FOLLOWER_MON_'+data.personal[lead.species].species:'';
    if(lead&&data.sprites[key]){follower=world.paper(key,1.5);followSpecies=lead.species;followMon=lead;if(snapshot.followerPosition)follower.group.position.fromArray(snapshot.followerPosition);else follower.group.position.copy(player.group.position);follower.group.visible=!followerSuppressed;}
    // Discard private child buffers, pending phone state and battle result too.
    vm=new ScriptVM(data,state,vm.hooks);if(error instanceof UnsupportedScript)vm.lastUnsupported={map:error.map,command:error.command,pc:error.pc};
    ready=true;refreshNPCs();updateHUD();encounterChecks.reset();
  }finally{walking=false;transitioning=false;world.endFieldTransition();ui.loading(null);}
}
async function executeSourceAction<T>(action:()=>Promise<T>){
  if(!sourceActions)throw Error('Source recovery is not initialized');
  const triggerState=frameTriggerGate.snapshot(),trainerState=trainerAttempts.snapshot();
  return runRecoverableSourceAction(sourceActions,action,{
    committed:save,retry:()=>{frameTriggerGate.restore(triggerState);trainerAttempts.restore(trainerState);},
    recoveryFailed:async error=>{
      recoveryPrompt=true;keys.clear();console.error(error);
      try{await ui.choose('The area could not be restored.',['Retry loading'],'Your last browser save is unchanged. '+String(error.recoveryError));}finally{recoveryPrompt=false;}
    },
    failed:async cause=>{
      lastError=String(cause);console.error(cause);recoveryPrompt=true;keys.clear();
      const detail=(cause instanceof UnsupportedScript?`This scene needs the source command ${cause.command} (${cause.map}:${cause.pc}). `:'The scene could not finish. ')+ 'Changes from this scene were undone. Progress from completed earlier scenes is retained.';
      try{
        const choice=await ui.choose('Scene not completed',['Retry scene','Return to field'],detail);
        if(choice!==0){
          // Failed visits may have cleared the restored map's earlier pauses.
          // Retain its new failures too, including an A -> B -> A excursion.
          const location=String(state.map),current=frameTriggerGate.snapshot();
          frameTriggerGate.restore({location,blocked:[...new Set([...(triggerState.location===location?triggerState.blocked:[]),...(current.location===location?current.blocked:[])])]});
          const trainerLocation=`${state.map}:${Math.floor(state.x)},${Math.floor(state.z)}`,currentTrainers=trainerAttempts.snapshot();
          trainerAttempts.restore({location:trainerLocation,attempts:[...new Set([...(trainerState.location===trainerLocation?trainerState.attempts:[]),...(currentTrainers.location===trainerLocation?currentTrainers.attempts:[])])]});
        }
        return choice===0?'retry':'return';
      }finally{recoveryPrompt=false;}
    },
  });
}
async function runScript(script:string|number,object='obj_player',nested=false,preserveControls=false,deferTriggers=false,approach?:TrainerEncounter,admissionError?:UnsupportedScript){
  if(vm.busy&&!nested)return false;
  const result=await executeSourceAction(async()=>{
    const runner=nested?new ScriptVM(data,state,vm.hooks):vm,wasWalking=walking;
    if(!preserveControls)keys.clear();walking=true;
    try{try{if(admissionError)throw admissionError;if(approach){if(approach.eyeType!==0)throw new UnsupportedScript(map.code,'TrainerBattleDouble',-1);await runner.runTrainerApproach(map,approach);}else await runner.run(map,script,object);}finally{if(approach){await Promise.allSettled(trainerApproachTasks.values());trainerApproachTasks.clear();}}updateHUD();}finally{walking=wasWalking;}
    if(!nested&&!vm.busy&&!deferTriggers)await checkFrameTriggers();
  });
  return result.ok;
}
async function runFieldEntry(kind:'connection'|'warp'|'resume',preserveControls=false){await executeSourceAction(async()=>{for(const event of fieldEntryScripts(kind))if(map.initScripts[event])await runScript(map.initScripts[event],'obj_player',vm.busy,preserveControls,true);});}
async function enterMap(id:number,x:number,z:number,runEntry=true,restoreObjects=false,connection=false,deferTriggers=false){
  await executeSourceAction(async()=>{
  world.clearScriptCameraTarget();
  encounterChecks.reset();
  const {initialHeight,violetLift}=gymFieldEntry(state,restoreObjects,connection),previousRestore=restoringGym;restoringGym=restoreObjects;
  playerDirectionLocked=false;
  const loadingText='Entering '+(data.index.maps[id]?.name||'Johto')+'…';
  transitioning=true;if(!connection){world.beginFieldTransition();drag=false;previousStepJump=false;keys.clear();ui.loading(loadingText);}state.map=id;state.x=x;state.z=z;
  try{
    let retried=false;
    for(;;){
      try{
        map=await world.map(id);if(map.mapType!=='MAP_TYPE_CAVE'){state.flags.FLAG_SYS_FLASH=false;state.flags.FLAG_SYS_DEFOG=false;}map=connection?await world.connect(id,x,z,mapWeather(map,state)):await world.enter(id,x,z,mapWeather(map,state),initialHeight,violetLift);world.clearNPCs();objects.load(map.events.objects);if(restoreObjects)objects.restore(id,state.objectEvents);if(!connection){const spawn=await mapBlackoutSpawn(id);if(spawn)state.lastHeal={...spawn.death};}player.group.visible=true;refreshNPCs();updateHUD();if(!connection){player.group.position.set(x,world.height(x,z,initialHeight),z);if(follower)follower.group.position.copy(player.group.position);}
        if(retried)lastError='';break;
      }catch(error){
        if(connection)throw error;
        lastError=String(error);retried=true;ui.loading(null);
        await ui.choose('This area could not load.',['Retry']);keys.clear();ui.loading(loadingText);
      }
    }
    if(!connection)world.endFieldTransition();
    if(runEntry)await runFieldEntry(connection?'connection':'warp',connection);
  }finally{restoringGym=previousRestore;transitioning=false;if(!connection){world.endFieldTransition();ui.loading(null);}}
  if(!deferTriggers)await checkFrameTriggers();
  });
}
async function checkFrameTriggers(){
  if(vm.busy||ui.busy||battle.active)return false;
  const location=String(state.map);frameTriggerGate.visit(location);
  const trigger=map.initTriggers.find(t=>vm.value(t.var,map)===t.value);if(!trigger)return false;
  const key=`${map.id}:${trigger.var}:${trigger.value}:${trigger.script}`;
  if(!frameTriggerGate.allows(key))return false;
  try{if(!await runScript(trigger.script))frameTriggerGate.failed(location,key);}
  catch(error){frameTriggerGate.failed(location,key);throw error;}
  return true;
}
async function warp(index:number,facing=state.facing){
  await executeSourceAction(async()=>{
  transitioning=true;keys.clear();
  try{
  const from=map.events.warps[index],id=data.index.mapIds[from.header];if(id===undefined)throw Error(`Missing original warp destination ${from.header}`);
  const destination=await world.map(id),target=destination.events.warps[from.anchor];if(!target)throw Error(`Missing original warp anchor ${from.header}:${from.anchor}`);
  lastWarp=id+':'+target.x+','+target.z;state.facing=facing;
  await enterMap(id,target.x+.5,target.z+.5,true,false,false,true);
  state.facing=arrivalFacing(world.permission(state.x,state.z),state.facing);
  if(state.map===id&&state.x===target.x+.5&&state.z===target.z+.5){const direction=arrivalStep(world.permission(state.x,state.z),state.facing);if(direction!==null){const d=deltas[direction],x=state.x+d.x,z=state.z+d.z,occupied=[...world.npcSprites.values()].some(n=>n.group.visible&&Math.floor(n.group.position.x)===Math.floor(x)&&Math.floor(n.group.position.z)===Math.floor(z));if(world.walkable(x,z,state.x,state.z,player.group.position.y)&&!occupied){transitioning=true;await tweenPlayer(x,z,.25);}}}
  if(Math.floor(state.x)!==target.x||Math.floor(state.z)!==target.z)lastWarp='';
  await checkFrameTriggers();
  }finally{transitioning=false;}
  });
}
async function checkEvents(enteredDoor=false,eggClock?:EggStepClock){
  const outcome=await executeSourceAction(async()=>{
  const owner=world.owner(state.x,state.z);
  if(owner!==undefined&&owner!==state.map){await enterMap(owner,state.x,state.z,true,false,true,true);}
  if(await trainerEventPriority(checkFrameTriggers,tryTrainerEncounter))return;
  const x=Math.floor(state.x),z=Math.floor(state.z);
  const warpIndex=map.events.warps.findIndex(w=>w.x===x&&w.z===z),key=map.id+':'+x+','+z;
  if(key!==lastWarp)lastWarp='';
  const trigger=map.events.coords.find(c=>x>=c.x&&x<c.x+(c.w||1)&&z>=c.z&&z<c.z+(c.h||1)&&vm.value(c.var||'0',map)===c.val);
  if(trigger){const id=String(trigger.scriptId)+':'+key;if(id!==lastCoord){lastCoord=id;await runScript(trigger.scriptId);return;}}else lastCoord='';
  const transitionFacing=enteredDoor?state.facing:stepWarpFacing(world.permission(state.x,state.z),state.facing);
  if(warpIndex>=0&&key!==lastWarp&&transitionFacing!==null){await warp(warpIndex,transitionFacing);save();return;}if(warpIndex<0)lastWarp='';
  if(await checkFrameTriggers())return;
  // Native forced movement, poison and Safari checks precede daycare; Repel
  // follows it. These handlers and daycare breeding remain separate parity
  // work from this host's ordinary walking and ledge movement.
  if(eggClock&&advancePartyEggStep(data,state,eggClock).hatchReady){recordEggHatchEvent(data,state);await runScript(data.constants.std_hatch_egg,'obj_player',false,false,true);return;}
  return !vm.busy&&!ui.busy&&!transitioning;
  });
  return outcome.ok&&!!outcome.value;
}
async function wildEncounter(){
  if(!state.party.some(isUsableBattler))return;
  const behavior=world.permission(state.x,state.z)&255;if(![2,3,8].includes(behavior))return;
  const bank=map.fields.wildEncounterBank?.replace('ENCDATA_',''),encounter=data.encounters.find(e=>e.map===bank);if(!encounter?.land.rate||!encounterChecks.roll(encounter.land.rate,state.facing,!!state.runningShoes&&keys.has('ShiftLeft'),behavior===3))return;
  const slot=landSlot();
  const row=encounter.land.mons[slot];if(!row)return;const hour=new Date().getHours(),time=hour>=4&&hour<10?'morn':hour>=10&&hour<20?'day':'nite';let key=row.species[time];if(typeof key!=='string')key=key.HEARTGOLD;
  const species=data.constants[key],level=typeof row.level==='number'?row.level:row.level.HEARTGOLD;if(!species)return;
  await startBattle([createMon(data,species,level,'')]);
}
async function whiteOut(runEntry=true,deferTriggers=false){healParty(state);state.facing=0;await enterMap(state.lastHeal.map,state.lastHeal.x,state.lastHeal.z,runEntry,false,false,deferTriggers);}
async function startBattle(enemies:Mon[],trainer:number|null=null,canLose=false){
  const nested=!!sourceActions?.busy,battleMap=state.map,opponents=structuredClone(enemies);let blackedOut=false;
  const outcome=await runFieldBattleAction({nested,execute:executeSourceAction,
    fight:async()=>{
      // An explicit battle retry keeps the encounter and restores fresh enemy HP.
      const attempt=structuredClone(opponents);blackedOut=false;keys.clear();encounterChecks.reset();
      const result=await battle.start(attempt,trainer,{noCritical:trainer!==null&&data.trainers[trainer].class==='TRAINERCLASS_PASSERBY',weather:world.sky.currentWeather});
      if(result==='caught'){const mon=attempt[0];if(await ui.choose(`Give a nickname to ${mon.name}?`,['Yes','No'])===0)mon.name=await ui.input('Pokémon nickname',10,mon.name);}
      if(result==='lost'){
        if(canLose)healParty(state);
        else{state.money-=battleMoneyLoss(state.party,state.badges.length,state.money);if(trainer===null){blackedOut=true;await whiteOut(nested,!nested);}}
      }
      if(result==='won'&&trainer!==null){const prize=await trainerPrize(data,trainer);state.money=Math.min(999999,state.money+prize);if(prize)await ui.message(`${state.name} got ₽${prize} for winning!`);}
      updateHUD();return result==='won';
    },
    resume:async()=>{
      if(blackedOut&&!nested){keys.clear();await runFieldEntry('warp');await checkFrameTriggers();}
      else if(state.map===battleMap){keys.clear();await runFieldEntry('resume');await checkFrameTriggers();}
      updateHUD();
    },
  });
  return outcome.ok?outcome.value:false;
}
async function trainerBattle(id:number,options?:{second:number;canLose:boolean;suppressFollower:boolean}){const trainer=data.trainers[id];if(!trainer)throw Error(`Missing trainer ${id}`);if(options?.second||trainer.double)throw new UnsupportedScript(map.code,'TrainerBattleDouble',vm.current?.pc??-1);return startBattle(await originalTrainerParty(data,id),id,options?.canLose);}
async function interact(){
  if(ui.dialogueOpen){ui.advance();return;}if(!started||sourceActions?.busy||recoveryPrompt||walking||transitioning||vm.busy||ui.panelOpen||battle.active)return;
  const d=deltas[state.facing],x=Math.floor(state.x)+d.x,z=Math.floor(state.z)+d.z;
  const actorAt=(xx:number,zz:number)=>[...world.npcSprites.values()].find(n=>n.group.visible&&Math.floor(n.group.position.x)===xx&&Math.floor(n.group.position.z)===zz);
  const npc=actorAt(x,z)||((world.permission(x,z)&255)===0x80?actorAt(x+d.x,z+d.z):undefined);
  if(await trainerEventPriority(checkFrameTriggers,tryTrainerEncounter))return;
  if(npc){await runScript(npc.npc.scriptId,npc.npc.id);return;}
  const bg=map.events.bgs.find(b=>(b.x===x&&b.z===z)||(b.x===Math.floor(state.x)&&b.z===Math.floor(state.z)));
  if(bg)await runScript(bg.scriptId);
}
async function step(facing:number){
  if(sourceActions?.busy||recoveryPrompt||walking||transitioning||vm.busy||ui.busy||battle.active)return;state.facing=facing;const d=deltas[facing],x=Math.floor(state.x)+d.x+.5,z=Math.floor(state.z)+d.z+.5;
  const occupied=[...world.npcSprites.values()].some(n=>n.group.visible&&Math.floor(n.group.position.x)===Math.floor(x)&&Math.floor(n.group.position.z)===Math.floor(z));
  const exit=map.events.warps.findIndex(w=>w.x===Math.floor(state.x)&&w.z===Math.floor(state.z)),standing=world.permission(state.x,state.z),ladder=[60,61].includes(standing&255);
  if(exit>=0&&(!occupied||ladder)&&pushWarp(standing,facing,!world.terrainWalkable(x,z))){await warp(exit,facing);save();return;}
  // A completed ledge hop is one movement event even though it crosses two tiles.
  const jumping=ledgeDirection(world.permission(x,z))===facing;
  const nativeWarp=map.events.warps.some(w=>w.x===Math.floor(x)&&w.z===Math.floor(z));
  const enteredDoor=doorwayEntry(world.permission(x,z),nativeWarp,facing);
  if(!jumping&&((!world.walkable(x,z,state.x,state.z,player.group.position.y)&&!enteredDoor)||occupied))return;
  // Capture the target and browser date once so explicit Retry replays the
  // same completed step. Global native RTC penalty detection is unported.
  const date=new Date(),eggClock={month:date.getMonth()+1,day:date.getDate(),penalty:false};
  const targetX=jumping?x+d.x:x,targetZ=jumping?z+d.z:z,seconds=jumping?.42:keys.has('ShiftLeft')&&state.runningShoes?.14:.25;
  const outcome=await executeSourceAction(async()=>{
    walking=true;try{await tweenPlayer(targetX,targetZ,seconds,jumping);}finally{walking=false;}
    encounterChecks.step();return checkEvents(enteredDoor,eggClock);
  });
  // Commit the completed movement before the independent wild battle action.
  if(outcome.ok&&outcome.value)await wildEncounter();
}
async function menu(){if(!started||sourceActions?.busy||recoveryPrompt||transitioning||vm.busy||walking||battle.active||ui.dialogueOpen)return;if(!ui.panelOpen&&await trainerEventPriority(checkFrameTriggers,tryTrainerEncounter))return;if(ui.panelOpen){ui.close();return;}
  const entries=[['party','Pokémon',`${state.party.length} in your party`],['bag','Bag','Items and Key Items'],['trainer',state.name,`${state.badges.length} Badges`],['save','Save','Save your adventure'],['options','Options','Game settings'],['close','Close','Return to Johto']];
  const unlocks:Record<string,string>={bag:'FLAG_GOT_BAG',trainer:'FLAG_GOT_TRAINER_CARD',save:'FLAG_GOT_SAVE_BUTTON',options:'FLAG_GOT_OPTIONS_BUTTON'};
  ui.panel(`<span class="eyebrow">POKÉMON HEARTGOLD</span><h2>Menu</h2><div class="menu-list">${entries.filter(([key])=>key==='party'?state.party.length:!unlocks[key]||state.flags[unlocks[key]]).map(([key,label,detail])=>`<button data-menu="${key}">${esc(label)}<small>${esc(detail)}</small></button>`).join('')}</div>`);
  document.querySelectorAll<HTMLButtonElement>('[data-menu]').forEach(b=>b.onclick=async()=>{const key=b.dataset.menu;ui.close();if(key==='party')partyMenu();if(key==='bag')bagMenu();if(key==='trainer')trainerCard();if(key==='save'){save();await ui.message(`${state.name} saved the game!`);}if(key==='options')optionsMenu();});
}
function partyMenu(focused=0){ui.panel(`<button class="close-panel" id="close-party" aria-label="Close">×</button><span class="eyebrow">POKÉMON</span><h2>Your party</h2>${state.party.map((mon,i)=>partyRow(mon,i,NATIVE_EGG_ICON)).join('')}`,false);$('close-party').onclick=()=>ui.close();document.querySelectorAll<HTMLButtonElement>('[data-party-slot]').forEach(b=>b.onclick=()=>{void choosePartyAction(Number(b.dataset.partySlot));});document.querySelector<HTMLButtonElement>(`[data-party-slot="${focused}"]`)?.focus();}
async function choosePartyAction(index:number){
  if(sourceActions?.busy||recoveryPrompt||transitioning||walking||vm.busy||battle.active||!state.party[index])return;
  const result=await executeSourceAction(async()=>{
    const controller=new AbortController(),cancelled=new DOMException('Party selection cancelled','AbortError');
    const cancel=(event:KeyboardEvent)=>{if(event.code==='Escape'){event.preventDefault();controller.abort(cancelled);}};
    addEventListener('keydown',cancel);keys.clear();drag=false;
    try{
      // Native field menus omit Switch only in the Battle Tower partner room.
      const canSwitch=state.map!==data.constants.MAP_BATTLE_TOWER_PARTNER_ROOM;
      const options=canSwitch?['Summary','Switch','Cancel']:['Summary','Cancel'];
      const action=await ui.choose(state.party[index].name,options,'',controller.signal);
      if(action===0)return{summary:index,focused:index};
      if(!canSwitch||action!==1)return{focused:index};
      const target=await chooseFieldPartySwitchTarget(()=>state.party,index,ui,controller.signal);
      state.party=swapFieldPartySlots(state.party,index,target);updateHUD();
      return{focused:target??index};
    }catch(error){if(controller.signal.aborted&&error===cancelled)return{focused:index};throw error;}
    finally{removeEventListener('keydown',cancel);}
  });
  if(!result.ok){partyMenu(index);return;}
  if(result.value.summary!==undefined)summary(result.value.summary);else partyMenu(result.value.focused);
}
function summary(index:number){const mon=state.party[index];if(!mon)return;ui.panel(`<button class="close-panel" id="summary-back" aria-label="Back">×</button><span class="eyebrow">POKÉMON SUMMARY</span>${partySummary(data,mon,NATIVE_EGG_ICON,data.eggSummary)}`);$('summary-back').onclick=()=>partyMenu(index);}
function bagMenu(){const pockets=new Map<string,[string,number][]>();for(const [key,count]of Object.entries(state.bag)){if(count<=0)continue;const item=data.items.find(i=>i.item===key),pocket=titleCase((item?.fieldPocket||'POCKET_KEY_ITEMS').replace('POCKET_',''));if(!pockets.has(pocket))pockets.set(pocket,[]);pockets.get(pocket)!.push([key,count]);}
  ui.panel(`<button class="close-panel" id="close-bag" aria-label="Close">×</button><span class="eyebrow">BAG</span><h2>Your belongings</h2>${[...pockets].map(([pocket,items])=>`<h3>${pocket}</h3>${items.map(([key,count])=>`<div class="list-row"><b>${esc(itemName(data,key))}</b><span style="margin-left:auto">× ${count}</span></div>`).join('')}`).join('')||'<p>Your Bag is empty.</p>'}`);$('close-bag').onclick=()=>ui.close();
}
function trainerCard(){ui.panel(`<button class="close-panel" id="close-card" aria-label="Close">×</button><span class="eyebrow">TRAINER CARD</span><h2>${esc(state.name)}</h2><p>Money: ₽${state.money}<br>Pokédex: ${state.caught.length} caught / ${state.seen.length} seen<br>Play time: ${Math.floor(state.playSeconds/3600)}:${String(Math.floor(state.playSeconds/60)%60).padStart(2,'0')}<br>Badges: ${state.badges.length} / 16</p>`);$('close-card').onclick=()=>ui.close();}
function optionsMenu(){ui.panel('<span class="eyebrow">OPTIONS</span><h2>Game settings</h2><div class="actions"><button id="battle-style">Battle style: '+(state.options.battleStyle==='shift'?'Shift':'Set')+'</button><button id="close-options" class="secondary">Done</button></div>');$('battle-style').onclick=()=>{state.options.battleStyle=state.options.battleStyle==='shift'?'set':'shift';optionsMenu();};$('close-options').onclick=()=>{ui.close();save();};}
async function title(){
  const saved=readSave();openingView=new OpeningView(ui);
  try{
    const [menu,labels]=await Promise.all([sourceJSON<Record<string,string>>('messages/442.json'),sourceJSON<Record<string,string>>('messages/719.json')]);
    await openingView.title(world.renderer,labels['0'].replace(/\{[^}]+\}/g,''));
    // Asset loading and every identity choice operate on a draft. Continue or
    // a failed/cancelled introduction cannot replace the existing browser save.
    const detail=saved?`${menu['13']}: ${saved.name} · ${menu['14']}: ${Math.floor(saved.playSeconds/3600)}:${String(Math.floor(saved.playSeconds/60)%60).padStart(2,'0')} · ${menu['16']}: ${saved.badges.length}`+(saved.pokedexEnabled?` · ${menu['15']}: ${saved.caught.length}`:''):'';
    state=await runOpeningSession(saved,async()=>({messages:data.intro.msg_0219,defaultNames:await sourceJSON<Record<string,string>>('messages/254.json')}),openingView,identity=>newState(data,identity.name,identity.gender),menu,detail);
  }finally{openingView.dispose();openingView=null;keys.clear();}
  await begin();
}
async function begin(){
  player=world.paper(state.gender==='boy'?'SPRITE_HERO':'SPRITE_HEROINE');battle=new Battle(data,state,ui,Math.random,new WorldBattleView(world,()=>({x:state.x,z:state.z,y:player.group.position.y,facing:state.facing,location:displayMapName(map),gender:state.gender,actors:[player.group,...(follower?[follower.group]:[])]})));objects=new FieldObjects(data,state);
  vm=new ScriptVM(data,state,{eggHatchAnim:()=>hatchEgg(),cameraTarget:target=>setScriptCameraTarget(world,state.map,target),violetGym:{init:()=>world.violetGym.init(state,restoringGym),elevator:()=>world.violetGym.ride(state,{waitFollower:async signal=>{while(followerMoving){if(signal.aborted)throw Error('Follower wait cancelled');await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));}},player:()=>({x:state.x,y:player.group.position.y,z:state.z}),placeRiders:y=>{player.group.position.y=y;if(follower)follower.group.position.y=y;}})},objectMovement:(id,next)=>objects.movement(id,next),objectFacing:id=>objects.facing(id),followerActive:()=>!!follower&&!followerSuppressed&&follower.group.visible,trainerPath:beginTrainerPath,trainerStep:finishTrainerPath,weather:value=>{if(value!==undefined)world.sky.setWeather(value);return world.sky.currentWeather;},objectName:id=>map.events.objects.find(n=>map.constants[n.id]===id)?.id,healAnimation:count=>world.healAnimation(count,state.x,state.z-3),followerVisible:visible=>{followerSuppressed=!visible;},message:async text=>{refreshNPCs();await ui.message(text);},choice:text=>ui.choose('',['Yes','No'],text),coordinates:id=>{if(id===SCRIPT_CAMERA_ACTOR){const point=world.scriptCameraPosition;if(!point)throw Error('Missing original camera movement object 241');return{x:Math.floor(point.x),z:Math.floor(point.z)};}const n=objects.get(id);return n?{x:Math.floor(n.x),z:Math.floor(n.z)}:{x:255,z:255};},nameRival:()=>ui.input('What was your rival’s name?',7,'Silver'),whiteOut,catchingTutorial:async()=>{keys.clear();const demo=catchingTutorialState(data,state);await new Battle(data,demo.state,ui,Math.random,new WorldBattleView(world,()=>({x:state.x,z:state.z,y:player.group.position.y,facing:state.facing,location:displayMapName(map),gender:demo.state.gender,actors:[player.group,...(follower?[follower.group]:[])]}))).start([demo.enemy],null,{tutorial:true});keys.clear();await runFieldEntry('resume');},move:moveActor,position:setPosition,face,visible:showPerson,chooseStarter,nickname:async i=>{const mon=state.party[i];if(mon)mon.name=await ui.input('Pokémon nickname',10,mon.name);},refresh:async()=>{followerSuppressed=false;refreshNPCs();updateHUD();},battle:trainerBattle,warp:(id,x,z)=>enterMap(id,x+.5,z+.5)});
  sourceActions=new SourceActionRecovery(state,{capture:captureField,restore:restoreField});started=true;try{await enterMap(state.map,state.x,state.z,true,true);}catch(error){started=false;ready=false;throw error;}ready=true;save();$('original-world').focus();
}
async function boot(){
  data=await loadData();world=new OriginalWorld($<HTMLCanvasElement>('original-world'),data.index,data.sprites);ui.loading(null);
  let previous=performance.now();function render(now:number){requestAnimationFrame(render);const dt=Math.min(.05,(now-previous)/1000);previous=now;elapsed+=dt;if(!started){openingView?.draw(dt);return;}
    state.playSeconds+=dt;if(player){player.group.position.set(state.x,world.violetGym.riderHeight??playerTweenY??world.height(state.x,state.z,player.group.position.y,player.group.position.x,player.group.position.z),state.z);world.animate(player,state.facing,walking?stepFrame:-1);}
    if(hatchFollowerPendingCommit&&!sourceActions?.busy)hatchFollowerPendingCommit=false;
    const lead=firstFollowerMon(state.party);if(!hatchFollowerPendingCommit&&(followMon!==(lead??null)||followSpecies!==(lead?.species??0))){const position=follower?.group.position.clone()??player.group.position.clone();if(follower)world.removePaper(follower);follower=null;followSpecies=lead?.species??0;followMon=lead??null;const key=lead?'SPRITE_FOLLOWER_MON_'+data.personal[lead.species].species:'';if(lead&&data.sprites[key]){follower=world.paper(key,1.5);follower.group.position.copy(position);}}
    if(follower){world.animate(follower,followerFacing,followerMoving?followerStep:-1);follower.group.visible=!!lead&&!followerSuppressed&&!world.battleStage?.active;}
    if(!world.fieldTransitionActive){if(keys.has('KeyQ'))world.yaw+=dt*1.4;if(keys.has('KeyE'))world.yaw-=dt*1.4;}
    if(ready&&!transitioning&&!sourceActions?.recovering)world.updateStreaming(state.map,state.x,state.z);
    if(ready&&!sourceActions?.busy&&!recoveryPrompt&&!walking&&!transitioning&&!vm.busy&&!ui.busy&&!battle.active)void pollFieldInput().catch(error=>{console.error(error);lastError=String(error);});
    world.draw(state.x,state.z,dt,player.group.position.y);saveClock+=dt;if(saveClock>10&&!walking&&!vm.busy){saveClock=0;save();}
    (window as unknown as {__HG3D__:unknown}).__HG3D__={ready,map:state.map,code:map?.code,position:{x:state.x,y:player.group.position.y,z:state.z},facing:state.facing,walking,transitioning,vmBusy:vm?.busy,uiBusy:ui.busy,dialogue:ui.dialogueOpen,battle:!!battle?.active||!!world.battleStage?.active,battleView:world.battleStage?.active?'world':null,weather:world.sky.status,scriptCamera:world.scriptCameraPosition,camera:{yaw:world.yaw,pitch:world.pitch,distance:world.distance,position:world.camera.position.toArray(),target:world.target.toArray(),rotation:world.camera.quaternion.toArray()},follower:follower?{x:follower.group.position.x,y:follower.group.position.y,z:follower.group.position.z,moving:followerMoving,facing:followerFacing}:null,party:state.party.map(m=>({species:m.species,level:m.level,hp:m.hp,moves:m.moves})),flags:state.flags,vars:state.vars,bag:state.bag,unsupported:vm?.lastUnsupported,script:vm?.current,error:lastError,cells:world.cells.size,drawCalls:world.renderer.info.render.calls};
  }requestAnimationFrame(render);await title();
}
addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement)return;if(e.code==='Escape'){if(ui.dialogueOpen)return;if(ui.panelOpen){if(ui.canDismiss)ui.close();return;}menu();return;}if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','KeyF','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();keys.add(e.code);if(['KeyF','Enter'].includes(e.code)&&!e.repeat&&!ui.dialogueOpen)void interact();});
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>keys.clear());addEventListener('pagehide',save);
$('open-menu').onclick=menu;
let drag=false,lastPointer={x:0,y:0};const canvas=$<HTMLCanvasElement>('original-world');canvas.addEventListener('pointerdown',e=>{if(ui.busy||!started||world.fieldTransitionActive)return;drag=true;lastPointer={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(!drag||world.fieldTransitionActive)return;world.yaw-=(e.clientX-lastPointer.x)*.006;world.pitch=Math.max(.18,Math.min(.95,world.pitch+(e.clientY-lastPointer.y)*.003));lastPointer={x:e.clientX,y:e.clientY};});for(const event of ['pointerup','pointercancel'])canvas.addEventListener(event,()=>drag=false);canvas.addEventListener('wheel',e=>{e.preventDefault();if(world&&!world.fieldTransitionActive)world.distance=Math.max(5,Math.min(28,world.distance+e.deltaY*.01));},{passive:false});
document.querySelectorAll<HTMLButtonElement>('[data-control]').forEach(button=>{button.addEventListener('pointerdown',e=>{e.preventDefault();if(button.dataset.control==='KeyF'){void interact();return;}keys.add(button.dataset.control!);button.setPointerCapture(e.pointerId);});for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>keys.delete(button.dataset.control!));});
boot().catch(error=>{console.error(error);ui.loading(null);ui.panel('<h2>Johto could not load.</h2><p>The world needs WebGL 2 and its original data files. Reload to try again.</p><button id="retry" class="game-button">Retry</button>');$('retry').onclick=()=>location.reload();});
