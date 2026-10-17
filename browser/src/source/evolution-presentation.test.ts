import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {createEvolutionPresentation,type EvolutionAudioSession,type EvolutionPresentationPorts,type EvolutionSharedOutput} from './evolution-presentation.ts';
import {WorldEvolutionView} from './evolution-view.ts';
import {evolutionScene,viewFixture} from './evolution-test-fixtures.ts';
import type {BattleEvolutionCallbacks} from './battle-evolution-types.ts';

const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
type Fixture=ReturnType<typeof fixture>;
function fixture(){const f=viewFixture(),events:{kind:string;frame:number;value?:unknown}[]=[],phases:{phase:string;frame:number}[]=[];let frame=0,cryUntil=0,fanfareUntil=0,enabled=true,sharedReads=0,restores=0,cancels=0,opened=0,bCount=0;const callbacks:BattleEvolutionCallbacks={evolve(){event('evolve');return{nickname:'Cyndaquil',speciesName:'Quilava'};},register(){event('register');},async learnMoves(){event('learn');},finish(){event('finish');}};
 let printerTask:(()=>void)|undefined;
 const output={context:{state:'running'},output:{},signal:new AbortController().signal}as unknown as EvolutionSharedOutput;let outputPort:(()=>EvolutionSharedOutput|null)|undefined;
 const event=(kind:string,value?:unknown)=>events.push({kind,frame,value});
 const audio:EvolutionAudioSession={async prepare(){event('prepared');},bgm(id){event('bgm',id);},stopBGM(id){event('stop-bgm',id);},cry(species,form){event('cry',[species,form]);cryUntil=frame+24;outputPort!();},cryPlaying:()=>frame<cryUntil,se(id){event('se',id);outputPort!();},anySEPlaying:()=>false,fanfare(id){event('fanfare',id);fanfareUntil=frame+50;outputPort!();},fanfarePlaying:()=>frame<fanfareUntil,cancel(){cancels++;event('audio-cancel');},async restore(){restores++;event('restore');}};
 const retained:((signal:AbortSignal)=>Promise<void>)[]=[];
 const ports:EvolutionPresentationPorts={view:f.view,async nextFrame(signal){if(signal.aborted)throw signal.reason;frame++;if(phases.at(-1)?.phase!==f.view.phase)phases.push({phase:f.view.phase,frame});f.view.update(1/60);printerTask?.();await Promise.resolve();},takeBCancel(){bCount++;return false;},enabled:()=>enabled,sharedOutput(){sharedReads++;return output;},retainRestore:retry=>retained.push(retry),audio:{open(_scene,borrowed){opened++;outputPort=borrowed;event('open');return audio;}},print(bank,id,operands,glyph,signal){event('print',{bank,id,operands});let active=true,resolve!:()=>void,reject!:(reason:unknown)=>void;const done=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});if(id===918)glyph(3);printerTask=()=>{try{if(signal.aborted)throw signal.reason;if(id===918&&glyph(2))return;event('printed',id);printerTask=undefined;resolve();}catch(error){printerTask=undefined;reject(error);}};return{done,clear(){if(active){event('clear',id);active=false;printerTask=undefined;}}};}};
 return{...f,ports,audio,callbacks,events,phases,event,retained,present:createEvolutionPresentation(ports),get frame(){return frame;},get bCount(){return bCount;},get opened(){return opened;},get restores(){return restores;},get cancels(){return cancels;},get sharedReads(){return sharedReads;},setEnabled(value:boolean){enabled=value;},get outputPort(){return outputPort!;},output};
}
function of(f:Fixture,kind:string){return f.events.filter(event=>event.kind===kind);}
const semantic=(f:Fixture)=>f.events.filter(event=>['evolve','register','learn','finish'].includes(event.kind)).map(event=>event.kind);

test('actual paper view carries Cyndaquil155→156 through native flags3 semantic order and original source text/fanfare controls',async()=>{
 const f=fixture(),scene=evolutionScene(),before=structuredClone(scene);assert.equal(await f.present(scene,f.callbacks),'evolved');assert.deepEqual(semantic(f),['evolve','register','learn','finish']);assert.deepEqual(of(f,'cry').map(e=>e.value),[[155,0],[156,0]]);assert.deepEqual(of(f,'bgm').map(e=>e.value),[1011]);assert.deepEqual(of(f,'se').map(e=>e.value),[1528,1529,1530,1531]);assert.deepEqual(of(f,'fanfare').map(e=>e.value),[1188]);
 assert.deepEqual(of(f,'print').map(e=>e.value),[{bank:197,id:916,operands:[]},{bank:197,id:917,operands:['Cyndaquil']},{bank:197,id:918,operands:['Cyndaquil','Quilava']}]);assert.equal(f.bCount,120);assert.equal(f.restores,1);assert.equal(f.cancels,1);assert.equal(f.view.active,false);assert.equal(f.actors[0].visible,true);assert.deepEqual(scene,before);
 const phase=(name:string)=>f.phases.find(value=>value.phase===name)!.frame;
 assert.equal(phase('narrow')-phase('gather'),20);assert.equal(phase('oscillate')-phase('narrow'),40);assert.equal(phase('reveal')-phase('widen'),24,'sixteen real visual fade ticks, then native timer8');assert.equal(of(f,'register')[0].frame-of(f,'printed').find(e=>e.value===918)!.frame,40);
 assert.ok(of(f,'evolve')[0].frame>=of(f,'cry')[1].frame+24,'new cry completion must precede gameplay change');assert.ok(of(f,'finish')[0].frame>of(f,'learn')[0].frame,'actual return motion must finish first');
});

