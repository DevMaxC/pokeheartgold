import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setImmediate as immediate} from 'node:timers/promises';
import {loadData,newState,createMon} from './data.ts';
import {FieldObjects} from './objects.ts';
import {ScriptVM,UnsupportedScript,type ScriptHooks,type ScriptFieldMoveContext} from './script.ts';
import {SourceActionRecovery} from './script-recovery.ts';
import {sourceJSON,type SourceMap,type Mon} from './types.ts';

globalThis.fetch=async input=>{try{return new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));}catch{return new Response('',{status:404});}};
const data=await loadData(),route=await sourceJSON<SourceMap>('maps/34.json'),tree=route.events.objects.find(o=>o.id==='obj_R30_tree')!;
const cut=data.constants.std_field_cut,menuCut=data.constants.std_menu_cut;
const slot=(species=19,move=15)=>{const mon=createMon(data,species,8,'Case',()=>.5);mon.moves=[{id:move,pp:0,maxPP:data.moves[move].pp}];return mon;};
async function until(predicate:()=>boolean){for(let attempt=0;!predicate();attempt++){assert.ok(attempt<10000,'The native fixture did not reach its expected yield');await immediate();}}

class NativeClock{
 frame=0;
 private pending:{at:number;resolve:()=>void;reject:(error:unknown)=>void;signal:AbortSignal;abort:()=>void}[]=[];
 wait(frames:number,signal:AbortSignal){return new Promise<void>((resolve,reject)=>{
  const task={at:this.frame+frames,resolve:()=>{},reject,signal,abort:()=>{}};
  const cleanup=()=>{signal.removeEventListener('abort',task.abort);const at=this.pending.indexOf(task);if(at>=0)this.pending.splice(at,1);};
  task.resolve=()=>{cleanup();resolve();};task.abort=()=>{cleanup();reject(signal.reason);};
  this.pending.push(task);signal.addEventListener('abort',task.abort,{once:true});if(signal.aborted)task.abort();
 });}
 async advance(frames:number){for(let i=0;i<frames;i++){this.frame++;for(const task of [...this.pending])if(task.at<=this.frame)task.resolve();await immediate();}}
 async finish(run:Promise<void>){let settled=false;const result=run.finally(()=>settled=true);void result.catch(()=>{});for(let frame=0;!settled&&frame<4;frame++)await this.advance(1);assert.equal(settled,true,'Native completion polling must settle within four more frames');await result;}
}

function scene(options:{species?:number;choice?:number;badge?:boolean;active?:boolean;visibleFlag?:boolean;avatar?:number;effectFrames?:number;failEffect?:boolean;map?:SourceMap}={}){
 const map=options.map??route,state=newState(data,'Case','boy',()=>.5);Object.assign(state,{map:map.id,x:558.5,z:295.5,facing:3,avatarState:options.avatar??0});state.party=[slot(options.species)];state.badges=options.badge===false?[]:[1];state.bag.ITEM_HM01=1;
 const objects=new FieldObjects(data,state);objects.load(map.events.objects);const clock=new NativeClock(),events:{kind:string;frame:number;value?:unknown}[]=[];
 let follower={x:557.5,z:295.5},effectStarted=false,effectFinished=false,restores=0;
 const record=(kind:string,value?:unknown)=>events.push({kind,frame:clock.frame,value});
 const request=(context:ScriptFieldMoveContext)=>{assert.equal(context.map.id,map.id);assert.equal(context.object,tree.id);assert.ok(context.signal instanceof AbortSignal);};
 const hooks:ScriptHooks={
  message:async text=>{record('message',text);},choice:async()=>{record('choice');return options.choice??0;},move:async()=>{},position:(id,x,z)=>objects.position(id,x,z),face:id=>{record('face',id);},
  visible:(id,shown)=>{record('visible',{id,shown});objects.show(id,shown);},chooseStarter:async()=>{},nickname:async()=>{},refresh:async()=>{record('refresh');},battle:async()=>true,warp:async()=>{},followerActive:()=>options.active??false,
  fieldMoves:{
   cutIn:async(index,context)=>{request(context);record('cutIn',index);},
   startEffect:(kind,context)=>{request(context);record('effectStart',kind);effectStarted=true;return clock.wait(options.effectFrames??12,context.signal).then(()=>{if(options.failEffect)throw Error('Native Cut effect failed');effectFinished=true;record('effectFinished');}).finally(()=>record('effectReleased'));},
   swapPlayerFollower:async(mode,context)=>{request(context);record('swap',mode);const before={x:state.x,z:state.z};state.x=follower.x;state.z=follower.z;follower=before;},
   jumpFollower:async(count,context)=>{request(context);record('jump',count);},
   resetFollowerMovement:async context=>{request(context);record('resetFollower');},
   addFollowerMood:delta=>{record('mood',delta);const mon=state.party.find(mon=>mon.hp>0&&!mon.isEgg&&!mon.checksumFailed) as Mon&{mood?:number};mon.mood=Math.max(-127,Math.min(127,(mon.mood??0)+delta));},
   followerVisibleFlag:()=>options.visibleFlag??true,
   cry:async(species,pattern,context)=>{request(context);record('cry',{species,pattern});},
   waitFrames:(frames,context)=>{request(context);assert.equal(frames,1);return clock.wait(frames,context.signal);},
  },
 };
 const vm=new ScriptVM(data,state,hooks);
 const recovery=new SourceActionRecovery(state,{capture:()=>({actors:objects.save(map.id),follower}),restore:async snapshot=>{restores++;objects.load(map.events.objects);objects.restore(state.map,snapshot.actors);follower={...snapshot.follower};record('restored');}});
 const run=(standard=cut)=>recovery.run(()=>vm.run(map,standard,tree.id));
 return{state,objects,clock,events,hooks,vm,recovery,run,record,get follower(){return follower;},get restores(){return restores;},get effectStarted(){return effectStarted;},get effectFinished(){return effectFinished;}};
}

