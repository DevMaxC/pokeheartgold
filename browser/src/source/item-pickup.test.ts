import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData,newState,moveName} from './data.ts';
import {FieldObjects} from './objects.ts';
import {ScriptVM} from './script.ts';
import {runItemBallPickup,isItemBallStandard,isItemBallObject} from './item-pickup.ts';
import {isTMHMItem,tmhmMove} from './tmhm.ts';
import {fieldSpriteHeight} from './field-sprite-scale.ts';
import {sourceJSON,type SourceMap} from './types.ts';

let failBank=false,failMoveTable=false,bankLoads=0;
globalThis.fetch=async input=>{const path=String(input);if(path==='/source/scripts/0141.json'){bankLoads++;if(failBank){failBank=false;return new Response('',{status:503});}}if(path==='/source/tmhm-moves.json'&&failMoveTable){failMoveTable=false;return new Response('',{status:503});}return new Response(await readFile(new URL('../../public'+path,import.meta.url)));};
const data=await loadData(),common=await sourceJSON<SourceMap>('scripts/0141.json'),maps=await Promise.all(Object.keys(data.index.maps).map(id=>sourceJSON<SourceMap>('maps/'+id+'.json')));
const id=(map:SourceMap,token:string|number):number=>typeof token==='number'?token:token.includes('+')?token.split('+').reduce((sum,part)=>sum+id(map,part.trim()),0):map.constants[token]??data.constants[token]??Number(token);
const placements=maps.flatMap(map=>map.events.objects.filter(event=>isItemBallStandard(id(map,event.scriptId))).map(event=>({map,event,script:id(map,event.scriptId)})));
const localPickups=maps.flatMap(map=>map.events.objects.filter(event=>isItemBallObject(map,event.id)&&!isItemBallStandard(id(map,event.scriptId))).map(event=>({map,event,script:id(map,event.scriptId)})));
const definitions=common.scripts.entries.slice(0,-1).map((entry,index)=>{const pc=common.scripts.labels[entry],[setItem,setCount]=common.scripts.instructions.slice(pc,pc+2);assert.deepEqual([setItem[0],setItem[1][0],setCount[0],setCount[1][0]],['SetVar','VAR_SPECIAL_x8008','SetVar','VAR_SPECIAL_x8009']);const item=id(common,setItem[1][1]),quantity=id(common,setCount[1][1]),key=data.items.find(row=>data.constants[row.item]===item)?.item;assert.ok(key,'literal source item '+item);return{script:7000+index,item,quantity,key:key!};});
const example=placements.find(row=>row.map.constants[row.event.id]>0)!;
function fixture(row=example){
 const state=newState(data,'Ethan','boy');state.map=row.map.id;state.bag={};delete state.flags[row.event.eventFlag];
 const objects=new FieldObjects(data,state);objects.load(row.map.events.objects);const trace:any[]=[],controls:{message?:()=>void;refresh?:()=>void}={};
 const refresh=async()=>{objects.snapshot();trace.push(['refresh']);controls.refresh?.();};
 const hooks={message:async(text:string)=>{trace.push(['message',text]);controls.message?.();},choice:async()=>0,move:async()=>{},position(){},face:(name:string)=>{trace.push(['face',name]);const actor=objects.get(name);if(actor)actor.facingDirection=1;},visible:(name:string,value:boolean)=>{trace.push(['visible',name,value]);objects.show(name,value);objects.snapshot();},chooseStarter:async()=>{},nickname:async()=>1,refresh,battle:async()=>false,warp:async()=>{throw Error('An item pickup must never warp');}};
 // Deliberately no objectName hook: nested common banks must retain the real
 // source map identity themselves, including event0 and nonzero object IDs.
 const vm=new ScriptVM(data,state,hooks),run=()=>runItemBallPickup(state,objects,()=>vm.run(row.map,row.event.scriptId,row.event.id),refresh);
 return{state,objects,trace,controls,vm,run,row};
}
function synthetic(script:number){const map=structuredClone(example.map),event={...example.event,id:'obj_item_test',scriptId:script,eventFlag:'FLAG_ITEM_TEST'};map.events.objects=[event];map.constants[event.id]=7;return{map,event,script};}
const maximum=(key:string)=>data.constants[data.items.find(item=>item.item===key)!.fieldPocket==='POCKET_TMHMS'?'BAG_TMHM_QUANTITY_MAX':'BAG_SLOT_QUANTITY_MAX'];