test('B cancellation is an ordinary outcome only inside OSCILLATE and never changes gameplay',async()=>{
 const f=fixture();let polls=0;f.ports.takeBCancel=()=>++polls===3;assert.equal(await f.present(evolutionScene(),f.callbacks),'cancelled');assert.equal(polls,3);assert.deepEqual(semantic(f),[]);assert.deepEqual(of(f,'cry').map(e=>e.value),[[155,0],[155,0]]);assert.deepEqual(of(f,'stop-bgm').map(e=>e.value),[1011]);assert.deepEqual(of(f,'se').map(e=>e.value),[1528,1529]);assert.deepEqual(of(f,'fanfare'),[]);assert.equal((of(f,'print').at(-1)!.value as any).id,919);const cancelledPrint=of(f,'printed').find(e=>e.value===919)!;assert.equal(f.phases.find(e=>e.phase==='closing')!.frame-cancelledPrint.frame,21);assert.equal(f.restores,1);assert.equal(f.world.fieldEffect,null);
});

test('B on the same tick as final particle completion still wins over evolution',async()=>{
 const f=fixture();let polls=0;f.ports.takeBCancel=()=>++polls===120;assert.equal(await f.present(evolutionScene(),f.callbacks),'cancelled');assert.deepEqual(semantic(f),[]);assert.equal(f.world.fieldEffect,null);
});

test('white silhouettes stay white throughout widening and reveal begins only in the reveal phase',async()=>{
 const f=fixture(),samples:{phase:string;white:number}[]=[],tick=f.view.tick.bind(f.view);f.view.tick=()=>{tick();const next=f.view.group.children.find(object=>object instanceof THREE.Mesh&&object.material instanceof THREE.ShaderMaterial&&object.material.uniforms.art.value===f.newArt.texture)as THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>;samples.push({phase:f.view.phase,white:next.material.uniforms.white.value});};await f.present(evolutionScene(),f.callbacks);assert.ok(samples.filter(s=>s.phase==='widen').every(s=>s.white===1));assert.ok(samples.filter(s=>s.phase==='oscillate').every(s=>s.white===1));assert.equal(samples.find(s=>s.phase==='reveal')!.white,15/16);
});

test('white old art does not flash back to colour before the cancel reveal begins',async()=>{
 const f=fixture(),samples:number[]=[],tick=f.view.tick.bind(f.view);f.view.tick=()=>{tick();if(f.view.phase==='cancel'){const old=f.view.group.children.find(object=>object instanceof THREE.Mesh&&object.material instanceof THREE.ShaderMaterial&&object.material.uniforms.art.value===f.oldArt.texture)as THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>;samples.push(old.material.uniforms.white.value);}};f.ports.takeBCancel=()=>true;assert.equal(await f.present(evolutionScene(),f.callbacks),'cancelled');assert.deepEqual(samples.slice(0,16),Array(16).fill(1));assert.equal(samples[16],15/16);
});

test('source glyph callbacks are live polls and no fanfare is invented when a printer never emits glyph3',async()=>{
 const f=fixture();const seen:boolean[]=[];f.ports.print=(_bank,id,_args,glyph)=>{if(id===918){seen.push(glyph(1));seen.push(glyph(2));glyph(4);glyph(5);seen.push(glyph(2));}return{done:Promise.resolve(),clear(){}};};await f.present(evolutionScene(),f.callbacks);assert.deepEqual(of(f,'fanfare').map(e=>e.value),[1184]);assert.deepEqual(seen,[false,false,true]);assert.ok(of(f,'se').some(e=>e.value===1510));
 const g=fixture();g.ports.print=(_bank,_id,_args,glyph)=>{glyph(77);return{done:Promise.resolve(),clear(){}};};await assert.rejects(g.present(evolutionScene(),g.callbacks),/Unsupported native evolution text callback 77/);assert.equal(g.restores,1);assert.equal(g.view.active,false);assert.deepEqual(semantic(g),[]);
});

