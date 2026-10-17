import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {nativeMessageTokens} from './native-text.ts';
import {installUIDOM,installUIClock} from './ui-test-dom.ts';
import type {UI as UIClass} from './ui.ts';
const {UI}=await import(process.env.HG_NATIVE_PRINTER_UI?pathToFileURL(process.env.HG_NATIVE_PRINTER_UI).href:'./ui.ts')as{UI:typeof UIClass};
const messages=JSON.parse(await readFile(new URL('../../public/source/messages/197.json',import.meta.url),'utf8'))as Record<string,string>;
const flush=async()=>{for(let n=0;n<12;n++)await Promise.resolve();};
function frames(){const pending:{resolve:()=>void;signal:AbortSignal}[]=[];let count=0;return{get count(){return count;},nextFrame:(signal:AbortSignal)=>new Promise<void>(resolve=>pending.push({resolve,signal})),async tick(){assert.equal(pending.length,1,'one current source printer wait');const frame=pending.shift()!;assert.equal(frame.signal.aborted,false);count++;frame.resolve();await flush();},releaseLate(){for(const row of pending.splice(0))row.resolve();}};}

test('bank197 tokens preserve native controls while nickname operands cannot inject source controls',()=>{
 const name='{WAIT 5}\\r<nickname>',tokens=nativeMessageTokens(messages[918],[name,'Quilava']);
 assert.deepEqual(tokens.filter(row=>row.kind==='glyph'),[{kind:'glyph',id:3},{kind:'glyph',id:2}]);assert.ok(tokens.some(row=>row.kind==='text'&&row.text===name));assert.equal(tokens.filter(row=>row.kind==='page').length,1);
 assert.deepEqual(nativeMessageTokens(messages[1199]).filter(row=>row.kind==='pause'),Array.from({length:4},()=>({kind:'pause',frames:20})));assert.deepEqual(nativeMessageTokens(messages[1195]).at(-1),{kind:'indicator',id:0});
 assert.throws(()=>nativeMessageTokens(messages[917]),/operand/);assert.throws(()=>nativeMessageTokens('{WAIT 6}'),/Unsupported/);assert.throws(()=>nativeMessageTokens('{PAUSE 65536}'),/Invalid/);
});

test('actual UI congratulations starts fanfare once, polls live readiness on source frames and waits for its final page',async()=>{
 const d=installUIDOM(),clock=installUIClock(),f=frames();try{
  const ui=new UI(),calls:number[]=[];let playing=true,complete=false;const printer=ui.printNativeMessage(nativeMessageTokens(messages[918],['Cyndaquil','Quilava']),0,{nextFrame:f.nextFrame,glyph:id=>{calls.push(id);return id===2&&playing;}});void printer.done.then(()=>{complete=true;});assert.deepEqual(calls,[3]);assert.equal(d.ids.get('dialogue-text')!.textContent,'');
  await f.tick();assert.match(d.ids.get('dialogue-text')!.textContent,/Congratulations! Your Cyndaquil\nevolved into Quilava!/);assert.deepEqual(calls,[3,2]);ui.advance();assert.equal(complete,false);await f.tick();assert.deepEqual(calls,[3,2,2]);playing=false;await f.tick();assert.deepEqual(calls,[3,2,2,2]);await f.tick();assert.equal(complete,false);
  assert.equal(d.key('KeyB').defaultPrevented,true);await printer.done;assert.equal(complete,true);assert.equal(ui.dialogueOpen,true);assert.equal(clock.tasks.size,0);printer.clear();assert.equal(ui.dialogueOpen,false);
 }finally{clock.restore();d.restore();}
});

test('PAUSE uses the source state6 countdown and text fast-forward cannot bypass it',async()=>{
 const d=installUIDOM(),clock=installUIClock(),f=frames();try{
  const ui=new UI(),printer=ui.printNativeMessage(nativeMessageTokens('1,{PAUSE 2}Poof!{WAIT 4}'),0,{nextFrame:f.nextFrame,glyph:id=>{assert.equal(id,4);return false;}});assert.equal(d.ids.get('dialogue-text')!.textContent,'1,');ui.advance();await f.tick();await f.tick();assert.equal(d.ids.get('dialogue-text')!.textContent,'1,');await f.tick();assert.equal(d.ids.get('dialogue-text')!.textContent,'1,Poof!');await f.tick();await printer.done;assert.equal(f.count,4);printer.clear();
 }finally{clock.restore();d.restore();}
});

