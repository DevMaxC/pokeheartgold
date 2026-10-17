import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {UI} from './ui.ts';

function dom(){
  const oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document'),oldAdd=Object.getOwnPropertyDescriptor(globalThis,'addEventListener');
  const ids=new Map<string,Element>(),focus:string[]=[];let buttons:Element[]=[];
  class Element{
    hidden=true;inert=false;textContent='';value='';dataset:Record<string,string>={};onclick:(()=>void)|null=null;onsubmit:((event:{preventDefault:()=>void})=>void)|null=null;
    private html='';private first:Element|null=null;
    constructor(readonly id:string){}
    get innerHTML(){return this.html;}
    set innerHTML(value:string){
      this.html=value;if(this.id!=='panel-content')return;
      buttons=Array.from(value.matchAll(/data-option="(\d+)"/g),match=>{const button=new Element('option-'+match[1]);button.dataset.option=match[1];return button;});
      if(value.includes('id="name-form"')){ids.set('name-form',new Element('name-form'));const input=new Element('name-input');input.value=value.match(/value="([^"]*)"/)?.[1]??'';ids.set('name-input',input);}
      this.first=buttons[0]??new Element('panel-first');
    }
    focus(){focus.push(this.id);}
    select(){}
    querySelector(){return this.first;}
  }
  for(const id of['dialogue-next','dialogue','dialogue-speaker','dialogue-text','panel-content','panel','original-world','game-hud','touch-pad'])ids.set(id,new Element(id));
  Object.defineProperty(globalThis,'document',{value:{getElementById:(id:string)=>ids.get(id),querySelectorAll:()=>buttons},configurable:true});
  Object.defineProperty(globalThis,'addEventListener',{value:()=>{},configurable:true});
  return{ids,focus,get buttons(){return buttons;},restore(){for(const[key,descriptor]of[['document',oldDocument],['addEventListener',oldAdd]]as const){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}}};
}
function clock(){
  const set=globalThis.setTimeout,clear=globalThis.clearTimeout,tasks=new Map<number,()=>void>();let serial=0;
  globalThis.setTimeout=((callback:()=>void)=>{tasks.set(++serial,callback);return serial;})as unknown as typeof setTimeout;
  globalThis.clearTimeout=((id:number)=>{tasks.delete(id);})as unknown as typeof clearTimeout;
  return{tasks,flush(){const batch=[...tasks];tasks.clear();for(const[,callback]of batch)callback();},restore(){globalThis.setTimeout=set;globalThis.clearTimeout=clear;}};
}
function controller(){
  const owner=new AbortController(),listeners=new Set<EventListenerOrEventListenerObject>(),signal=owner.signal,add=signal.addEventListener.bind(signal),remove=signal.removeEventListener.bind(signal);
  signal.addEventListener=((type:string,listener:EventListenerOrEventListenerObject,options?:AddEventListenerOptions)=>{if(type==='abort')listeners.add(listener);add(type,listener,options);})as typeof signal.addEventListener;
  signal.removeEventListener=((type:string,listener:EventListenerOrEventListenerObject,options?:EventListenerOptions)=>{if(type==='abort')listeners.delete(listener);remove(type,listener,options);})as typeof signal.removeEventListener;
  return{owner,signal,listeners};
}
const sourceMessages=await Promise.all([187,302].map(async bank=>JSON.parse(await readFile(new URL(`../../public/source/messages/${bank}.json`,import.meta.url),'utf8'))as Record<string,string>));

test('real native hatch187 and Egg summary302 messages decode literal newline tokens without double decoding',async()=>{
  const fixtures=[
    {text:sourceMessages[0]['1'],expected:'Would you like to nickname the\nnewly hatched {STRVAR_1 0, 0, 0}? {YESNO 0}'},
    {text:sourceMessages[1]['105'],expected:'“The Egg Watch”\nSounds can be heard\ncoming from inside!\nIt will hatch soon!'},
  ];
  const d=dom();try{const ui=new UI();for(const{text,expected}of fixtures){assert.ok(text.includes('\\n'));const pending=ui.message(text);assert.equal(d.ids.get('dialogue-text')!.textContent,expected);ui.advance();await pending;}}finally{d.restore();}
});

