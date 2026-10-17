/** DOM/event fixture for the actual UI class. No browser layout is simulated;
 * tests cover ownership, event admission, form behavior and semantic markup. */
export function installUIDOM(){
  const priorDocument=Object.getOwnPropertyDescriptor(globalThis,'document'),priorAdd=Object.getOwnPropertyDescriptor(globalThis,'addEventListener');
  const ids=new Map<string,Element>(),focus:string[]=[],listeners=new Map<string,{handler:(event:any)=>void;capture:boolean}[]>();
  const listen=(type:string,handler:(event:any)=>void,capture=false)=>{const handlers=listeners.get(type)??[];handlers.push({handler,capture});listeners.set(type,handlers);};
  const decode=(value:string)=>value.replace(/&(amp|lt|gt|quot|#39);/g,(_,entity)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[entity as string]??''));
  let document:any;
  class Element{
    private identifier='';tagName:string;hidden=false;inert=false;disabled=false;isContentEditable=false;textContent='';value='';className='';dataset:Record<string,string>={};parentElement:Element|null=null;children:Element[]=[];
    onclick:((event?:any)=>void)|null=null;onsubmit:((event:any)=>void)|null=null;private attributes=new Map<string,string>();private html='';
    constructor(tag='div',id=''){this.tagName=tag.toUpperCase();if(id)this.setAttribute('id',id);}
    get id(){return this.identifier;}
    set id(value:string){if(ids.get(this.identifier)===this)ids.delete(this.identifier);this.identifier=value;if(value)ids.set(value,this);}
    get isConnected():boolean{return this===document?.body||!!this.parentElement?.isConnected;}
    get tabIndex(){return this.attributes.has('tabindex')?Number(this.attributes.get('tabindex')):['BUTTON','INPUT','SELECT','TEXTAREA'].includes(this.tagName)||this.tagName==='A'&&this.attributes.has('href')?0:-1;}
    get type(){return this.getAttribute('type')??'text';}
    set tabIndex(value:number){this.attributes.set('tabindex',String(value));}
    setAttribute(key:string,value:string){this.attributes.set(key,value);if(key==='id'){this.id=value;ids.set(value,this);}if(key==='class')this.className=value;if(key==='value')this.value=value;if(key==='disabled')this.disabled=true;if(key==='hidden')this.hidden=true;if(key==='inert')this.inert=true;if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;}
    getAttribute(key:string){return this.attributes.get(key)??null;}
    contains(other:any):boolean{return this===other||this.children.some(child=>child.contains(other));}
    appendChild(child:Element){child.parentElement=this;this.children.push(child);return child;}
    private matches(selector:string){if(selector==='[hidden]')return this.hidden;if(selector==='[inert]')return this.inert;const match=selector.match(/^([a-z]+)?(?:\[([\w-]+)(?:="?([^\]"]+)"?)?\])?$/i);return !!match&&(!match[1]||this.tagName===match[1].toUpperCase())&&(!match[2]||this.getAttribute(match[2])!==null&&(match[3]===undefined||this.getAttribute(match[2])===match[3]));}
    closest(selector:string):Element|null{for(let node:Element|null=this;node;node=node.parentElement)if(selector.split(',').some(part=>node!.matches(part.trim())))return node;return null;}
    querySelectorAll<T=Element>(selector:string):T[]{const found:Element[]=[];const visit=(node:Element)=>{for(const child of node.children){if(selector.split(',').some(part=>child.matches(part.trim())))found.push(child);visit(child);}};visit(this);return found as T[];}
    querySelector<T=Element>(selector:string):T|null{return this.querySelectorAll<T>(selector)[0]??null;}
    getClientRects(){return this.closest('[hidden]')?[]:[{}];}
    focus(){if(!this.isConnected||this.disabled||this.closest('[hidden],[inert]'))return;document.activeElement=this;focus.push(this.id||this.tagName);for(const{handler}of listeners.get('focusin')??[])handler({target:this});}
    select(){}
    click(){if(this.disabled||!this.isConnected)return;this.onclick?.({preventDefault(){}});if(this.tagName==='BUTTON'&&this.getAttribute('type')==='submit')this.closest('form')?.requestSubmit();}
    requestSubmit(){this.onsubmit?.({preventDefault(){}});}
    get innerHTML(){return this.html;}
    set innerHTML(value:string){
      this.html=value;const remove=(node:Element)=>{for(const child of node.children)remove(child);if(node.id&&ids.get(node.id)===node)ids.delete(node.id);};for(const child of this.children){remove(child);child.parentElement=null;}this.children=[];
      const stack:Element[]=[this],voidTags=new Set(['INPUT','IMG','BR','HR','META','LINK']);
      for(const tag of value.matchAll(/<\/?([a-z][\w-]*)\b([^>]*)>/gi)){
        if(tag[0].startsWith('</')){if(stack.length>1)stack.pop();continue;}
        const child=new Element(tag[1]);for(const attr of tag[2].matchAll(/([\w-]+)(?:\s*=\s*"([^"]*)")?/g))child.setAttribute(attr[1],decode(attr[2]??''));stack.at(-1)!.appendChild(child);if(!voidTags.has(child.tagName))stack.push(child);
      }
    }
  }
  document={body:new Element('body'),activeElement:null,getElementById:(id:string)=>ids.get(id)??null,querySelectorAll:(selector:string)=>document.body.querySelectorAll(selector),createElement:(tag:string)=>new Element(tag)};
  const game=document.body.appendChild(new Element('main','game'));
  for(const[id,tag]of[['original-world','canvas'],['game-hud','header'],['touch-pad','div'],['dialogue','div'],['panel','section'],['loading','div']])game.appendChild(new Element(tag,id));
  ids.get('original-world')!.tabIndex=0;ids.get('game-hud')!.appendChild(new Element('button','open-menu'));
  ids.get('panel')!.appendChild(new Element('div','panel-content'));for(const id of['dialogue-speaker','dialogue-text','dialogue-next'])ids.get('dialogue')!.appendChild(new Element(id==='dialogue-next'?'button':'div',id));
  for(const id of['dialogue','panel','loading'])ids.get(id)!.hidden=true;document.activeElement=ids.get('original-world');
  Object.defineProperty(globalThis,'document',{value:document,configurable:true});Object.defineProperty(globalThis,'addEventListener',{value:(type:string,handler:(event:any)=>void,options?:{capture?:boolean})=>listen(type,handler,options?.capture),configurable:true});
  return{ids,document,focus,get buttons(){return ids.get('panel-content')!.querySelectorAll<Element>('[data-option]');},get actions(){return ids.get('panel-content')!.querySelectorAll<Element>('[data-start-action]');},key(code:string,options:Record<string,unknown>={}){const event:any={code,target:document.activeElement,defaultPrevented:false,repeat:false,shiftKey:false,isComposing:false,ctrlKey:false,metaKey:false,altKey:false,preventDefault(){this.defaultPrevented=true;},...options};for(const{handler}of[...(listeners.get('keydown')??[])].sort((a,b)=>Number(b.capture)-Number(a.capture)))handler(event);return event;},listen,restore(){for(const[key,descriptor]of[['document',priorDocument],['addEventListener',priorAdd]]as const){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}}};
}
export function installUIClock(){
  const set=globalThis.setTimeout,clear=globalThis.clearTimeout,tasks=new Map<number,()=>void>();let serial=0;
  globalThis.setTimeout=((callback:()=>void)=>{tasks.set(++serial,callback);return serial;})as unknown as typeof setTimeout;globalThis.clearTimeout=((id:number)=>{tasks.delete(id);})as unknown as typeof clearTimeout;
  return{tasks,flush(){const batch=[...tasks];tasks.clear();for(const[,callback]of batch)callback();},restore(){globalThis.setTimeout=set;globalThis.clearTimeout=clear;}};
}
