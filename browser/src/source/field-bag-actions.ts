import {UI,$,escapeHTML as esc} from './ui.ts';
import {itemName,moveName} from './data.ts';
import {tmhmDefinition,prepareTMHMTeaching,commitTMHMTeaching,cancelTMHMTeaching,type NativeFieldMoveData,type TMHMTeachingPlan} from './field-moves.ts';
import {planFieldMedicine,applyFieldMedicine,type FieldMedicineEffect} from './field-medicine.ts';
import type {GameData,Mon,State} from './types.ts';

export type FieldBagActionContext={state:()=>State|null;expectedState:State;signal:AbortSignal};
export type FieldBagActionResult=
 |{status:'cancelled'}
 |{status:'no-effect'}
 |{status:'unsupported';requirements:readonly string[]}
 |{status:'used';kind:'medicine'|'teaching';partyIndex:number};
type Choice={value:string;label:string;detail?:string;disabled?:boolean};
const interrupted=()=>new DOMException('The Bag action is no longer current','AbortError');
const egg=(mon:Mon)=>!!(mon.isEgg||(mon as Mon&{checksumFailed?:boolean}).checksumFailed);
// The adventure clock keeps running while a prompt is open. All other state
// and record identities belong to the outer source action until it commits.
const signature=(state:State)=>JSON.stringify({...state,playSeconds:0});
function checkpoint(context:FieldBagActionContext){
 const state=context.expectedState,party=state.party,bag=state.bag,mons=party.slice(),before=signature(state);
 return()=>{
  if(context.signal.aborted)throw context.signal.reason??interrupted();
  if(context.state()!==state||state.party!==party||state.bag!==bag||party.length!==mons.length||mons.some((mon,i)=>party[i]!==mon)||signature(state)!==before)throw interrupted();
 };
}
function choice(ui:UI,title:string,detail:string,choices:Choice[],signal:AbortSignal){
 return ui.customPanel<string>(`<div class="panel-heading"><button class="back-button" data-bag-choice="cancel" aria-label="Back to Bag">‹</button><div><span class="eyebrow">Your Bag</span><h2>${esc(title)}</h2></div></div>${detail?`<p>${esc(detail)}</p>`:''}<div class="menu-list">${choices.map(row=>`<button class="list-row" data-bag-choice="${esc(row.value)}"${row.disabled?' disabled':''}><span><b>${esc(row.label)}</b>${row.detail?`<small>${esc(row.detail)}</small>`:''}</span></button>`).join('')}</div><div class="actions"><button class="secondary" data-bag-choice="cancel">Cancel</button></div>`,(resolve,current)=>{
  const bindings=Array.from($('panel-content').querySelectorAll<HTMLButtonElement>('[data-bag-choice]'),button=>{const click=()=>{if(current()&&!button.disabled)resolve(button.dataset.bagChoice!);};button.onclick=click;return{button,click};});
  bindings.find(({button})=>!button.disabled&&button.dataset.bagChoice!=='cancel')?.button.setAttribute('data-panel-focus','');
  return()=>{for(const{button,click}of bindings)if(button.onclick===click)button.onclick=null;};
 },signal,{cancel:()=> 'cancel'});
}
function medicineDescription(effect:FieldMedicineEffect){
 const lines:string[]=[];
 if(effect.hp.before!==effect.hp.after)lines.push(`HP: ${effect.hp.before} → ${effect.hp.after}`);
 if(effect.status.before!==effect.status.after)lines.push(`Status: ${effect.status.before} → clear`);
 for(const move of effect.pp)lines.push(`Move ${move.slot+1} PP: ${move.before} → ${move.after}`);
 return lines.join('\n');
}

/** Owned field Bag prompts around the reviewed native teaching/medicine cores.
 * The host MUST wrap this entire promise in SourceActionRecovery, including
 * the final acknowledgement, and save only after that outer action commits.
 * Native data is preloaded by the host; there is no unowned asset-loading gap.
 * Replacement, lifecycle abort and stale state reject rather than report use.
 */
