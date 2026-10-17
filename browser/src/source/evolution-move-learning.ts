import {moveName} from './data.ts';
import {evolutionAudioTextControl} from './evolution-audio.ts';
import type {GameData} from './types.ts';
import type {EvolutionLearningEvent,EvolutionMoveChoice,EvolutionMoveRequest} from './battle-evolution-types.ts';
import type {EvolutionAudioSession} from './evolution-presentation.ts';
import {nativeMessageTokens,type NativePrinter} from './native-text.ts';
import {UI,$,escapeHTML} from './ui.ts';

export type EvolutionLearningPorts={
 ui:UI;data:GameData;messages:Readonly<Record<string,string>>;textDelay:()=>number;
 nextFrame:(signal:AbortSignal)=>Promise<void>;
 /** Exact currently owned evolution session; never a second audio session. */
 audio:()=>EvolutionAudioSession;
 /** Original SELECT is PLAYER4, not the scene's shared PLAYER3. */
 prepareMenu:(signal:AbortSignal)=>Promise<void>;selectSound:(signal:AbortSignal)=>void;
};
/** Source glyph dispatcher shared by the scene and its learner. */
export function evolutionPrinterGlyph(audio:EvolutionAudioSession,id:number){
 if(!Number.isInteger(id)||id<1||id>5)throw Error('Unsupported evolution text callback '+id);
 return evolutionAudioTextControl(audio,id);
}
/** The controller alone owns mutation. This adapter returns only a confirmed
 * summary choice, with native text/page/pause/fanfare waits on the same owner.
 * The rich field panel deliberately replaces the DS two-screen summary art. */
export class EvolutionMoveLearning{
 private printer:NativePrinter|null=null;
 constructor(private ports:EvolutionLearningPorts){}
 clear(){const previous=this.printer;this.printer=null;previous?.clear();}
 private source(id:number){const text=this.ports.messages[id];if(typeof text!=='string')throw Error('Missing original evolution message197:'+id);return text;}
 private label(id:number,operands:readonly string[]=[]){
  // ALN_CENTER is source menu layout, represented by centered action buttons.
  const source=this.source(id),tokens=nativeMessageTokens(source.startsWith('{ALN_CENTER}')?source.slice(12):source,operands);
  if(tokens.some(row=>row.kind!=='text'&&row.kind!=='page'))throw Error('Unexpected original evolution menu control197:'+id);
  return tokens.map(row=>row.kind==='text'?row.text:'').join('').trim();
 }
 private async print(id:number,operands:readonly string[],signal:AbortSignal){
  signal.throwIfAborted();this.clear();const audio=this.ports.audio();
  const printer=this.ports.ui.printNativeMessage(nativeMessageTokens(this.source(id),operands),this.ports.textDelay(),{glyph:glyph=>evolutionPrinterGlyph(audio,glyph),nextFrame:this.ports.nextFrame},signal);this.printer=printer;await printer.done;signal.throwIfAborted();
 }
 private async frames(count:number,signal:AbortSignal){for(let i=0;i<count;i++){signal.throwIfAborted();await this.ports.nextFrame(signal);signal.throwIfAborted();}}
 private async pick(labels:readonly string[],signal:AbortSignal,options:{back:number;disabled?:readonly boolean[];heading?:string}):Promise<number>{
  const controller=new AbortController(),owner=AbortSignal.any([signal,controller.signal]);owner.throwIfAborted();
  const html=`${options.heading?`<h2>${escapeHTML(options.heading)}</h2>`:''}<div class="actions">${labels.map((label,index)=>`<button data-evolution-option="${index}"${index===0?' data-panel-focus':''}${options.disabled?.[index]?' disabled':''}>${escapeHTML(label)}</button>`).join('')}</div>`;
  const select=(action:()=>void)=>{try{owner.throwIfAborted();this.ports.selectSound(owner);action();}catch(error){controller.abort(error);}};
  try{return await this.ports.ui.customPanel<number>(html,(resolve,current)=>{
   let focused=0;const buttons=Array.from($('panel-content').querySelectorAll<HTMLButtonElement>('[data-evolution-option]'));
   const handlers=buttons.map((button,index)=>{const click=()=>{if(current()&&!button.disabled)select(()=>resolve(index));},focus=()=>{if(current()&&!button.disabled&&focused!==index)select(()=>{focused=index;});};button.onclick=click;button.onfocus=focus;return{button,click,focus};});
   return()=>{for(const{button,click,focus}of handlers){if(button.onclick===click)button.onclick=null;if(button.onfocus===focus)button.onfocus=null;}};
  },owner,{cancel:()=>{this.ports.selectSound(owner);return options.back;}});}finally{controller.abort(new DOMException('Evolution menu completed','AbortError'));}
 }
 async choose(request:EvolutionMoveRequest,signal:AbortSignal):Promise<EvolutionMoveChoice>{
  signal.throwIfAborted();await this.ports.prepareMenu(signal);signal.throwIfAborted();
  const mon=request.mon.name,move=moveName(this.ports.data,request.move);
  for(;;){
   await this.print(1193,[mon,move],signal);await this.frames(30,signal);
   await this.print(1194,[mon],signal);await this.frames(30,signal);
   await this.print(1195,[],signal);await this.frames(1,signal);
   const deletion=await this.pick([this.label(1181),this.label(1182)],signal,{back:1});
   if(deletion===0){
    const labels=[...request.existing.map((row,index)=>`${moveName(this.ports.data,row.id)} · ${row.pp}/${row.maxPP}${request.unforgettablyHM[index]?' · HM':''}`),'Back'];
    const slot=await this.pick(labels,signal,{back:request.existing.length,disabled:request.unforgettablyHM,heading:this.label(1196)});
    if(slot<request.existing.length)return{kind:'replace',slot};
   }
   await this.print(1197,[move],signal);await this.frames(1,signal);
   if(await this.pick([this.label(1186,[move]),this.label(1187,[move])],signal,{back:1})===0)return{kind:'decline'};
  }
 }
 async show(event:EvolutionLearningEvent,signal:AbortSignal):Promise<void>{
  const mon=event.mon.name,move=moveName(this.ports.data,event.move);
  if(event.kind==='forget'){
   await this.print(1199,[],signal);await this.frames(30,signal);
   await this.print(1200,[mon,moveName(this.ports.data,event.forgotten)],signal);await this.frames(30,signal);
   await this.print(1201,[],signal);await this.frames(30,signal);
  }else if(event.kind==='declined'){
   await this.print(1198,[mon,move],signal);await this.frames(30,signal);
  }else{
   await this.print(event.replaced===null?4:1202,[mon,move],signal);
   // EVO_STATE_WAIT_FANFARE decrements timer only after the live poll is false.
   for(let left=30;left>0;){await this.ports.nextFrame(signal);signal.throwIfAborted();if(!this.ports.audio().fanfarePlaying())left--;}
  }
 }
}
