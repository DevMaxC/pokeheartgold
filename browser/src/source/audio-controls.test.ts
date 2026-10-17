import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bindAudioControls} from './audio-controls.ts';
import {defaultInterfacePreferences,INTERFACE_PREFERENCES_KEY} from './interface-preferences.ts';

function fixture(){
 class Button extends EventTarget{textContent='';attrs=new Map<string,string>();setAttribute(k:string,v:string){this.attrs.set(k,v);}}
 const button=new Button(),doc=Object.assign(new EventTarget(),{visibilityState:'visible'}),win=new EventTarget(),active:boolean[]=[],listeners=new Set<()=>void>(),values=new Map<string,string>();let preferences=defaultInterfacePreferences(),unlocks=0,writes=0;
 const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{writes++;values.set(key,value);}};
 const dispose=bindAudioControls({button:button as unknown as HTMLButtonElement,preferences:()=>preferences,updatePreferences(value,persist=true){preferences=value;if(persist)storage.setItem(INTERFACE_PREFERENCES_KEY,JSON.stringify({version:1,...value}));for(const listener of listeners)listener();},storage,unlock(){unlocks++;},setPageActive:value=>active.push(value),watch:listener=>{listeners.add(listener);return()=>{listeners.delete(listener);};}},doc as unknown as Document,win as unknown as Window);
 return{button,doc,win,active,storage,values,dispose,get preferences(){return preferences;},get unlocks(){return unlocks;},get writes(){return writes;},setPreference(value:typeof preferences){preferences=value;for(const listener of listeners)listener();},storageEvent(key:string|null,storageArea:unknown=storage){win.dispatchEvent(Object.assign(new Event('storage'),{key,storageArea}));}};
}
test('one persistent control mutes immediately, reflects Settings, and only unlocks on an explicit unmute',()=>{
 const f=fixture();assert.equal(f.button.textContent,'Mute');f.button.dispatchEvent(new Event('click'));assert.equal(f.preferences.music,false);assert.equal(f.button.textContent,'Unmute');assert.equal(f.button.attrs.get('aria-pressed'),'true');assert.equal(f.unlocks,0);assert.equal(JSON.parse(f.values.get(INTERFACE_PREFERENCES_KEY)!).music,false);
 f.button.dispatchEvent(new Event('click'));assert.equal(f.preferences.music,true);assert.equal(f.unlocks,1);f.setPreference({...f.preferences,music:false});assert.equal(f.button.textContent,'Unmute');f.dispose();f.button.dispatchEvent(new Event('click'));assert.equal(f.preferences.music,false);
});
test('mute propagates between same-origin tabs without a write loop or autoplay unlock',()=>{
 const f=fixture();f.values.set(INTERFACE_PREFERENCES_KEY,JSON.stringify({version:1,...f.preferences,music:false,volume:.23}));f.storageEvent('unrelated');assert.equal(f.preferences.music,true);f.storageEvent(INTERFACE_PREFERENCES_KEY,{});assert.equal(f.preferences.music,true);f.storageEvent(INTERFACE_PREFERENCES_KEY);assert.equal(f.preferences.music,false);assert.equal(f.preferences.volume,.23);assert.equal(f.writes,0);assert.equal(f.unlocks,0);assert.equal(f.button.textContent,'Unmute');f.dispose();
});
test('visibility and page lifecycle silence background output and never change the saved mute setting',()=>{
 const f=fixture();assert.deepEqual(f.active,[true]);f.doc.visibilityState='hidden';f.doc.dispatchEvent(new Event('visibilitychange'));f.win.dispatchEvent(new Event('pagehide'));assert.deepEqual(f.active,[true,false,false]);f.doc.visibilityState='visible';f.win.dispatchEvent(new Event('pageshow'));assert.equal(f.active.at(-1),true);assert.equal(f.writes,0);assert.equal(f.unlocks,0);f.dispose();f.doc.dispatchEvent(new Event('visibilitychange'));assert.equal(f.active.length,4);
});
