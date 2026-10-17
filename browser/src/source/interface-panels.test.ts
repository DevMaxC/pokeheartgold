import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {UI} from './ui.ts';
import {InterfacePanels} from './interface-panels.ts';
import {newState} from './data.ts';
import {defaultInterfacePreferences,INTERFACE_PREFERENCES_KEY,readInterfacePreferences,writeInterfacePreferences} from './interface-preferences.ts';
import type {InterfacePreferences} from './interface-preferences.ts';
import type {TouchControls,TouchPreferences} from './touch-controls.ts';
import type {GameData,Mon,State} from './types.ts';
import {installUIDOM,installUIClock} from './ui-test-dom.ts';

const original=<T>(file:string):T=>JSON.parse(readFileSync(new URL(`../../public/source/${file}`,import.meta.url),'utf8'));
const data={initial:{flags:{},vars:{}},items:original('items.json'),constants:original('constants.json'),names:original('names.json'),personal:original<{baseStats:GameData['personal']}>('pokemon.json').baseStats,moves:original('moves.json')}as GameData;
const tick=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};

/** Extend only this fixture's Element prototype with event registration. This
 * models actual listener cleanup and button dispatch, not browser layout,
 * slider stepping, audio output or field-host admission. */
function events(d:ReturnType<typeof installUIDOM>){
  const prototype=Object.getPrototypeOf(d.document.body),names=['addEventListener','removeEventListener','dispatchEvent','click'];
  const prior=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(prototype,name)]));
  const listeners=new WeakMap<object,Map<string,Set<(...args:any[])=>void>>>();
  const handlers=(element:object,type:string)=>[...(listeners.get(element)?.get(type)??[])];
  prototype.addEventListener=function(type:string,handler:(...args:any[])=>void){let types=listeners.get(this);if(!types){types=new Map();listeners.set(this,types);}let set=types.get(type);if(!set){set=new Set();types.set(type,set);}set.add(handler);};
  prototype.removeEventListener=function(type:string,handler:(...args:any[])=>void){listeners.get(this)?.get(type)?.delete(handler);};
  prototype.dispatchEvent=function(event:any){event.target??=this;event.preventDefault??=function(){this.defaultPrevented=true;};for(const handler of handlers(this,event.type))handler.call(this,event);return !event.defaultPrevented;};
  const click=prototype.click;
  prototype.click=function(){if(this.disabled||!this.isConnected)return;click.call(this);this.dispatchEvent({type:'click',target:this,defaultPrevented:false});};
  return{handlers,restore(){for(const[name,descriptor]of prior){if(descriptor)Object.defineProperty(prototype,name,descriptor);else Reflect.deleteProperty(prototype,name);}}};
}

function fixture(withState=true){
  const d=installUIDOM(),clock=installUIClock(),ev=events(d),ui=new UI();
  const storageValues=new Map<string,string>(),writes:string[]=[];
  const storage={getItem:(key:string)=>storageValues.get(key)??null,setItem:(key:string,value:string)=>{storageValues.set(key,value);writes.push(key);}};
  let state:State|null=withState?newState(data,'<Ethan & friend>','boy'):null,prefs=defaultInterfacePreferences(),saves=0,saveResult=true,gestures=0;
  if(state){for(const key of['FLAG_GOT_BAG','FLAG_GOT_TRAINER_CARD','FLAG_GOT_SAVE_BUTTON','FLAG_GOT_OPTIONS_BUTTON'])state.flags[key]=true;state.money=3500;state.playSeconds=7380;}
  let touchPrefs:TouchPreferences={layout:'joystick',handedness:'right'};const touchWrites:Partial<TouchPreferences>[]=[];
  const touch={get preferences(){return{...touchPrefs};},setPreferences(patch:Partial<TouchPreferences>){touchWrites.push(patch);touchPrefs={...touchPrefs,...patch};}}as TouchControls;
  const ports={state:()=>state,location:()=>'<New Bark & home>',save:()=>{saves++;return saveResult;},preferences:()=>prefs,updatePreferences:(next:InterfacePreferences)=>{prefs=writeInterfacePreferences(storage,next);},touch,gesture:()=>{gestures++;}};
  const panels=new InterfacePanels(ui,data,ports);
  const node=(id:string)=>{const value=d.ids.get(id);assert.ok(value,`expected #${id}`);return value;};
  const action=(value:string)=>{const button=node('panel-content').querySelector(`[data-action="${value}"]`);assert.ok(button,`expected action ${value}`);return button;};
  const html=()=>node('panel-content').innerHTML;
  return{d,clock,ev,ui,panels,ports,storage,writes,touchWrites,node,action,html,get state(){return state;},set state(next:State|null){state=next;},get prefs(){return prefs;},get saves(){return saves;},get gestures(){return gestures;},set saveResult(next:boolean){saveResult=next;},restore(){ui.close();ev.restore();clock.restore();d.restore();}};
}

