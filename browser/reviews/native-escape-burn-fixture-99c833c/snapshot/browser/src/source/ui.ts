export const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
export const escapeHTML=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export class UI{
  panelOpen=false;dialogueOpen=false;canDismiss=true;
  private next:(()=>void)|null=null;
  constructor(){
    $('dialogue-next').onclick=()=>this.advance();
    addEventListener('keydown',e=>{if(this.dialogueOpen&&['Enter','Space','KeyF'].includes(e.code)&&!e.repeat){e.preventDefault();this.advance();}});
  }
  get busy(){return this.panelOpen||this.dialogueOpen;}
  advance(){this.next?.();}
  panel(html:string){this.panelOpen=true;this.canDismiss=true;$('panel-content').innerHTML=html;$('panel').hidden=false;$('original-world').inert=true;$('game-hud').inert=true;$('touch-pad').inert=true;setTimeout(()=>$('panel-content').querySelector<HTMLElement>('button,input')?.focus(),0);}
  close(){this.panelOpen=false;$('panel').hidden=true;$('original-world').inert=false;$('game-hud').inert=false;$('touch-pad').inert=false;$('original-world').focus();}
  async message(text:string){
    const pages=text.replace(/\\n/g,'\n').split(/\\[rf]/).map(s=>s.trim()).filter(Boolean);
    this.dialogueOpen=true;$('dialogue').hidden=false;
    for(const page of pages){const colon=page.indexOf(':');const hasSpeaker=colon>0&&colon<25;
      $('dialogue-speaker').textContent=hasSpeaker?page.slice(0,colon):'';$('dialogue-text').textContent=hasSpeaker?page.slice(colon+1).trim():page;
      await new Promise<void>(resolve=>{let accepted=false;this.next=()=>{if(accepted)return;accepted=true;this.next=null;resolve();};});
    }
    this.next=null;this.dialogueOpen=false;$('dialogue').hidden=true;
  }
  async choose(title:string,options:string[],detail=''):Promise<number>{
    this.panel(`<span class="eyebrow">POKÉMON HEARTGOLD</span><h2>${escapeHTML(title)}</h2>${detail?`<p>${escapeHTML(detail)}</p>`:''}<div class="actions">${options.map((o,i)=>`<button data-option="${i}" class="${i?'secondary':''}">${escapeHTML(o)}</button>`).join('')}</div>`);
    this.canDismiss=false;return new Promise(resolve=>{document.querySelectorAll<HTMLButtonElement>('[data-option]').forEach(button=>button.onclick=()=>{const n=Number(button.dataset.option);this.close();resolve(n);});});
  }
  async input(title:string,maxLength:number,initial=''):Promise<string>{
    this.panel(`<span class="eyebrow">POKÉMON HEARTGOLD</span><h2>${escapeHTML(title)}</h2><form id="name-form"><input id="name-input" aria-label="${escapeHTML(title)}" maxlength="${maxLength}" autocomplete="off" value="${escapeHTML(initial)}" required><div class="actions"><button type="submit">Confirm</button></div></form>`);
    this.canDismiss=false;$<HTMLInputElement>('name-input').focus();$<HTMLInputElement>('name-input').select();
    return new Promise(resolve=>$('name-form').onsubmit=e=>{e.preventDefault();const name=$<HTMLInputElement>('name-input').value.trim().slice(0,maxLength);if(name){this.close();resolve(name);}});
  }
  loading(text:string|null){$('loading').hidden=text===null;if(text)$('loading').textContent=text;}
}
