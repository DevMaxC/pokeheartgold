import {BattleEvolutionQueue,UnsupportedBattleEvolution,type BattleEvolutionSummary} from './battle-evolution.ts';
import type {BattleEvolutionCompletion,BattleEvolutionScene} from './battle-evolution-types.ts';
import {createEvolutionPresentation,type EvolutionPresentationPorts,type EvolutionAudioSession} from './evolution-presentation.ts';
import {WorldEvolutionView,type EvolutionField,type EvolutionFieldWorld} from './evolution-view.ts';
import {selectNativeLevelEvolution,nativeMapEvolutionMethod,nativeEvolutionNight,type NativeEvolutionData} from './evolution-native.ts';
import {EvolutionMoveLearning} from './evolution-move-learning.ts';
import {nativeMessageTokens} from './native-text.ts';
import {isHMMove,type NativeFieldMoveData} from './field-moves.ts';
import type {NativeFieldClock} from './native-field-clock.ts';
import type {GameData,State} from './types.ts';
import {UI,$} from './ui.ts';

type Waiter={finish:(error?:unknown)=>void};
export type EvolutionFieldHostPorts={
 data:GameData;native:NativeEvolutionData;fieldMoves:NativeFieldMoveData;messages:Readonly<Record<string,string>>;
 state:()=>State;field:()=>EvolutionField;world:EvolutionFieldWorld;clock:NativeFieldClock;lifetime:AbortSignal;ui:UI;
 enabled:()=>boolean;sharedOutput:EvolutionPresentationPorts['sharedOutput'];textDelay:()=>number;hour:()=>number;
 audio:EvolutionPresentationPorts['audio'];retainRestore:EvolutionPresentationPorts['retainRestore'];
 /** Required original PLAYER4 menu sound. Unsupported before that port exists. */
 prepareMenu:(signal:AbortSignal)=>Promise<void>;menuSE:(owner:object,signal:AbortSignal)=>void;cancelMenuOwner:(owner:object)=>void;
 keyboard?:Pick<EventTarget,'addEventListener'|'removeEventListener'>;
 /** Existing game surface; no new overlay root or document-global singleton. */
 controls?:HTMLElement;
 view?:WorldEvolutionView;
};
/** One host and one queue per actual Battle owner. The root post-task hook is
 * installed at idle, never from a scene/task callback, and keeps running while
 * the scene deliberately owns fieldEffect/mapRunning=false. It does not own
 * PLAYER3 update, another RAF, another field clock, or an AudioContext. */
