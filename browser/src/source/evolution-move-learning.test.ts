import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData,createMon,moveName} from './data.ts';
import {EvolutionMoveLearning} from './evolution-move-learning.ts';
import {UI} from './ui.ts';
import {installUIDOM} from './ui-test-dom.ts';
import type {EvolutionAudioSession} from './evolution-presentation.ts';
import type {EvolutionMoveRequest} from './battle-evolution-types.ts';

globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData(),messages=JSON.parse(await readFile(new URL('../../public/source/messages/197.json',import.meta.url),'utf8'));
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
function fixture(){
 const d=installUIDOM(),ui=new UI(),frames:(()=>void)[]=[],sounds:number[]=[],printed:string[]=[],mon={...createMon(data,20,20,'Gold',()=>.5),form:0,hasNickname:false};let count=0,fanfareUntil=0;const signal=new AbortController();
 const audio:EvolutionAudioSession={prepare:async()=>{},bgm(){throw Error('Learner cannot start evolution BGM');},stopBGM(){},cry(){throw Error('Learner cannot create a cry');},cryPlaying:()=>false,se:id=>sounds.push(id),anySEPlaying:()=>false,fanfare:id=>{sounds.push(id);fanfareUntil=count+4;},fanfarePlaying:()=>count<fanfareUntil,cancel(){},restore:async()=>{}};
 const printer=ui.printNativeMessage.bind(ui);ui.printNativeMessage=(tokens,...args)=>{printed.push(tokens.map(row=>row.kind==='text'?row.text:row.kind==='glyph'?`{WAIT ${row.id}}`:row.kind==='pause'?`{PAUSE ${row.frames}}`:row.kind==='indicator'?'{YESNO 0}':'\\r').join(''));return printer(tokens,...args);};
 const nextFrame=(owner:AbortSignal)=>new Promise<void>((resolve,reject)=>{const cancel=()=>reject(owner.reason),release=()=>{owner.removeEventListener('abort',cancel);resolve();};owner.addEventListener('abort',cancel,{once:true});if(owner.aborted)cancel();else frames.push(release);});
 const learner=new EvolutionMoveLearning({ui,data,messages,textDelay:()=>0,nextFrame,audio:()=>audio,prepareMenu:async signal=>signal.throwIfAborted(),selectSound:()=>sounds.push(1500)});
 async function tick(){count++;for(const release of frames.splice(0))release();await flush();}
 async function drive<T>(work:Promise<T>,select?:(buttons:any[],panel:number)=>void){let done=false,value:T|undefined,failure:unknown,panels=0,old:any;void work.then(result=>{done=true;value=result;},error=>{done=true;failure=error;});for(let n=0;n<1500&&!done;n++){if(ui.panelOpen){const buttons=d.ids.get('panel-content')!.querySelectorAll<any>('[data-evolution-option]');if(buttons[0]!==old){old=buttons[0];select?.(buttons,panels++);}}else ui.advance();await tick();}assert.equal(done,true,'source learner resolves through actual owned UI');if(failure!==undefined)throw failure;return value!;}
 const request:EvolutionMoveRequest={mon,move:184,existing:mon.moves,unforgettablyHM:mon.moves.map((_,index)=>index===0)};
 return{d,ui,learner,audio,mon,request,signal,sounds,printed,tick,drive,get count(){return count;},dispose(){signal.abort();learner.clear();d.restore();}};
}

test('native full-set menus use source labels/default TOP; B/Back enters stop-learning and never silently declines',async()=>{
 const f=fixture();try{const actions=[1,1,0,4,0],seen:string[]=[];const choice=await f.drive(f.learner.choose(f.request,f.signal.signal),(buttons,index)=>{seen.push(f.d.ids.get('panel-content')!.innerHTML);assert.equal(buttons[0].getAttribute('data-panel-focus'),'');if(index===3){f.d.key('KeyB');return;}buttons[actions[index]].click();});assert.deepEqual(choice,{kind:'decline'});assert.equal(seen.length,5);assert.match(seen[0],/Forget a move!/);assert.match(seen[0],/Keep old moves!/);assert.match(seen[1],/Give up on Scary Face!/);assert.match(seen[1],/Don’t give up on Scary Face!/);assert.equal(f.printed.filter(row=>row.includes('wants to learn')).length,2);assert.equal(f.printed.filter(row=>row.includes('Stop trying to teach')).length,2);assert.equal(f.ui.panelOpen,false);assert.equal(f.sounds.filter(id=>id===1500).length,5);}finally{f.dispose();}
});

test('actual summary cannot forget an HM and returns only a selected non-HM slot; party records remain untouched',async()=>{
 const f=fixture();try{const before=structuredClone(f.mon);const choice=await f.drive(f.learner.choose(f.request,f.signal.signal),(buttons,index)=>{if(index===0)buttons[0].click();else{assert.equal(buttons.length,5);assert.equal(buttons[0].disabled,true);buttons[0].click();assert.equal(f.ui.panelOpen,true);buttons[2].click();}});assert.deepEqual(choice,{kind:'replace',slot:2});assert.deepEqual(f.mon,before);assert.equal(f.sounds.filter(id=>id===1500).length,2);}finally{f.dispose();}
});

test('learned text dispatches original1184 on the CURRENT borrowed session and waits30 polls after its final page',async()=>{
 const f=fixture();try{let printedAt=-1;const method=f.ui.printNativeMessage.bind(f.ui);f.ui.printNativeMessage=(...args)=>{const p=method(...args);void p.done.then(()=>printedAt=f.count);return p;};const before=structuredClone(f.mon);await f.drive(f.learner.show({kind:'learned',mon:f.mon,move:184,replaced:null},f.signal.signal));assert.deepEqual(f.sounds,[1184]);assert.equal(f.count-printedAt,30);assert.deepEqual(f.mon,before);assert.match(f.printed[0],new RegExp(moveName(data,184)));}finally{f.dispose();}
});

test('forget messages preserve all four PAUSE20 controls,1510 and source message order before controller mutation',async()=>{
 const f=fixture();try{const old=structuredClone(f.mon.moves);await f.drive(f.learner.show({kind:'forget',mon:f.mon,move:184,forgotten:f.mon.moves[1].id},f.signal.signal));assert.equal(f.printed.length,3);assert.equal((f.printed[0].match(/\{PAUSE 20\}/g)??[]).length,4);assert.match(f.printed[1],/forgot how to/);assert.equal(f.printed[2],'And...\\r');assert.deepEqual(f.sounds,[1510]);assert.ok(f.count>=175);assert.deepEqual(f.mon.moves,old);}finally{f.dispose();}
});

test('abort owns both source printer and summary handlers; stale selection cannot resolve or close a new recovery prompt',async()=>{
 const f=fixture();try{const work=f.learner.choose(f.request,f.signal.signal),rejected=assert.rejects(work,/learner failed/);for(let n=0;n<150&&!f.ui.panelOpen;n++){f.ui.advance();await f.tick();}assert.equal(f.ui.panelOpen,true);const button=f.d.ids.get('panel-content')!.querySelectorAll<any>('[data-evolution-option]')[0],stale=button.onclick;f.signal.abort(Error('learner failed'));await rejected;assert.equal(button.onclick,null);f.learner.clear();const recovery=f.ui.choose('Recovery',['Retry','Return']);stale();assert.equal(f.ui.panelOpen,true);assert.match(f.d.ids.get('panel-content')!.innerHTML,/Recovery/);f.d.buttons[1].click();assert.equal(await recovery,1);assert.equal(f.ui.busy,false);}finally{f.dispose();}
});
