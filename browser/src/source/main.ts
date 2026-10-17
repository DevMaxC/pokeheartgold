import './style.css';
import {loadData,newState,titleCase,speciesName,createMon,giveMon,healParty,itemName,moveName} from './data.ts';
import {OriginalWorld} from './world.ts';
import {mapWeather} from './atmosphere.ts';
import {UI,$,escapeHTML as esc} from './ui.ts';
import {ScriptVM,UnsupportedScript} from './script.ts';
import {Battle} from './battle.ts';
import {WorldBattleView} from './battle-stage.ts';
import {EncounterChecks,landSlot} from './encounter.ts';
import {doorwayEntry} from './terrain.ts';
import {ledgeDirection,jumpHeight} from './ledges.ts';
import {stepWarpFacing,pushWarp,fieldEntryScripts,arrivalStep,arrivalFacing} from './field-transitions.ts';
import {FieldObjects} from './objects.ts';
import {movementAction} from './movement.ts';
import {mapBlackoutSpawn} from './spawns.ts';
import {originalTrainerParty,battleMoneyLoss,trainerPrize} from './trainers.ts';
import {catchingTutorialState} from './tutorial.ts';
import type {State,SourceMap,NPC,Mon,GameData} from './types.ts';
import {TouchControls} from './touch-controls.ts';
import {CameraInput} from './camera-input.ts';
import {fieldInput,fieldInputFacing} from './field-input.ts';
import {readInterfacePreferences,writeInterfacePreferences} from './interface-preferences.ts';
import {InterfacePanels} from './interface-panels.ts';
import {isItemBallObject,runItemBallPickup} from './item-pickup.ts';
import {createNativeFieldMusicPlayer,type EffectiveMusic} from './field-music.ts';
import {nativeBattleMusic} from './battle-music.ts';

