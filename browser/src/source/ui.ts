export const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
export const escapeHTML=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
type PendingUI={cancel:(reason:unknown)=>void};
export type ChoiceBehavior={cancelIndex?:number};
export type StartProfile={name:string;location:string;badges:number;playSeconds:number;party:readonly{species:number;gender:'male'|'female'|'genderless';name?:string;isEgg?:boolean}[]};
export type StartAction='continue'|'new'|'settings';
let toastSerial=0;
const replaced=()=>new DOMException('UI operation was replaced','AbortError');
const abortReason=(signal:AbortSignal)=>signal.reason??new DOMException('UI operation was cancelled','AbortError');
export class UI{
  panelOpen=false;dialogueOpen=false;canDismiss=true;
  private next:(()=>void)|null=null;
  private dialogueTask:PendingUI|null=null;
  private panelTask:PendingUI|null=null;
  private focusTimer:ReturnType<typeof setTimeout>|undefined;
  private panelInert:{element:HTMLElement;previous:boolean}[]=[];
  private returnFocus:HTMLElement|null=null;
  private replacingPanel=false;
  private panelVersion=0;
  private panelCancel:(()=>void)|null=null;
  private toastTask:PendingUI|null=null;
  constructor(){
    $('dialogue-next').onclick=()=>this.advance();
    addEventListener('keydown',e=>this.keydown(e),{capture:true});
    addEventListener('focusin',e=>{if(this.panelOpen&&!$('panel-content').contains(e.target as Node))this.focusPanel();});
  }
  get busy(){return this.panelOpen||this.dialogueOpen;}
  advance(){this.next?.();}
  panel(html:string,autoFocus=true){
    this.replacingPanel=true;try{this.panelTask?.cancel(replaced());}finally{this.replacingPanel=false;}clearTimeout(this.focusTimer);
    if(!this.panelOpen){this.returnFocus=document.activeElement as HTMLElement|null;this.panelInert=['original-world','game-hud','touch-pad'].map(id=>({element:$(id),previous:$(id).inert}));}
    const version=++this.panelVersion;this.panelCancel=null;this.panelOpen=true;this.canDismiss=true;$('panel').dataset.view='default';$('panel-content').innerHTML=html;$('panel').hidden=false;
    for(const entry of this.panelInert)entry.element.inert=true;
    if(autoFocus)this.focusTimer=setTimeout(()=>{if(this.panelVersion!==version)return;this.focusTimer=undefined;if(this.panelOpen)this.focusPanel();},0);
  }
  private hidePanel(){clearTimeout(this.focusTimer);this.focusTimer=undefined;if(this.replacingPanel)return;++this.panelVersion;this.panelOpen=false;this.panelCancel=null;this.canDismiss=true;$('panel').hidden=true;for(const entry of this.panelInert)entry.element.inert=entry.previous;this.panelInert=[];const target=this.returnFocus;this.returnFocus=null;if(target?.isConnected&&target.tabIndex>=0&&!(target as HTMLButtonElement).disabled&&!target.closest('[hidden],[inert]'))target.focus();else $('original-world').focus();}
  close(){if(this.panelTask)this.panelTask.cancel(replaced());else this.hidePanel();}
  private focusables(){return Array.from($('panel-content').querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],[tabindex]')).filter(element=>!(element as HTMLButtonElement).disabled&&element.tabIndex>=0&&element.getAttribute('aria-disabled')!=='true'&&!element.closest('[hidden],[inert]')&&(typeof element.getClientRects!=='function'||element.getClientRects().length>0));}
  private focusPanel(){const first=this.focusables()[0];if(first)first.focus();else{$('panel-content').tabIndex=-1;$('panel-content').focus();}}
  private editable(element:HTMLElement|null){return !!element&&(['INPUT','TEXTAREA','SELECT'].includes(element.tagName)||element.isContentEditable);}
  private keydown(event:KeyboardEvent){
    if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey)return;
    const target=event.target as HTMLElement|null;
    if(this.panelOpen){
      const controls=this.focusables(),active=document.activeElement as HTMLElement|null,index=controls.indexOf(active!);
      if(event.code==='Tab'){event.preventDefault();if(!controls.length)this.focusPanel();else controls[index<0?(event.shiftKey?controls.length-1:0):(index+(event.shiftKey?-1:1)+controls.length)%controls.length].focus();return;}
      if(this.editable(target)){
        if(event.code==='Escape'){event.preventDefault();if(!event.repeat){if(this.panelCancel)this.panelCancel();else if(this.canDismiss)this.close();}}
        if(event.code==='KeyB'&&target?.tagName==='INPUT'&&['range','checkbox','radio'].includes((target as HTMLInputElement).type)){event.preventDefault();if(!event.repeat){if(this.panelCancel)this.panelCancel();else if(this.canDismiss)this.close();}}
        if(event.code==='Enter'&&target?.tagName==='INPUT'&&!event.isComposing){const form=target.closest('form')as HTMLFormElement|null;if(form){event.preventDefault();if(!event.repeat)form.requestSubmit();}}
        return;
      }
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(event.code)){
        event.preventDefault();if(!controls.length){this.focusPanel();return;}
        const next=event.code==='Home'?0:event.code==='End'?controls.length-1:index<0?0:(index+(['ArrowUp','ArrowLeft'].includes(event.code)?-1:1)+controls.length)%controls.length;controls[next].focus();return;
      }
      if(['Enter','Space','KeyF'].includes(event.code)){event.preventDefault();if(!event.repeat)(controls[index]??controls[0])?.click();return;}
      if(['Escape','KeyB'].includes(event.code)){event.preventDefault();if(!event.repeat){if(this.panelCancel)this.panelCancel();else if(this.canDismiss)this.close();}return;}
      return;
    }
    if(this.dialogueOpen&&!this.editable(target)){if(['Enter','Space','KeyF'].includes(event.code)){event.preventDefault();if(!event.repeat)this.advance();}else if(['Escape','KeyB'].includes(event.code))event.preventDefault();}
  }
  async message(text:string,characterDelay=0,signal?:AbortSignal){
    if(signal?.aborted)throw abortReason(signal);
    this.dialogueTask?.cancel(replaced());
    const pages=text.replace(/\\n/g,'\n').split(/\\[rf]/).map(s=>s.trim()).filter(Boolean);
    let stopped=false,reason:unknown,timer:ReturnType<typeof setTimeout>|undefined,rejectPage:((reason:unknown)=>void)|null=null;
    const abort=()=>task.cancel(abortReason(signal!));
    const hide=()=>{if(this.dialogueTask===task){this.dialogueTask=null;this.next=null;this.dialogueOpen=false;$('dialogue').hidden=true;}};
    const task:PendingUI={cancel:error=>{if(stopped)return;stopped=true;reason=error;clearTimeout(timer);signal?.removeEventListener('abort',abort);rejectPage?.(error);hide();}};
    this.dialogueTask=task;signal?.addEventListener('abort',abort,{once:true});
    this.dialogueOpen=true;$('dialogue').hidden=false;
    try{for(const page of pages){if(stopped)throw reason;const colon=page.indexOf(':');const hasSpeaker=colon>0&&colon<25;
      const full=hasSpeaker?page.slice(colon+1).trim():page;$('dialogue-speaker').textContent=hasSpeaker?page.slice(0,colon):'';$('dialogue-text').textContent=characterDelay?'':full;
      await new Promise<void>((resolve,reject)=>{rejectPage=reject;let accepted=false,typing=characterDelay>0;const chars=Array.from(full);let count=0;
        const print=()=>{if(!typing||stopped||this.dialogueTask!==task)return;$('dialogue-text').textContent=chars.slice(0,++count).join('');if(count<chars.length)timer=setTimeout(print,characterDelay);else typing=false;};
        this.next=()=>{if(accepted||stopped||this.dialogueTask!==task)return;if(typing){typing=false;clearTimeout(timer);$('dialogue-text').textContent=full;return;}accepted=true;this.next=null;rejectPage=null;resolve();};if(typing)print();
      });
    }if(stopped)throw reason;}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);hide();}
  }
  /** Native hatch text finishes on its printer, without a confirm click. The
   * returned disposer retains ownership of the visible text until the host
   * opens its next prompt. Abort/replacement also release that ownership. */
  async printMessage(text:string,characterDelay=0,signal?:AbortSignal):Promise<()=>void>{
    if(signal?.aborted)throw abortReason(signal);
    const pages=text.replace(/\\n/g,'\n').split(/\\[rf]/).map(page=>page.trim()).filter(Boolean);
    if(pages.length>1)throw Error('Automatic native text printing requires one message page');
    this.dialogueTask?.cancel(replaced());
    return new Promise((resolve,reject)=>{
      let stopped=false,printed=false,timer:ReturnType<typeof setTimeout>|undefined;
      const abort=()=>task.cancel(abortReason(signal!));
      const task:PendingUI={cancel:reason=>{
        if(stopped)return;stopped=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
        if(this.dialogueTask===task){this.dialogueTask=null;this.next=null;this.dialogueOpen=false;$('dialogue').hidden=true;}
        if(!printed)reject(reason);
      }};
      this.dialogueTask=task;signal?.addEventListener('abort',abort,{once:true});this.dialogueOpen=true;$('dialogue').hidden=false;
      const page=pages[0]??'',colon=page.indexOf(':'),hasSpeaker=colon>0&&colon<25,full=hasSpeaker?page.slice(colon+1).trim():page;
      $('dialogue-speaker').textContent=hasSpeaker?page.slice(0,colon):'';$('dialogue-text').textContent='';
      const finish=()=>{if(stopped||printed||this.dialogueTask!==task)return;printed=true;clearTimeout(timer);this.next=null;resolve(()=>task.cancel(replaced()));};
      const chars=Array.from(full);let count=0;
      const print=()=>{if(stopped||printed||this.dialogueTask!==task)return;$('dialogue-text').textContent=chars.slice(0,++count).join('');if(count<chars.length)timer=setTimeout(print,characterDelay);else finish();};
      this.next=()=>{if(stopped||printed||this.dialogueTask!==task)return;$('dialogue-text').textContent=full;finish();};
      if(characterDelay>0&&chars.length)print();else{$('dialogue-text').textContent=full;finish();}
    });
  }
  private waitPanel<T>(signal:AbortSignal|undefined,bind:(resolve:(value:T)=>void,current:()=>boolean)=>(()=>void)):Promise<T>{
    return new Promise((resolve,reject)=>{
      let settled=false,cleanup=()=>{};
      const abort=()=>task.cancel(abortReason(signal!));
      const finish=(ok:boolean,value:unknown)=>{if(settled)return;settled=true;signal?.removeEventListener('abort',abort);cleanup();if(this.panelTask===task){this.panelTask=null;this.panelCancel=null;this.hidePanel();}if(ok)resolve(value as T);else reject(value);};
      const task:PendingUI={cancel:reason=>finish(false,reason)};this.panelTask=task;
      signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return;}
      try{cleanup=bind(value=>finish(true,value),()=>!settled&&this.panelTask===task);if(settled)cleanup();}catch(error){finish(false,error);}
    });
  }
  /** Owned rich interaction surface. bind returns exact handler cleanup; use
   * current() before mutating state in callbacks. Keyboard cancel is opt-in. */
  async customPanel<T>(html:string,bind:(resolve:(value:T)=>void,current:()=>boolean)=>(()=>void),signal?:AbortSignal,options:{cancel?:()=>T;autoFocus?:boolean}={}):Promise<T>{
    if(signal?.aborted)throw abortReason(signal);
    this.panel(html,options.autoFocus??true);this.canDismiss=false;
    return this.waitPanel<T>(signal,(resolve,current)=>{
      if(options.cancel)this.panelCancel=()=>{if(!current())return;try{resolve(options.cancel!());}catch(error){if(current())this.panelTask?.cancel(error);}};
      return bind(resolve,current);
    });
  }
  async choose(title:string,options:string[],detail='',signal?:AbortSignal,behavior:ChoiceBehavior={}):Promise<number>{
    if(signal?.aborted)throw abortReason(signal);
    if(!options.length||behavior.cancelIndex!==undefined&&(!Number.isInteger(behavior.cancelIndex)||behavior.cancelIndex<0||behavior.cancelIndex>=options.length))throw RangeError('A source choice needs options and a valid explicit cancel index');
    this.panel(`<span class="eyebrow">POKÉMON HEARTGOLD</span><h2>${escapeHTML(title)}</h2>${detail?`<p>${escapeHTML(detail)}</p>`:''}<div class="actions">${options.map((o,i)=>`<button data-option="${i}" class="${i?'secondary':''}">${escapeHTML(o)}</button>`).join('')}</div>`);
    this.canDismiss=false;return this.waitPanel<number>(signal,(resolve,current)=>{
      const handlers=Array.from($('panel-content').querySelectorAll<HTMLButtonElement>('[data-option]'),button=>{const click=()=>{if(current()&&!button.disabled)resolve(Number(button.dataset.option));};button.onclick=click;return{button,click};});
      if(behavior.cancelIndex!==undefined)this.panelCancel=()=>handlers[behavior.cancelIndex!]?.click();
      return()=>{for(const{button,click}of handlers)if(button.onclick===click)button.onclick=null;};
    });
  }
  async input(title:string,maxLength:number,initial='',signal?:AbortSignal):Promise<string>{
    if(signal?.aborted)throw abortReason(signal);
    this.panel(`<span class="eyebrow">POKÉMON HEARTGOLD</span><h2>${escapeHTML(title)}</h2><form id="name-form"><input id="name-input" aria-label="${escapeHTML(title)}" maxlength="${maxLength}" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="done" value="${escapeHTML(initial)}" required><div class="actions"><button type="submit">Confirm</button></div></form>`);
    this.canDismiss=false;$<HTMLInputElement>('name-input').focus();$<HTMLInputElement>('name-input').select();
    return this.waitPanel<string>(signal,resolve=>{
      const form=$('name-form'),input=$<HTMLInputElement>('name-input');
      const submit=(event:SubmitEvent)=>{event.preventDefault();const name=input.value.trim().slice(0,maxLength);if(name)resolve(name);};form.onsubmit=submit;
      return()=>{if(form.onsubmit===submit)form.onsubmit=null;};
    });
  }
  async startScreen(profile:StartProfile|null,signal?:AbortSignal,onGesture?:()=>void):Promise<StartAction>{
    if(signal?.aborted)throw abortReason(signal);
    const seconds=profile&&Number.isFinite(profile.playSeconds)?Math.max(0,Math.floor(profile.playSeconds)):0,time=Math.floor(seconds/3600)+':'+String(Math.floor(seconds/60)%60).padStart(2,'0');
    const badges=profile&&Number.isFinite(profile.badges)?Math.min(16,Math.max(0,Math.floor(profile.badges))):0;
    const saved=profile?`<article class="save-card" aria-label="Saved adventure"><div class="save-heading"><span class="eyebrow">SAVED ADVENTURE</span><h2 class="save-name">${escapeHTML(profile.name)}</h2></div><p class="save-location">${escapeHTML(profile.location)}</p><dl class="save-stats"><div><dt>Badges</dt><dd>${badges} / 16</dd></div><div><dt>Play time</dt><dd>${time}</dd></div></dl><div class="save-party" role="list" aria-label="Saved party">${profile.party.slice(0,6).map(mon=>mon.isEgg?'<span class="save-party-egg" role="listitem" aria-label="Egg">Egg</span>':Number.isInteger(mon.species)&&mon.species>0&&mon.species<=493?`<span class="save-party-mon" role="listitem"><img src="/source/pokemon/${mon.species}-${mon.gender==='female'?'female':'male'}-front.png" alt="${escapeHTML(mon.name??'Pokémon '+mon.species)}"></span>`:'').join('')}</div></article>`:'';
    this.panel(`<div class="title-screen"><section class="title-hero"><h1 class="title-wordmark"><span>POKÉMON</span><strong>HEARTGOLD</strong></h1><p class="title-subtitle">A grand adventure in Johto awaits.</p><img class="title-pokemon" src="/source/pokemon/250-male-front.png" alt="Ho-Oh"></section>${saved}<nav class="title-actions" aria-label="Adventure options">${profile?'<button class="title-action primary" data-start-action="continue">Continue<small>Return to your saved adventure</small></button>':''}<button class="title-action ${profile?'secondary':'primary'}" data-start-action="new">New game<small>Begin a new adventure</small></button><button class="title-action secondary" data-start-action="settings">Settings<small>Your preferences</small></button></nav></div>`);
    $('panel').dataset.view='title';this.canDismiss=false;
    return this.waitPanel<StartAction>(signal,(resolve,current)=>{
      const handlers=Array.from($('panel-content').querySelectorAll<HTMLButtonElement>('[data-start-action]'),button=>{
        const click=()=>{if(!current()||button.disabled)return;try{onGesture?.();resolve(button.dataset.startAction as StartAction);}catch(error){if(current())this.panelTask?.cancel(error);}};button.onclick=click;return{button,click};
      });return()=>{for(const{button,click}of handlers)if(button.onclick===click)button.onclick=null;};
    });
  }
  toast(text:string,duration=2600):()=>void{
    this.toastTask?.cancel(replaced());let node=$('ui-toast');if(!node){node=document.createElement('div');node.id='ui-toast';node.className='ui-toast';node.setAttribute('role','status');node.setAttribute('aria-live','polite');node.setAttribute('aria-atomic','true');($('game')??document.body).appendChild(node);}
    const owner=String(++toastSerial);node.dataset.toastOwner=owner;node.textContent=text;node.hidden=false;
    let timer:ReturnType<typeof setTimeout>|undefined;const task:PendingUI={cancel:()=>{clearTimeout(timer);if(this.toastTask===task)this.toastTask=null;if(node.dataset.toastOwner===owner){node.hidden=true;node.textContent='';}}};this.toastTask=task;timer=setTimeout(()=>task.cancel(replaced()),Math.max(0,duration));return()=>task.cancel(replaced());
  }
  loading(text:string|null){$('loading').hidden=text===null;if(text)$('loading').textContent=text;}
}