test('actual standard10000 starts effect0, hides the native tree after 7 frames, then waits for true completion',async()=>{
 const h=scene(),before=structuredClone(h.state);const running=h.run();await until(()=>h.effectStarted);
 assert.equal(h.vm.busy,true);assert.equal(h.recovery.busy,true);assert.equal(h.vm.value('VAR_SPECIAL_x8005',route),0);assert.equal(h.vm.value('VAR_SPECIAL_RESULT',route),7);
 await h.clock.advance(6);assert.equal(h.objects.snapshot().find(o=>o.id===tree.id)!.visible,true);assert.equal(h.vm.value('VAR_SPECIAL_RESULT',route),1);
 await h.clock.advance(1);assert.equal(h.state.flags[tree.eventFlag],true);assert.equal(h.effectFinished,false);assert.equal(h.vm.busy,true);assert.equal(h.vm.value('VAR_SPECIAL_x8005',route),0);
 assert.deepEqual(h.events.filter(e=>e.kind==='visible'),[{kind:'visible',frame:7,value:{id:tree.id,shown:false}}]);
 await h.clock.advance(5);await h.clock.finish(running);assert.equal(h.effectFinished,true);assert.equal(h.vm.value('VAR_SPECIAL_x8005',route),1);assert.equal(h.vm.busy,false);assert.equal(h.recovery.busy,false);
 assert.equal(h.state.bag.ITEM_HM01,1);assert.deepEqual(h.state.party,before.party,'Field Cut does not spend PP or heal the user');
 assert.deepEqual(h.events.filter(e=>e.kind==='effectStart').map(e=>e.value),[0]);assert.deepEqual(h.events.filter(e=>e.kind==='cutIn').map(e=>e.value),[0]);
});

test('native no-move/no-badge/Egg/BadEgg/No branches do not request effect ports or remove the source gate',async()=>{
 for(const mode of['noMove','noBadge','egg','badEgg','no'] as const){
  const h=scene({badge:mode!=='noBadge',choice:mode==='no'?1:0});if(mode==='noMove')h.state.party[0].moves=[{id:33,pp:10,maxPP:35}];if(mode==='egg')h.state.party[0].isEgg=true;if(mode==='badEgg')h.state.party[0].checksumFailed=true;
  delete h.hooks.fieldMoves;delete h.hooks.followerActive;await h.run();assert.equal(h.state.flags[tree.eventFlag],undefined,mode);assert.equal(h.objects.snapshot().find(o=>o.id===tree.id)!.visible,true);assert.equal(h.events.some(e=>e.kind==='effectStart'||e.kind==='cutIn'),false);assert.equal(h.vm.lastUnsupported,null);
 }
});