test('a printer rejected with undefined remains a technical failure and cannot advance registration',async()=>{
 const f=fixture();f.ports.print=(_bank,id)=>({done:id===918?Promise.reject(undefined):Promise.resolve(),clear(){}});await assert.rejects(f.present(evolutionScene(),f.callbacks));assert.equal(of(f,'evolve').length,1);assert.equal(of(f,'register').length,0);assert.equal(of(f,'finish').length,0);assert.equal(f.world.fieldEffect,null);assert.equal(f.restores,1);
});

test('audio remains on the required borrowed master, muted admission never asks for Context or creates a second player',async()=>{
 const f=fixture();f.setEnabled(false);assert.equal(await f.present(evolutionScene(),f.callbacks),'evolved');assert.equal(f.sharedReads,0);assert.equal(f.outputPort(),null);f.setEnabled(true);assert.equal(f.outputPort(),f.output);assert.equal(f.sharedReads,1);
 const source=await readFile(new URL('./evolution-presentation.ts',import.meta.url),'utf8');assert.doesNotMatch(source,/new\s+(Audio|AudioContext|webkitAudioContext)\s*\(/);assert.match(source,/ports\.enabled\(\)\?ports\.sharedOutput\(\):null/);
});

test('a technical failure is thrown, not converted into native cancellation, and releases voices/camera/actors',async()=>{
 for(const checkpoint of['old-cry','evolve','register','learn','finish']){const f=fixture();if(checkpoint==='old-cry')f.audio.cry=()=>{throw Error('Required borrowed cry missing');};else f.callbacks[checkpoint==='learn'?'learnMoves':checkpoint as 'evolve'|'register'|'finish']=(()=>{throw Error(`Failed ${checkpoint}`);})as never;
  await assert.rejects(f.present(evolutionScene(),f.callbacks),/Required borrowed cry missing|Failed/);assert.equal(f.world.fieldEffect,null,checkpoint);assert.equal(f.actors[0].visible,true,checkpoint);assert.equal(f.cancels,1,checkpoint);assert.equal(f.restores,1,checkpoint);
 }
});

test('source cancellation during owned learning waits for the mutating task to drain before returning a technical abort',async()=>{
 const f=fixture(),abort=new AbortController();let release!:()=>void,learning=false;f.callbacks.learnMoves=()=>{learning=true;return new Promise<void>(resolve=>release=resolve);};let done=false;const action=f.present(evolutionScene(),f.callbacks,abort.signal);const rejected=assert.rejects(action,/Rollback requested/).then(()=>done=true);for(let i=0;i<20&&!learning;i++)await flush();assert.equal(learning,true);abort.abort(Error('Rollback requested'));await flush();assert.equal(f.view.active,false);assert.equal(done,false,'mutating menu task must not be detached');release();await rejected;assert.equal(of(f,'finish').length,0);assert.equal(f.restores,1);
});

test('simultaneous scenes reject, external abort cancels before later semantic callbacks, failed presentation can be retried',async()=>{
 const f=fixture(),abort=new AbortController();let release!:()=>void;const original=f.audio.prepare;f.audio.prepare=()=>new Promise<void>(resolve=>release=resolve);const first=f.present(evolutionScene(),f.callbacks,abort.signal);const rejection=assert.rejects(first,/Cancelled prepare/);await assert.rejects(f.present(evolutionScene(),f.callbacks),/already owned/);abort.abort(Error('Cancelled prepare'));await rejection;assert.deepEqual(semantic(f),[]);assert.equal(f.restores,1);release();f.audio.prepare=original;assert.equal(await f.present(evolutionScene(),f.callbacks),'evolved');
});

test('hung borrowed preparation is bounded with an owned session handle, and late completion cannot start the scene',async()=>{
 const f=fixture();f.ports.preparationTimeoutMs=15;let release!:()=>void,aborted=false;f.audio.prepare=signal=>{signal.addEventListener('abort',()=>aborted=true,{once:true});return new Promise<void>(resolve=>release=resolve);};await assert.rejects(f.present(evolutionScene(),f.callbacks),/audio preparation timed out/);assert.equal(aborted,true);assert.equal(f.cancels,1);assert.equal(f.restores,1);assert.equal(f.world.fieldEffect,null);release();await flush();assert.deepEqual(of(f,'bgm'),[]);assert.deepEqual(semantic(f),[]);
});

test('an abort-ignoring nextFrame cannot retain the scene or block a fresh retry',async()=>{
 const f=fixture(),abort=new AbortController(),original=f.ports.nextFrame;let release!:()=>void,waiting=false,settled=false;f.ports.nextFrame=()=>{waiting=true;return new Promise<void>(resolve=>release=resolve);};const action=f.present(evolutionScene(),f.callbacks,abort.signal),observed=action.then(()=>{settled=true;},()=>{settled=true;});
 try{for(let i=0;i<10&&!waiting;i++)await flush();assert.equal(waiting,true);abort.abort(Error('Frame owner aborted'));for(let i=0;i<5&&!settled;i++)await flush();assert.equal(settled,true);assert.equal(f.restores,1);assert.equal(f.world.fieldEffect,null);release();await observed;f.ports.nextFrame=original;assert.equal(await f.present(evolutionScene(),f.callbacks),'evolved');}finally{abort.abort();release?.();await observed;}
});

test('separate factories reserve the same field before audio preparation without opening a competing session',async()=>{
 const f=fixture(),abort=new AbortController();let release!:()=>void,secondOpened=0;f.audio.prepare=()=>new Promise<void>(resolve=>release=resolve);const first=f.present(evolutionScene(),f.callbacks,abort.signal),observed=first.catch(()=>{}),otherView=new WorldEvolutionView(f.world,()=>f.field,{art:async()=>f.oldArt});const other=createEvolutionPresentation({...f.ports,view:otherView,audio:{open(){secondOpened++;throw Error('Competing audio must not open');}}});
 try{await assert.rejects(other(evolutionScene(),f.callbacks),/already owned|active presentation/);assert.equal(secondOpened,0);}finally{abort.abort(Error('Owner test done'));release();await observed;}
});

test('bad flags/form/shiny artwork fail before audio ownership or any gameplay callback',async()=>{
 for(const patch of[{flags:1},{before:{...evolutionScene().before,form:1}},{before:{...evolutionScene().before,id:0,personality:0}}]){const f=fixture(),scene={...evolutionScene(),...patch};await assert.rejects(f.present(scene as any,f.callbacks),/flags3|not exported/);assert.equal(f.opened,0);assert.deepEqual(semantic(f),[]);assert.equal(f.world.fieldEffect,null);}
});

test('borrowed audio restoration watchdog aborts stalled cleanup and preserves an explicit technical failure',async()=>{
 const f=fixture();f.ports.cleanupTimeoutMs=20;let aborted=false;f.audio.restore=signal=>new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>{aborted=true;reject(signal.reason);},{once:true});});await assert.rejects(f.present(evolutionScene(),f.callbacks),/restoration timed out/);assert.equal(aborted,true);assert.equal(f.world.fieldEffect,null);assert.equal(f.cancels,1);assert.equal(f.retained.length,1);let retry=0;f.audio.restore=async()=>{retry++;};await f.retained[0](new AbortController().signal);assert.equal(retry,1);
});