export class EvolutionFieldHost{
 readonly queue=new BattleEvolutionQueue();readonly view:WorldEvolutionView;
 private waits=new Set<Waiter>();private removeFrame:()=>void;
 private controller:AbortController|null=null;private running:Promise<BattleEvolutionSummary>|null=null;
 private currentAudio:EvolutionAudioSession|null=null;private menuOwner:object|null=null;private closed=false;private ownedField:{state:State;map:number}|null=null;
 private heldB=false;private pendingB=false;private cancelButton:HTMLButtonElement|null=null;private learning:EvolutionMoveLearning;
 constructor(private ports:EvolutionFieldHostPorts){
  ports.lifetime.throwIfAborted();this.view=ports.view??new WorldEvolutionView(ports.world,ports.field);
  if(this.view.world!==ports.world)throw Error('Evolution view belongs to another field');
  // Registration rejects tasks/after-tasks. Main awaits this SAME clock's
  // settled() and constructs here synchronously, before another frame begins.
  this.removeFrame=ports.clock.onAfterTasks(()=>{this.syncCancelButton();for(const wait of[...this.waits])wait.finish();},ports.lifetime);
  this.learning=new EvolutionMoveLearning({ui:ports.ui,data:ports.data,messages:ports.messages,textDelay:ports.textDelay,nextFrame:this.nextFrame,audio:()=>{if(!this.currentAudio)throw Error('Evolution learner has no current borrowed audio session');return this.currentAudio;},prepareMenu:ports.prepareMenu,selectSound:signal=>{if(!this.menuOwner)throw Error('Evolution menu has no current owner');ports.menuSE(this.menuOwner,signal);}});
  ports.lifetime.addEventListener('abort',this.rootEnded,{once:true});
  ports.keyboard?.addEventListener('keydown',this.keyDown,{capture:true});ports.keyboard?.addEventListener('keyup',this.keyUp,{capture:true});ports.keyboard?.addEventListener('blur',this.blur);
  void ports.clock.failure.catch(error=>this.dispose(error));
 }
 get active(){return this.controller!==null;}
 get cameraActive(){return this.active&&this.view.active&&this.ports.world.fieldEffect===this.view&&!this.ports.ui.panelOpen;}
 get phase(){return this.view.active?this.view.phase:null;}
 private keyDown=(raw:Event)=>{const event=raw as KeyboardEvent;if(event.code!=='KeyB'||event.ctrlKey||event.metaKey||event.altKey)return;const newlyDown=!this.heldB&&!event.repeat;this.heldB=true;
  if(this.cancellationWindow()){if(newlyDown)this.pendingB=true;event.preventDefault();}
 };
 private keyUp=(raw:Event)=>{if((raw as KeyboardEvent).code==='KeyB'){this.heldB=false;}};
 private blur=()=>{this.heldB=false;this.pendingB=false;};
 private cancellationWindow(){return !!this.controller&&!this.controller.signal.aborted&&this.view.active&&this.view.phase==='oscillate'&&this.ports.world.fieldEffect===this.view&&!this.ports.ui.panelOpen;}
 private syncCancelButton(){if(this.cancelButton){const active=this.cancellationWindow();this.cancelButton.hidden=!active;this.cancelButton.disabled=!active;}}
 private mobileAction(controller:AbortController,signal:AbortSignal):()=>void{
  const surface=this.ports.controls;if(!surface)return()=>{};
  const button=document.createElement('button');button.setAttribute('type','button');button.className='game-button';button.textContent='Stop evolving (B)';button.setAttribute('aria-label','Stop evolving');
  button.setAttribute('style','position:absolute;top:calc(82px + var(--safe-top, 0px));right:calc(16px + var(--safe-right, 0px));min-width:44px;min-height:44px;padding:10px 14px;z-index:13;touch-action:manipulation;user-select:none;-webkit-user-select:none;');button.hidden=true;button.disabled=true;
  const active=()=>this.controller===controller&&!signal.aborted&&button.isConnected&&this.cancellationWindow();
  const click=()=>{if(active())this.pendingB=true;};button.onclick=click;surface.appendChild(button);this.cancelButton=button;
  let release:()=>void;try{release=this.ports.ui.ownNativeAction(button,active,signal);}catch(error){button.onclick=null;button.remove();if(this.cancelButton===button)this.cancelButton=null;throw error;}
  return()=>{release();if(button.onclick===click)button.onclick=null;if(document.activeElement===button)$('original-world').focus();button.remove();if(this.cancelButton===button)this.cancelButton=null;};
 }
 private rootEnded=()=>this.dispose(this.ports.lifetime.reason);
 private nextFrame=(signal:AbortSignal):Promise<void>=>{
  signal.throwIfAborted();if(this.closed)throw Error('Evolution field host was disposed');if(this.ownedField)this.check(signal,this.ownedField.state,this.ownedField.map);
  return new Promise((resolve,reject)=>{const wait:Waiter={finish:error=>{if(!this.waits.delete(wait))return;signal.removeEventListener('abort',abort);if(error===undefined)try{if(this.ownedField)this.check(signal,this.ownedField.state,this.ownedField.map);}catch(cause){error=cause;}if(error===undefined)resolve();else reject(error);}},abort=()=>wait.finish(signal.reason??new DOMException('Evolution frame cancelled','AbortError'));this.waits.add(wait);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
 };
 private check(signal:AbortSignal,state:State,map:number){signal.throwIfAborted();if(this.closed||this.ports.state()!==state||state.map!==map||this.ports.field().map!==map)throw Error('Evolution field ownership changed');}
 run(completion:BattleEvolutionCompletion,outer?:AbortSignal):Promise<BattleEvolutionSummary>{
  if(this.closed)throw Error('Evolution field host was disposed');if(this.running)throw Error('Evolution field host is already running');
  const state=this.ports.state(),map=state.map,controller=new AbortController(),signal=AbortSignal.any([this.ports.lifetime,controller.signal,...(outer?[outer]:[])]);this.check(signal,state,map);this.controller=controller;this.menuOwner={};const menuOwner=this.menuOwner;this.ownedField={state,map};this.pendingB=false;
  const present=createEvolutionPresentation({view:this.view,nextFrame:async owned=>{this.check(owned,state,map);await this.nextFrame(owned);this.check(owned,state,map);},
   takeBCancel:()=>{const pressed=this.pendingB;this.pendingB=false;return pressed;},enabled:this.ports.enabled,sharedOutput:this.ports.sharedOutput,retainRestore:this.ports.retainRestore,
   audio:{open:(scene:BattleEvolutionScene,output,owner)=>{this.check(owner,state,map);const audio=this.ports.audio.open(scene,output,owner);this.currentAudio=audio;return audio;}},
   print:(bank,id,operands,glyph,owner)=>{if(bank!==197)throw Error('Evolution text bank changed');const source=this.ports.messages[id];if(typeof source!=='string')throw Error('Missing original evolution message197:'+id);return this.ports.ui.printNativeMessage(nativeMessageTokens(source,operands),this.ports.textDelay(),{glyph,nextFrame:this.nextFrame},owner);},
  });
  let releaseMobile=()=>{};try{releaseMobile=this.mobileAction(controller,signal);}catch(error){controller.abort(error);if(this.controller===controller){this.controller=null;this.ownedField=null;if(this.menuOwner===menuOwner)this.menuOwner=null;}throw error;}
  const work=(async()=>{try{return await this.queue.run(this.ports.data,state,completion,{
   select:(party,mon)=>selectNativeLevelEvolution(this.ports.native,party,mon,{night:nativeEvolutionNight(this.ports.hour()),evolutionLocation:nativeMapEvolutionMethod(map)}),
   metadata:mon=>{if(!Number.isInteger(mon.form)||typeof mon.hasNickname!=='boolean')throw new UnsupportedBattleEvolution('Native evolution needs admitted stored form and nickname metadata');return{form:mon.form!,hasNickname:mon.hasNickname};},
   present,moveLearning:{choose:(request,owned)=>this.learning.choose(request,owned),show:(event,owned)=>this.learning.show(event,owned),isHM:move=>isHMMove(this.ports.fieldMoves,move)},
  },signal);}finally{
   controller.abort(new DOMException('Evolution batch completed','AbortError'));
   try{try{this.learning.clear();}finally{releaseMobile();}}
   finally{try{this.ports.cancelMenuOwner(menuOwner);}finally{if(this.menuOwner===menuOwner)this.menuOwner=null;this.currentAudio=null;this.pendingB=false;if(this.controller===controller){this.controller=null;this.ownedField=null;}}}
  }})();
  this.running=work;void work.then(()=>{if(this.running===work)this.running=null;},()=>{if(this.running===work)this.running=null;});return work;
 }
 cancel(reason:unknown=new DOMException('Evolution field owner cancelled','AbortError')){this.controller?.abort(reason);this.syncCancelButton();if(this.view.active)this.view.cancel(reason);this.learning.clear();this.pendingB=false;for(const wait of[...this.waits])wait.finish(reason);}
 async settled(){if(this.running)await Promise.allSettled([this.running]);}
 dispose(reason:unknown=new DOMException('Evolution field host disposed','AbortError')){if(this.closed)return;this.closed=true;this.cancel(reason);this.removeFrame();this.ports.lifetime.removeEventListener('abort',this.rootEnded);this.ports.keyboard?.removeEventListener('keydown',this.keyDown,{capture:true});this.ports.keyboard?.removeEventListener('keyup',this.keyUp,{capture:true});this.ports.keyboard?.removeEventListener('blur',this.blur);}
}