test('aborting an instant page or active typewriter rejects and removes its timer, advance callback and listener',async()=>{
  for(const delay of[0,50]){const d=dom(),c=clock(),abort=controller();try{
    const ui=new UI(),reason=Error('hatch cry failed'),pending=ui.message('Hatching text',delay,abort.signal),rejected=assert.rejects(pending,error=>error===reason);
    const stalePrint=[...c.tasks.values()][0];assert.equal(abort.listeners.size,1);abort.owner.abort(reason);await rejected;
    const stoppedText=d.ids.get('dialogue-text')!.textContent;ui.advance();stalePrint?.();assert.equal(d.ids.get('dialogue-text')!.textContent,stoppedText);assert.equal(c.tasks.size,0);assert.equal(abort.listeners.size,0);assert.equal(ui.dialogueOpen,false);assert.equal(d.ids.get('dialogue')!.hidden,true);
  }finally{c.restore();d.restore();}}
});

test('abort between native pages prevents the next page from appearing or leaving an orphan waiter',async()=>{
  const d=dom(),abort=controller();try{const ui=new UI(),pending=ui.message('First\\rSecond\\fThird',0,abort.signal),rejected=assert.rejects(pending,{name:'AbortError'});ui.advance();abort.owner.abort();await rejected;assert.equal(d.ids.get('dialogue-text')!.textContent,'First');assert.equal(ui.dialogueOpen,false);assert.equal(abort.listeners.size,0);}finally{d.restore();}
});

test('superseding dialogue rejects the old owner and late old abort cannot hide or advance the new message',async()=>{
  const d=dom(),c=clock(),abort=controller();try{
    const ui=new UI(),old=ui.message('Old hatch',50,abort.signal),rejected=assert.rejects(old,{name:'AbortError'}),stalePrint=[...c.tasks.values()][0];
    const next=ui.message('New recovery dialogue');abort.owner.abort();await rejected;stalePrint();assert.equal(d.ids.get('dialogue-text')!.textContent,'New recovery dialogue');assert.equal(ui.dialogueOpen,true);assert.equal(abort.listeners.size,0);assert.equal(c.tasks.size,0);ui.advance();await next;
  }finally{c.restore();d.restore();}
});

test('aborting a choice detaches buttons and queued focus, restores prior inert state and permits coherent recovery UI',async()=>{
  const d=dom(),c=clock(),abort=controller();try{
    d.ids.get('game-hud')!.inert=true;const ui=new UI(),pending=ui.choose('Nickname?',['Yes','No'],'',abort.signal),rejected=assert.rejects(pending,{name:'AbortError'}),buttons=d.buttons.slice(),oldClick=buttons[0].onclick!;
    assert.equal(ui.canDismiss,false);assert.equal(d.ids.get('original-world')!.inert,true);abort.owner.abort();await rejected;assert.equal(c.tasks.size,0);assert.equal(abort.listeners.size,0);assert.ok(buttons.every(button=>button.onclick===null));assert.equal(ui.panelOpen,false);assert.equal(ui.canDismiss,true);assert.equal(d.ids.get('original-world')!.inert,false);assert.equal(d.ids.get('game-hud')!.inert,true);
    ui.panel('Recovered field');oldClick();assert.equal(ui.panelOpen,true);assert.equal(d.ids.get('panel-content')!.innerHTML,'Recovered field');ui.close();
  }finally{c.restore();d.restore();}
});

