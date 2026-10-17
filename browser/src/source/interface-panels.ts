import {UI,$,escapeHTML as esc} from './ui.ts';
import {itemName,moveName,titleCase} from './data.ts';
import type {GameData,State} from './types.ts';
import type {TouchControls} from './touch-controls.ts';
import type {InterfacePreferences} from './interface-preferences.ts';

export type InterfaceMusicStatus={pending:boolean;message:string;canRetry:boolean};
type Ports={state:()=>State|null;location:()=>string;save:()=>boolean;party?:()=>Promise<void>;onChild?:(child:'party'|'bag'|'trainer'|'options')=>void;preferences:()=>InterfacePreferences;updatePreferences:(value:InterfacePreferences)=>void;touch:TouchControls;gesture:()=>void;musicStatus?:()=>InterfaceMusicStatus;retryMusic?:()=>Promise<void>;watchMusic?:(listener:()=>void)=>()=>void};
const heading=(title:string,eyebrow:string)=>`<div class="panel-heading"><button class="back-button" data-action="back" aria-label="Back">‹</button><div><span class="eyebrow">${esc(eyebrow)}</span><h2>${esc(title)}</h2></div></div>`;
const time=(seconds:number)=>`${Math.floor(seconds/3600)}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}`;
/** Game menus own their entire navigation promise. Back returns to its parent;
 * it never leaves a detached choice handler or a field key held underneath. */