test('a failed original item standard503 is evicted so the same VM/context retries and picks up the intended event',async()=>{
 const f=fixture(),before=structuredClone(f.state),actors=structuredClone(f.objects.save(f.state.map));failBank=true;const initialLoads=bankLoads;
 await assert.rejects(f.run(),/scripts\/0141.json/);assert.deepEqual(f.state,before);assert.deepEqual(f.objects.save(f.state.map),actors);assert.equal(f.vm.busy,false);
 await f.run();assert.equal(bankLoads,initialLoads+2);assert.equal(f.vm.lastUnsupported,null);assert.equal(f.state.vars.VAR_SPECIAL_LAST_TALKED,f.row.map.constants[f.row.event.id]);assert.deepEqual(f.trace.filter(row=>row[0]==='visible'),[['visible',f.row.event.id,false]]);
});

test('a failed TM move-name asset after Hide/Give rolls back State and actor overrides, and retries from the source without duplicate items',async()=>{
 const entry=definitions.find(row=>isTMHMItem(data,row.item))!,f=fixture(synthetic(entry.script));f.objects.show(f.row.event.id,true);const before=structuredClone(f.state),actors=structuredClone(f.objects.save(f.state.map));failMoveTable=true;
 await assert.rejects(f.run(),/tmhm-moves.json/);assert.deepEqual(f.state,before);assert.deepEqual(f.objects.save(f.state.map),actors);assert.equal(f.objects.snapshot()[0].visible,true);assert.equal(f.vm.busy,false);
 await f.run();assert.equal(f.state.bag[entry.key],entry.quantity);assert.equal(f.state.flags[f.row.event.eventFlag],true);const expectedMove=await tmhmMove(data,entry.item);assert.ok(f.trace.some(row=>row[0]==='message'&&row[1].includes(moveName(data,expectedMove))),'native move-name message appears on successful retry');
});

test('all255 literal item definitions and the explicit shared tail execute real0141 scripts, with success and native full-stack no-hide paths',async t=>{
 assert.equal(common.scripts.entries.length,256);assert.equal(definitions.length,255);let successes=0,full=0,tm=0;
 for(const definition of definitions){
  const f=fixture(synthetic(definition.script));await f.run();assert.deepEqual(f.state.bag,{[definition.key]:definition.quantity});assert.equal(f.state.flags[f.row.event.eventFlag],true);assert.equal(f.objects.snapshot()[0].visible,false);assert.equal(f.state.vars.VAR_SPECIAL_RESULT,1);assert.equal(f.vm.lastUnsupported,null);assert.deepEqual(f.trace.filter(row=>row[0]==='visible'),[['visible',f.row.event.id,false]]);assert.equal(f.trace.filter(row=>row[0]==='message').length,2);successes++;
  if(isTMHMItem(data,definition.item)){tm++;const move=await tmhmMove(data,definition.item);assert.ok(f.trace.some(row=>row[0]==='message'&&row[1].includes(moveName(data,move))),'native TM move name '+definition.key);}
  const denied=fixture(synthetic(definition.script));denied.state.bag[definition.key]=maximum(definition.key);const bag=structuredClone(denied.state.bag);await denied.run();assert.deepEqual(denied.state.bag,bag);assert.notEqual(denied.state.flags[denied.row.event.eventFlag],true);assert.equal(denied.objects.snapshot()[0].visible,true);assert.equal(denied.state.vars.VAR_SPECIAL_RESULT,0);assert.equal(denied.trace.some(row=>row[0]==='visible'),false);assert.equal(denied.trace.filter(row=>row[0]==='message').length,1);full++;
 }
 // Entry7255 is the common tail, not a256th fabricated item. Its native
 // caller supplies8008/8009; exercise it explicitly using source definition0.
 const tail=fixture(synthetic(7255)),definition=definitions[0];tail.vm.set('VAR_SPECIAL_x8008',definition.item);tail.vm.set('VAR_SPECIAL_x8009',definition.quantity);await tail.run();assert.deepEqual(tail.state.bag,{[definition.key]:definition.quantity});
 t.diagnostic(JSON.stringify({literalDefinitions:definitions.length,successes,fullBag:full,tmDefinitions:tm,sharedTail:1}));
});