test('replacing a native WAIT cancels an abort-ignoring frame port without clobbering recovery UI',async()=>{
 const d=installUIDOM(),clock=installUIClock(),f=frames(),owner=new AbortController();try{
  const ui=new UI(),old=ui.printNativeMessage(nativeMessageTokens('{WAIT 1}Old'),0,{nextFrame:f.nextFrame,glyph:()=>true},owner.signal),rejected=assert.rejects(old.done,{name:'AbortError'});const next=ui.message('Recovery dialogue');await rejected;owner.abort();f.releaseLate();await flush();assert.equal(d.ids.get('dialogue-text')!.textContent,'Recovery dialogue');assert.equal(ui.dialogueOpen,true);ui.advance();await next;assert.equal(clock.tasks.size,0);
 }finally{clock.restore();d.restore();}
});

test('typewriter and page abort release owned timers; late dispose cannot hide newer native text',async()=>{
 const d=installUIDOM(),clock=installUIClock(),f=frames();try{
  const ui=new UI(),owner=new AbortController(),reason=Error('scene failed'),old=ui.printNativeMessage(nativeMessageTokens('Old\\rNext'),30,{nextFrame:f.nextFrame,glyph:()=>false},owner.signal),rejected=assert.rejects(old.done,error=>error===reason),stale=[...clock.tasks.values()][0];owner.abort(reason);await rejected;assert.equal(clock.tasks.size,0);const current=ui.printNativeMessage(nativeMessageTokens('Current'),0,{nextFrame:f.nextFrame,glyph:()=>false});await current.done;old.clear();stale?.();assert.equal(d.ids.get('dialogue-text')!.textContent,'Current');assert.equal(ui.dialogueOpen,true);current.clear();
  const pageOwner=new AbortController(),page=ui.printNativeMessage(nativeMessageTokens('Page\\r'),0,{nextFrame:f.nextFrame,glyph:()=>false},pageOwner.signal),pageRejected=assert.rejects(page.done,{name:'AbortError'});pageOwner.abort();await pageRejected;assert.equal(ui.dialogueOpen,false);
 }finally{clock.restore();d.restore();}
});

test('invalid native admission preserves existing UI and default automatic printer remains unchanged',async()=>{
 const d=installUIDOM(),clock=installUIClock(),f=frames();try{
  const ui=new UI(),clear=await ui.printMessage('Default automatic text'),owner=new AbortController();owner.abort();assert.throws(()=>ui.printNativeMessage([],0,{nextFrame:f.nextFrame,glyph:()=>false},owner.signal),{name:'AbortError'});assert.throws(()=>ui.printNativeMessage([{kind:'glyph',id:8}]as any,0,{nextFrame:f.nextFrame,glyph:()=>false}),/Invalid/);assert.equal(d.ids.get('dialogue-text')!.textContent,'Default automatic text');clear();
  const indicator=ui.printNativeMessage(nativeMessageTokens(messages[1197],['Ember']),0,{nextFrame:f.nextFrame,glyph:()=>false});await indicator.done;assert.equal(d.ids.get('dialogue')!.dataset.nativeChoice,'yes-no');assert.equal(d.ids.get('dialogue-text')!.textContent,'Stop trying to teach\nEmber? ');indicator.clear();assert.equal(d.ids.get('dialogue')!.dataset.nativeChoice,'');
 }finally{clock.restore();d.restore();}
});

test('only the live nonmodal native action retains button Enter/Space; mandatory panels and stale owners still capture',async()=>{
 const d=installUIDOM(),clock=installUIClock();try{
  const ui=new UI(),clear=await ui.printMessage('Retained source text'),button=d.document.createElement('button');d.ids.get('game')!.appendChild(button);let active=true;const first=new AbortController(),second=new AbortController(),allowed=()=>active,release=ui.ownNativeAction(button,allowed,first.signal);
  assert.equal(d.key('Enter',{target:button}).defaultPrevented,false);assert.equal(d.key('Space',{target:button}).defaultPrevented,false);active=false;assert.equal(d.key('Enter',{target:button}).defaultPrevented,true);active=true;
  release();const current=ui.ownNativeAction(button,allowed,second.signal);release();first.abort();assert.equal(d.key('Enter',{target:button}).defaultPrevented,false,'old disposer with same callback cannot remove a newer registration');
  const mandatory=ui.choose('Mandatory source choice',['Yes','No']);assert.equal(d.key('Enter',{target:button}).defaultPrevented,true);assert.equal(await mandatory,0);second.abort();assert.equal(d.key('Space',{target:button}).defaultPrevented,true);current();clear();button.remove();assert.equal(clock.tasks.size,0);
 }finally{clock.restore();d.restore();}
});