test('owned menu and Bag return through their parents with keyboard Back and consume field confirmation',async()=>{
  const f=fixture();try{
    f.state!.bag={ITEM_POTION:2,ITEM_POKE_BALL:5,ITEM_BICYCLE:1,ITEM_ANTIDOTE:0};
    let fieldKeys=0;f.d.listen('keydown',event=>{if(!event.defaultPrevented)fieldKeys++;});
    const menu=f.panels.menu();f.clock.flush();assert.match(f.html(),/&lt;New Bark &amp; home&gt;/);
    f.action('bag').focus();assert.equal(f.d.key('Enter').defaultPrevented,true);await tick();
    assert.match(f.html(),/Your Bag/);assert.match(f.html(),/Potion/);assert.match(f.html(),/× 2/);assert.doesNotMatch(f.html(),/Antidote/);
    const pocket=f.action('pocket:1');pocket.focus();f.d.key('Space');await tick();assert.match(f.html(),/Poké Ball|Poke Ball/);assert.match(f.html(),/× 5/);
    assert.equal(f.d.key('KeyB').defaultPrevented,true);await tick();assert.match(f.html(),/Adventure menu/);assert.equal(f.ui.panelOpen,true);
    assert.equal(f.d.key('Escape').defaultPrevented,true);await menu;assert.equal(f.ui.panelOpen,false);assert.equal(fieldKeys,0);assert.equal(f.saves,0);
  }finally{f.restore();}
});

test('owned menus initially focus a real action and Bag re-renders retain focus on the selected pocket',async()=>{
 const f=fixture();try{
  f.state!.party=[{species:155,gender:'male',name:'Cyndaquil',level:5,hp:12,maxHP:20,status:''}as Mon];
  const menu=f.panels.menu();f.clock.flush();assert.equal(f.d.document.activeElement.dataset.action,'party');f.d.key('KeyF');await tick();assert.match(f.html(),/Your party/);assert.equal(f.ui.panelOpen,true);f.d.key('Escape');await tick();f.d.key('Escape');await menu;
  f.state!.bag={ITEM_POTION:2,ITEM_POKE_BALL:5};const bag=f.panels.bag();f.clock.flush();assert.equal(f.d.document.activeElement.dataset.action,'pocket:0');f.action('pocket:1').click();await tick();f.clock.flush();assert.equal(f.d.document.activeElement.dataset.action,'pocket:1');f.d.key('Enter');await tick();assert.match(f.html(),/Your Bag/);assert.equal(f.ui.panelOpen,true);f.d.key('Escape');await bag;
 }finally{f.restore();}
});

test('native menu unlocks hide unavailable panels and empty party while missing state opens nothing',async()=>{
  const f=fixture();try{
    f.state!.flags={};const pending=f.panels.menu();assert.deepEqual(f.node('panel-content').querySelectorAll('[data-action]').map(button=>button.dataset.action),['back','back']);
    f.d.key('Escape');await pending;f.state=null;await f.panels.menu();await f.panels.party();await f.panels.bag();assert.equal(f.ui.busy,false);assert.equal(f.saves,0);
  }finally{f.restore();}
});

test('party delegates its entire owned flow when the host supplies native Summary/Switch/Egg actions',async()=>{
  const f=fixture();try{
    f.state!.party=[{isEgg:true,species:175}as Mon];let calls=0,release!:()=>void;
    f.ports.party=()=>{calls++;return new Promise<void>(resolve=>{release=resolve;});};
    const menu=f.panels.menu();f.action('party').click();await tick();assert.equal(calls,1);assert.equal(f.ui.panelOpen,false);assert.doesNotMatch(f.html(),/Your party/);
    release();await tick();assert.match(f.html(),/Adventure menu/);f.d.key('Escape');await menu;assert.equal(calls,1);
  }finally{f.restore();}
});