test('all257 exported mapped item balls hide only themselves, persist their source flags on re-entry/Continue and preserve full bags',async t=>{
 assert.equal(placements.length,257);assert.equal(new Set(placements.map(row=>row.script)).size,254);
 for(const row of placements){
  assert.equal(row.event.spriteId,'SPRITE_MONSTARBALL');assert.notEqual(row.event.eventFlag,'FLAG_NOTHING');assert.ok(data.constants[row.event.eventFlag]>0);assert.ok(Number.isInteger(row.map.constants[row.event.id]));
  const definition=definitions[row.script-7000],f=fixture(row),unrelated=structuredClone(f.objects.save(f.state.map).actors.filter(actor=>actor.id!==row.event.id));
  await f.run();assert.equal(f.state.bag[definition.key],definition.quantity);assert.equal(f.state.flags[row.event.eventFlag],true);assert.equal(f.objects.snapshot().find(actor=>actor.id===row.event.id)!.visible,false);assert.deepEqual(f.objects.save(f.state.map).actors.filter(actor=>actor.id!==row.event.id),unrelated);assert.equal(f.state.vars.VAR_SPECIAL_LAST_TALKED,row.map.constants[row.event.id]);
  const continued=JSON.parse(JSON.stringify(f.state)),reentered=new FieldObjects(data,continued);reentered.load(row.map.events.objects);assert.equal(reentered.snapshot().find(actor=>actor.id===row.event.id)!.visible,false);assert.equal(continued.bag[definition.key],definition.quantity);
  const denied=fixture(row);denied.state.bag[definition.key]=maximum(definition.key);await denied.run();assert.equal(denied.objects.snapshot().find(actor=>actor.id===row.event.id)!.visible,true);assert.notEqual(denied.state.flags[row.event.eventFlag],true);assert.equal(denied.state.bag[definition.key],maximum(definition.key));
 }
 t.diagnostic('257 success +257 full-bag mapped actions, all source hide flags and event IDs covered;254 distinct standard IDs');
});

test('the actual saturated native Items pocket rejects a new source item without deleting its ball or altering existing stacks',async()=>{
 const definition=definitions.find(row=>data.items.find(item=>item.item===row.key)!.fieldPocket==='POCKET_ITEMS')!,f=fixture(synthetic(definition.script)),others=data.items.filter(row=>row.fieldPocket==='POCKET_ITEMS'&&row.item!==definition.key&&row.item!=='ITEM_NONE').slice(0,data.constants.NUM_BAG_ITEMS);
 assert.equal(others.length,data.constants.NUM_BAG_ITEMS);f.state.bag=Object.fromEntries(others.map(row=>[row.item,1]));const before=structuredClone(f.state.bag);await f.run();assert.deepEqual(f.state.bag,before);assert.equal(f.state.vars.VAR_SPECIAL_RESULT,0);assert.equal(f.objects.snapshot()[0].visible,true);assert.equal(f.trace.some(row=>row[0]==='visible'),false);
});

test('all four local source pickups also support success, persistence, full bag and late failure/retry; Oak script0 balls stay displays',async t=>{
 assert.equal(localPickups.length,4);assert.deepEqual(localPickups.map(row=>row.map.id).sort(),[513,88,88,88]);
 for(const row of localPickups){
  const start=row.map.scripts.labels[row.map.scripts.entries[row.script-1]],prefix=row.map.scripts.instructions.slice(start,start+5),item=id(row.map,prefix.find(command=>command[0]==='SetVar'&&command[1][0]==='VAR_SPECIAL_x8008')![1][1]),key=data.items.find(record=>data.constants[record.item]===item)!.item;
  const f=fixture(row);await f.run();assert.deepEqual(f.state.bag,{[key]:1});assert.equal(f.state.flags[row.event.eventFlag],true);assert.equal(f.vm.lastUnsupported,null);assert.equal(f.objects.snapshot().find(actor=>actor.id===row.event.id)!.visible,false);
  const saved=JSON.parse(JSON.stringify(f.state)),reloaded=new FieldObjects(data,saved);reloaded.load(row.map.events.objects);assert.equal(reloaded.snapshot().find(actor=>actor.id===row.event.id)!.visible,false);
  const full=fixture(row);full.state.bag[key]=maximum(key);await full.run();assert.deepEqual(full.state.bag,{[key]:maximum(key)});assert.equal(full.state.vars.VAR_SPECIAL_RESULT,0);assert.equal(full.objects.snapshot().find(actor=>actor.id===row.event.id)!.visible,true);assert.equal(full.trace.some(command=>command[0]==='visible'),false);
  const failed=fixture(row),before=structuredClone(failed.state),actors=structuredClone(failed.objects.save(failed.state.map));let once=true;failed.controls.message=()=>{if(once){once=false;throw Error('local pickup print failed');}};await assert.rejects(failed.run(),/local pickup print failed/);assert.deepEqual(failed.state,before);assert.deepEqual(failed.objects.save(failed.state.map),actors);await failed.run();assert.equal(failed.state.bag[key],1);
 }
 const displays=maps.flatMap(map=>map.events.objects.filter(event=>event.spriteId==='SPRITE_MONSTARBALL'&&!isItemBallObject(map,event.id)).map(event=>({map,event})));assert.equal(displays.length,3);for(const row of displays){assert.equal(row.map.id,505);assert.equal(row.event.scriptId,0);}
 t.diagnostic('All264 source ball objects classified:261 genuine pickups (257 standard +4 local),3 script0 Oak starter displays');
});