const SAVE_KEY=new URLSearchParams(location.search).has('qa')?'heartgold-3d-v2-qa':'heartgold-3d-v2';
const keys=new Set<string>();const ui=new UI();
const encounterChecks=new EncounterChecks();
let state:State,world:OriginalWorld,map:SourceMap,vm:ScriptVM,battle:Battle,data:GameData,objects:FieldObjects;
let ready=false,transitioning=false,connecting=false,walking=false,started=false,stepFrame=0,elapsed=0,saveClock=0;
let player:ReturnType<OriginalWorld['paper']>,follower:ReturnType<OriginalWorld['paper']>|null=null,followSpecies=0;
let lastWarp='',lastCoord='',lastError='';
let followerSuppressed=false;let playerDirectionLocked=false;let followerFacing=1,followerMoving=false,followerStep=-1;
let playerTweenY:number|undefined;let previousStepJump=false;
const npcTweenY=new Map<string,number>();
const deltas=[{x:0,z:-1},{x:0,z:1},{x:-1,z:0},{x:1,z:0}];
let preferenceStorage:Storage|null=null;try{preferenceStorage=localStorage;}catch{/* Private browsing still has working controls. */}
let preferences=readInterfacePreferences(preferenceStorage),panels:InterfacePanels;
const music=createNativeFieldMusicPlayer({enabled:preferences.music,volume:preferences.volume});
let musicKey='',musicError='',pickupRecoveryBlocked=false,soundUnlocked=false;let unlockPending:Promise<void>|null=null;let battleSoundOwned=false;let musicRequestPending:Promise<void>|null=null;let musicRequestSerial=0;const pendingMusicRestores=new Set<()=>Promise<void>>();
function reportInputError(error:unknown){if(error instanceof DOMException&&error.name==='AbortError')return;console.error(error);lastError=String(error);ui.toast('That action could not finish. Please try again.');}
async function retryMusicRestores(){for(const restore of pendingMusicRestores){await restore();pendingMusicRestores.delete(restore);}}
function unlockSound(){if(soundUnlocked){if(!musicRequestPending&&(musicError||pendingMusicRestores.size)){musicKey='';syncMusic();}return;}if(unlockPending)return;const pending=music.unlock();unlockPending=pending;void pending.then(()=>{soundUnlocked=true;musicKey='';syncMusic();}).catch(error=>{musicError=String(error);}).finally(()=>{if(unlockPending===pending)unlockPending=null;});}
function syncMusic(){
  if(!started||!map||battle?.active||battleSoundOwned)return;
  const hour=new Date().getHours(),key=JSON.stringify([map.id,hour,state.flags,preferences.music,preferences.volume]);if(key===musicKey)return;musicKey=key;const request=++musicRequestSerial;
  const pending=music.playMap(map,{hour,flags:state.flags}).then(async()=>{if(request!==musicRequestSerial||key!==musicKey)return;await retryMusicRestores();if(request===musicRequestSerial&&key===musicKey)musicError='';}).catch(error=>{if(request!==musicRequestSerial||key!==musicKey||battleSoundOwned)return;musicError=String(error);console.warn(error);ui.toast('Music could not load. You can retry from Settings.');}).finally(()=>{if(musicRequestPending===pending)musicRequestPending=null;});musicRequestPending=pending;
}
function textDelay(){return [8,4,1][preferences.textSpeed]*1000/60;}
const touch=new TouchControls($('touch-pad'),{interact:()=>{unlockSound();void interact().catch(reportInputError);},menu:()=>{unlockSound();void menu().catch(reportInputError);}});
const camera=new CameraInput($('original-world'),{allowed:()=>!!world&&started&&ready&&(!transitioning||connecting)&&!pickupRecoveryBlocked&&!battleSoundOwned&&!vm?.busy&&!ui.busy&&!battle?.active&&!world.fieldTransitionActive,read:()=>({yaw:world.yaw,pitch:world.pitch,distance:world.distance}),write:orbit=>{world.yaw=orbit.yaw;world.pitch=orbit.pitch;world.distance=orbit.distance;},sensitivity:()=>preferences.cameraSensitivity});
function resetFieldInput(){keys.clear();touch.reset();camera.reset();}
function syncInputContext(){const field=started&&ready&&(!transitioning||connecting)&&!pickupRecoveryBlocked&&!battleSoundOwned&&!vm?.busy&&!ui.busy&&!battle?.active&&!world?.fieldTransitionActive;touch.setContext({movement:field,run:field&&!!state?.runningShoes,interact:ui.dialogueOpen||field&&!walking,menu:field&&!walking});camera.sync();$('game').dataset.gameState=!started?'title':battle?.active?'battle':'field';}
function running(){return !!state.runningShoes&&fieldInput(keys,touch.read()).run;}