test('the first fainted zero-PP Cut user is selected while the follower query independently selects a living non-Egg',async()=>{
 const h=scene();const egg={...slot(),isEgg:true},bad={...slot(),checksumFailed:true},fainted=slot();fainted.hp=0;fainted.name='ZERO';h.state.party=[egg,bad,fainted,slot(155,33)];
 const running=h.run();await until(()=>h.effectStarted);assert.equal(h.vm.value('VAR_SPECIAL_x8004',route),2);assert.deepEqual(h.events.filter(e=>e.kind==='cutIn').map(e=>e.value),[2]);assert.equal(h.vm.buffers[0],'ZERO');assert.ok(h.events.some(e=>e.kind==='message'&&String(e.value).includes('ZERO')));
 await h.clock.advance(12);await h.clock.finish(running);assert.equal(h.state.party[2].hp,0);assert.equal(h.state.party[2].moves[0].pp,0);
});

test('the actual active-follower branch swaps, uses native Grass mood/hops and cry, then starts effect3',async()=>{
 const h=scene({species:152,active:true,visibleFlag:false});const running=h.run();await until(()=>h.effectStarted);
 assert.deepEqual(h.events.filter(e=>['swap','mood','jump','cry','effectStart'].includes(e.kind)).map(e=>[e.kind,e.value]),[['swap',1],['mood',20],['jump',2],['mood',1],['cry',{species:152,pattern:0}],['effectStart',3]]);
 assert.deepEqual([h.state.x,h.state.z],[557.5,295.5]);assert.deepEqual(h.follower,{x:558.5,z:295.5});assert.equal((h.state.party[0]as Mon&{mood:number}).mood,21);
 await h.clock.advance(12);await h.clock.finish(running);assert.equal(h.state.flags[tree.eventFlag],true);
});

test('actual menu10007 resets follower movement, preserves the literal target and follows the same delayed HidePerson',async()=>{
 const h=scene();h.vm.set('VAR_SPECIAL_x8000',0);const running=h.run(menuCut);await until(()=>h.effectStarted);
 assert.ok(h.events.some(e=>e.kind==='resetFollower'));assert.equal(h.events.some(e=>e.kind==='choice'),false);await h.clock.advance(7);assert.equal(h.state.flags[tree.eventFlag],true);assert.equal(h.effectFinished,false);await h.clock.advance(5);await h.clock.finish(running);
});

test('missing or non-Promise effect ports remain explicit errors before a cut-in or fabricated completion',async()=>{
 const h=scene();delete (h.hooks.fieldMoves as Partial<NonNullable<ScriptHooks['fieldMoves']>>).startEffect;const before=structuredClone(h.state),actors=h.objects.save(route.id);
 await assert.rejects(h.run(),UnsupportedScript);assert.equal(h.events.some(e=>e.kind==='cutIn'),false);assert.deepEqual(h.state,before);assert.deepEqual(h.objects.save(route.id),actors);
 const invalid=scene();invalid.hooks.fieldMoves!.startEffect=(()=>undefined)as never;await assert.rejects(invalid.run(),/completion Promise/);assert.equal(invalid.state.flags[tree.eventFlag],undefined);assert.equal(invalid.vm.value('VAR_SPECIAL_x8005',route),0);
});

test('a failed real effect restores source flags, actor state and a follower swap before returning control',async()=>{
 const h=scene({species:152,active:true,visibleFlag:false,effectFrames:10,failEffect:true}),before=structuredClone(h.state),actors=h.objects.save(route.id),follower={...h.follower};
 const running=h.run(),outcome=running.then(()=>null,error=>error);await until(()=>h.effectStarted);await h.clock.advance(7);assert.equal(h.state.flags[tree.eventFlag],true);assert.notDeepEqual([h.state.x,h.state.z],[before.x,before.z]);
 await h.clock.advance(3);assert.match(String(await outcome),/Native Cut effect failed/);assert.deepEqual(h.state,before);assert.deepEqual(h.objects.save(route.id),actors);assert.deepEqual(h.follower,follower);assert.equal(h.restores,1);assert.equal(h.vm.busy,false);assert.equal(h.recovery.busy,false);
 const restored=structuredClone(h.state);await h.clock.advance(20);assert.deepEqual(h.state,restored,'No completion can rewrite restored flags/variables');
 h.hooks.fieldMoves!.startEffect=(kind,context)=>{h.record('retryEffect',kind);return h.clock.wait(9,context.signal);};
 const retry=h.run();await until(()=>h.events.some(e=>e.kind==='retryEffect'));await h.clock.advance(9);await h.clock.finish(retry);assert.equal(h.state.flags[tree.eventFlag],true);assert.equal(h.restores,1,'Explicit retry commits once from its restored checkpoint');
});