export async function useFieldBagItem(ui:UI,data:GameData,native:NativeFieldMoveData,context:FieldBagActionContext,item:string):Promise<FieldBagActionResult>{
 const state=context.expectedState;let stateCurrent=checkpoint(context),surface:HTMLElement|null=null;
 const current=()=>{stateCurrent();if(surface&&(!surface.isConnected||!$('panel-content').contains(surface)))throw interrupted();};current();
 const isEgg=(mon:Mon)=>egg(mon)||mon.species===data.constants.SPECIES_EGG;
 const awaitCurrent=async<T>(open:()=>Promise<T>)=>{
  // Keep the previous surface through all Promise continuation turns and
  // check it BEFORE opening our next prompt. A resolved task can otherwise
  // steal a replacement that arrived between wrapper and caller awaits.
  current();const pending=open();
  surface=$('panel-content').querySelector<HTMLElement>('[data-bag-choice],[data-option]');
  if(!surface)throw interrupted();
  const value=await pending;current();return value;
 };
 const finish=<T extends FieldBagActionResult>(result:T):T=>{current();return result;};
 const acknowledge=(title:string,detail:string)=>awaitCurrent(()=>ui.choose(title,['Back to Bag'],detail,context.signal,{cancelIndex:0}));
 const unsupported=async(requirements:readonly string[]):Promise<FieldBagActionResult>=>{await acknowledge('Field use unavailable',`${itemName(data,item)} cannot be used from the Bag yet.`);return finish({status:'unsupported',requirements});};
 const cancelled:FieldBagActionResult={status:'cancelled'};
 const row=data.items.find(row=>row.item===item),teaching=tmhmDefinition(native,item);
 if(!row)return unsupported(['unknown-item']);
 if(!Number.isInteger(state.bag[item])||state.bag[item]<=0)throw interrupted();
 if(!teaching&&row.partyUse!=='1')return unsupported(['not-party-item']);
 const selected=await awaitCurrent(()=>choice(ui,`Use ${itemName(data,item)}`,teaching?`Choose a Pokémon to learn ${moveName(data,teaching.moveId)}.`:'Choose a Pokémon.',state.party.map((mon,i)=>isEgg(mon)?{value:`party:${i}`,label:'Egg',detail:'Cannot use this item on an Egg.',disabled:true}:{value:`party:${i}`,label:mon.name,detail:`Lv.${mon.level} · ${mon.hp} / ${mon.maxHP} HP${mon.status?` · ${mon.status}`:''}`}),context.signal));
 if(selected==='cancel')return finish(cancelled);
 const partyIndex=Number(selected.slice(6)),mon=state.party[partyIndex];
 if(!selected.startsWith('party:')||!Number.isInteger(partyIndex)||!mon||isEgg(mon))throw interrupted();
 if(teaching){
  let plan=prepareTMHMTeaching(data,native,state,partyIndex,item),ownedPlan:TMHMTeachingPlan|undefined;
  try{
   if(plan.status==='chooseReplacement'){
    const proceed=await awaitCurrent(()=>ui.choose(`Learn ${moveName(data,teaching.moveId)}?`,['Choose a move','Cancel'],`${mon.name} already knows four moves. Choose a move to forget. HM moves cannot be forgotten here.`,context.signal,{cancelIndex:1}));
    if(proceed!==0)return finish(cancelled);
    const protectedSlots=plan.protectedSlots;
    const move=await awaitCurrent(()=>choice(ui,'Forget which move?',`Make room for ${moveName(data,teaching.moveId)}.`,mon.moves.map((move,i)=>({value:`move:${i}`,label:moveName(data,move.id),detail:`PP ${move.pp} / ${move.maxPP}${protectedSlots.includes(i)?' · HM — cannot forget':''}`,disabled:protectedSlots.includes(i)})),context.signal));
    if(move==='cancel')return finish(cancelled);
    if(!move.startsWith('move:'))throw interrupted();
    plan=prepareTMHMTeaching(data,native,state,partyIndex,item,Number(move.slice(5)));
   }
   if(plan.status==='noEffect'){
    if(plan.reason==='cancelled')return finish(cancelled);
    const reason=plan.reason==='known'?`${mon.name} already knows ${moveName(data,teaching.moveId)}.`:plan.reason==='incompatible'?`${mon.name} cannot learn ${moveName(data,teaching.moveId)}.`:'This move cannot be taught to this Pokémon.';
    await acknowledge('Cannot learn this move',reason);return finish({status:'no-effect'});
   }
   if(plan.status!=='ready')throw interrupted();ownedPlan=plan;
   const detail=plan.replacingMove?`Forget ${moveName(data,plan.replacingMove)} and learn ${moveName(data,plan.move)}?`:`Teach ${moveName(data,plan.move)} to ${mon.name}?`;
   const confirmation=`${detail}\n${plan.consumesItem?'One TM will be used.':'The HM will stay in your Bag.'}`;
   const confirm=await awaitCurrent(()=>ui.choose('Teach this move?',['Teach move','Cancel'],confirmation,context.signal,{cancelIndex:1}));
   if(confirm!==0)return finish(cancelled);
   current();const result=commitTMHMTeaching(state,plan);if(result.status!=='learned')throw interrupted();
   stateCurrent=checkpoint(context);
   await acknowledge('Move learned',`${mon.name} learned ${moveName(data,plan.move)}!`);
   return finish({status:'used',kind:'teaching',partyIndex});
  }finally{if(ownedPlan)cancelTMHMTeaching(ownedPlan);}
 }
 let request={item,partySlot:partyIndex,moveSlot:undefined as number|undefined},plan=planFieldMedicine(data,state,request);
 if(plan.kind==='select-move'){
  const moves=plan.moves;
  const selectedMove=await awaitCurrent(()=>choice(ui,'Restore which move?',itemName(data,item),moves.map(move=>({value:`move:${move.slot}`,label:moveName(data,move.id),detail:`PP ${move.pp} / ${move.maxPP}${move.canRestore?'':' · PP full'}`})),context.signal));
  if(selectedMove==='cancel')return finish(cancelled);
  if(!selectedMove.startsWith('move:'))throw interrupted();
  request={...request,moveSlot:Number(selectedMove.slice(5))};plan=planFieldMedicine(data,state,request);
 }
 if(plan.kind==='unsupported')return unsupported(plan.requirements);
 if(plan.kind==='cancelled')return finish(cancelled);
 if(plan.kind!=='ready'){await acknowledge('No effect',`It would not have any effect on ${mon.name}.`);return finish({status:'no-effect'});}
 const detail=medicineDescription(plan.effect);
 if(await awaitCurrent(()=>ui.choose(`Use ${itemName(data,item)}?`,['Use item','Cancel'],`${mon.name}\n${detail}`,context.signal,{cancelIndex:1}))!==0)return finish(cancelled);
 current();const result=applyFieldMedicine(data,state,request);
 if(result.kind!=='applied'||JSON.stringify([result.party[partyIndex],result.bag,result.effect])!==JSON.stringify([plan.mon,plan.bag,plan.effect]))throw interrupted();
 // Both records are published synchronously, after all validation and before
 // any awaited presentation. Outer recovery owns any later interruption.
 Object.assign(state,{party:result.party,bag:result.bag});stateCurrent=checkpoint(context);
 await acknowledge(itemName(data,item),`${mon.name}\n${medicineDescription(result.effect)}`);
 return finish({status:'used',kind:'medicine',partyIndex});
}
