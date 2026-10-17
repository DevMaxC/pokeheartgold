export const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
export const escapeHTML=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
type PendingUI={cancel:(reason:unknown)=>void};
const replaced=()=>new DOMException('UI operation was replaced','AbortError');
const abortReason=(signal:AbortSignal)=>signal.reason??new DOMException('UI operation was cancelled','AbortError');
export class UI{
  panelOpen=false;dialogueOpen=false;canDismiss=true;
  private next:(()=>void)|null=null;
  private dialogueTask:PendingUI|null=null;
  private panelTask:PendingUI|null=null;
  private focusTimer:ReturnType<typeof setTimeout>|undefined;
  private panelInert:{element:HTMLElement;previous:boolean}[]=[];
  constructor(){
    $('dialogue-next').onclick=()=>this.advance();
    addEventListener('keydown',e=>{if(this.dialogueOpen&&['Enter','Space','KeyF'].includes(e.code)&&!e.repeat){e.preventDefault();this.advance();}});
  }
  get busy(){return this.panelOpen||this.dialogueOpen;}
  advance(){this.next?.();}
  panel(html:string,autoFocus=true){
    this.panelTask?.cancel(replaced());clearTimeout(this.focusTimer);
    if(!this.panelOpen)this.panelInert=['original-world','game-hud','touch-pad'].map(id=>({element:$(id),previous:$(id).inert}));
    this.panelOpen=true;this.canDismiss=true;$('panel-content').innerHTML=html;$('panel').hidden=false;
    for(const entry of this.panelInert)entry.element.inert=true;
    if(autoFocus)this.focusTimer=setTimeout(()=>{this.focusTimer=undefined;if(this.panelOpen)$('panel-content').querySelector<HTMLElement>('button,input')?.focus();},0);
  }
  private hidePanel(){clearTimeout(this.focusTimer);this.focusTimer=undefined;this.panelOpen=false;this.canDismiss=true;$('panel').hidden=true;for(const entry of this.panelInert)entry.element.inert=entry.previous;this.panelInert=[];$('original-world').focus();}
  close(){if(this.panelTask)this.panelTask.cancel(replaced());else this.hidePanel();}
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
  private waitPanel<T>(signal:AbortSignal|undefined,bind:(resolve:(value:T)=>void)=>(()=>void)):Promise<T>{
    return new Promise((resolve,reject)=>{
      let settled=false,cleanup=()=>{};
      const abort=()=>task.cancel(abortReason(signal!));
      const finish=(ok:boolean,value:unknown)=>{if(settled)return;settled=true;signal?.removeEventListener('abort',abort);cleanup();if(this.panelTask===task){this.panelTask=null;this.hidePanel();}if(ok)resolve(value as T);else reject(value);};
      const task:PendingUI={cancel:reason=>finish(false,reason)};this.panelTask=task;
      signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return;}
      try{cleanup=bind(value=>finish(true,value));}catch(error){finish(false,error);}
    });
  }
  async choose(title:string,options:string[],detail='',signal?:AbortSignal):Promise<number>{
    if(signal?.aborted)throw abortReason(signal);
    this.panel(`<span class="eyebrow">POKÉMON HEARTGOLD</span><h2>${escapeHTML(title)}</h2>${detail?`<p>${escapeHTML(detail)}</p>`:''}<div class="actions">${options.map((o,i)=>`<button data-option="${i}" class="${i?'secondary':''}">${escapeHTML(o)}</button>`).join('')}</div>`);
    this.canDismiss=false;return this.waitPanel<number>(signal,resolve=>{
      const handlers=Array.from(document.querySelectorAll<HTMLButtonElement>('[data-option]'),button=>{const click=()=>resolve(Number(button.dataset.option));button.onclick=click;return{button,click};});
      return()=>{for(const{button,click}of handlers)if(button.onclick===click)button.onclick=null;};
    });
  }
  async input(title:string,maxLength:number,initial='',signal?:AbortSignal):Promise<string>{
    if(signal?.aborted)throw abortReason(signal);
    this.panel(`<span class="eyebrow">POKÉMON HEARTGOLD</span><h2>${escapeHTML(title)}</h2><form id="name-form"><input id="name-input" aria-label="${escapeHTML(title)}" maxlength="${maxLength}" autocomplete="off" value="${escapeHTML(initial)}" required><div class="actions"><button type="submit">Confirm</button></div></form>`);
    this.canDismiss=false;$<HTMLInputElement>('name-input').focus();$<HTMLInputElement>('name-input').select();
    return this.waitPanel<string>(signal,resolve=>{
      const form=$('name-form'),input=$<HTMLInputElement>('name-input');
      const submit=(event:SubmitEvent)=>{event.preventDefault();const name=input.value.trim().slice(0,maxLength);if(name)resolve(name);};form.onsubmit=submit;
      return()=>{if(form.onsubmit===submit)form.onsubmit=null;};
    });
  }
  loading(text:string|null){$('loading').hidden=text===null;if(text)$('loading').textContent=text;}
}