test('cancellation drains even an uncooperative effect and blocks its completion write before recovery',async()=>{
 const h=scene();let finish!:()=>void;h.hooks.fieldMoves!.startEffect=(_kind,context)=>{h.record('heldEffect',context.signal);return new Promise<void>(resolve=>finish=resolve);};
 const before=structuredClone(h.state),actors=h.objects.save(route.id);const running=h.run(),outcome=running.then(()=>null,error=>error);await until(()=>!!finish);await h.clock.advance(7);assert.equal(h.state.flags[tree.eventFlag],true);
 h.vm.cancel(Error('External map replacement cancelled Cut'));await immediate();assert.equal(h.vm.busy,true);assert.equal(h.recovery.busy,true);assert.equal(h.restores,0,'Hydration waits for ownership drain');
 finish();assert.match(String(await outcome),/cancelled Cut/);assert.deepEqual(h.state,before);assert.deepEqual(h.objects.save(route.id),actors);assert.equal(h.restores,1);assert.equal(h.vm.busy,false);const restored=structuredClone(h.state);finish();await h.clock.advance(20);assert.deepEqual(h.state,restored);
});

test('an external map replacement cannot write a delayed Cut completion into the destination field',async()=>{
 const h=scene();let finish!:()=>void;h.hooks.fieldMoves!.startEffect=()=>new Promise<void>(resolve=>finish=resolve);
 const before=structuredClone(h.state),running=h.run(),outcome=running.then(()=>null,error=>error);await until(()=>!!finish);
 h.state.map=35;await h.clock.advance(1);assert.equal(h.vm.value('VAR_SPECIAL_x8005',route),0);assert.equal(h.restores,0,'A pending effect still owns cleanup before hydration');
 finish();assert.match(String(await outcome),/field change/);assert.deepEqual(h.state,before);assert.equal(h.restores,1);assert.equal(h.state.flags[tree.eventFlag],undefined);
});

test('query operands, raw buffer bytes, checksum policy and source form/plate types are exact',async()=>{
 const h=scene();h.state.party=[{...slot(),isEgg:true},{...slot(),checksumFailed:true},{...slot(),hp:0,name:'ZERO'},slot(493,33)];h.state.party[3].heldItem='ITEM_MEADOW_PLATE';
 const map={...route,scripts:{entries:['queries'],labels:{queries:0},instructions:[
  ['GetPartySlotWithMove',['VAR_TEMP_x4000','MOVE_CUT']],['MonHasMove',['VAR_TEMP_x4001','MOVE_CUT','VAR_TEMP_x4000']],['GetFollowPokePartyIndex',['VAR_TEMP_x4002']],
  ['GetPartyLeadAlive',['VAR_TEMP_x4003']],['GetPartyMonSpecies',['1','VAR_TEMP_x4004']],['BufferPartyMonNick',['VAR_TEMP_x4000','VAR_TEMP_x4000']],
  ['FirstAliveMonHasType',['12','VAR_TEMP_x4005']],['FollowMonIsInactiveOrVisible',['VAR_TEMP_x4006']],['End',[]],
 ]}} as SourceMap;
 await h.vm.run(map,1,tree.id);assert.equal(h.vm.value('VAR_TEMP_x4000',map),2);assert.equal(h.vm.value('VAR_TEMP_x4001',map),1);assert.equal(h.vm.value('VAR_TEMP_x4002',map),3);assert.equal(h.vm.value('VAR_TEMP_x4003',map),3);assert.equal(h.vm.value('VAR_TEMP_x4004',map),0);assert.equal(h.vm.value('VAR_TEMP_x4005',map),1);assert.equal(h.vm.value('VAR_TEMP_x4006',map),1);assert.equal(h.vm.buffers[0],'ZERO');assert.equal(h.vm.buffers[2],undefined,'Buffer byte is the literal VAR address low byte, not its value');
});
