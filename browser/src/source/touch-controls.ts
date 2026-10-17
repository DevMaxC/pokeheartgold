export type TouchPreferences={layout:'joystick'|'dpad';handedness:'right'|'left'};
export type TouchInput={horizontal:number;forward:number;run:boolean};
/** Movement remains permitted during ordinary tile tweens. Root alone decides
 * field/menu/battle/recovery admission and whether running shoes permit Run. */
export type TouchContext={movement:boolean;interact:boolean;menu:boolean;run:boolean};
export type TouchControlActions={interact:()=>void;menu:()=>void};
export type TouchControlOptions={storage?:Pick<Storage,'getItem'|'setItem'>|null;document?:Document;eventTarget?:EventTarget;deadzone?:number};
export const TOUCH_PREFERENCES_KEY='heartgold-touch-controls-v1';
type Direction='up'|'left'|'down'|'right';
type Kind='stick'|'direction'|'run'|'interact'|'menu'|'layout'|'hand';
type OwnedPointer={element:HTMLElement;kind:Kind;direction:Direction|null};
const defaults:TouchPreferences={layout:'joystick',handedness:'right'};
const directions:Direction[]=['up','left','down','right'];
const zero=():TouchInput=>({horizontal:0,forward:0,run:false});
function preferences(value:unknown):value is TouchPreferences{
 const p=value as TouchPreferences|null;return !!p&&(p.layout==='joystick'||p.layout==='dpad')&&(p.handedness==='right'||p.handedness==='left');
}
function editing(target:EventTarget|null){return typeof(target as Element|null)?.closest==='function'&&!!(target as Element).closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])');}

/** Owns touch input only: no keyboard Set, synthetic keys, game state, clock or
 * native movement rules. read() returns screen-relative axes, forward=up.
 * DOM contract: #touch-stick/.touch-stick__thumb, #touch-dpad buttons with
 * data-touch-dir, #touch-interact/run/menu/layout-toggle; hand-toggle optional.
 * CSS: wrapper data-layout=stick|dpad, data-handedness=right|left, .is-active
 * stick and .is-pressed buttons; thumb vars --touch-stick-x/y are clamped px.
 */
export class TouchControls{
 private readonly doc:Document;
 private readonly storage:Pick<Storage,'getItem'|'setItem'>|null;
 private readonly deadzone:number;
 private readonly stick:HTMLElement;
 private readonly thumb:HTMLElement;
 private readonly dpad:HTMLElement;
 private readonly dirButtons:Map<Direction,HTMLButtonElement>;
 private readonly runButton:HTMLButtonElement;
 private readonly interactButton:HTMLButtonElement;
 private readonly menuButton:HTMLButtonElement;
 private readonly layoutButton:HTMLButtonElement;
 private readonly handButton:HTMLButtonElement|null;
 private readonly controls:HTMLElement[];
 private readonly owned=new Map<number,OwnedPointer>();
 private readonly cleanup:(()=>void)[]=[];
 private context:TouchContext={movement:false,interact:false,menu:false,run:false};
 private prefs:TouchPreferences={...defaults};
 private stickVector={horizontal:0,forward:0};
 private disposed=false;