export class InterfacePanels{
 constructor(private ui:UI,private data:GameData,private ports:Ports){}
 private select(html:string):Promise<string>{return this.ui.customPanel<string>(html,(resolve,current)=>{
  const bindings=Array.from($('panel-content').querySelectorAll<HTMLButtonElement>('[data-action]'),button=>{const click=()=>{if(current()&&!button.disabled){this.ports.gesture();resolve(button.dataset.action!);}};button.onclick=click;return{button,click};});
  const actions=bindings.filter(({button})=>!button.disabled&&button.dataset.action!=='back'),first=actions.find(({button})=>button.getAttribute('aria-pressed')==='true')??actions[0];first?.button.setAttribute('data-panel-focus','');
  return()=>{for(const{button,click}of bindings)if(button.onclick===click)button.onclick=null;};
 },undefined,{cancel:()=> 'back'});}
 async menu(){
  const state=this.ports.state();if(!state)return;
  for(;;){
   const entries=[['party','Pokémon',`${state.party.length} in your party`,'◉'],['bag','Bag','Items and Key Items','▣'],['trainer',state.name,`${state.badges.length} Badges`,'◇'],['save','Save','Keep your progress','▤'],['options','Settings','Sound, controls and camera','⚙'],['back','Return','Back to your adventure','↗']];
   const unlocks:Record<string,string>={bag:'FLAG_GOT_BAG',trainer:'FLAG_GOT_TRAINER_CARD',save:'FLAG_GOT_SAVE_BUTTON',options:'FLAG_GOT_OPTIONS_BUTTON'};
   const action=await this.select(`${heading('Adventure menu','Pokémon HeartGold')}<div class="panel-toolbar"><b>${esc(this.ports.location())}</b><span>₽${state.money.toLocaleString()}</span></div><div class="menu-grid">${entries.filter(([key])=>key==='party'?state.party.length>0:!unlocks[key]||state.flags[unlocks[key]]).map(([key,label,detail,icon])=>`<button class="menu-tile" data-action="${key}"><span class="menu-tile__icon" aria-hidden="true">${icon}</span><span><span class="menu-tile__title">${esc(label)}</span><small>${esc(detail)}</small></span></button>`).join('')}</div>`);
   if(action==='back')return;
   if(action==='party'||action==='bag'||action==='trainer'||action==='options')this.ports.onChild?.(action);
   if(action==='party')await (this.ports.party?.()??this.party());else if(action==='bag')await this.bag();else if(action==='trainer')await this.trainer();else if(action==='options')await this.settings();else if(action==='save'){const saved=this.ports.save();this.ui.toast(saved?`${state.name} saved the game.`:'The browser could not save. Please try again.');}
  }
 }
 async party(){
  const state=this.ports.state();if(!state)return;
  for(;;){const action=await this.select(`${heading('Your party','Pokémon')}<div class="panel-toolbar"><span>${state.party.length} / 6 Pokémon</span></div>${state.party.map((mon,i)=>mon.isEgg?`<article class="party-card"><span class="party-card__sprite" aria-hidden="true">🥚</span><div><h3>Egg</h3><p>A mysterious Pokémon Egg.</p></div></article>`:`<article class="party-card"><img src="/source/pokemon/${mon.species}-${mon.gender}-front.png" alt=""><div><h3>${esc(mon.name)} <small>Lv.${mon.level}</small></h3><p>${mon.status?esc(mon.status):mon.hp===0?'Fainted':'Ready for adventure'} · ${mon.hp} / ${mon.maxHP} HP</p><span class="hp-bar"><i style="width:${Math.max(0,Math.min(100,mon.hp/mon.maxHP*100))}%"></i></span></div><button data-action="${i}" aria-label="Summary for ${esc(mon.name)}">Summary</button></article>`).join('')}`);if(action==='back')return;await this.summary(Number(action));}
 }
 private async summary(index:number){const mon=this.ports.state()?.party[index];if(!mon||mon.isEgg)return;const base=this.data.personal[mon.species];await this.select(`${heading(mon.name,'Pokémon summary')}<article class="party-card"><img src="/source/pokemon/${mon.species}-${mon.gender}-front.png" alt="${esc(mon.name)}"><div><b>Level ${mon.level}</b><p>${base.types.filter((type,i,all)=>all.indexOf(type)===i).map(type=>esc(titleCase(type))).join(' / ')}</p><p>Original Trainer: ${esc(mon.ot)}</p></div></article><div class="panel-toolbar"><span>HP <b>${mon.hp} / ${mon.maxHP}</b></span><span>${mon.status?esc(mon.status):'No status condition'}</span></div><div class="summary-stats">${[['Attack',mon.stats.atk],['Defense',mon.stats.def],['Sp. Atk',mon.stats.spatk],['Sp. Def',mon.stats.spdef],['Speed',mon.stats.speed]].map(([label,value])=>`<div><span>${label}</span><b>${value}</b></div>`).join('')}</div><h3>Moves</h3>${mon.moves.map(slot=>`<div class="move-row"><b>${esc(moveName(this.data,slot.id))}</b><span>PP ${slot.pp} / ${slot.maxPP}</span></div>`).join('')}`);}
 async bag(){
  const state=this.ports.state();if(!state)return;let selected='';
  for(;;){const pockets=new Map<string,[string,number][]>();for(const[key,count]of Object.entries(state.bag)){if(count<=0)continue;const item=this.data.items.find(item=>item.item===key),pocket=titleCase((item?.fieldPocket||'POCKET_KEY_ITEMS').replace('POCKET_',''));if(!pockets.has(pocket))pockets.set(pocket,[]);pockets.get(pocket)!.push([key,count]);}
   const names=[...pockets.keys()];if(!pockets.has(selected))selected=names[0]??'';
   const action=await this.select(`${heading('Your Bag','Items and Key Items')}<div class="panel-toolbar"><span>${Object.values(state.bag).filter(count=>count>0).length} kinds of items</span><span>₽${state.money.toLocaleString()}</span></div>${names.length?`<nav class="pocket-tabs" aria-label="Bag pockets">${names.map((name,i)=>`<button data-action="pocket:${i}" aria-pressed="${name===selected}">${esc(name)}</button>`).join('')}</nav><h3>${esc(selected)}</h3>${(pockets.get(selected)??[]).map(([key,count])=>`<article class="bag-item"><b>${esc(itemName(this.data,key))}</b><span class="bag-item__count">× ${count}</span></article>`).join('')}`:'<p>Your Bag is empty.</p>'}`);
   if(action==='back')return;if(action.startsWith('pocket:'))selected=names[Number(action.slice(7))]??selected;
  }
 }
 private async trainer(){const state=this.ports.state();if(!state)return;await this.select(`${heading(state.name,'Trainer card')}<div class="panel-toolbar"><b>${esc(this.ports.location())}</b><span>${state.gender==='boy'?'Ethan':'Lyra'}</span></div><dl class="trainer-stats"><div><dt>Money</dt><dd>₽${state.money.toLocaleString()}</dd></div><div><dt>Pokédex</dt><dd>${state.caught.length} caught · ${state.seen.length} seen</dd></div><div><dt>Play time</dt><dd>${time(state.playSeconds)}</dd></div><div><dt>Badges</dt><dd>${state.badges.length} / 16</dd></div></dl>`);}
 async settings(){
  const prefs=this.ports.preferences(),state=this.ports.state();
  const row=(label:string,detail:string,control:string)=>`<div class="setting-row"><div><b>${label}</b><small>${detail}</small></div>${control}</div>`;
  const musicRow=this.ports.musicStatus&&this.ports.retryMusic?row('Music playback','Retry music here if it could not load.','<div><p id="setting-music-status" role="status" aria-live="polite" tabindex="-1" data-panel-neutral></p><button id="setting-music-retry">Retry music</button></div>'):'';
  await this.ui.customPanel<void>(`${heading('Settings','Make yourself at home')}<div class="settings-list">${row('Music','Original HeartGold music.',`<button id="setting-music" data-panel-focus aria-pressed="${prefs.music}">${prefs.music?'On':'Off'}</button>`)}${row('Volume','Game music volume.',`<label class="range-setting"><span class="sr-only">Music volume</span><input id="setting-volume" type="range" min="0" max="100" value="${Math.round(prefs.volume*100)}"><output id="setting-volume-value">${Math.round(prefs.volume*100)}%</output></label>`)}${musicRow}${row('Movement','Choose the touch control you prefer.',`<button id="setting-layout">${this.ports.touch.preferences.layout==='joystick'?'Joystick':'D-pad'}</button>`)}${row('Control side','Movement on the left or right.',`<button id="setting-hand">${this.ports.touch.preferences.handedness==='right'?'Right-handed':'Left-handed'}</button>`)}${row('Camera sensitivity','Drag the world to look. Pinch to zoom.',`<label class="range-setting"><span class="sr-only">Camera sensitivity</span><input id="setting-camera" type="range" min="30" max="160" value="${Math.round(prefs.cameraSensitivity*100)}"><output id="setting-camera-value">${prefs.cameraSensitivity.toFixed(1)}×</output></label>`)}${row('Text speed','Tap Next to finish a line immediately.',`<button id="setting-text">${['Slow','Normal','Fast'][prefs.textSpeed]}</button>`)}${state?row('Battle style','Choose Shift or Set.',`<button id="setting-battle">${state.options.battleStyle==='shift'?'Shift':'Set'}</button>`):''}</div><div class="actions"><button id="settings-done">Done</button></div>`,(resolve,current)=>{
   const cleanups:(()=>void)[]=[];
   const bind=(id:string,event:string,action:()=>void)=>{const element=$(id),handler=()=>{if(current()&&!(element as HTMLButtonElement).disabled){this.ports.gesture();action();}};element.addEventListener(event,handler);cleanups.push(()=>element.removeEventListener(event,handler));};
   let retrying=false,retryFailed=false;
   const updateMusicStatus=()=>{if(!current()||!this.ports.musicStatus||!this.ports.retryMusic)return;const status=this.ports.musicStatus(),enabled=this.ports.preferences().music;$('setting-music-status').textContent=!enabled?'Music is off.':status.pending||retrying?'Loading original music…':status.message||(retryFailed?'Music could not load. Please try again.':'Music is on.');const retry=$<HTMLButtonElement>('setting-music-retry'),disabled=!enabled||status.pending||retrying||!status.canRetry&&!retryFailed;if(disabled&&document.activeElement===retry)$('setting-music-status').focus();retry.disabled=disabled;};
   if(this.ports.musicStatus&&this.ports.retryMusic){updateMusicStatus();if(this.ports.watchMusic)cleanups.push(this.ports.watchMusic(updateMusicStatus));bind('setting-music-retry','click',()=>{retrying=true;retryFailed=false;updateMusicStatus();void this.ports.retryMusic!().catch(()=>{retryFailed=true;}).finally(()=>{retrying=false;updateMusicStatus();});});}
   const update=(patch:Partial<InterfacePreferences>)=>{this.ports.updatePreferences({...this.ports.preferences(),...patch});updateMusicStatus();};
   bind('settings-done','click',()=>resolve());
   const back=$<HTMLButtonElement>('panel-content').querySelector<HTMLButtonElement>('[data-action="back"]')!;const leave=()=>{if(current())resolve();};back.onclick=leave;cleanups.push(()=>{if(back.onclick===leave)back.onclick=null;});
   bind('setting-music','click',()=>{const music=!this.ports.preferences().music;update({music});$('setting-music').textContent=music?'On':'Off';$('setting-music').setAttribute('aria-pressed',String(music));});
   bind('setting-volume','input',()=>{const volume=Number($<HTMLInputElement>('setting-volume').value)/100;update({volume});$('setting-volume-value').textContent=`${Math.round(volume*100)}%`;});
   bind('setting-camera','input',()=>{const cameraSensitivity=Number($<HTMLInputElement>('setting-camera').value)/100;update({cameraSensitivity});$('setting-camera-value').textContent=cameraSensitivity.toFixed(1)+'×';});
   bind('setting-layout','click',()=>{this.ports.touch.setPreferences({layout:this.ports.touch.preferences.layout==='joystick'?'dpad':'joystick'});$('setting-layout').textContent=this.ports.touch.preferences.layout==='joystick'?'Joystick':'D-pad';});
   bind('setting-hand','click',()=>{this.ports.touch.setPreferences({handedness:this.ports.touch.preferences.handedness==='right'?'left':'right'});$('setting-hand').textContent=this.ports.touch.preferences.handedness==='right'?'Right-handed':'Left-handed';});
   bind('setting-text','click',()=>{const textSpeed=((this.ports.preferences().textSpeed+1)%3)as 0|1|2;update({textSpeed});$('setting-text').textContent=['Slow','Normal','Fast'][textSpeed];});
   if(state)bind('setting-battle','click',()=>{state.options.battleStyle=state.options.battleStyle==='shift'?'set':'shift';$('setting-battle').textContent=state.options.battleStyle==='shift'?'Shift':'Set';});
   return()=>{for(const cleanup of cleanups)cleanup();};
  },undefined,{cancel:()=>undefined});
  if(state)this.ports.save();
 }
}