function save(){if(!started||transitioning||vm?.busy||battle?.active||walking||pickupRecoveryBlocked||battleSoundOwned)return false;try{state.objectEvents=objects.save(state.map);localStorage.setItem(SAVE_KEY,JSON.stringify(state));return true;}catch{console.warn('Local save is unavailable');return false;}}
function readSave():State|null{try{const s=JSON.parse(localStorage.getItem(SAVE_KEY)||'null');return s?.version===2&&typeof s.name==='string'&&Number.isFinite(s.x)&&Number.isFinite(s.z)&&data.index.maps[s.map]&&Array.isArray(s.party)&&s.flags&&s.vars&&s.bag?s:null;}catch{return null;}}
function displayMapName(m:SourceMap){const names:Record<string,string>={T20:'New Bark Town',T20R0202:'Your room',T20R0201:'Home',T20R0101:'Professor Elm’s Lab',T20R0102:'Elm’s home',T21:'Cherrygrove City',T22:'Violet City'};if(names[m.code])return names[m.code];return m.key.replace('MAP_','').split('_').map(word=>/^\d+$/.test(word)?word:word[0]+word.slice(1).toLowerCase()).join(' ');}
function updateHUD(){
  $('map-name').textContent=displayMapName(map);$('map-detail').textContent=state.name?`${state.name} · ${state.badges.length} Badges · ₽${state.money.toLocaleString()}`:'';
  $('party-hud').innerHTML=state.party.map(m=>`<img src="/source/pokemon/${m.species}-${m.gender}-front.png" alt="${esc(m.name)} Level ${m.level}, ${m.hp} HP">`).join('');
}
function refreshNPCs(){world.updateNPCs(objects.snapshot());for(const[id,y]of npcTweenY){const actor=world.npcSprites.get(id);if(actor)actor.group.position.y=y;}}
function showPerson(object:string,value:boolean){objects.show(object,value);refreshNPCs();}
async function moveActor(object:string,label:string,source:SourceMap){
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
          const from={x:npc!.x,z:npc!.z},fromY=world.npcSprites.get(npc!.id)?.group.position.y??world.height(from.x+.5,from.z+.5),toY=world.height(from.x+d.x+.5,from.z+d.z+.5,fromY,from.x+.5,from.z+.5);try{await tween(action.seconds,t=>{npc!.x=from.x+d.x*t;npc!.z=from.z+d.z*t;npc!.step=t*4;if(action.jump)npcTweenY.set(npc!.id,jumpHeight(fromY,toY,t));refreshNPCs();});}finally{npcTweenY.delete(npc!.id);npc!.step=-1;refreshNPCs();}
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
  if(followFrom){const dx=from.x-followFrom.x,dz=from.z-followFrom.z;followerMoving=Math.hypot(dx,dz)>.001;if(followerMoving)followerFacing=Math.abs(dx)>Math.abs(dz)?dx>0?3:2:dz>0?1:0;}
  try{await tween(seconds,t=>{state.x=from.x+(x-from.x)*t;state.z=from.z+(z-from.z)*t;stepFrame=t*4;if(jump)playerTweenY=jumpHeight(fromY,toY,t);
    if(follower&&followFrom){const fx=followFrom.x+(from.x-followFrom.x)*t,fz=followFrom.z+(from.z-followFrom.z)*t;follower.group.position.set(fx,followerJump?jumpHeight(followFrom.y,fromY,t):world.height(fx,fz,follower.group.position.y,follower.group.position.x,follower.group.position.z),fz);followerStep=t*4;}
  });}finally{playerTweenY=undefined;previousStepJump=jump;stepFrame=-1;followerMoving=false;followerStep=-1;}
}