test('fallback party and summary escape labels, preserve PP, and conceal Egg species and HP',async()=>{
  const f=fixture();try{
    f.state!.party=[{species:155,gender:'male',name:'<Pip & pal>',level:5,status:'',hp:12,maxHP:20,ot:'<Original>',stats:{atk:10,def:11,spatk:12,spdef:13,speed:14},moves:[{id:33,pp:7,maxPP:35}]}as Mon,{isEgg:true,species:175,gender:'female',name:'Secret Togepi',hp:1,maxHP:1}as Mon];
    const pending=f.panels.party();assert.match(f.html(),/&lt;Pip &amp; pal&gt;/);assert.doesNotMatch(f.html(),/175-female|Secret Togepi|1 \/ 1 HP/);
    f.action('0').click();await tick();assert.match(f.html(),/&lt;Original&gt;/);assert.match(f.html(),/PP 7 \/ 35/);assert.match(f.html(),/Tackle/);
    f.d.key('KeyB');await tick();assert.match(f.html(),/Your party/);f.d.key('Escape');await pending;
  }finally{f.restore();}
});

test('Save reports its actual result, remains in menu, and never dispatches confirmation into the field',async()=>{
  const f=fixture();try{
    let fieldKeys=0;f.d.listen('keydown',event=>{if(!event.defaultPrevented)fieldKeys++;});const pending=f.panels.menu();
    f.action('save').focus();f.d.key('Enter');await tick();assert.equal(f.saves,1);assert.equal(f.node('ui-toast').textContent,'<Ethan & friend> saved the game.');assert.match(f.html(),/Adventure menu/);
    f.saveResult=false;f.action('save').focus();f.d.key('KeyF');await tick();assert.equal(f.saves,2);assert.equal(f.node('ui-toast').textContent,'The browser could not save. Please try again.');assert.equal(fieldKeys,0);
    f.d.key('Escape');await pending;
  }finally{f.restore();}
});

test('settings persist mute, volume, camera and text preferences while routing touch and battle options separately',async()=>{
  const f=fixture();try{
    const pending=f.panels.settings();assert.equal(f.node('setting-volume').getAttribute('type'),'range');assert.equal(f.node('setting-volume').getAttribute('min'),'0');assert.equal(f.node('setting-volume').getAttribute('max'),'100');
    f.node('setting-music').click();assert.equal(f.prefs.music,false);assert.equal(f.node('setting-music').getAttribute('aria-pressed'),'false');
    f.node('setting-volume').value='23';f.node('setting-volume').dispatchEvent({type:'input'});assert.equal(f.prefs.volume,.23);assert.equal(f.node('setting-volume-value').textContent,'23%');assert.equal(f.prefs.music,false,'changing volume does not unmute');
    f.node('setting-camera').value='145';f.node('setting-camera').dispatchEvent({type:'input'});assert.equal(f.prefs.cameraSensitivity,1.45);assert.equal(f.node('setting-camera-value').textContent,'1.4×');
    f.node('setting-text').click();assert.equal(f.prefs.textSpeed,2);f.node('setting-text').click();assert.equal(f.prefs.textSpeed,0);f.node('setting-text').click();assert.equal(f.prefs.textSpeed,1);
    f.node('setting-layout').click();f.node('setting-hand').click();assert.deepEqual(f.touchWrites,[{layout:'dpad'},{handedness:'left'}]);assert.equal(f.node('setting-layout').textContent,'D-pad');assert.equal(f.node('setting-hand').textContent,'Left-handed');
    f.node('setting-battle').click();assert.equal(f.state!.options.battleStyle,'set');assert.equal(f.saves,0,'save happens when the owned settings flow exits');
    f.node('settings-done').click();await pending;assert.equal(f.saves,1);assert.deepEqual(readInterfacePreferences(f.storage),f.prefs);assert.deepEqual([...new Set(f.writes)],[INTERFACE_PREFERENCES_KEY]);
    const reopened=f.panels.settings();assert.equal(f.node('setting-volume').value,'23');assert.equal(f.node('setting-music').getAttribute('aria-pressed'),'false');assert.match(f.html(),/>Set<\/button>/);f.d.key('Escape');await reopened;assert.equal(f.saves,2);
  }finally{f.restore();}
});

test('title settings avoid game-state save and keep range/editor keys native while explicit Back closes ownership',async()=>{
  const f=fixture(false);try{
    const pending=f.panels.settings();assert.equal(f.d.ids.has('setting-battle'),false);const range=f.node('setting-volume');range.focus();
    for(const code of['ArrowLeft','ArrowRight','Home','End','Space','KeyF'])assert.equal(f.d.key(code).defaultPrevented,false,code);
    assert.equal(f.ui.panelOpen,true);range.value='0';range.dispatchEvent({type:'input'});assert.equal(f.prefs.volume,0);
    // A native text editor embedded by a future control retains text/IME keys.
    const editor=f.d.document.createElement('input');editor.id='settings-editor';f.node('panel-content').appendChild(editor);editor.focus();for(const code of['KeyB','KeyF','Space','ArrowLeft'])assert.equal(f.d.key(code).defaultPrevented,false,code);assert.equal(f.d.key('Enter',{isComposing:true}).defaultPrevented,false);
    range.focus();assert.equal(f.d.key('KeyB').defaultPrevented,true);await pending;assert.equal(f.saves,0);assert.equal(readInterfacePreferences(f.storage).volume,0);
  }finally{f.restore();}
});