 constructor(readonly root:HTMLElement,private readonly actions:TouchControlActions,options:TouchControlOptions={}){
  this.doc=options.document??root.ownerDocument;this.deadzone=options.deadzone??.18;
  if(!Number.isFinite(this.deadzone)||this.deadzone<0||this.deadzone>=1)throw RangeError('Touch deadzone must be in [0,1)');
  const required=<T extends HTMLElement>(selector:string)=>{const node=root.querySelector<T>(selector);if(!node)throw Error('Missing touch control '+selector);return node;};
  this.stick=required('#touch-stick');this.thumb=required('.touch-stick__thumb');this.dpad=required('#touch-dpad');
  this.dirButtons=new Map(directions.map(dir=>[dir,required<HTMLButtonElement>(`[data-touch-dir="${dir}"]`)]));
  this.runButton=required('#touch-run');this.interactButton=required('#touch-interact');this.menuButton=required('#touch-menu');this.layoutButton=required('#touch-layout-toggle');this.handButton=root.querySelector('#touch-hand-toggle');
  this.controls=[this.stick,...this.dirButtons.values(),this.runButton,this.interactButton,this.menuButton,this.layoutButton,...(this.handButton?[this.handButton]:[])];
  let storage=options.storage??null;if(options.storage===undefined)try{storage=this.doc.defaultView?.localStorage??null;}catch{/* Browser storage can be disabled without disabling field input. */}this.storage=storage;
  try{const saved=JSON.parse(this.storage?.getItem(TOUCH_PREFERENCES_KEY)??'null');if(saved?.version===1&&preferences(saved))this.prefs={layout:saved.layout,handedness:saved.handedness};}catch{/* Corrupt/private-mode preferences use safe defaults; held input is never saved. */}
  for(const element of this.controls){
   element.style.setProperty('touch-action','none');element.style.setProperty('user-select','none');element.style.setProperty('-webkit-user-select','none');element.style.setProperty('-webkit-touch-callout','none');element.draggable=false;
   this.listen(element,'pointermove',event=>this.pointerMove(event as PointerEvent));
   for(const name of['pointerup','pointercancel','lostpointercapture'])this.listen(element,name,event=>this.release((event as PointerEvent).pointerId,name==='lostpointercapture'));
  }
  const bind=(element:HTMLElement,kind:Kind,direction:Direction|null=null)=>this.listen(element,'pointerdown',event=>this.pointerDown(event as PointerEvent,element,kind,direction));
  bind(this.stick,'stick');for(const[dir,button]of this.dirButtons)bind(button,'direction',dir);bind(this.runButton,'run');bind(this.interactButton,'interact');bind(this.menuButton,'menu');bind(this.layoutButton,'layout');if(this.handButton)bind(this.handButton,'hand');
  for(const[element,kind]of[[this.interactButton,'interact'],[this.menuButton,'menu'],[this.layoutButton,'layout'],...(this.handButton?[[this.handButton,'hand']]:[])]as [HTMLElement,Kind][]){
   this.listen(element,'click',event=>{
    if(editing(event.target))return;event.preventDefault();
    // Pointer activation already happened on down. Native keyboard/assistive
    // clicks have detail0 and no pointerType, and remain usable without keys.
    if((event as MouseEvent).detail!==0||(event as PointerEvent).pointerType||!this.available()||!this.allowed(kind))return;this.activate(kind);
   });
  }
  for(const name of['contextmenu','selectstart','dragstart'])this.listen(root,name,event=>{if(!editing(event.target)&&this.controls.some(control=>control===event.target||control.contains(event.target as Node)))event.preventDefault();});
  const events=options.eventTarget??this.doc.defaultView;
  if(events){for(const name of['blur','pagehide','orientationchange','resize'])this.listen(events,name,()=>this.reset());for(const name of['pointerup','pointercancel'])this.listen(events,name,event=>this.release((event as PointerEvent).pointerId));}
  this.listen(this.doc,'visibilitychange',()=>{if(this.doc.visibilityState==='hidden')this.reset();});
  this.listen(this.doc,'focusin',event=>{if(editing(event.target))this.reset();});
  this.renderPreferences();this.renderHeld();this.renderContext();
 }
 private listen(target:EventTarget,type:string,listener:(event:Event)=>void){target.addEventListener(type,listener,{passive:false});this.cleanup.push(()=>target.removeEventListener(type,listener));}
 private available(){return !this.disposed&&!this.root.inert&&this.doc.visibilityState!=='hidden'&&!editing(this.doc.activeElement);}
 private allowed(kind:Kind){return kind==='stick'||kind==='direction'?this.context.movement:kind==='run'?this.context.movement&&this.context.run:kind==='interact'?this.context.interact:kind==='menu'?this.context.menu:true;}
 private pointerDown(event:PointerEvent,element:HTMLElement,kind:Kind,direction:Direction|null){
  if(editing(event.target))return;event.preventDefault();
  if(!this.available()||!this.allowed(kind)||event.button!==0||!Number.isInteger(event.pointerId)||this.owned.has(event.pointerId))return;
  if(kind==='stick'&&(this.prefs.layout!=='joystick'||[...this.owned.values()].some(p=>p.kind==='stick'))||kind==='direction'&&this.prefs.layout!=='dpad')return;
  if(kind==='stick'&&!this.stickRadius())return;
  try{element.setPointerCapture(event.pointerId);}catch{return;}
  this.owned.set(event.pointerId,{element,kind,direction});
  if(kind==='stick')this.updateStick(event);this.renderHeld();
  try{this.activate(kind);}catch(error){this.release(event.pointerId);throw error;}
 }
 private activate(kind:Kind){
  if(kind==='menu'){this.reset();this.actions.menu();}
  else if(kind==='interact')this.actions.interact();
  else if(kind==='layout')this.setPreferences({layout:this.prefs.layout==='joystick'?'dpad':'joystick'});
  else if(kind==='hand')this.setPreferences({handedness:this.prefs.handedness==='right'?'left':'right'});
 }
 private pointerMove(event:PointerEvent){
  const pointer=this.owned.get(event.pointerId);if(!pointer)return;
  if(!this.available()||!this.allowed(pointer.kind)){this.release(event.pointerId);return;}event.preventDefault();
  if(pointer.kind==='stick')this.updateStick(event);
  else if(pointer.kind==='direction'){
   pointer.direction=null;
   for(const[direction,button]of this.dirButtons){const r=button.getBoundingClientRect();if(event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom){pointer.direction=direction;break;}}
   this.renderHeld();
  }
 }
 private stickRadius(){const rect=this.stick.getBoundingClientRect(),thumb=this.thumb.getBoundingClientRect();return rect.width>0&&rect.height>0?Math.max(1,(Math.min(rect.width,rect.height)-Math.max(thumb.width,thumb.height))/2):0;}
 private updateStick(event:PointerEvent){
  const rect=this.stick.getBoundingClientRect(),radius=this.stickRadius();if(!radius){this.release(event.pointerId);return;}
  const dx=event.clientX-rect.left-rect.width/2,dy=event.clientY-rect.top-rect.height/2,length=Math.hypot(dx,dy),scale=length?Math.min(1,radius/length):0;
  const fraction=Math.min(1,length/radius),strength=Math.max(0,(fraction-this.deadzone)/(1-this.deadzone));
  this.stickVector={horizontal:length?dx/length*strength:0,forward:length?-dy/length*strength:0};
  this.thumb.style.setProperty('--touch-stick-x',String(dx*scale)+'px');this.thumb.style.setProperty('--touch-stick-y',String(dy*scale)+'px');
 }
 private release(id:number,lost=false){
  const pointer=this.owned.get(id);if(!pointer)return;
  // Forget ownership before releasePointerCapture can synchronously emit lost.
  this.owned.delete(id);
  if(pointer.kind==='stick'){this.stickVector={horizontal:0,forward:0};this.thumb.style.setProperty('--touch-stick-x','0px');this.thumb.style.setProperty('--touch-stick-y','0px');}
  if(!lost)try{if(pointer.element.hasPointerCapture(id))pointer.element.releasePointerCapture(id);}catch{/* Detached controls can already have lost capture. */}
  this.renderHeld();
 }
 private renderHeld(){
  for(const control of this.controls){const held=[...this.owned.values()].some(p=>p.kind==='direction'?this.dirButtons.get(p.direction!)===control:p.element===control);control.classList.toggle(control===this.stick?'is-active':'is-pressed',held);control.dataset.touchActive=String(held);}
  this.runButton.setAttribute('aria-pressed',String([...this.owned.values()].some(p=>p.kind==='run')));
 }
 private renderContext(){
  this.root.dataset.movementEnabled=String(this.context.movement);this.stick.setAttribute('aria-disabled',String(!this.context.movement));
  for(const button of this.dirButtons.values())button.disabled=!this.context.movement;this.runButton.disabled=!(this.context.movement&&this.context.run);this.interactButton.disabled=!this.context.interact;this.menuButton.disabled=!this.context.menu;
 }
 private renderPreferences(){
  this.root.dataset.layout=this.prefs.layout==='joystick'?'stick':'dpad';this.root.dataset.handedness=this.prefs.handedness;this.stick.hidden=this.prefs.layout!=='joystick';this.dpad.hidden=this.prefs.layout!=='dpad';
  const layout=this.prefs.layout==='joystick'?'D-pad':'Joystick',hand=this.prefs.handedness==='right'?'Left hand':'Right hand';
  this.layoutButton.setAttribute('aria-label','Use '+layout);this.layoutButton.title='Use '+layout;this.layoutButton.setAttribute('aria-pressed',String(this.prefs.layout==='dpad'));const label=this.layoutButton.querySelector('[data-touch-layout-label]');if(label)label.textContent=layout;
  if(this.handButton){this.handButton.setAttribute('aria-label','Use '+hand.toLowerCase()+' controls');this.handButton.title='Use '+hand.toLowerCase()+' controls';this.handButton.setAttribute('aria-pressed',String(this.prefs.handedness==='left'));const label=this.handButton.querySelector('[data-touch-hand-label]');if(label)label.textContent=hand;}
 }
 /** Safe to call every frame. A disabled A button cannot cancel a held stick;
  * permission loss releases only the pointers whose action became forbidden. */
 setContext(context:TouchContext){
  if(this.disposed)return;for(const key of['movement','interact','menu','run']as const)if(typeof context[key]!=='boolean')throw TypeError('Explicit touch context requires boolean '+key);
  if((Object.keys(this.context)as(keyof TouchContext)[]).every(key=>this.context[key]===context[key]))return;
  this.context={...context};for(const[id,pointer]of this.owned)if(!this.allowed(pointer.kind))this.release(id);this.renderContext();
 }
 get preferences():Readonly<TouchPreferences>{return{...this.prefs};}
 setPreferences(update:Partial<TouchPreferences>){
  if(this.disposed)return;const next={layout:update.layout===undefined?this.prefs.layout:update.layout,handedness:update.handedness===undefined?this.prefs.handedness:update.handedness};if(!preferences(next))throw RangeError('Invalid touch layout or handedness');
  if(next.layout===this.prefs.layout&&next.handedness===this.prefs.handedness)return;
  this.reset();this.prefs=next;this.renderPreferences();try{this.storage?.setItem(TOUCH_PREFERENCES_KEY,JSON.stringify({version:1,...next}));}catch{/* A storage failure must not interrupt held-input cleanup or game controls. */}
 }
 read():TouchInput{
  if(!this.available()){this.reset();return zero();}
  let horizontal=0,forward=0,run=false;const heldDirections=new Set<Direction>();
  for(const pointer of this.owned.values()){
   if(pointer.kind==='stick'&&this.context.movement){horizontal+=this.stickVector.horizontal;forward+=this.stickVector.forward;}
   if(pointer.kind==='direction'&&this.context.movement&&pointer.direction)heldDirections.add(pointer.direction);
   if(pointer.kind==='run'&&this.context.movement&&this.context.run)run=true;
  }
  horizontal+=Number(heldDirections.has('right'))-Number(heldDirections.has('left'));forward+=Number(heldDirections.has('up'))-Number(heldDirections.has('down'));
  const length=Math.hypot(horizontal,forward);if(length>1){horizontal/=length;forward/=length;}return{horizontal,forward,run};
 }
 /** Root calls this for UI/field transitions; it never alters root permissions. */
 reset(){for(const id of [...this.owned.keys()])this.release(id);}
 dispose(){if(this.disposed)return;this.reset();this.disposed=true;for(const cleanup of this.cleanup.splice(0))cleanup();this.context={movement:false,interact:false,menu:false,run:false};this.renderContext();}
}