test('late message/final-refresh failures restore the whole State and exact preexisting shown/facing/position records before retry',async()=>{
 for(const override of[false,true])for(const phase of['first-message','second-message','final-refresh']){
  const f=fixture(),definition=definitions[f.row.script-7000],actor=f.objects.get(f.row.event.id)!;f.objects.position(actor.id,14,17,3);if(override){f.state.flags[actor.eventFlag]=true;f.objects.show(actor.id,true);}assert.equal(f.objects.snapshot().find(row=>row.id===actor.id)!.visible,true);
  const stateRef=f.state,before=structuredClone(f.state),actors=structuredClone(f.objects.save(f.state.map));let messages=0,failed=false;const failure=Error(phase);
  f.controls.message=()=>{if(!failed&&++messages===(phase==='first-message'?1:phase==='second-message'?2:-1)){failed=true;throw failure;}};
  f.controls.refresh=()=>{if(!failed&&phase==='final-refresh'&&(f.state.bag[definition.key]??0)>0){failed=true;throw failure;}};
  await assert.rejects(f.run(),error=>error===failure);assert.equal(f.state,stateRef);assert.deepEqual(f.state,before);assert.deepEqual(f.objects.save(f.state.map),actors);assert.equal(f.objects.snapshot().find(row=>row.id===actor.id)!.visible,true);assert.equal(f.vm.busy,false);
  await f.run();assert.equal(f.state.bag[definition.key],definition.quantity);assert.equal(f.objects.snapshot().find(row=>row.id===actor.id)!.visible,false);
 }
});

test('recovery refresh failure preserves restored State and reports both errors instead of silently declaring a pickup complete',async()=>{
 const f=fixture(),before=structuredClone(f.state),actors=structuredClone(f.objects.save(f.state.map)),action=Error('pickup failed'),refresh=Error('redraw failed');
 await assert.rejects(runItemBallPickup(f.state,f.objects,async()=>{f.state.bag.ITEM_POTION=1;f.objects.show(f.row.event.id,false);throw action;},async()=>{throw refresh;}),error=>error instanceof AggregateError&&error.errors[0]===action&&error.errors[1]===refresh);
 assert.deepEqual(f.state,before);assert.deepEqual(f.objects.save(f.state.map),actors);
});

test('all100 generated TM/HM entries match literal native item.c order and inclusive command boundaries',async()=>{
 const source=await readFile(new URL('../../../src/item.c',import.meta.url),'utf8'),body=source.match(/static const u16 sTMHMMoves\[\] = \{([\s\S]*?)\n\};/)![1],expected=[...body.matchAll(/^\s*(MOVE_\w+)\s*,/gm)].map(match=>data.constants[match[1]]),table=await sourceJSON<number[]>('tmhm-moves.json');assert.equal(expected.length,100);assert.deepEqual(table,expected);
 for(let offset=0;offset<expected.length;offset++){
  const item=data.constants.ITEM_TM01+offset;assert.equal(await tmhmMove(data,item),expected[offset]);
  const f=fixture(),local={...f.row.map,scripts:{entries:['start'],labels:{start:0},instructions:[['SetVar',['VAR_SPECIAL_x8004',String(item)]],['BufferTMHMMoveName',['2','VAR_SPECIAL_x8004']],['NPCMsg',['Move: {STRVAR_1 2, 2, 0}']],['End',[]]]}}as SourceMap;await f.vm.run(local,1);assert.equal(f.vm.buffers[2],moveName(data,expected[offset]));assert.ok(f.trace.some(row=>row[0]==='message'&&row[1]==='Move: '+moveName(data,expected[offset])));
 }
 for(const item of[327,328,419,420,427,428]){const f=fixture();const local={...f.row.map,scripts:{entries:['start'],labels:{start:0},instructions:[['SetVar',['VAR_SPECIAL_x8004',String(item)]],['ItemIsTMOrHM',['VAR_SPECIAL_x8004','VAR_SPECIAL_RESULT']],['End',[]]]}}as SourceMap;await f.vm.run(local,1);assert.equal(f.state.vars.VAR_SPECIAL_RESULT,Number(item>=328&&item<=427));}
 assert.equal(await tmhmMove(data,327),data.constants.MOVE_NONE);assert.equal(await tmhmMove(data,428),data.constants.MOVE_NONE);
});