test('Settings exposes explicit music retry, disables duplicate requests and follows owned playback status',async()=>{
  const f=fixture();try{
    let status={pending:true,message:'',canRetry:false},retryCalls=0,release!:()=>void,unsubscribed=0;
    const listeners=new Set<()=>void>(),notify=()=>{for(const listener of listeners)listener();};
    Object.assign(f.ports,{musicStatus:()=>status,retryMusic:()=>{retryCalls++;return new Promise<void>(resolve=>{release=resolve;});},watchMusic:(listener:()=>void)=>{listeners.add(listener);return()=>{unsubscribed++;listeners.delete(listener);};}});
    const pending=f.panels.settings();f.clock.flush();assert.equal(f.d.document.activeElement.id,'setting-music');
    const retry=f.node('setting-music-retry');assert.equal(retry.disabled,true);assert.equal(f.node('setting-music-status').textContent,'Loading original music…');assert.equal(listeners.size,1);
    status={pending:false,message:'Music could not load. Retry when ready.',canRetry:true};notify();assert.equal(retry.disabled,false);assert.equal(f.node('setting-music-status').textContent,status.message);
    retry.click();assert.equal(retryCalls,1);assert.equal(retry.disabled,true);assert.equal(f.node('setting-music-status').textContent,'Loading original music…');retry.click();retry.dispatchEvent({type:'click'});assert.equal(retryCalls,1,'even synthetic duplicate clicks respect the disabled owned control');
    status={pending:false,message:'',canRetry:false};release();await tick();assert.equal(retry.disabled,true);assert.equal(f.node('setting-music-status').textContent,'Music is on.');
    status={pending:false,message:'This original music is unavailable.',canRetry:false};notify();assert.equal(retry.disabled,true);assert.equal(f.node('setting-music-status').textContent,status.message);retry.click();assert.equal(retryCalls,1,'unsupported music is not presented as retryable');
    f.node('setting-music').click();assert.equal(f.node('setting-music-status').textContent,'Music is off.');assert.equal(retry.disabled,true);
    f.d.key('Escape');await pending;assert.equal(unsubscribed,1);assert.equal(listeners.size,0);assert.equal(f.ev.handlers(retry,'click').length,0);
  }finally{f.restore();}
});

test('a pending Settings music retry releases exact handlers and subscription without altering its replacement',async()=>{
  const f=fixture();try{
    let release!:()=>void,unsubscribed=0,retries=0;
    const listeners=new Set<()=>void>();
    Object.assign(f.ports,{musicStatus:()=>({pending:false,message:'Retry when ready.',canRetry:true}),retryMusic:()=>{retries++;return new Promise<void>(resolve=>{release=resolve;});},watchMusic:(listener:()=>void)=>{listeners.add(listener);return()=>{unsubscribed++;listeners.delete(listener);};}});
    const pending=f.panels.settings(),rejected=assert.rejects(pending,{name:'AbortError'}),retry=f.node('setting-music-retry'),oldListener=[...listeners][0],oldHandler=f.ev.handlers(retry,'click')[0];
    retry.click();assert.equal(retries,1);const replacement=f.ui.choose('Keep this question',['Continue']);await rejected;assert.equal(unsubscribed,1);assert.equal(listeners.size,0);assert.equal(f.ev.handlers(retry,'click').length,0);
    const before=f.html();oldHandler.call(retry,{type:'click'});oldListener();release();await tick();assert.equal(retries,1);assert.equal(f.html(),before);assert.equal(f.saves,0);assert.equal(f.ui.panelOpen,true);f.d.buttons[0].click();await replacement;
  }finally{f.restore();}
});

