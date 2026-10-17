import {INTERFACE_PREFERENCES_KEY,readInterfacePreferences,type InterfacePreferences} from './interface-preferences.ts';

type Ports={button:HTMLButtonElement;preferences:()=>InterfacePreferences;updatePreferences:(value:InterfacePreferences,persist?:boolean)=>void;storage:Pick<Storage,'getItem'|'setItem'>|null;unlock:()=>void;setPageActive:(active:boolean)=>void;watch:(listener:()=>void)=>()=>void};
/** Independent of field/menu ownership: stopping sound must always work. */
export function bindAudioControls(ports:Ports,doc:Document=document,win:Window=window){
 const render=()=>{const muted=!ports.preferences().music;ports.button.textContent=muted?'Unmute':'Mute';ports.button.setAttribute('aria-pressed',String(muted));ports.button.setAttribute('aria-label',muted?'Unmute all game audio':'Mute all game audio');};
 const toggle=()=>{const music=!ports.preferences().music;ports.updatePreferences({...ports.preferences(),music});render();if(music)ports.unlock();};
 const visibility=()=>ports.setPageActive(doc.visibilityState!=='hidden');
 const hide=()=>ports.setPageActive(false);
 const storage=(event:StorageEvent)=>{if(event.storageArea&&event.storageArea!==ports.storage)return;if(event.key!==INTERFACE_PREFERENCES_KEY&&event.key!==null)return;ports.updatePreferences(readInterfacePreferences(ports.storage),false);render();};
 ports.button.addEventListener('click',toggle);doc.addEventListener('visibilitychange',visibility);win.addEventListener('pagehide',hide);win.addEventListener('pageshow',visibility);win.addEventListener('storage',storage);
 const unwatch=ports.watch(render);visibility();render();
 return()=>{unwatch();ports.button.removeEventListener('click',toggle);doc.removeEventListener('visibilitychange',visibility);win.removeEventListener('pagehide',hide);win.removeEventListener('pageshow',visibility);win.removeEventListener('storage',storage);};
}
