import * as THREE from 'three';
import {UI,$,escapeHTML as esc} from './ui.ts';
import {OpeningTitleStage} from './opening-stage.ts';
import {OPENING_NAME_KEYBOARD,normalizeOpeningName,validOpeningName,type OpeningEffect,type OpeningGender,type OpeningPort,type OpeningScene} from './opening.ts';
import {sourceJSON} from './types.ts';
import {drawOpeningDemo,setOpeningDemoVisible,prepareOpeningArtwork,animateOpeningShrink,type OpeningArtwork} from './opening-art.ts';
import {chooseOpeningButton} from './opening-input.ts';
import './opening.css';
type Assets=OpeningArtwork;
const source='/source/opening/';const wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
export class OpeningView implements OpeningPort{
 private root:HTMLElement;private stage:OpeningTitleStage|null=null;private assets:Assets|null=null;
 private phase='title';private animation:{sequence:number;frame:number;elapsed:number}|null=null;private current:OpeningScene={phase:'topics'};private disposed=false;
 private sounds=new Set<HTMLAudioElement>();
 constructor(private ui:UI){
  document.body.classList.add('in-opening');this.root=document.createElement('section');this.root.id='opening-scene';this.root.dataset.phase='title';this.root.setAttribute('aria-label','Pokémon HeartGold introduction');
  this.root.innerHTML=`<img class="opening-title-logo" src="${source}title-logo.png" alt="Pokémon HeartGold"><div class="opening-paper-stage"><img id="opening-portrait" src="${source}oak.png" alt="Professor Oak" hidden><svg id="opening-demo" viewBox="0 0 256 192" aria-label="Marill demonstration" hidden><image id="opening-demo-cell"/></svg></div><p id="opening-hint"></p><div id="opening-title-actions"></div><div class="opening-flash"></div>`;document.getElementById('game')!.append(this.root);
 }
 async title(renderer:THREE.WebGLRenderer,startText:string){
  this.phase='title';this.root.dataset.phase='title';this.ui.loading('Loading the opening…');
  try{this.stage=await OpeningTitleStage.create(renderer);}catch(error){console.warn('Original title model could not load; native title artwork remains available.',error);this.root.classList.add('opening-title-fallback');}finally{this.ui.loading(null);}
  const actions=$('opening-title-actions');actions.innerHTML=`<button class="opening-start" id="opening-start">${esc(startText)}<small>Enter · Touch · Click</small></button>`;
  await new Promise<void>(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;removeEventListener('keydown',key);actions.innerHTML='';this.playCry(250);this.root.classList.add('opening-do-flash');setTimeout(()=>{this.root.classList.remove('opening-do-flash');resolve();},180);},key=(event:KeyboardEvent)=>{if(!event.repeat&&['Enter','Space','KeyF'].includes(event.code)){event.preventDefault();finish();}};$('opening-start').onclick=finish;addEventListener('keydown',key);setTimeout(()=>$('opening-start')?.focus(),0);});
 }
 async prepare(){const assets=await sourceJSON<Assets>('opening/assets.json');await prepareOpeningArtwork(assets);this.assets=assets;}
 scene(view:OpeningScene){
  if(this.phase==='title'){this.stage?.dispose();this.stage=null;}
  this.current=view;this.phase=view.phase;this.root.dataset.phase=view.phase;this.root.dataset.oak=view.oak??'center';$('opening-hint').textContent=view.hint??'';
  const portrait=$<HTMLImageElement>('opening-portrait');portrait.hidden=!['oak','naming','shrink'].includes(view.phase);portrait.src=source+(view.phase==='shrink'?(view.gender??'boy'):'oak')+'.png';portrait.alt=view.phase==='shrink'?(view.gender==='girl'?'Lyra':'Ethan'):'Professor Oak';
  if(!['oak'].includes(view.phase)){setOpeningDemoVisible($('opening-demo'),false);this.animation=null;}
 }
 message(text:string){return this.ui.message(text,4*1000/60);}
 async choose(prompt:string,choices:string[],initialIndex=0,detail=''){
  const gender=choices.length===2&&choices[0]==='Boy'&&choices[1]==='Girl';
  this.ui.panel(`<span class="eyebrow">POKÉMON HEARTGOLD</span>${prompt?`<h2>${esc(prompt)}</h2>`:''}${detail?`<p>${esc(detail)}</p>`:''}<div class="${gender?'opening-character-choices':'actions'}">${choices.map((text,i)=>`<button data-opening-choice="${i}"${i===initialIndex?' class="opening-selected"':''}>${gender?`<img src="${source}${i?'girl':'boy'}-choice.png" alt="">`:''}${esc(text)}</button>`).join('')}</div>`,false);this.ui.canDismiss=false;
  // The panel is already mounted. Its capture handler must see the remembered
  // native cursor even if confirm arrives before the next browser task.
  const value=await chooseOpeningButton(Array.from(document.querySelectorAll<HTMLButtonElement>('[data-opening-choice]')),initialIndex,window,focus=>focus());this.ui.close();return value;
 }
 async name(prompt:string,maximum:number){
  this.ui.panel(`<span class="eyebrow">${this.current.gender==='girl'?'GIRL':'BOY'}</span><h2>${esc(prompt)}</h2><form id="opening-name-form"><input id="opening-name" aria-label="${esc(prompt)}" maxlength="${maximum}" autocomplete="off" autocapitalize="off"><p class="opening-name-count" id="opening-name-count">0 / ${maximum}</p><div class="opening-keyboard-tabs">${Object.keys(OPENING_NAME_KEYBOARD).map((tab,i)=>`<button type="button" data-name-page="${tab}" aria-pressed="${i===0}">${tab}</button>`).join('')}</div><div id="opening-keyboard"></div><div class="actions"><button id="opening-name-back" type="button">Backspace</button><button type="submit">OK</button></div></form>`);this.ui.canDismiss=false;
  const input=$<HTMLInputElement>('opening-name');const update=()=>{input.setCustomValidity(validOpeningName(input.value)?'':'Choose a letter, number, or symbol from the keyboard below.');$('opening-name-count').textContent=Array.from(input.value).length+' / '+maximum;};
  const page=(name:keyof typeof OPENING_NAME_KEYBOARD)=>{document.querySelectorAll<HTMLElement>('[data-name-page]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.namePage===name)));$('opening-keyboard').innerHTML=OPENING_NAME_KEYBOARD[name].filter(row=>row.trim()).map(row=>`<div>${Array.from(row).map(c=>`<button type="button" data-name-character="${esc(c)}" aria-label="${c===' '?'Space':esc(c)}">${c===' '?'␣':esc(c)}</button>`).join('')}</div>`).join('');document.querySelectorAll<HTMLButtonElement>('[data-name-character]').forEach(button=>button.onclick=()=>{if(Array.from(input.value).length<maximum)input.value+=button.dataset.nameCharacter;update();input.focus();});};
  document.querySelectorAll<HTMLButtonElement>('[data-name-page]').forEach(button=>button.onclick=()=>page(button.dataset.namePage as keyof typeof OPENING_NAME_KEYBOARD));$('opening-name-back').onclick=()=>{input.value=Array.from(input.value).slice(0,-1).join('');update();input.focus();};input.oninput=update;page('Uppercase');setTimeout(()=>input.focus(),0);
  return new Promise<string>(resolve=>{let done=false;$('opening-name-form').onsubmit=event=>{event.preventDefault();update();if(done||!input.reportValidity())return;done=true;const result=normalizeOpeningName(input.value);this.ui.close();resolve(result);};});
 }
 private demo(sequence:number){if(!this.assets)throw Error('Opening demonstration assets are unavailable');this.animation={sequence,frame:0,elapsed:0};setOpeningDemoVisible($('opening-demo'),true);this.drawDemo();}
 private playCry(species:183|250){const audio=new Audio(source+`cry-${species}.wav`);audio.volume=.6;this.sounds.add(audio);audio.onended=()=>this.sounds.delete(audio);void audio.play().catch(error=>{this.sounds.delete(audio);console.warn('Original opening cry could not play.',error);});}
 private drawDemo(){if(this.assets&&this.animation)drawOpeningDemo($('opening-demo-cell'),this.assets.demo,this.animation.sequence,this.animation.frame);}
 async effect(effect:OpeningEffect,gender?:OpeningGender){
  if(effect==='oak-right'||effect==='oak-left'){this.root.dataset.oak=effect==='oak-right'?'right':'center';await wait(450);return;}
  if(effect==='ball-flash'){this.demo(3);await wait(500);this.root.classList.add('opening-do-flash');await wait(120);this.root.classList.remove('opening-do-flash');return;}
  if(effect==='marill-appear'){this.demo(1);const frames=this.assets!.demo.sequences[1].frames;await wait(frames.reduce((n,f)=>n+f.duration,0)*1000/60);return;}
  if(effect==='marill-cry'){this.demo(2);this.playCry(183);await wait(40*1000/60);return;}
  if(effect==='marill-hide'){this.animation=null;setOpeningDemoVisible($('opening-demo'),false);await wait(300);return;}
  if(effect==='player-shrink'){const portrait=$<HTMLImageElement>('opening-portrait');await animateOpeningShrink(gender??'boy',file=>{portrait.hidden=file===null;if(file)portrait.src=source+file;});}
 }
 draw(dt:number){if(this.disposed)return;if(this.phase==='title')this.stage?.draw(dt);if(this.animation&&this.assets){const sequence=this.assets.demo.sequences[this.animation.sequence];this.animation.elapsed+=dt*60;while(this.animation.elapsed>=sequence.frames[this.animation.frame].duration){this.animation.elapsed-=sequence.frames[this.animation.frame].duration;if(this.animation.frame+1<sequence.frames.length)this.animation.frame++;else if(sequence.loop)this.animation.frame=sequence.loopStart;else{this.animation.elapsed=0;break;}}this.drawDemo();}}
 dispose(){if(this.disposed)return;this.disposed=true;this.animation=null;for(const audio of this.sounds)audio.pause();this.sounds.clear();this.stage?.dispose();this.root.remove();document.body.classList.remove('in-opening');}
}