function face(object:string,facing?:number){const actor=objects.get(object);if(!actor)return;if(facing===undefined){const dx=state.x-actor.x-.5,dz=state.z-actor.z-.5;facing=Math.abs(dx)>Math.abs(dz)?dx>0?3:2:dz>0?1:0;}actor.facingDirection=facing;refreshNPCs();}
function setPosition(object:string,x:number,z:number,facing?:number){if(object==='obj_player'){state.x=x+.5;state.z=z+.5;if(facing!==undefined)state.facing=facing;return;}objects.position(object,x,z,facing);refreshNPCs();}
async function chooseStarter(){
  let chosen=0;while(!chosen){const id=await ui.customPanel<number>('<span class="eyebrow">PROFESSOR ELM’S LAB</span><h2>Choose a Pokémon.</h2><p>Choose a Poké Ball to see what Pokémon is inside.</p><div class="select-row">'+[152,155,158].map(id=>`<button data-starter-id="${id}"><img src="/source/pokemon/${id}-male-front.png" alt="${speciesName(data,id)}">${speciesName(data,id)}<small class="tag">${titleCase(data.personal[id].types[0])}</small></button>`).join('')+'</div>',(resolve,current)=>{const buttons=Array.from($('panel-content').querySelectorAll<HTMLButtonElement>('[data-starter-id]'));for(const button of buttons)button.onclick=()=>{if(current())resolve(Number(button.dataset.starterId));};return()=>{for(const button of buttons)button.onclick=null;};});
    if(await ui.choose(`You’ll take ${speciesName(data,id)}, the ${titleCase(data.personal[id].types[0])}-type Pokémon?`,['Yes','No'])===0)chosen=id;
  }
  const mon=createMon(data,chosen,5,state.name);giveMon(state,mon);state.starter=chosen;updateHUD();
}
async function runScript(script:string|number,object='obj_player',nested=false,preserveControls=false,deferTriggers=false){
  if(vm.busy&&!nested)return;
  const runner=nested?new ScriptVM(data,state,vm.hooks):vm;
  if(!preserveControls)resetFieldInput();walking=true;
  try{
    if(isItemBallObject(map,object)){
      for(;;){
        pickupRecoveryBlocked=true;
        try{await runItemBallPickup(state,objects,async()=>{await runner.run(map,script,object);updateHUD();},async()=>{refreshNPCs();updateHUD();});pickupRecoveryBlocked=false;lastError='';break;}
        catch(error){lastError=String(error);console.error(error);const refreshFailed=error instanceof AggregateError&&error.message==='Item pickup failed and its actors could not be refreshed';pickupRecoveryBlocked=refreshFailed;const choices=refreshFailed?['Retry']:['Retry','Return'];const answer=await ui.choose('The item could not be collected.',choices,'The pickup has been restored. Retry to collect it.',undefined,refreshFailed?{}:{cancelIndex:1});if(answer===1)break;}
      }
    }else{await runner.run(map,script,object);updateHUD();}
  }
  catch(error){lastError=String(error);console.error(error);if(error instanceof UnsupportedScript)await ui.message('This scene is still being restored. Your progress has been kept.');else await ui.message('The scene could not finish. Your progress has been kept.');}
  finally{walking=false;save();}
  if(!nested&&!vm.busy&&!deferTriggers)await checkFrameTriggers();
}
async function runFieldEntry(kind:'connection'|'warp'|'resume',preserveControls=false){for(const event of fieldEntryScripts(kind))if(map.initScripts[event])await runScript(map.initScripts[event],'obj_player',vm.busy,preserveControls,true);}
async function enterMap(id:number,x:number,z:number,runEntry=true,restoreObjects=false,connection=false,deferTriggers=false){
  encounterChecks.reset();
  playerDirectionLocked=false;
  const loadingText='Entering '+(data.index.maps[id]?.name||'Johto')+'…';
  transitioning=true;connecting=connection;if(!connection){world.beginFieldTransition();resetFieldInput();previousStepJump=false;ui.loading(loadingText);}state.map=id;state.x=x;state.z=z;
  try{
    let retried=false;
    for(;;){
      try{
        map=await world.map(id);if(map.mapType!=='MAP_TYPE_CAVE'){state.flags.FLAG_SYS_FLASH=false;state.flags.FLAG_SYS_DEFOG=false;}map=connection?await world.connect(id,x,z,mapWeather(map,state)):await world.enter(id,x,z,mapWeather(map,state));world.clearNPCs();objects.load(map.events.objects);if(restoreObjects)objects.restore(id,state.objectEvents);if(!connection){const spawn=await mapBlackoutSpawn(id);if(spawn)state.lastHeal={...spawn.death};}player.group.visible=true;refreshNPCs();updateHUD();if(!connection){player.group.position.set(x,world.height(x,z),z);if(follower)follower.group.position.copy(player.group.position);}
        if(retried)lastError='';break;
      }catch(error){
        if(connection)throw error;
        lastError=String(error);retried=true;ui.loading(null);
        await ui.choose('This area could not load.',['Retry']);keys.clear();ui.loading(loadingText);
      }
    }
    if(!connection)world.endFieldTransition();
    if(runEntry)await runFieldEntry(connection?'connection':'warp',connection);
  }finally{transitioning=false;connecting=false;if(!connection){world.endFieldTransition();ui.loading(null);}}
  if(!deferTriggers)await checkFrameTriggers();
}
async function checkFrameTriggers(){if(pickupRecoveryBlocked||battleSoundOwned||vm.busy||ui.busy||battle.active)return false;const trigger=map.initTriggers.find(t=>vm.value(t.var,map)===t.value);if(!trigger)return false;await runScript(trigger.script);return true;}
async function warp(index:number,facing=state.facing){
  transitioning=true;resetFieldInput();
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
}
async function checkEvents(enteredDoor=false){
  const x=Math.floor(state.x),z=Math.floor(state.z);const owner=world.owner(state.x,state.z);
  if(owner!==undefined&&owner!==state.map){await enterMap(owner,state.x,state.z,true,false,true);}
  const warpIndex=map.events.warps.findIndex(w=>w.x===x&&w.z===z),key=map.id+':'+x+','+z;
  if(key!==lastWarp)lastWarp='';
  const trigger=map.events.coords.find(c=>x>=c.x&&x<c.x+(c.w||1)&&z>=c.z&&z<c.z+(c.h||1)&&vm.value(c.var||'0',map)===c.val);
  if(trigger){const id=String(trigger.scriptId)+':'+key;if(id!==lastCoord){lastCoord=id;await runScript(trigger.scriptId);return;}}else lastCoord='';
  const transitionFacing=enteredDoor?state.facing:stepWarpFacing(world.permission(state.x,state.z),state.facing);
  if(warpIndex>=0&&key!==lastWarp&&transitionFacing!==null){await warp(warpIndex,transitionFacing);save();return;}if(warpIndex<0)lastWarp='';
  if(await checkFrameTriggers())return;
  if(!vm.busy&&!ui.busy&&!transitioning)await wildEncounter();
}
async function wildEncounter(){
  if(!state.party.some(m=>m.hp>0))return;
  const behavior=world.permission(state.x,state.z)&255;if(![2,3,8].includes(behavior))return;
  const bank=map.fields.wildEncounterBank?.replace('ENCDATA_',''),encounter=data.encounters.find(e=>e.map===bank);if(!encounter?.land.rate||!encounterChecks.roll(encounter.land.rate,state.facing,running(),behavior===3))return;
  const slot=landSlot();
  const row=encounter.land.mons[slot];if(!row)return;const hour=new Date().getHours(),time=hour>=4&&hour<10?'morn':hour>=10&&hour<20?'day':'nite';let key=row.species[time];if(typeof key!=='string')key=key.HEARTGOLD;
  const species=data.constants[key],level=typeof row.level==='number'?row.level:row.level.HEARTGOLD;if(!species)return;
  await startBattle([createMon(data,species,level,'')]);
}
async function whiteOut(){healParty(state);state.facing=0;await enterMap(state.lastHeal.map,state.lastHeal.x,state.lastHeal.z);}
async function withBattleMusic<T>(enemies:Mon[],trainer:number|null,action:()=>Promise<T>,battleType=trainer===null?0:1){
  battleSoundOwned=true;const session=music.createCueSession(),controller=new AbortController();let fallback:EffectiveMusic|undefined;
  try{
    try{await retryMusicRestores();const {cue}=nativeBattleMusic(await music.catalog(),{battleType,mapId:state.map,trainerClass:trainer===null?undefined:data.constants[data.trainers[trainer].class],leadSpecies:enemies.find(mon=>mon.hp>0)?.species,flags:state.flags});await session.start(cue,controller.signal);}
    catch(error){musicError=String(error);console.warn(error);fallback=await music.field.suspend(music.capture());}
    return await action();
  }finally{
    controller.abort(new DOMException('Battle music completed','AbortError'));
    // Keep failed restore ownership until a later gesture or Settings retry;
    // selecting the current map first prevents reviving an old blackout cue.
    const restore=async()=>{await session.restore();if(fallback)await music.field.restore(fallback);};pendingMusicRestores.add(restore);
    let selected=false;try{await music.playMap(map,{hour:new Date().getHours(),flags:state.flags});selected=true;}catch(error){musicError=String(error);}
    if(selected)try{await retryMusicRestores();}catch(error){musicError=String(error);}
    battleSoundOwned=false;musicKey='';syncMusic();
  }
}
async function startBattle(enemies:Mon[],trainer:number|null=null,canLose=false){const battleMap=state.map;resetFieldInput();encounterChecks.reset();const result=await withBattleMusic(enemies,trainer,async()=>{const outcome=await battle.start(enemies,trainer,{noCritical:trainer!==null&&data.trainers[trainer].class==='TRAINERCLASS_PASSERBY',weather:world.sky.currentWeather});if(outcome==='lost'){if(canLose)healParty(state);else{state.money-=battleMoneyLoss(state.party,state.badges.length,state.money);if(trainer===null)await whiteOut();}}return outcome;});if(result==='caught'){const mon=enemies[0];if(await ui.choose(`Give a nickname to ${mon.name}?`,['Yes','No'])===0)mon.name=await ui.input('Pokémon nickname',10,mon.name);}
  if(result==='won'&&trainer!==null){const prize=await trainerPrize(data,trainer);state.money=Math.min(999999,state.money+prize);if(prize)await ui.message(`${state.name} got ₽${prize} for winning!`);}
  if(state.map===battleMap){resetFieldInput();await runFieldEntry('resume');}await checkFrameTriggers();updateHUD();save();return result==='won';
}
async function trainerBattle(id:number,options?:{second:number;canLose:boolean;suppressFollower:boolean}){const trainer=data.trainers[id];if(!trainer)throw Error(`Missing trainer ${id}`);if(options?.second||trainer.double)throw Error('Original double/multi battles are still being ported');return startBattle(await originalTrainerParty(data,id),id,options?.canLose);}
async function interact(){
  if(ui.dialogueOpen){ui.advance();return;}if(!started||walking||transitioning||pickupRecoveryBlocked||battleSoundOwned||vm.busy||ui.panelOpen||battle.active)return;
  const d=deltas[state.facing],x=Math.floor(state.x)+d.x,z=Math.floor(state.z)+d.z;
  const actorAt=(xx:number,zz:number)=>[...world.npcSprites.values()].find(n=>n.group.visible&&Math.floor(n.group.position.x)===xx&&Math.floor(n.group.position.z)===zz);
  const npc=actorAt(x,z)||((world.permission(x,z)&255)===0x80?actorAt(x+d.x,z+d.z):undefined);
  if(npc){await runScript(npc.npc.scriptId,npc.npc.id);return;}
  const bg=map.events.bgs.find(b=>(b.x===x&&b.z===z)||(b.x===Math.floor(state.x)&&b.z===Math.floor(state.z)));
  if(bg)await runScript(bg.scriptId);
}
async function step(facing:number){
  if(walking||transitioning||pickupRecoveryBlocked||battleSoundOwned||vm.busy||ui.busy||battle.active)return;state.facing=facing;const d=deltas[facing],x=Math.floor(state.x)+d.x+.5,z=Math.floor(state.z)+d.z+.5;
  const occupied=[...world.npcSprites.values()].some(n=>n.group.visible&&Math.floor(n.group.position.x)===Math.floor(x)&&Math.floor(n.group.position.z)===Math.floor(z));
  const exit=map.events.warps.findIndex(w=>w.x===Math.floor(state.x)&&w.z===Math.floor(state.z)),standing=world.permission(state.x,state.z),ladder=[60,61].includes(standing&255);
  if(exit>=0&&(!occupied||ladder)&&pushWarp(standing,facing,!world.terrainWalkable(x,z))){await warp(exit,facing);save();return;}
  // Native ledge collision takes priority over ordinary map/NPC blocking.
  if(ledgeDirection(world.permission(x,z))===facing){walking=true;try{await tweenPlayer(x+d.x,z+d.z,.42,true);}finally{walking=false;}encounterChecks.step();await checkEvents();return;}
  const nativeWarp=map.events.warps.some(w=>w.x===Math.floor(x)&&w.z===Math.floor(z));
  const enteredDoor=doorwayEntry(world.permission(x,z),nativeWarp,facing);
  if((!world.walkable(x,z,state.x,state.z,player.group.position.y)&&!enteredDoor)||occupied)return;
  walking=true;
  try{await tweenPlayer(x,z,running()? .14:.25);}
  finally{walking=false;}
  encounterChecks.step();await checkEvents(enteredDoor);
}
async function menu(){if(!started||!ready||pickupRecoveryBlocked||battleSoundOwned||vm.busy||walking||transitioning||battle.active||ui.busy)return;resetFieldInput();await panels.menu();resetFieldInput();}
async function title(){
  for(;;){
    const saved=readSave(),profile=saved?{name:saved.name,location:data.index.maps[saved.map]?.name??'Johto',badges:saved.badges.length,playSeconds:saved.playSeconds,party:saved.party}:null;
    const choice=await ui.startScreen(profile,undefined,unlockSound);
    if(choice==='settings'){await panels.settings();continue;}
    if(choice==='continue'&&saved){state=saved;await begin();return;}
    if(saved&&await ui.choose('Start a new adventure?',['Keep existing adventure','Start New Game'],'The new adventure will replace this browser’s HeartGold save.',undefined,{cancelIndex:0})===0)continue;
    break;
  }
  const intro=data.intro.msg_0219;await ui.message(intro.msg_0219_00006||'Welcome to the world of Pokémon!');await ui.message(intro.msg_0219_00034||'This world is widely inhabited by creatures known as Pokémon.');await ui.message(intro.msg_0219_00035||'We humans live alongside Pokémon as friends.');
  const gender=(await ui.choose('Are you a boy? Or are you a girl?',['Boy','Girl']))===0?'boy':'girl';let name='';while(!name){const candidate=await ui.input('Please tell me your name.',7,gender==='boy'?'Ethan':'Lyra');if(await ui.choose(`Your name is ${candidate}?`,['Yes','No'])===0)name=candidate;}
  state=newState(data,name,gender);await ui.message((intro.msg_0219_00043||'Your very own tale of grand adventure is about to unfold.').replace(/\{STRVAR_1 3, 0, 0\}/g,name));await begin();
}
async function begin(){
  state.options.sound=preferences.music;state.options.textSpeed=preferences.textSpeed;
  player=world.paper(state.gender==='boy'?'SPRITE_HERO':'SPRITE_HEROINE');battle=new Battle(data,state,ui,Math.random,new WorldBattleView(world,()=>({x:state.x,z:state.z,y:player.group.position.y,facing:state.facing,location:displayMapName(map),gender:state.gender,actors:[player.group,...(follower?[follower.group]:[])]})));objects=new FieldObjects(data,state);
  vm=new ScriptVM(data,state,{weather:value=>{if(value!==undefined)world.sky.setWeather(value);return world.sky.currentWeather;},objectName:id=>map.events.objects.find(n=>map.constants[n.id]===id)?.id,healAnimation:count=>world.healAnimation(count,state.x,state.z-3),followerVisible:visible=>{followerSuppressed=!visible;},message:async text=>{refreshNPCs();await ui.message(text,textDelay());},choice:text=>ui.choose('',['Yes','No'],text),coordinates:id=>{const n=objects.get(id);return n?{x:Math.floor(n.x),z:Math.floor(n.z)}:{x:255,z:255};},nameRival:()=>ui.input('What was your rival’s name?',7,'Silver'),whiteOut,catchingTutorial:async()=>{resetFieldInput();const demo=catchingTutorialState(data,state),demoBattle=new Battle(data,demo.state,ui,Math.random,new WorldBattleView(world,()=>({x:state.x,z:state.z,y:player.group.position.y,facing:state.facing,location:displayMapName(map),gender:demo.state.gender,actors:[player.group,...(follower?[follower.group]:[])]})));await withBattleMusic([demo.enemy],null,()=>demoBattle.start([demo.enemy],null,{tutorial:true}),1<<10);resetFieldInput();await runFieldEntry('resume');},move:moveActor,position:setPosition,face,visible:showPerson,chooseStarter,nickname:async i=>{const mon=state.party[i];if(mon)mon.name=await ui.input('Pokémon nickname',10,mon.name);},refresh:async()=>{followerSuppressed=false;refreshNPCs();updateHUD();},battle:trainerBattle,warp:(id,x,z)=>enterMap(id,x+.5,z+.5)});
  started=true;await enterMap(state.map,state.x,state.z,true,true);ready=true;save();$('original-world').focus();
}
async function boot(){
  data=await loadData();world=new OriginalWorld($<HTMLCanvasElement>('original-world'),data.index,data.sprites);panels=new InterfacePanels(ui,data,{state:()=>started?state:null,location:()=>displayMapName(map),save,preferences:()=>preferences,updatePreferences:value=>{preferences=writeInterfacePreferences(preferenceStorage,value);if(started){state.options.sound=preferences.music;state.options.textSpeed=preferences.textSpeed;}musicKey='';void music.setPreferences({enabled:preferences.music,volume:preferences.volume}).catch(error=>{musicError=String(error);}).finally(()=>{musicKey='';syncMusic();});},touch,gesture:unlockSound});ui.loading(null);
  let previous=performance.now();function render(now:number){requestAnimationFrame(render);const dt=Math.min(.05,(now-previous)/1000);previous=now;elapsed+=dt;syncInputContext();if(!started)return;syncMusic();
    state.playSeconds+=dt;if(player){player.group.position.set(state.x,playerTweenY??world.height(state.x,state.z,player.group.position.y,player.group.position.x,player.group.position.z),state.z);world.animate(player,state.facing,walking?stepFrame:-1);}
    const lead=state.party.find(m=>m.hp>0);if(lead&&followSpecies!==lead.species){if(follower)world.scene.remove(follower.group);const key='SPRITE_FOLLOWER_MON_'+data.personal[lead.species].species;if(data.sprites[key]){follower=world.paper(key,1.5);follower.group.position.copy(player.group.position);followSpecies=lead.species;}}
    if(follower){world.animate(follower,followerFacing,followerMoving?followerStep:-1);follower.group.visible=!!lead&&!followerSuppressed&&!world.battleStage?.active;}
    if(!pickupRecoveryBlocked&&!battleSoundOwned&&!ui.busy&&!vm.busy&&!battle.active&&!world.fieldTransitionActive){if(keys.has('KeyQ'))world.yaw+=dt*1.4*preferences.cameraSensitivity;if(keys.has('KeyE'))world.yaw-=dt*1.4*preferences.cameraSensitivity;}
    if(ready&&!transitioning)world.updateStreaming(state.map,state.x,state.z);
    if(ready&&!walking&&!transitioning&&!pickupRecoveryBlocked&&!battleSoundOwned&&!vm.busy&&!ui.busy&&!battle.active){const facing=fieldInputFacing(fieldInput(keys,touch.read()),world.yaw);if(facing!==null)void step(facing).catch(reportInputError);}
    world.draw(state.x,state.z,dt,player.group.position.y);saveClock+=dt;if(saveClock>10&&!walking&&!vm.busy){saveClock=0;save();}
    (window as unknown as {__HG3D__:unknown}).__HG3D__={ready,map:state.map,code:map?.code,position:{x:state.x,y:player.group.position.y,z:state.z},facing:state.facing,walking,transitioning,vmBusy:vm?.busy,uiBusy:ui.busy,dialogue:ui.dialogueOpen,battle:!!battle?.active||!!world.battleStage?.active,battleView:world.battleStage?.active?'world':null,weather:world.sky.status,camera:{yaw:world.yaw,pitch:world.pitch,distance:world.distance,position:world.camera.position.toArray(),target:world.target.toArray(),rotation:world.camera.quaternion.toArray()},follower:follower?{x:follower.group.position.x,y:follower.group.position.y,z:follower.group.position.z,moving:followerMoving,facing:followerFacing}:null,party:state.party.map(m=>({species:m.species,level:m.level,hp:m.hp,moves:m.moves})),flags:state.flags,vars:state.vars,bag:state.bag,unsupported:vm?.lastUnsupported,script:vm?.current,error:lastError,music:{effective:music.capture(),error:musicError},pickupRecoveryBlocked,cells:world.cells.size,drawCalls:world.renderer.info.render.calls};
  }requestAnimationFrame(render);await title();
}
addEventListener('keydown',e=>{if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey)return;const target=e.target as HTMLElement|null;if(target?.isContentEditable||target&&['INPUT','TEXTAREA','SELECT'].includes(target.tagName))return;unlockSound();if(ui.busy)return;if(e.code==='Escape'){e.preventDefault();if(!e.repeat)void menu().catch(reportInputError);return;}if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','KeyF','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();if(!started||pickupRecoveryBlocked||battleSoundOwned||transitioning&&!connecting||vm?.busy||battle?.active)return;keys.add(e.code);if(['KeyF','Enter'].includes(e.code)&&!e.repeat)void interact().catch(reportInputError);});
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',resetFieldInput);addEventListener('pagehide',()=>{resetFieldInput();save();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){resetFieldInput();soundUnlocked=false;}});
$('open-menu').onclick=()=>{unlockSound();void menu().catch(reportInputError);};
$('original-world').addEventListener('pointerdown',unlockSound,{passive:true});
boot().catch(error=>{console.error(error);ui.loading(null);ui.panel('<h2>Johto could not load.</h2><p>The world needs WebGL 2 and its original data files. Reload to try again.</p><button id="retry" class="game-button">Retry</button>');$('retry').onclick=()=>location.reload();});
