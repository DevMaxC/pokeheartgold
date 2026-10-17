import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createContext,runInContext} from 'node:vm';
import * as ts from 'typescript';
import * as THREE from 'three';
import {UI} from './ui.ts';
import {loadData,newState,createMon} from './data.ts';
import {NATIVE_EGG_ICON} from './eggs.ts';
import {partyRow,partySummary} from './party-display.ts';
import {chooseFieldPartySwitchTarget,swapFieldPartySlots} from './party-order.ts';
import {SourceActionRecovery,SourceTriggerGate,runRecoverableSourceAction} from './script-recovery.ts';
import {TrainerAttemptLatch} from './trainer-encounters.ts';
import {UnsupportedScript} from './script.ts';
import {installUIDOM,installUIClock} from './ui-test-dom.ts';

globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData(),mainURL=new URL('./main.ts',import.meta.url),main=await readFile(mainURL,'utf8'),mainHash=createHash('sha256').update(main).digest('hex');
const ast=ts.createSourceFile('main.ts',main,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),functions=new Map(ast.statements.filter(ts.isFunctionDeclaration).map(node=>[node.name?.text,node.getText(ast)]));
const names=['resetFieldInput','save','executeSourceAction','partyMenu','choosePartyAction','summary'];for(const name of names)assert.ok(functions.has(name),'actual main binding '+name);
const globalKeydowns=ast.statements.filter(node=>ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)&&node.expression.expression.getText(ast)==='addEventListener'&&ts.isStringLiteral(node.expression.arguments[0])&&node.expression.arguments[0].text==='keydown');
assert.equal(globalKeydowns.length,2,'bind both permission capture and field bubble handlers');
const globalHandler=globalKeydowns.map(node=>node.getText(ast)).join('\n'),bound=names.map(name=>functions.get(name)).join('\n')+'\n'+globalHandler;
const compiled=ts.transpileModule(bound,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
after(async()=>assert.equal(createHash('sha256').update(await readFile(mainURL)).digest('hex'),mainHash,'main changed during actual global/UI binding tests'));

function dom(){
 const d=installUIDOM(),clock=installUIClock(),log=[],listeners=[];let phase='ui';
 const add=(type,handler,options)=>{const entry={handler,phase:phase==='global'&&options?.capture?'permission':phase,active:true};if(type==='keydown')listeners.push(entry);d.listen(type,event=>{if(!entry.active)return;if(type==='keydown')log.push(['keydown',entry.phase]);handler(event);},!!options?.capture);};
 const remove=(type,handler)=>{if(type==='keydown')for(const entry of listeners)if(entry.handler===handler)entry.active=false;};
 Object.defineProperty(globalThis,'addEventListener',{value:add,configurable:true});
 return{...d,clock,log,listeners,add,remove,setPhase(value){phase=value;},get buttons(){return d.buttons;},dispatchEscape(){return d.key('Escape');},restore(){clock.restore();d.restore();}};
}
function fixture(){
 const d=dom(),ui=new UI(),state=newState(data,'Ethan','boy',()=>.5);state.map=73;state.party=[createMon(data,155,5,state.name,()=>.5),createMon(data,175,1,state.name,()=>.2)];
 const writes=[],log=d.log,signals=[],originalChoose=ui.choose.bind(ui),originalClose=ui.close.bind(ui);
 ui.choose=(...args)=>{log.push(['choice',args[0]]);if(args[3]){signals.push(args[3]);args[3].addEventListener('abort',()=>log.push('owned-abort'),{once:true});}return originalChoose(...args);};
 ui.close=()=>{log.push('close');originalClose();};
 const c={state,data,ui,document:d.document,$:id=>d.ids.get(id),NATIVE_EGG_ICON,partyRow,partySummary,chooseFieldPartySwitchTarget,swapFieldPartySlots,UnsupportedScript,runRecoverableSourceAction,ready:true,started:true,recoveryPrompt:false,transitioning:false,walking:false,hatching:false,battleSoundOwned:false,touch:{reset(){}},camera:{reset(){}},vm:{busy:false},battle:{active:false},player:{group:new THREE.Group()},objects:{save:()=>state.objectEvents},keys:new Set(),drag:false,frameTriggerGate:new SourceTriggerGate(),trainerAttempts:new TrainerAttemptLatch(),lastError:'',console:{error(){},warn:console.warn},SAVE_KEY:'party-global-test',localStorage:{setItem:(_key,text)=>writes.push(JSON.parse(text))},updateHUD(){},AbortController,DOMException,HTMLInputElement:class{},unlockSound(){},fieldControlsAvailable(){return !ui.busy&&!c.sourceActions.busy;},reportInputError(error){throw error;},addEventListener:d.add,removeEventListener:d.remove,menu(){log.push('menu');},interact(){log.push('interact');},answerPhone:async()=>{log.push('phone');}};
 createContext(c);d.setPhase('global');runInContext(compiled,c);d.setPhase('party');
 c.sourceActions=new SourceActionRecovery(state,{capture:()=>({}),restore:async()=>{log.push('restore');}});
 return{c,d,ui,log,writes,signals,cleanup(){ui.close();d.restore();}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(condition){for(let i=0;i<20;i++){if(condition())return;await tick();}assert.ok(condition(),'expected actual UI phase did not open');}

test('actual main global Escape runs before the party abort listener while REAL UI.choose owns a nondismissible panel',async t=>{
 t.diagnostic('main SHA256 '+mainHash+'; global/party bindings SHA256 '+createHash('sha256').update(bound).digest('hex'));
 for(const target of[false,true]){
  const f=fixture(),{c,d,ui,log}=f;try{
   const before=structuredClone(c.state.party);const pending=c.choosePartyAction(1);
   if(target){d.buttons.find(button=>button.dataset.option==='1').onclick();await until(()=>d.ids.get('panel-content').innerHTML.includes('Move to where?'));}
   assert.equal(ui.panelOpen,true);assert.equal(ui.canDismiss,false);assert.equal(c.sourceActions.busy,true);
   const oldButton=d.buttons[0],oldClick=oldButton.onclick,event=d.dispatchEscape();
   assert.deepEqual(log.filter(row=>Array.isArray(row)&&row[0]==='keydown').slice(-4),[['keydown','ui'],['keydown','permission'],['keydown','global'],['keydown','party']]);assert.ok(log.findIndex(row=>Array.isArray(row)&&row[0]==='keydown'&&row[1]==='global')<log.indexOf('owned-abort'));
   assert.equal(f.signals.at(-1).aborted,true);assert.equal(oldButton.onclick,null);assert.equal(ui.panelOpen,false,'only local abort closes the old chooser synchronously');assert.ok(!log.includes('close'),'global Escape must not call UI.close on the nondismissible chooser');
   const result=await pending;assert.equal(result.focused,1);assert.deepEqual(c.state.party,before);assert.ok(!log.includes('restore'),'owned Escape is cancellation, not a failed source scene');assert.ok(!log.some(row=>Array.isArray(row)&&row[0]==='choice'&&row[1]==='Scene not completed'));assert.equal(c.sourceActions.busy,false);assert.equal(d.listeners.some(entry=>entry.phase==='party'&&entry.active),false);assert.equal(ui.panelOpen,false,'the caller owns reopening the party after this resolved action');
   // Late callbacks from the aborted chooser cannot close a newer panel.
   ui.panel('<h2>Replacement field panel</h2>');oldClick();assert.equal(ui.panelOpen,true);assert.match(d.ids.get('panel-content').innerHTML,/Replacement field panel/);assert.equal(event.code,'Escape');
  }finally{f.cleanup();}
 }
});

test('global Escape and stale party abort/button callbacks leave the REAL recovery choice owned and usable after external replacement',async()=>{
 const f=fixture(),{c,d,ui,log}=f;try{
  const before=structuredClone(c.state.party);const pending=c.choosePartyAction(1),oldButton=d.buttons[0],oldClick=oldButton.onclick,oldLocal=d.listeners.find(entry=>entry.phase==='party').handler,oldSignal=f.signals[0];
  ui.panel('<h2>External replacement</h2>');await until(()=>d.ids.get('panel-content').innerHTML.includes('Scene not completed'));
  assert.ok(log.includes('restore'));assert.equal(c.recoveryPrompt,true);assert.equal(ui.panelOpen,true);assert.equal(ui.canDismiss,false);assert.equal(oldButton.onclick,null);assert.equal(d.listeners.some(entry=>entry.phase==='party'&&entry.active),false);
  const recoveryHTML=d.ids.get('panel-content').innerHTML,recoveryButtons=[...d.buttons],event=d.dispatchEscape();
  oldLocal(event);oldClick();await tick();
  assert.equal(oldSignal.aborted,true);assert.equal(ui.panelOpen,true);assert.equal(ui.canDismiss,false);assert.equal(d.ids.get('panel-content').innerHTML,recoveryHTML);assert.ok(recoveryButtons.every(button=>typeof button.onclick==='function'),'the old abort must not detach replacement handlers');assert.ok(!log.includes('close'),'global Escape must not dismiss the recovery choice');
  recoveryButtons[1].onclick();const result=await pending;assert.equal(result.focused,1);assert.equal(c.recoveryPrompt,false);assert.equal(c.sourceActions.busy,false);assert.deepEqual(c.state.party,before);assert.equal(ui.panelOpen,false,'the caller owns reopening the party after this resolved action');assert.equal(d.listeners.some(entry=>entry.phase==='party'&&entry.active),false);
 }finally{f.cleanup();}
});
