import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import ts from 'typescript';
import {UI,escapeHTML} from './ui.ts';
import {chooseOpeningButton} from './opening-input.ts';
import {installUIDOM,installUIClock} from './ui-test-dom.ts';

// Execute the actual OpeningView.choose method with the actual modal capture
// handler and native cursor helper. Only DOM focus/layout and artwork are ports.
const source=await readFile(new URL('./opening-view.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('opening-view.ts',source,ts.ScriptTarget.Latest,true);
const view=ast.statements.find(ts.isClassDeclaration)!;
const method=view.members.find(member=>member.name?.getText(ast)==='choose')!;
const titleMethod=view.members.find(member=>member.name?.getText(ast)==='title')!;
function fixture(){
 const dom=installUIDOM(),clock=installUIClock(),ui=new UI();
 const priorWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
 const handlers=new Map<EventListenerOrEventListenerObject,{active:boolean}>();
 const window={addEventListener(type:string,handler:(event:KeyboardEvent)=>void){const owner={active:true};handlers.set(handler,owner);dom.listen(type,event=>{if(owner.active)handler(event);});},removeEventListener(_type:string,handler:EventListenerOrEventListenerObject){const owner=handlers.get(handler);if(owner)owner.active=false;}};
 Object.defineProperty(globalThis,'window',{value:window,configurable:true});
 const panel=ui.panel.bind(ui);ui.panel=(html,autoFocus)=>{
  panel(html,autoFocus);
  for(const button of dom.document.querySelectorAll('[data-opening-choice]')){
   button.classList={toggle(_name:string,value:boolean){button.selected=value;}};
   const focus=button.focus.bind(button);button.focus=()=>{focus();button.onfocus?.();};
  }
 };
 const context=createContext({document:dom.document,window,chooseOpeningButton,esc:escapeHTML,source:'/source/opening/',$:(id:string)=>dom.document.getElementById(id),OpeningTitleStage:{create:async()=>({})},addEventListener:window.addEventListener,removeEventListener:window.removeEventListener,setTimeout,console});
 const code=ts.transpileModule('class ActualOpeningChoice {'+method.getText(ast)+titleMethod.getText(ast)+'}\nglobalThis.Choice=ActualOpeningChoice;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 runInContext(code,context);const choice=new (context as any).Choice();choice.ui=ui;
 return{dom,clock,ui,choice,buttons:()=>dom.document.querySelectorAll('[data-opening-choice]'),restore(){if(priorWindow)Object.defineProperty(globalThis,'window',priorWindow);else Reflect.deleteProperty(globalThis,'window');clock.restore();dom.restore();}};
}
test('actual native opening confirms the remembered choice before any deferred focus task',async()=>{
 for(const code of['Enter','Space','KeyF']){const f=fixture();try{
  const pending=f.choice.choose('Are you a boy? Or are you a girl?',['Boy','Girl'],1);
  assert.equal(f.dom.document.activeElement,f.buttons()[1]);assert.deepEqual(f.buttons().map((button:any)=>button.selected),[false,true]);
  assert.equal(f.dom.key(code).defaultPrevented,true);assert.equal(await pending,1);assert.equal(f.ui.panelOpen,false);
 }finally{f.restore();}}
});
test('legacy opening title never consumes keyboard activation of the global mute control',async()=>{
 const f=fixture();try{
  const audio=f.dom.document.createElement('button');audio.id='audio-toggle';audio.setAttribute('data-global-audio','');f.dom.document.body.appendChild(audio);
  const actions=f.dom.document.createElement('div');actions.id='opening-title-actions';f.dom.document.body.appendChild(actions);
  f.choice.root={dataset:{},classList:{add(){},remove(){}}};let cries=0;f.choice.playCry=()=>{cries++;};
  const pending=f.choice.title({},'Start');await new Promise(resolve=>setImmediate(resolve));f.clock.flush();audio.focus();
  for(const code of['Enter','Space','KeyF']){assert.equal(f.dom.key(code).defaultPrevented,false);assert.equal(cries,0);assert.ok(f.dom.document.getElementById('opening-start'));}
  f.dom.document.getElementById('opening-start').focus();assert.equal(f.dom.key('Enter').defaultPrevented,true);assert.equal(cries,1);f.clock.flush();await pending;
 }finally{f.restore();}
});
test('actual modal capture and native cursor move once per arrow and keep focus selection aligned',async()=>{
 const f=fixture();try{
  const pending=f.choice.choose('Choose',['Boy','Girl'],1);
  for(const[code,index]of[['ArrowRight',0],['ArrowLeft',1],['ArrowUp',0],['ArrowDown',1],['Home',0],['End',1],['Tab',0]]as const){
   f.dom.key(code);assert.equal(f.dom.document.activeElement,f.buttons()[index],code);assert.deepEqual(f.buttons().map((button:any)=>button.selected),[index===0,index===1],code);
  }
  f.dom.key('Enter');assert.equal(await pending,0);
 }finally{f.restore();}
});
test('native opening retains pointer selection and mandatory Back behavior under modal ownership',async()=>{
 const f=fixture();try{
  const pending=f.choice.choose('Choose',['Boy','Girl'],1);f.dom.key('Escape');f.dom.key('KeyB');assert.equal(f.ui.panelOpen,true);
  f.buttons()[0].focus();f.buttons()[0].click();assert.equal(await pending,0);assert.equal(f.ui.panelOpen,false);
 }finally{f.restore();}
});
test('global audio activation leaves the actual opening choice and remembered cursor pending',async()=>{
 const f=fixture();try{
  const audio=f.dom.document.createElement('button');audio.id='audio-toggle';audio.setAttribute('data-global-audio','');f.dom.document.body.appendChild(audio);
  let selected:number|undefined;const pending=f.choice.choose('Choose',['Boy','Girl'],1).then((value:number)=>{selected=value;return value;});audio.focus();
  for(const code of['Enter','Space','KeyF']){assert.equal(f.dom.key(code).defaultPrevented,false);await Promise.resolve();assert.equal(selected,undefined);assert.equal(f.ui.panelOpen,true);assert.equal(f.dom.document.activeElement,audio);}
  f.buttons()[1].focus();f.dom.key('Enter');assert.equal(await pending,1);
 }finally{f.restore();}
});
