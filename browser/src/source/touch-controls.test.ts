import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TouchControls,TOUCH_PREFERENCES_KEY} from './touch-controls.ts';

const enabled={movement:true,interact:true,menu:true,run:true};
const approx=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} should equal ${expected}`);
function storage(initial?:string){const values=new Map(initial===undefined?[]:[[TOUCH_PREFERENCES_KEY,initial]]),writes:string[]=[];return{values,writes,failRead:false,failWrite:false,getItem(key:string){if(this.failRead)throw Error('Storage blocked');return values.get(key)??null;},setItem(key:string,value:string){if(this.failWrite)throw Error('Storage full');values.set(key,value);writes.push(value);}};}
function fixture(options:{storage?:ReturnType<typeof storage>|null;deadzone?:number;start?:boolean;missing?:string}={}){
 const captures=new Map<number,Element>(),captureLog:unknown[]=[],nodes=new Map<string,Element>(),targets:Target[]=[];
 class Target{
  listeners=new Map<string,Set<(event:any)=>void>>();parent:Target|null=null;
  constructor(){targets.push(this);}
  addEventListener(type:string,handler:(event:any)=>void){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type)!.add(handler);}
  removeEventListener(type:string,handler:(event:any)=>void){this.listeners.get(type)?.delete(handler);}
  fire(type:string,values:Record<string,unknown>={}){
   const event={type,target:this,defaultPrevented:false,button:0,detail:0,pointerType:'touch',preventDefault(){this.defaultPrevented=true;},...values};
   for(let target:Target|null=this;target;target=target.parent)for(const listener of [...(target.listeners.get(type)??[])])if(target.listeners.get(type)?.has(listener))listener(event);
   return event;
  }
 }
 const win=new Target(),doc=Object.assign(new Target(),{visibilityState:'visible',activeElement:null as Element|null,defaultView:win});doc.parent=win;
 class Element extends Target{
  ownerDocument=doc;disabled=false;hidden=false;inert=false;draggable=true;dataset:Record<string,string>={};title='';textContent='';failCapture=false;
  rect={left:0,top:0,width:40,height:40};attributes=new Map<string,string>();styles=new Map<string,string>();classes=new Set<string>();selectors=new Map<string,Element>();
  style={setProperty:(key:string,value:string)=>this.styles.set(key,value),getPropertyValue:(key:string)=>this.styles.get(key)??''};
  classList={toggle:(key:string,on:boolean)=>{if(on)this.classes.add(key);else this.classes.delete(key);},contains:(key:string)=>this.classes.has(key)};
  constructor(readonly id:string,readonly tag='button'){super();nodes.set(id,this);}
  setAttribute(name:string,value:string){this.attributes.set(name,value);}
  getAttribute(name:string){return this.attributes.get(name)??null;}
  querySelector(selector:string){return this.selectors.get(selector)??null;}
  contains(target:Element|null){for(let current:Target|null=target;current;current=current.parent)if(current===this)return true;return false;}
  closest(_selector:string){for(let current:Target|null=this;current;current=current.parent)if(current instanceof Element&&['input','textarea','select','editable'].includes(current.tag))return current;return null;}
  getBoundingClientRect(){return{...this.rect,right:this.rect.left+this.rect.width,bottom:this.rect.top+this.rect.height};}
  setPointerCapture(id:number){if(this.failCapture)throw Error('Capture unavailable');captures.set(id,this);captureLog.push(['capture',this.id,id]);}
  hasPointerCapture(id:number){return captures.get(id)===this;}
  releasePointerCapture(id:number){if(!this.hasPointerCapture(id))throw Error('Not owned');captures.delete(id);captureLog.push(['release',this.id,id]);this.fire('lostpointercapture',{pointerId:id});}
 }
 const root=new Element('touch-pad','div');root.parent=doc;
 for(const id of['touch-stick','touch-dpad','touch-run','touch-interact','touch-menu','touch-layout-toggle','touch-hand-toggle']){const element=new Element(id,id==='touch-stick'||id==='touch-dpad'?'div':'button');element.parent=root;root.selectors.set('#'+id,element);}
 const stick=nodes.get('touch-stick')!,thumb=new Element('thumb','div');thumb.parent=stick;root.selectors.set('.touch-stick__thumb',thumb);stick.rect={left:20,top:100,width:160,height:160};thumb.rect={left:0,top:0,width:56,height:56};
 const positions={up:[40,100],left:[0,140],down:[40,180],right:[80,140]};
 for(const dir of['up','left','down','right']as const){const button=new Element(dir);button.parent=nodes.get('touch-dpad')!;button.dataset.touchDir=dir;button.rect={left:positions[dir][0],top:positions[dir][1],width:40,height:40};root.selectors.set(`[data-touch-dir="${dir}"]`,button);}
 for(const[id,selector]of[['touch-layout-toggle','[data-touch-layout-label]'],['touch-hand-toggle','[data-touch-hand-label]']]){const label=new Element(id+'-label','span');label.parent=nodes.get(id)!;nodes.get(id)!.selectors.set(selector,label);}
 if(options.missing)root.selectors.delete(options.missing);
 const local=options.storage===undefined?storage():options.storage,actions:string[]=[],calls:{interact?:()=>void;menu?:()=>void}={};let controls:TouchControls;
 const create=()=>new TouchControls(root as unknown as HTMLElement,{interact:()=>{actions.push('interact');calls.interact?.();},menu:()=>{actions.push('menu');calls.menu?.();}},{document:doc as unknown as Document,eventTarget:win as unknown as EventTarget,storage:local,deadzone:options.deadzone});
 if(options.start!==false)controls=create();
 const send=(id:string,type:string,pointerId:number,x=100,y=180,extra:Record<string,unknown>={})=>{const target=type==='pointerdown'?nodes.get(id)!:captures.get(pointerId)??nodes.get(id)!;return target.fire(type,{pointerId,clientX:x,clientY:y,...extra});};
 return{get controls(){return controls;},create,root,doc,win,nodes,stick,thumb,captures,captureLog,actions,calls,storage:local,send,Element,listenerCount:()=>targets.reduce((total,target)=>total+[...target.listeners.values()].reduce((sum,set)=>sum+set.size,0),0)};
}

test('default joystick has a radial deadzone, smooth analog travel, up-positive axes and a clamped visual thumb',()=>{
 const f=fixture(),c=f.controls;assert.deepEqual(c.preferences,{layout:'joystick',handedness:'right'});assert.equal(f.root.dataset.layout,'stick');assert.equal(f.nodes.get('touch-dpad')!.hidden,true);assert.deepEqual(c.read(),{horizontal:0,forward:0,run:false});
 c.setContext(enabled);f.send('touch-stick','pointerdown',1);assert.deepEqual(c.read(),{horizontal:0,forward:0,run:false});assert.equal(f.stick.classList.contains('is-active'),true);
 f.send('touch-stick','pointermove',1,105,180);assert.deepEqual(c.read(),{horizontal:0,forward:0,run:false});
 f.send('touch-stick','pointermove',1,131.2,180);assert.ok(c.read().horizontal>.5&&c.read().horizontal<.52);assert.equal(c.read().forward,0);
 f.send('touch-stick','pointermove',1,100,-100);approx(c.read().forward,1);assert.equal(f.thumb.style.getPropertyValue('--touch-stick-y'),'-52px');
 f.send('touch-stick','pointermove',1,1000,-1000);const value=c.read();approx(Math.hypot(value.horizontal,value.forward),1);approx(Math.hypot(parseFloat(f.thumb.style.getPropertyValue('--touch-stick-x')),parseFloat(f.thumb.style.getPropertyValue('--touch-stick-y'))),52);
 f.send('touch-stick','pointerup',1);assert.deepEqual(c.read(),{horizontal:0,forward:0,run:false});assert.equal(f.thumb.style.getPropertyValue('--touch-stick-x'),'0px');assert.equal(f.captures.size,0);c.dispose();
});

test('the stick retains its pointer outside the zone and ignores another finger or unrelated pointer release',()=>{
 const f=fixture();f.controls.setContext(enabled);f.send('touch-stick','pointerdown',1,152,180);f.send('touch-stick','pointerdown',2,48,180);assert.equal(f.captures.has(2),false);f.send('touch-stick','pointerup',2);approx(f.controls.read().horizontal,1);
 f.send('touch-stick','pointermove',1,-100,180);approx(f.controls.read().horizontal,-1);f.send('touch-stick','pointercancel',1);assert.equal(f.controls.read().horizontal,0);f.controls.dispose();
});

test('move plus held Run uses independent multi-touch ownership and never writes keyboard keys',()=>{
 const keyboard=new Set(['KeyW','ShiftLeft']),f=fixture();f.controls.setContext(enabled);f.send('touch-stick','pointerdown',1,152,180);f.send('touch-run','pointerdown',2);f.send('touch-run','pointerdown',3);assert.deepEqual(f.controls.read(),{horizontal:1,forward:0,run:true});
 f.send('touch-run','pointerup',2);assert.equal(f.controls.read().run,true);assert.equal(f.nodes.get('touch-run')!.getAttribute('aria-pressed'),'true');f.send('touch-run','pointerup',3);assert.equal(f.controls.read().run,false);approx(f.controls.read().horizontal,1);assert.deepEqual([...keyboard],['KeyW','ShiftLeft']);assert.equal(f.win.listeners.has('keydown'),false);f.controls.dispose();
});

test('per-frame context updates and A permission loss preserve movement; Run permission and movement loss release only their owners',()=>{
 const f=fixture(),c=f.controls;c.setContext(enabled);f.send('touch-stick','pointerdown',1,152,180);f.send('touch-run','pointerdown',2);f.send('touch-interact','pointerdown',3);
 const releases=()=>f.captureLog.filter((entry:any)=>entry[0]==='release').length;const before=releases();for(let i=0;i<100;i++)c.setContext({...enabled});assert.equal(releases(),before);
 c.setContext({...enabled,interact:false});assert.equal(f.captures.has(3),false);assert.equal(f.captures.has(1),true);assert.equal(f.captures.has(2),true);assert.deepEqual(c.read(),{horizontal:1,forward:0,run:true});
 c.setContext({...enabled,interact:false,run:false});assert.equal(c.read().run,false);assert.equal(f.captures.has(2),false);assert.equal(f.nodes.get('touch-run')!.disabled,true);f.send('touch-run','pointerdown',4);assert.equal(f.captures.has(4),false);
 c.setContext({...enabled,movement:false});assert.deepEqual(c.read(),{horizontal:0,forward:0,run:false});assert.equal(f.captures.has(1),false);assert.equal(f.nodes.get('touch-interact')!.disabled,false);c.setContext(enabled);assert.equal(c.read().horizontal,0,'re-enabling never revives old held movement');c.dispose();
});

test('disabled controls still prevent selection but cannot capture, run or invoke actions; root explicitly admits each action',()=>{
 const f=fixture();for(const id of['touch-stick','touch-run','touch-interact','touch-menu'])assert.equal(f.send(id,'pointerdown',1).defaultPrevented,true);assert.equal(f.captures.size,0);assert.deepEqual(f.actions,[]);
 f.controls.setContext({movement:false,interact:true,menu:false,run:true});f.send('touch-interact','pointerdown',1);f.send('touch-menu','pointerdown',2);f.send('touch-run','pointerdown',3);assert.deepEqual(f.actions,['interact']);assert.deepEqual(f.controls.read(),{horizontal:0,forward:0,run:false});f.controls.dispose();
});

test('A fires once per pointer press and Menu releases move/Run before invoking its callback; keyboard click remains accessible',()=>{
 const f=fixture();f.controls.setContext(enabled);f.send('touch-stick','pointerdown',1,152,180);f.send('touch-run','pointerdown',2);f.send('touch-interact','pointerdown',3);f.send('touch-interact','pointermove',3);f.send('touch-interact','pointerup',3);
 f.nodes.get('touch-interact')!.fire('click',{detail:1,pointerType:'touch'});assert.deepEqual(f.actions,['interact']);f.nodes.get('touch-interact')!.fire('click',{detail:0,pointerType:''});assert.deepEqual(f.actions,['interact','interact']);
 f.calls.menu=()=>{assert.deepEqual(f.controls.read(),{horizontal:0,forward:0,run:false});assert.equal(f.captures.size,0);};f.send('touch-menu','pointerdown',4);assert.deepEqual(f.actions,['interact','interact','menu']);f.controls.dispose();
});

test('D-pad supports normalized diagonals, duplicate fingers, opposite cancellation and dragging to another live direction',()=>{
 const f=fixture(),c=f.controls;c.setPreferences({layout:'dpad'});c.setContext(enabled);assert.equal(f.stick.hidden,true);assert.equal(f.nodes.get('touch-dpad')!.hidden,false);
 f.send('right','pointerdown',1,100,160);f.send('up','pointerdown',2,60,120);f.send('up','pointerdown',3,60,120);approx(c.read().horizontal,Math.SQRT1_2);approx(c.read().forward,Math.SQRT1_2);
 f.send('left','pointerdown',4,20,160);assert.deepEqual(c.read(),{horizontal:0,forward:1,run:false});f.send('left','pointerup',4);f.send('up','pointerup',2);f.send('up','pointercancel',3);approx(c.read().horizontal,1);
 f.send('right','pointermove',1,20,160);approx(c.read().horizontal,-1);assert.equal(f.nodes.get('left')!.classList.contains('is-pressed'),true);assert.equal(f.nodes.get('right')!.classList.contains('is-pressed'),false);
 f.send('right','pointermove',1,500,500);assert.deepEqual(c.read(),{horizontal:0,forward:0,run:false});f.send('right','pointermove',1,60,120);approx(c.read().forward,1);f.send('right','pointerup',1);assert.deepEqual(c.read(),{horizontal:0,forward:0,run:false});c.dispose();
});

test('layout/hand controls persist only browser preferences and clear captures before rearranging, with no stale input on reload',()=>{
 const saved=storage(),f=fixture({storage:saved});f.controls.setContext(enabled);f.send('touch-stick','pointerdown',1,152,180);f.send('touch-layout-toggle','pointerdown',2);assert.equal(f.captures.size,0);assert.deepEqual(f.controls.preferences,{layout:'dpad',handedness:'right'});assert.equal(f.root.dataset.layout,'dpad');assert.equal(f.nodes.get('touch-layout-toggle-label')!.textContent,'Joystick');
 f.send('touch-hand-toggle','pointerdown',3);assert.equal(f.root.dataset.handedness,'left');assert.equal(f.nodes.get('touch-hand-toggle')!.getAttribute('aria-pressed'),'true');assert.deepEqual(JSON.parse(saved.values.get(TOUCH_PREFERENCES_KEY)!),{version:1,layout:'dpad',handedness:'left'});
 const copy=f.controls.preferences as any;copy.layout='bad';assert.equal(f.controls.preferences.layout,'dpad');f.controls.dispose();const reloaded=fixture({storage:saved});assert.deepEqual(reloaded.controls.preferences,{layout:'dpad',handedness:'left'});assert.deepEqual(reloaded.controls.read(),{horizontal:0,forward:0,run:false});assert.deepEqual(reloaded.actions,[]);reloaded.controls.dispose();
});

test('corrupt/unsupported preferences and blocked storage never disable usable controls; invalid explicit updates are atomic',()=>{
 for(const value of['{','null','[]','{"version":2,"layout":"dpad","handedness":"left"}','{"version":1,"layout":"keys","handedness":"right"}']){const f=fixture({storage:storage(value)});assert.deepEqual(f.controls.preferences,{layout:'joystick',handedness:'right'});f.controls.dispose();}
 const saved=storage();saved.failRead=true;saved.failWrite=true;const f=fixture({storage:saved});f.controls.setContext(enabled);f.send('touch-stick','pointerdown',1,152,180);assert.throws(()=>f.controls.setPreferences({layout:'bad'}as never),/Invalid touch/);approx(f.controls.read().horizontal,1);f.controls.setPreferences({layout:'dpad',handedness:'left'});assert.equal(f.captures.size,0);assert.equal(f.controls.preferences.layout,'dpad');f.send('right','pointerdown',2,100,160);approx(f.controls.read().horizontal,1);f.controls.dispose();
});

test('pointer cancellation, capture loss, window fallback up and repeated reset never leave a held axis or Run',()=>{
 for(const event of['pointercancel','lostpointercapture','window-up','reset']){const f=fixture();f.controls.setContext(enabled);f.send('touch-stick','pointerdown',1,152,180);f.send('touch-run','pointerdown',2);
  if(event==='reset')f.controls.reset();else if(event==='window-up'){f.win.fire('pointerup',{pointerId:1});f.win.fire('pointerup',{pointerId:2});}else for(const id of[1,2]){if(event==='lostpointercapture')f.captures.delete(id);f.nodes.get(id===1?'touch-stick':'touch-run')!.fire(event,{pointerId:id});}
  f.controls.reset();assert.deepEqual(f.controls.read(),{horizontal:0,forward:0,run:false});assert.equal(f.captures.size,0);assert.equal(f.nodes.get('touch-run')!.getAttribute('aria-pressed'),'false');f.controls.dispose();
 }
});

test('blur/pagehide/orientation/resize/hidden and editing focus clear touch state without reviving it on return',()=>{
 for(const event of['blur','pagehide','orientationchange','resize','hidden','editing','inert']){const f=fixture();f.controls.setContext(enabled);f.send('touch-stick','pointerdown',1,152,180);f.send('touch-run','pointerdown',2);
  if(event==='hidden'){f.doc.visibilityState='hidden';f.doc.fire('visibilitychange');}else if(event==='editing'){const input=new f.Element('name','input');input.parent=f.doc;f.doc.activeElement=input;input.fire('focusin');}else if(event==='inert')f.root.inert=true;else f.win.fire(event);
  assert.deepEqual(f.controls.read(),{horizontal:0,forward:0,run:false});assert.equal(f.captures.size,0);f.doc.visibilityState='visible';f.doc.activeElement=null;f.root.inert=false;f.controls.setContext(enabled);assert.deepEqual(f.controls.read(),{horizontal:0,forward:0,run:false});f.controls.dispose();
 }
});

test('callout/selection/drag suppression is confined to control surfaces, including disabled buttons; text editing stays native',()=>{
 const f=fixture();for(const id of['touch-stick','touch-run','touch-interact','touch-menu']){const control=f.nodes.get(id)!;assert.equal(control.style.getPropertyValue('user-select'),'none');assert.equal(control.style.getPropertyValue('-webkit-touch-callout'),'none');for(const type of['contextmenu','selectstart','dragstart'])assert.equal(control.fire(type).defaultPrevented,true);}
 for(const tag of['input','textarea','editable']){const input=new f.Element('edit-'+tag,tag);input.parent=f.nodes.get('touch-interact')!;for(const type of['pointerdown','contextmenu','selectstart','dragstart'])assert.equal(input.fire(type,{pointerId:10}).defaultPrevented,false);assert.equal(input.style.getPropertyValue('user-select'),'');}
 const outside=new f.Element('settings-input','input');outside.parent=f.doc;assert.equal(outside.fire('contextmenu').defaultPrevented,false);assert.equal(f.captures.size,0);f.controls.dispose();
});

test('failed capture, zero-size live zones and invalid context/config do not create phantom movement',()=>{
 const f=fixture();f.controls.setContext(enabled);f.stick.failCapture=true;f.send('touch-stick','pointerdown',1,152,180);assert.deepEqual(f.controls.read(),{horizontal:0,forward:0,run:false});f.stick.failCapture=false;f.stick.rect.width=0;f.send('touch-stick','pointerdown',2,152,180);assert.equal(f.captures.size,0);assert.throws(()=>f.controls.setContext({movement:true}as never),/boolean/);f.controls.dispose();
 for(const deadzone of[-.1,1,NaN]){const invalid=fixture({deadzone,start:false});assert.throws(invalid.create,/deadzone/);assert.equal(invalid.listenerCount(),0);}
 const missing=fixture({missing:'#touch-run',start:false});assert.throws(missing.create,/Missing touch control/);assert.equal(missing.listenerCount(),0);
});

test('dispose releases only this controller pointers, detaches every listener once and preserves a camera-owned pointer',()=>{
 const f=fixture(),camera=new f.Element('camera','canvas');camera.parent=f.doc;camera.setPointerCapture(99);f.controls.setContext(enabled);f.send('touch-stick','pointerdown',1,152,180);f.send('touch-run','pointerdown',2);assert.ok(f.listenerCount()>0);
 const stale=[...f.stick.listeners.get('pointerdown')!][0];f.controls.dispose();f.controls.dispose();assert.equal(f.listenerCount(),0);assert.deepEqual([...f.captures.keys()],[99]);assert.equal(camera.hasPointerCapture(99),true);stale({target:f.stick,pointerId:4,button:0,preventDefault(){}});assert.deepEqual(f.controls.read(),{horizontal:0,forward:0,run:false});assert.equal(f.captures.has(4),false);assert.deepEqual(f.actions,[]);
});