test('confirming a focused Retry twice cannot activate Settings Back when the request disables the button',async()=>{
  const f=fixture();let release!:()=>void;try{
    let status={pending:false,message:'Retry when ready.',canRetry:true},calls=0;
    Object.assign(f.ports,{musicStatus:()=>status,retryMusic:()=>{calls++;return new Promise<void>(resolve=>{release=resolve;});}});
    const pending=f.panels.settings();void pending.catch(()=>{});f.clock.flush();f.node('setting-music-retry').focus();f.d.key('Enter');assert.equal(calls,1);assert.equal(f.node('setting-music-retry').disabled,true);assert.equal(f.d.document.activeElement.id,'setting-music-status');for(const code of['Enter','Space','KeyF']){assert.equal(f.d.key(code).defaultPrevented,true);await tick();assert.equal(f.ui.panelOpen,true);assert.equal(f.prefs.music,true,'another confirmation must not mute music');assert.equal(calls,1);assert.equal(f.saves,0);}assert.match(f.html(),/Make yourself at home/);status={pending:false,message:'',canRetry:false};release();await tick();assert.equal(f.ui.panelOpen,true);f.d.key('KeyF');assert.equal(f.prefs.music,true);assert.equal(f.ui.panelOpen,true);assert.equal(calls,1);f.d.key('Tab');assert.notEqual(f.d.document.activeElement.id,'setting-music-status');f.d.key('ArrowRight');assert.equal(f.d.document.activeElement.id,'setting-music');f.d.key('Escape');await pending;
  }finally{release?.();f.restore();}
});

test('settings inside menu return on Done, heading Back, B and Escape without resolving the parent prematurely',async()=>{
  const f=fixture();try{
    const parent=f.panels.menu();let resolved=false;void parent.then(()=>{resolved=true;});
    for(const exit of['done','heading','b','escape']){
      f.action('options').click();await tick();assert.match(f.html(),/Make yourself at home/);f.clock.flush();
      if(exit==='done')f.node('settings-done').click();else if(exit==='heading')f.action('back').click();else f.d.key(exit==='b'?'KeyB':'Escape');
      await tick();assert.match(f.html(),/Adventure menu/);assert.equal(resolved,false);assert.equal(f.ui.panelOpen,true);
    }
    assert.equal(f.saves,4);f.d.key('Escape');await parent;assert.equal(resolved,true);
  }finally{f.restore();}
});

test('replacing settings detaches exact callbacks, rejects its owner and cannot mutate or close the replacement',async()=>{
  const f=fixture();try{
    const old=f.panels.settings(),rejected=assert.rejects(old,{name:'AbortError'});
    const controls=['setting-music','setting-volume','setting-camera','setting-layout','setting-hand','setting-text','setting-battle','settings-done'];
    const captures=controls.map(id=>{const node=f.node(id),type=['setting-volume','setting-camera'].includes(id)?'input':'click';return{node,type,handlers:f.ev.handlers(node,type)};});
    const back=f.action('back'),staleBack=back.onclick!,before={prefs:{...f.prefs},battle:f.state!.options.battleStyle,gestures:f.gestures};
    const next=f.ui.choose('Keep replacement',['Continue']);await rejected;
    for(const{node,type,handlers}of captures){assert.equal(f.ev.handlers(node,type).length,0,`${node.id} exact cleanup`);node.value='100';for(const handler of handlers)handler.call(node,{type,target:node});}
    assert.equal(back.onclick,null);staleBack();assert.deepEqual(f.prefs,before.prefs);assert.equal(f.state!.options.battleStyle,before.battle);assert.equal(f.gestures,before.gestures);assert.equal(f.saves,0);assert.deepEqual(f.touchWrites,[]);assert.match(f.html(),/Keep replacement/);assert.equal(f.ui.panelOpen,true);f.d.buttons[0].click();await next;
  }finally{f.restore();}
});

test('a stale Save callback cannot save, unlock sound, navigate, or resolve a replacement after menu cancellation',async()=>{
  const f=fixture();try{
    const old=f.panels.menu(),rejected=assert.rejects(old,{name:'AbortError'}),save=f.action('save'),stale=save.onclick!,next=f.ui.choose('Recovery',['Retry']);await rejected;assert.equal(save.onclick,null);stale();assert.equal(f.saves,0);assert.equal(f.gestures,0);assert.match(f.html(),/Recovery/);assert.equal(f.ui.panelOpen,true);f.d.buttons[0].click();await next;
  }finally{f.restore();}
});


test('open Settings follows the global mute and cross-tab volume changes without replacing its owned panel',async()=>{
 const f=fixture();try{const listeners=new Set<()=>void>();Object.assign(f.ports,{watchMusic:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};}});const pending=f.panels.settings();f.ports.updatePreferences({...f.prefs,music:false,volume:.17});for(const listener of listeners)listener();assert.equal(f.node('setting-music').textContent,'Off');assert.equal(f.node('setting-music').getAttribute('aria-pressed'),'false');assert.equal(f.node('setting-volume').value,'17');assert.equal(f.node('setting-volume-value').textContent,'17%');assert.equal(f.ui.panelOpen,true);f.node('setting-music').click();assert.equal(f.prefs.music,true);f.node('settings-done').click();await pending;assert.equal(listeners.size,0);
 }finally{f.restore();}
});