test('outer cancellation during independent audio restoration cannot return a successful native outcome',async()=>{
 const f=fixture(),abort=new AbortController();let restoring=false,release!:()=>void;f.audio.restore=()=>{restoring=true;return new Promise<void>(resolve=>release=resolve);};const action=f.present(evolutionScene(),f.callbacks,abort.signal),rejected=assert.rejects(action,/Exit while restoring/);for(let i=0;i<20&&!restoring;i++)await flush();assert.equal(restoring,true);abort.abort(Error('Exit while restoring'));release();await rejected;assert.equal(f.world.fieldEffect,null);
});

test('phase ownership is grounded in literal native flags3 source, callback glyphs and actual original messages',async()=>{
 const root=new URL('../../../',import.meta.url),native=await readFile(new URL('src/evolution_scene.c',root),'utf8'),battle=await readFile(new URL('src/battle/battle_022378C0.c',root),'utf8'),messages=await readFile(new URL('files/msgdata/msg/msg_0197.gmm',root),'utf8');
 assert.match(native,/data->state == EVO_STATE_OSCILLATE && \(gSystem.newKeys & PAD_BUTTON_B\)/);assert.match(native,/case 3:\s*PlayFanfare\(SEQ_ME_SHINKAOME\)/);assert.match(native,/case 2:\s*result = IsFanfarePlaying\(\)/);assert.match(native,/case EVO_STATE_REGISTER:[\s\S]*?data->timer == 0[\s\S]*?Pokedex_SetMonCaughtFlag/);assert.match(battle,/evolutionCondition, 3, HEAP_ID_EVOLUTION/);
 for(const[id,text]of[[916,'What?\\r'],[917,'{STRVAR_1 1, 0, 0} is evolving!'],[918,'{WAIT 3}Congratulations!'],[919,'stopped evolving!\\r']]as const){const match=messages.match(new RegExp(`<row id="msg_0197_${String(id).padStart(5,'0')}"[\\s\\S]*?<language name="English">([\\s\\S]*?)</language>`));assert.ok(match);assert.ok(match[1].includes(text));}
});