test('successful choices release abort ownership and superseded choices cannot close a newer panel',async()=>{
  const d=dom(),c=clock(),abort=controller();try{
    const ui=new UI(),first=ui.choose('First',['Yes','No'],'',abort.signal);d.buttons[1].onclick!();assert.equal(await first,1);assert.equal(abort.listeners.size,0);
    const pending=ui.choose('Old',['Old']),rejected=assert.rejects(pending,{name:'AbortError'}),oldClick=d.buttons[0].onclick!;
    const next=ui.choose('New',['New']);abort.owner.abort();await rejected;oldClick();assert.equal(ui.panelOpen,true);assert.match(d.ids.get('panel-content')!.innerHTML,/New/);d.buttons[0].onclick!();assert.equal(await next,0);assert.equal(ui.panelOpen,false);
  }finally{c.restore();d.restore();}
});

test('aborting naming detaches its exact form and cannot submit or close a replacement nickname prompt',async()=>{
  const d=dom(),c=clock(),abort=controller();try{
    const ui=new UI(),pending=ui.input('Old nickname',10,'Old',abort.signal),rejected=assert.rejects(pending,{name:'AbortError'}),oldForm=d.ids.get('name-form')!,oldSubmit=oldForm.onsubmit!;
    abort.owner.abort();await rejected;assert.equal(oldForm.onsubmit,null);assert.equal(abort.listeners.size,0);assert.equal(c.tasks.size,0);assert.equal(ui.panelOpen,false);
    const next=ui.input('New nickname',10,'New');oldSubmit({preventDefault(){}});assert.equal(ui.panelOpen,true);const input=d.ids.get('name-input')!,form=d.ids.get('name-form')!;input.value='   ';form.onsubmit!({preventDefault(){}});assert.equal(ui.panelOpen,true);input.value='  TogepiNameLong  ';form.onsubmit!({preventDefault(){}});assert.equal(await next,'TogepiName');assert.equal(form.onsubmit,null);assert.equal(ui.panelOpen,false);
  }finally{c.restore();d.restore();}
});

test('pre-aborted operations reject without replacing existing dialogue or a newer panel',async()=>{
  const d=dom(),c=clock(),abort=controller();try{
    const ui=new UI(),message=ui.message('Existing dialogue');ui.panel('Existing panel');abort.owner.abort();
    await assert.rejects(ui.message('Stale',0,abort.signal),{name:'AbortError'});await assert.rejects(ui.choose('Stale',['No'],'',abort.signal),{name:'AbortError'});await assert.rejects(ui.input('Stale',10,'',abort.signal),{name:'AbortError'});
    assert.equal(d.ids.get('dialogue-text')!.textContent,'Existing dialogue');assert.equal(d.ids.get('panel-content')!.innerHTML,'Existing panel');assert.equal(ui.dialogueOpen,true);assert.equal(ui.panelOpen,true);ui.advance();await message;ui.close();
  }finally{c.restore();d.restore();}
});

test('hatch sibling failure can abort pending text before all owned announcement work is drained',async()=>{
  const d=dom(),c=clock(),abort=controller();try{
    const ui=new UI(),reason=Error('Native cry failed'),cry=Promise.resolve().then(()=>{throw reason;});
    const announce=(async()=>{await ui.message(sourceMessages[0]['0'],0,abort.signal);await cry;await ui.choose('Nickname?',['Yes','No'],'',abort.signal);})();
    void cry.catch(error=>abort.owner.abort(error));const results=await Promise.allSettled([cry,announce]);assert.ok(results.every(result=>result.status==='rejected'&&result.reason===reason));assert.equal(ui.busy,false);assert.equal(abort.listeners.size,0);assert.equal(c.tasks.size,0);
  }finally{c.restore();d.restore();}
});

