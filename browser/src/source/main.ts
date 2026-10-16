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

const SAVE_KEY=new URLSearchParams(location.search).has('qa')?'heartgold-3d-v2-qa':'heartgold-3d-v2';
const keys=new Set<string>();const ui=new UI();
const encounterChecks=new EncounterChecks();
let state:State,world:OriginalWorld,map:SourceMap,vm:ScriptVM,battle:Battle,data:GameData,objects:FieldObjects;
let ready=false,transitioning=false,walking=false,started=false,stepFrame=0,elapsed=0,saveClock=0;
let player:ReturnType<OriginalWorld['paper']>,follower:ReturnType<OriginalWorld['paper']>|null=null,followSpecies=0;
let lastWarp='',lastCoord='',lastError='';
let followerSuppressed=false;let playerDirectionLocked=false;let followerFacing=1,followerMoving=false,followerStep=-1;
let playerTweenY:number|undefined;
const npcTweenY=new Map<string,number>();
const deltas=[{x:0,z:-1},{x:0,z:1},{x:-1,z:0},{x:1,z:0}];
function save(){if(!started||transitioning||vm?.busy||battle?.active||walking)return;try{state.objectEvents=objects.save(state.map);localStorage.setItem(SAVE_KEY,JSON.stringify(state));}catch{console.warn('Local save is unavailable');}}
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
          const from={x:npc!.x,z:npc!.z},fromY=world.npcSprites.get(npc!.id)?.group.position.y??world.height(from.x+.5,from.z+.5),toY=world.height(from.x+d.x+.5,from.z+d.z+.5,fromY);try{await tween(action.seconds,t=>{npc!.x=from.x+d.x*t;npc!.z=from.z+d.z*t;npc!.step=t*4;if(action.jump)npcTweenY.set(npc!.id,jumpHeight(fromY,toY,t));refreshNPCs();});}finally{npcTweenY.delete(npc!.id);npc!.step=-1;refreshNPCs();}
        }
      }
    }else if(action.delay)await new Promise(resolve=>setTimeout(resolve,action.delay*1000));
    refreshNPCs();
  }
}
async function tween(seconds:number,fn:(t:number)=>void){const start=performance.now();await new Promise<void>(resolve=>{function frame(){const t=Math.min(1,(performance.now()-start)/(seconds*1000));fn(t);if(t<1)requestAnimationFrame(frame);else resolve();}frame();});}
async function tweenPlayer(x:number,z:number,seconds:number,jump=false){
  const from={x:state.x,z:state.z},followFrom=follower?.group.position.clone();
  const fromY=world.height(from.x,from.z,player.group.position.y),toY=world.height(x,z,fromY),followerJump=followFrom&&Math.hypot(from.x-followFrom.x,from.z-followFrom.z)>1.5;
  if(followFrom){const dx=from.x-followFrom.x,dz=from.z-followFrom.z;followerMoving=Math.hypot(dx,dz)>.001;if(followerMoving)followerFacing=Math.abs(dx)>Math.abs(dz)?dx>0?3:2:dz>0?1:0;}
  try{await tween(seconds,t=>{state.x=from.x+(x-from.x)*t;state.z=from.z+(z-from.z)*t;stepFrame=t*4;if(jump)playerTweenY=jumpHeight(fromY,toY,t);
    if(follower&&followFrom){const fx=followFrom.x+(from.x-followFrom.x)*t,fz=followFrom.z+(from.z-followFrom.z)*t;follower.group.position.set(fx,followerJump?jumpHeight(followFrom.y,fromY,t):world.height(fx,fz,follower.group.position.y),fz);followerStep=t*4;}
  });}finally{playerTweenY=undefined;stepFrame=-1;followerMoving=false;followerStep=-1;}
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
async function runScript(script:string|number,object='obj_player',nested=false,preserveControls=false,deferTriggers=false){
  if(vm.busy&&!nested)return;
  const runner=nested?new ScriptVM(data,state,vm.hooks):vm;
  if(!preserveControls)keys.clear();walking=true;
  try{await runner.run(map,script,object);updateHUD();}
  catch(error){lastError=String(error);console.error(error);if(error instanceof UnsupportedScript)await ui.message('This scene is still being restored. Your progress has been kept.');else await ui.message('The scene could not finish. Your progress has been kept.');}
  finally{walking=false;save();}
  if(!nested&&!vm.busy&&!deferTriggers)await checkFrameTriggers();
}
async function runFieldEntry(kind:'connection'|'warp'|'resume',preserveControls=false){for(const event of fieldEntryScripts(kind))if(map.initScripts[event])await runScript(map.initScripts[event],'obj_player',vm.busy,preserveControls,true);}
async function enterMap(id:number,x:number,z:number,runEntry=true,restoreObjects=false,connection=false,deferTriggers=false){
  encounterChecks.reset();
  playerDirectionLocked=false;
  transitioning=true;if(!connection){keys.clear();ui.loading('Entering '+(data.index.maps[id]?.name||'Johto')+'…');}state.map=id;state.x=x;state.z=z;
  try{
    map=await world.map(id);if(map.mapType!=='MAP_TYPE_CAVE'){state.flags.FLAG_SYS_FLASH=false;state.flags.FLAG_SYS_DEFOG=false;}map=connection?await world.connect(id,x,z,mapWeather(map,state)):await world.enter(id,x,z,mapWeather(map,state));world.clearNPCs();objects.load(map.events.objects);if(restoreObjects)objects.restore(id,state.objectEvents);if(!connection){const spawn=await mapBlackoutSpawn(id);if(spawn)state.lastHeal={...spawn.death};}player.group.visible=true;refreshNPCs();updateHUD();if(!connection){player.group.position.set(x,world.height(x,z),z);if(follower)follower.group.position.copy(player.group.position);}
    if(runEntry)await runFieldEntry(connection?'connection':'warp',connection);
  }finally{transitioning=false;if(!connection)ui.loading(null);}
  if(!deferTriggers)await checkFrameTriggers();
}
async function checkFrameTriggers(){if(vm.busy||ui.busy||battle.active)return false;const trigger=map.initTriggers.find(t=>vm.value(t.var,map)===t.value);if(!trigger)return false;await runScript(trigger.script);return true;}
async function warp(index:number,facing=state.facing){
  transitioning=true;keys.clear();
  try{
  const from=map.events.warps[index],id=data.index.mapIds[from.header];if(id===undefined)throw Error(`Missing original warp destination ${from.header}`);
  const destination=await world.map(id),target=destination.events.warps[from.anchor];if(!target)throw Error(`Missing original warp anchor ${from.header}:${from.anchor}`);
  lastWarp=id+':'+target.x+','+target.z;state.facing=facing;
  await enterMap(id,target.x+.5,target.z+.5,true,false,false,true);
  state.facing=arrivalFacing(world.permission(state.x,state.z),state.facing);
  if(state.map===id&&state.x===target.x+.5&&state.z===target.z+.5){const direction=arrivalStep(world.permission(state.x,state.z),state.facing);if(direction!==null){const d=deltas[direction],x=state.x+d.x,z=state.z+d.z,occupied=[...world.npcSprites.values()].some(n=>n.group.visible&&Math.floor(n.group.position.x)===Math.floor(x)&&Math.floor(n.group.position.z)===Math.floor(z));if(world.walkable(x,z)&&!occupied){transitioning=true;await tweenPlayer(x,z,.25);}}}
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
  const bank=map.fields.wildEncounterBank?.replace('ENCDATA_',''),encounter=data.encounters.find(e=>e.map===bank);if(!encounter?.land.rate||!encounterChecks.roll(encounter.land.rate,state.facing,!!state.runningShoes&&keys.has('ShiftLeft'),behavior===3))return;
  const slot=landSlot();
  const row=encounter.land.mons[slot];if(!row)return;const hour=new Date().getHours(),time=hour>=4&&hour<10?'morn':hour>=10&&hour<20?'day':'nite';let key=row.species[time];if(typeof key!=='string')key=key.HEARTGOLD;
  const species=data.constants[key],level=typeof row.level==='number'?row.level:row.level.HEARTGOLD;if(!species)return;
  await startBattle([createMon(data,species,level,'')]);
}
async function whiteOut(){healParty(state);state.facing=0;await enterMap(state.lastHeal.map,state.lastHeal.x,state.lastHeal.z);}
async function startBattle(enemies:Mon[],trainer:number|null=null,canLose=false){const battleMap=state.map;keys.clear();encounterChecks.reset();const result=await battle.start(enemies,trainer,{noCritical:trainer!==null&&data.trainers[trainer].class==='TRAINERCLASS_PASSERBY'});if(result==='caught'){const mon=enemies[0];if(await ui.choose(`Give a nickname to ${mon.name}?`,['Yes','No'])===0)mon.name=await ui.input('Pokémon nickname',10,mon.name);}
  if(result==='lost'){if(canLose)healParty(state);else{state.money-=battleMoneyLoss(state.party,state.badges.length,state.money);if(trainer===null)await whiteOut();}}
  if(result==='won'&&trainer!==null){const prize=await trainerPrize(data,trainer);state.money=Math.min(999999,state.money+prize);if(prize)await ui.message(`${state.name} got ₽${prize} for winning!`);}
  if(state.map===battleMap){keys.clear();await runFieldEntry('resume');await checkFrameTriggers();}updateHUD();save();return result==='won';
}
async function trainerBattle(id:number,options?:{second:number;canLose:boolean;suppressFollower:boolean}){const trainer=data.trainers[id];if(!trainer)throw Error(`Missing trainer ${id}`);if(options?.second||trainer.double)throw Error('Original double/multi battles are still being ported');return startBattle(await originalTrainerParty(data,id),id,options?.canLose);}
async function interact(){
  if(ui.dialogueOpen){ui.advance();return;}if(!started||walking||transitioning||vm.busy||ui.panelOpen||battle.active)return;
  const d=deltas[state.facing],x=Math.floor(state.x)+d.x,z=Math.floor(state.z)+d.z;
  const actorAt=(xx:number,zz:number)=>[...world.npcSprites.values()].find(n=>n.group.visible&&Math.floor(n.group.position.x)===xx&&Math.floor(n.group.position.z)===zz);
  const npc=actorAt(x,z)||((world.permission(x,z)&255)===0x80?actorAt(x+d.x,z+d.z):undefined);
  if(npc){await runScript(npc.npc.scriptId,npc.npc.id);return;}
  const bg=map.events.bgs.find(b=>(b.x===x&&b.z===z)||(b.x===Math.floor(state.x)&&b.z===Math.floor(state.z)));
  if(bg)await runScript(bg.scriptId);
}
async function step(facing:number){
  if(walking||transitioning||vm.busy||ui.busy||battle.active)return;state.facing=facing;const d=deltas[facing],x=Math.floor(state.x)+d.x+.5,z=Math.floor(state.z)+d.z+.5;
  const occupied=[...world.npcSprites.values()].some(n=>n.group.visible&&Math.floor(n.group.position.x)===Math.floor(x)&&Math.floor(n.group.position.z)===Math.floor(z));
  const exit=map.events.warps.findIndex(w=>w.x===Math.floor(state.x)&&w.z===Math.floor(state.z)),standing=world.permission(state.x,state.z),ladder=[60,61].includes(standing&255);
  if(exit>=0&&(!occupied||ladder)&&pushWarp(standing,facing,!world.walkable(x,z))){await warp(exit,facing);save();return;}
  if(ledgeDirection(world.permission(x,z))===facing&&!occupied){const lx=x+d.x,lz=z+d.z,landingOccupied=[...world.npcSprites.values()].some(n=>n.group.visible&&Math.floor(n.group.position.x)===Math.floor(lx)&&Math.floor(n.group.position.z)===Math.floor(lz));if(world.walkable(lx,lz)&&!landingOccupied){walking=true;try{await tweenPlayer(lx,lz,.42,true);}finally{walking=false;}encounterChecks.step();await checkEvents();}return;}
  const nativeWarp=map.events.warps.some(w=>w.x===Math.floor(x)&&w.z===Math.floor(z));
  const enteredDoor=doorwayEntry(world.permission(x,z),nativeWarp,facing);
  if((!world.walkable(x,z)&&!enteredDoor)||occupied)return;
  walking=true;
  try{await tweenPlayer(x,z,keys.has('ShiftLeft')&&state.runningShoes? .14:.25);}
  finally{walking=false;}
  encounterChecks.step();await checkEvents(enteredDoor);
}
function menu(){if(!started||vm.busy||walking||battle.active||ui.dialogueOpen)return;if(ui.panelOpen){ui.close();return;}
  const entries=[['party','Pokémon',`${state.party.length} in your party`],['bag','Bag','Items and Key Items'],['trainer',state.name,`${state.badges.length} Badges`],['save','Save','Save your adventure'],['options','Options','Game settings'],['close','Close','Return to Johto']];
  const unlocks:Record<string,string>={bag:'FLAG_GOT_BAG',trainer:'FLAG_GOT_TRAINER_CARD',save:'FLAG_GOT_SAVE_BUTTON',options:'FLAG_GOT_OPTIONS_BUTTON'};
  ui.panel(`<span class="eyebrow">POKÉMON HEARTGOLD</span><h2>Menu</h2><div class="menu-list">${entries.filter(([key])=>key==='party'?state.party.length:!unlocks[key]||state.flags[unlocks[key]]).map(([key,label,detail])=>`<button data-menu="${key}">${esc(label)}<small>${esc(detail)}</small></button>`).join('')}</div>`);
  document.querySelectorAll<HTMLButtonElement>('[data-menu]').forEach(b=>b.onclick=async()=>{const key=b.dataset.menu;ui.close();if(key==='party')partyMenu();if(key==='bag')bagMenu();if(key==='trainer')trainerCard();if(key==='save'){save();await ui.message(`${state.name} saved the game!`);}if(key==='options')optionsMenu();});
}
function partyMenu(){ui.panel(`<button class="close-panel" id="close-party" aria-label="Close">×</button><span class="eyebrow">POKÉMON</span><h2>Your party</h2>${state.party.map((mon,i)=>`<div class="list-row"><img src="/source/pokemon/${mon.species}-${mon.gender}-front.png" alt=""><div><b>${esc(mon.name)}</b><p>Lv.${mon.level} · ${mon.hp}/${mon.maxHP} HP ${mon.status}</p><span class="hp-bar"><i style="width:${mon.hp/mon.maxHP*100}%"></i></span></div><button data-summary="${i}">Summary</button></div>`).join('')}`);$('close-party').onclick=()=>ui.close();document.querySelectorAll<HTMLButtonElement>('[data-summary]').forEach(b=>b.onclick=()=>summary(Number(b.dataset.summary)));}
function summary(index:number){const m=state.party[index],base=data.personal[m.species];ui.panel(`<button class="close-panel" id="summary-back" aria-label="Back">×</button><span class="eyebrow">POKÉMON SUMMARY</span><h2>${esc(m.name)} <small>Lv.${m.level}</small></h2><img class="intro-portrait" src="/source/pokemon/${m.species}-${m.gender}-front.png" alt="${esc(m.name)}"><p>${base.types.filter((t,i,a)=>a.indexOf(t)===i).map(titleCase).join(' / ')} · OT ${esc(m.ot)}<br>HP ${m.hp}/${m.maxHP} · Attack ${m.stats.atk} · Defense ${m.stats.def}<br>Sp. Atk ${m.stats.spatk} · Sp. Def ${m.stats.spdef} · Speed ${m.stats.speed}</p>${m.moves.map(slot=>`<div class="move-row"><span>${moveName(data,slot.id)}</span><span>PP ${slot.pp}/${slot.maxPP}</span></div>`).join('')}`);$('summary-back').onclick=partyMenu;}
function bagMenu(){const pockets=new Map<string,[string,number][]>();for(const [key,count]of Object.entries(state.bag)){if(count<=0)continue;const item=data.items.find(i=>i.item===key),pocket=titleCase((item?.fieldPocket||'POCKET_KEY_ITEMS').replace('POCKET_',''));if(!pockets.has(pocket))pockets.set(pocket,[]);pockets.get(pocket)!.push([key,count]);}
  ui.panel(`<button class="close-panel" id="close-bag" aria-label="Close">×</button><span class="eyebrow">BAG</span><h2>Your belongings</h2>${[...pockets].map(([pocket,items])=>`<h3>${pocket}</h3>${items.map(([key,count])=>`<div class="list-row"><b>${esc(itemName(data,key))}</b><span style="margin-left:auto">× ${count}</span></div>`).join('')}`).join('')||'<p>Your Bag is empty.</p>'}`);$('close-bag').onclick=()=>ui.close();
}
function trainerCard(){ui.panel(`<button class="close-panel" id="close-card" aria-label="Close">×</button><span class="eyebrow">TRAINER CARD</span><h2>${esc(state.name)}</h2><p>Money: ₽${state.money}<br>Pokédex: ${state.caught.length} caught / ${state.seen.length} seen<br>Play time: ${Math.floor(state.playSeconds/3600)}:${String(Math.floor(state.playSeconds/60)%60).padStart(2,'0')}<br>Badges: ${state.badges.length} / 16</p>`);$('close-card').onclick=()=>ui.close();}
function optionsMenu(){ui.panel('<span class="eyebrow">OPTIONS</span><h2>Game settings</h2><div class="actions"><button id="battle-style">Battle style: '+(state.options.battleStyle==='shift'?'Shift':'Set')+'</button><button id="close-options" class="secondary">Done</button></div>');$('battle-style').onclick=()=>{state.options.battleStyle=state.options.battleStyle==='shift'?'set':'shift';optionsMenu();};$('close-options').onclick=()=>{ui.close();save();};}
async function title(){
  const saved=readSave();const choice=await ui.choose('Pokémon HeartGold',saved?['Continue','New Game']:['New Game'],saved?`${saved.name} · ${data.index.maps[saved.map]?.name} · ${saved.badges.length} Badges`:'A grand adventure in the Johto region awaits.');
  if(saved&&choice===0){state=saved;await begin();return;}
  if(saved&&await ui.choose('Start a new adventure?',['Keep existing adventure','Start New Game'],'The new adventure will replace this browser’s HeartGold save.')===0){await title();return;}
  const intro=data.intro.msg_0219;await ui.message(intro.msg_0219_00006||'Welcome to the world of Pokémon!');await ui.message(intro.msg_0219_00034||'This world is widely inhabited by creatures known as Pokémon.');await ui.message(intro.msg_0219_00035||'We humans live alongside Pokémon as friends.');
  const gender=(await ui.choose('Are you a boy? Or are you a girl?',['Boy','Girl']))===0?'boy':'girl';let name='';while(!name){const candidate=await ui.input('Please tell me your name.',7,gender==='boy'?'Ethan':'Lyra');if(await ui.choose(`Your name is ${candidate}?`,['Yes','No'])===0)name=candidate;}
  state=newState(data,name,gender);await ui.message((intro.msg_0219_00043||'Your very own tale of grand adventure is about to unfold.').replace(/\{STRVAR_1 3, 0, 0\}/g,name));await begin();
}
async function begin(){
  player=world.paper(state.gender==='boy'?'SPRITE_HERO':'SPRITE_HEROINE');battle=new Battle(data,state,ui,Math.random,new WorldBattleView(world,()=>({x:state.x,z:state.z,facing:state.facing,location:displayMapName(map),gender:state.gender,actors:[player.group,...(follower?[follower.group]:[])]})));objects=new FieldObjects(data,state);
  vm=new ScriptVM(data,state,{weather:value=>{if(value!==undefined)world.sky.setWeather(value);return world.sky.currentWeather;},objectName:id=>map.events.objects.find(n=>map.constants[n.id]===id)?.id,healAnimation:count=>world.healAnimation(count,state.x,state.z-3),followerVisible:visible=>{followerSuppressed=!visible;},message:async text=>{refreshNPCs();await ui.message(text);},choice:text=>ui.choose('',['Yes','No'],text),coordinates:id=>{const n=objects.get(id);return n?{x:Math.floor(n.x),z:Math.floor(n.z)}:{x:255,z:255};},nameRival:()=>ui.input('What was your rival’s name?',7,'Silver'),whiteOut,catchingTutorial:async()=>{keys.clear();const demo=catchingTutorialState(data,state);await new Battle(data,demo.state,ui,Math.random,new WorldBattleView(world,()=>({x:state.x,z:state.z,facing:state.facing,location:displayMapName(map),gender:demo.state.gender,actors:[player.group,...(follower?[follower.group]:[])]}))).start([demo.enemy],null,{tutorial:true});keys.clear();await runFieldEntry('resume');},move:moveActor,position:setPosition,face,visible:showPerson,chooseStarter,nickname:async i=>{const mon=state.party[i];if(mon)mon.name=await ui.input('Pokémon nickname',10,mon.name);},refresh:async()=>{followerSuppressed=false;refreshNPCs();updateHUD();},battle:trainerBattle,warp:(id,x,z)=>enterMap(id,x+.5,z+.5)});
  started=true;await enterMap(state.map,state.x,state.z,true,true);ready=true;save();$('original-world').focus();
}
async function boot(){
  data=await loadData();world=new OriginalWorld($<HTMLCanvasElement>('original-world'),data.index,data.sprites);ui.loading(null);
  let previous=performance.now();function render(now:number){requestAnimationFrame(render);const dt=Math.min(.05,(now-previous)/1000);previous=now;elapsed+=dt;if(!started)return;
    state.playSeconds+=dt;if(player){player.group.position.set(state.x,playerTweenY??world.height(state.x,state.z,player.group.position.y),state.z);world.animate(player,state.facing,walking?stepFrame:-1);}
    const lead=state.party.find(m=>m.hp>0);if(lead&&followSpecies!==lead.species){if(follower)world.scene.remove(follower.group);const key='SPRITE_FOLLOWER_MON_'+data.personal[lead.species].species;if(data.sprites[key]){follower=world.paper(key,1.5);follower.group.position.copy(player.group.position);followSpecies=lead.species;}}
    if(follower){world.animate(follower,followerFacing,followerMoving?followerStep:-1);follower.group.visible=!!lead&&!followerSuppressed&&!world.battleStage?.active;}
    if(keys.has('KeyQ'))world.yaw+=dt*1.4;if(keys.has('KeyE'))world.yaw-=dt*1.4;
    if(ready&&!transitioning)world.updateStreaming(state.map,state.x,state.z);
    if(ready&&!walking&&!transitioning&&!vm.busy&&!ui.busy&&!battle.active){const horizontal=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft')),forward=Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'));if(horizontal||forward){const x=horizontal*Math.cos(world.yaw)-forward*Math.sin(world.yaw),z=-horizontal*Math.sin(world.yaw)-forward*Math.cos(world.yaw);const facing=Math.abs(x)>Math.abs(z)?x>0?3:2:z>0?1:0;void step(facing).catch(error=>{console.error(error);lastError=String(error);});}}
    world.draw(state.x,state.z,dt,playerTweenY);saveClock+=dt;if(saveClock>10&&!walking&&!vm.busy){saveClock=0;save();}
    (window as unknown as {__HG3D__:unknown}).__HG3D__={ready,map:state.map,code:map?.code,position:{x:state.x,y:player.group.position.y,z:state.z},facing:state.facing,walking,transitioning,vmBusy:vm?.busy,uiBusy:ui.busy,dialogue:ui.dialogueOpen,battle:!!battle?.active||!!world.battleStage?.active,battleView:world.battleStage?.active?'world':null,weather:world.sky.status,camera:{yaw:world.yaw,pitch:world.pitch,distance:world.distance,position:world.camera.position.toArray(),target:world.target.toArray(),rotation:world.camera.quaternion.toArray()},follower:follower?{x:follower.group.position.x,y:follower.group.position.y,z:follower.group.position.z,moving:followerMoving,facing:followerFacing}:null,party:state.party.map(m=>({species:m.species,level:m.level,hp:m.hp,moves:m.moves})),flags:state.flags,vars:state.vars,bag:state.bag,unsupported:vm?.lastUnsupported,script:vm?.current,error:lastError,cells:world.cells.size,drawCalls:world.renderer.info.render.calls};
  }requestAnimationFrame(render);await title();
}
addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement)return;if(e.code==='Escape'){if(ui.dialogueOpen)return;if(ui.panelOpen){if(ui.canDismiss)ui.close();return;}menu();return;}if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','KeyF','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();keys.add(e.code);if(['KeyF','Enter'].includes(e.code)&&!e.repeat&&!ui.dialogueOpen)void interact();});
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>keys.clear());addEventListener('pagehide',save);
$('open-menu').onclick=menu;
let drag=false,lastPointer={x:0,y:0};const canvas=$<HTMLCanvasElement>('original-world');canvas.addEventListener('pointerdown',e=>{if(ui.busy||!started)return;drag=true;lastPointer={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(!drag)return;world.yaw-=(e.clientX-lastPointer.x)*.006;world.pitch=Math.max(.18,Math.min(.95,world.pitch+(e.clientY-lastPointer.y)*.003));lastPointer={x:e.clientX,y:e.clientY};});for(const event of ['pointerup','pointercancel'])canvas.addEventListener(event,()=>drag=false);canvas.addEventListener('wheel',e=>{e.preventDefault();if(world)world.distance=Math.max(5,Math.min(28,world.distance+e.deltaY*.01));},{passive:false});
document.querySelectorAll<HTMLButtonElement>('[data-control]').forEach(button=>{button.addEventListener('pointerdown',e=>{e.preventDefault();if(button.dataset.control==='KeyF'){void interact();return;}keys.add(button.dataset.control!);button.setPointerCapture(e.pointerId);});for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>keys.delete(button.dataset.control!));});
boot().catch(error=>{console.error(error);ui.loading(null);ui.panel('<h2>Johto could not load.</h2><p>The world needs WebGL 2 and its original data files. Reload to try again.</p><button id="retry" class="game-button">Retry</button>');$('retry').onclick=()=>location.reload();});