test('item script/fanfare reachable closure contains no warp, object creation or movement and uses only the declared native item source',async()=>{
 const reachable=(map:SourceMap,start:number)=>{const seen=new Set<number>(),todo=[start],commands=new Set<string>();while(todo.length){let pc=todo.pop()!;while(!seen.has(pc)){seen.add(pc);const instruction=map.scripts.instructions[pc++];assert.ok(instruction);const[cmd,args]=instruction;commands.add(cmd);if(cmd==='End'||cmd==='Return')break;if(cmd==='Call'||cmd==='GoTo'||/^(Call|GoTo)If/.test(cmd))todo.push(map.scripts.labels[args[0]]);if(cmd==='Case')todo.push(map.scripts.labels[args[1]]);if(cmd==='GoTo')break;}}return commands;};
 const fanfare=await sourceJSON<SourceMap>('scripts/0003.json'),std=data.constants.std_hidden_item_fanfare,commands=reachable(fanfare,fanfare.scripts.labels[fanfare.scripts.entries[std-2000]]),localCommands=localPickups.flatMap(row=>[...reachable(row.map,row.map.scripts.labels[row.map.scripts.entries[row.script-1]])]);
 const all=[...common.scripts.instructions.map(row=>row[0]),...commands,...localCommands];for(const forbidden of['Warp','ApplyMovement','MovePerson','MovePersonFacing','ShowPerson','GiveMon'])assert.ok(!all.includes(forbidden),forbidden);
 assert.deepEqual([...new Set(common.scripts.instructions.filter(row=>row[0]==='CallStd').map(row=>row[1][0]))],['std_hidden_item_fanfare']);assert.ok(!commands.has('CallStd'));
 assert.equal(isItemBallStandard(6999),false);assert.equal(isItemBallStandard(7000),true);assert.equal(isItemBallStandard(7255),true);assert.equal(isItemBallStandard(7256),false);
});

test('HidePerson sets real delete flags, retains FLAG_NOTHING local hiding and leaves broader ShowPerson flag behavior unchanged',()=>{
 const f=fixture(),event=f.row.event;f.objects.show(event.id,false);assert.equal(f.state.flags[event.eventFlag],true);assert.equal(f.objects.get(event.id)!.shown,undefined);f.objects.load(f.row.map.events.objects);assert.equal(f.objects.snapshot().find(row=>row.id===event.id)!.visible,false);
 f.objects.show(event.id,true);assert.equal(f.state.flags[event.eventFlag],true,'no invented global flag clear');assert.equal(f.objects.get(event.id)!.shown,true);
 const noflag={...event,id:'obj_no_flag',eventFlag:'FLAG_NOTHING'};f.objects.load([noflag]);f.objects.show(noflag.id,false);assert.equal(f.objects.get(noflag.id)!.shown,false);assert.equal(f.state.flags.FLAG_NOTHING,undefined);
});

test('only the exact16px item-ball family receives source-relative sizing; other NPC and follower sizes remain unchanged',()=>{
 assert.equal(data.sprites.SPRITE_MONSTARBALL.height,16);assert.equal(data.sprites.SPRITE_HERO.height,32);assert.equal(fieldSpriteHeight('SPRITE_MONSTARBALL',data.sprites),1);assert.equal(fieldSpriteHeight('SPRITE_HERO',data.sprites),2);
 for(const key of Object.keys(data.sprites))if(key!=='SPRITE_MONSTARBALL')assert.equal(fieldSpriteHeight(key,data.sprites,1.4),1.4);
 assert.equal(fieldSpriteHeight('SPRITE_MONSTARBALL',{}),2);
});