test('native automatic printer completes without a confirm while retaining visible abort-owned hatch text',async()=>{
  const d=dom(),c=clock(),abort=controller();try{
    const ui=new UI();let completed=false;const pending=ui.printMessage('Pip',50,abort.signal).then(dispose=>{completed=true;return dispose;});
    assert.equal(d.ids.get('dialogue-text')!.textContent,'P');await Promise.resolve();assert.equal(completed,false);c.flush();assert.equal(d.ids.get('dialogue-text')!.textContent,'Pi');c.flush();const dispose=await pending;
    assert.equal(completed,true);assert.equal(c.tasks.size,0);assert.equal(abort.listeners.size,1);assert.equal(d.ids.get('dialogue-text')!.textContent,'Pip');assert.equal(ui.dialogueOpen,true);ui.advance();assert.equal(ui.dialogueOpen,true);
    dispose();dispose();assert.equal(ui.dialogueOpen,false);assert.equal(d.ids.get('dialogue')!.hidden,true);assert.equal(abort.listeners.size,0);
  }finally{c.restore();d.restore();}
});

test('confirm fast-forwards a native automatic printer and no second confirm is required to finish',async()=>{
  const d=dom(),c=clock();try{
    const ui=new UI(),text=sourceMessages[0]['0'],pending=ui.printMessage(text,50);ui.advance();const dispose=await pending;
    assert.equal(d.ids.get('dialogue-text')!.textContent,text);assert.equal(c.tasks.size,0);assert.equal(ui.dialogueOpen,true);dispose();assert.equal(ui.dialogueOpen,false);
  }finally{c.restore();d.restore();}
});

test('automatic printer abort rejects before completion and still cleans its retained surface after completion',async()=>{
  const d=dom(),c=clock();try{
    const ui=new UI(),early=controller(),failure=Error('cry failed'),pending=ui.printMessage('Hatching',50,early.signal),rejected=assert.rejects(pending,error=>error===failure),stalePrint=[...c.tasks.values()][0];early.owner.abort(failure);await rejected;stalePrint();assert.equal(c.tasks.size,0);assert.equal(early.listeners.size,0);assert.equal(ui.dialogueOpen,false);
    const late=controller(),dispose=await ui.printMessage('Hatched',0,late.signal);assert.equal(late.listeners.size,1);late.owner.abort(failure);assert.equal(ui.dialogueOpen,false);assert.equal(late.listeners.size,0);dispose();assert.equal(ui.dialogueOpen,false);
  }finally{c.restore();d.restore();}
});

test('late automatic-printer dispose, abort and timer cannot clear or write a newer dialogue or panel',async()=>{
  const d=dom(),c=clock(),abort=controller();try{
    const ui=new UI(),dispose=await ui.printMessage('Old hatch',0,abort.signal),next=ui.message('New dialogue');dispose();abort.owner.abort();assert.equal(d.ids.get('dialogue-text')!.textContent,'New dialogue');assert.equal(ui.dialogueOpen,true);assert.equal(abort.listeners.size,0);ui.advance();await next;
    const pending=ui.printMessage('Typing old hatch',50),rejected=assert.rejects(pending,{name:'AbortError'}),stalePrint=[...c.tasks.values()][0],replacement=ui.message('Recovery field');await rejected;stalePrint();assert.equal(d.ids.get('dialogue-text')!.textContent,'Recovery field');ui.advance();await replacement;
    const release=await ui.printMessage('Hatched',0),prompt=ui.choose('Nickname?',['Yes','No']);release();assert.equal(ui.dialogueOpen,false);assert.equal(ui.panelOpen,true);d.buttons[1].onclick!();assert.equal(await prompt,1);
  }finally{c.restore();d.restore();}
});

test('automatic printer rejects pre-aborted or multi-page requests without replacing existing owned text',async()=>{
  const d=dom(),c=clock(),abort=controller();try{
    const ui=new UI(),dispose=await ui.printMessage('Current hatch',0);abort.owner.abort();await assert.rejects(ui.printMessage('Stale',0,abort.signal),{name:'AbortError'});await assert.rejects(ui.printMessage('First\\rSecond'),/one message page/);assert.equal(d.ids.get('dialogue-text')!.textContent,'Current hatch');assert.equal(ui.dialogueOpen,true);dispose();
  }finally{c.restore();d.restore();}
});
