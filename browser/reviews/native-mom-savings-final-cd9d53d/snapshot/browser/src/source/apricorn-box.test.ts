import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData,newState} from './data.ts';
import {ScriptVM,UnsupportedScript,type ScriptHooks} from './script.ts';
import {SourceActionRecovery} from './script-recovery.ts';
import {sourceJSON,type SourceMap} from './types.ts';
import {APRICORN_BALL_ITEMS,countApricorn,totalApricornCount,giveApricorn,takeApricorn,giveApricornFromTree,setKurtApricorn,kurtApricornQuantity,kurtBall,clearKurtApricorn} from './apricorn-box.ts';

globalThis.fetch=async input=>{try{return new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));}catch{return new Response('',{status:404});}};
const data=await loadData(),map=await sourceJSON<SourceMap>('maps/164.json');
function fixture(){
  const state=newState(data,'Case','girl'),messages:string[]=[],moves:string[]=[];state.map=164;
  const hooks:ScriptHooks={message:async text=>{messages.push(text);},choice:async()=>0,move:async(_,label)=>{moves.push(label);},position:()=>{},face:()=>{},visible:()=>{},chooseStarter:async()=>{},nickname:async()=>{},refresh:async()=>{},battle:async()=>{throw Error('No battle in this source branch');},warp:async()=>{throw Error('No warp in this source branch');}};
  const vm=new ScriptVM(data,state,hooks);return{state,messages,moves,vm};
}

test('legacy absence reads native initialized zeros without inventing Bag-backed Apricorn stock',()=>{
  const f=fixture(),before=structuredClone(f.state);f.state.bag.ITEM_APRICORN_BOX=1;f.state.bag.ITEM_RED_APRICORN=99;
  for(let index=0;index<7;index++)assert.equal(countApricorn(f.state,index),0);assert.equal(totalApricornCount(f.state),0);assert.equal(kurtApricornQuantity(f.state),0);assert.equal(kurtBall(data,f.state),data.constants.ITEM_LEVEL_BALL);assert.equal(f.state.apricornBox,undefined);assert.deepEqual(f.state.party,before.party);
});

test('native seven-color counts, low-level saturation, strict tree capacity and failed removal remain distinct',()=>{
  const f=fixture();for(let index=0;index<7;index++)assert.equal(giveApricorn(f.state,index,index+1),index+1);assert.equal(totalApricornCount(f.state),28);assert.deepEqual(f.state.bag,{});
  assert.equal(giveApricorn(f.state,0,255),99);const before=f.state.apricornBox;assert.equal(giveApricornFromTree(f.state,0,1),false);assert.equal(f.state.apricornBox,before);assert.equal(takeApricorn(f.state,0,100),99);assert.equal(f.state.apricornBox,before);
  assert.equal(takeApricorn(f.state,0,3),96);assert.equal(giveApricornFromTree(f.state,0,3),true);assert.equal(countApricorn(f.state,0),99);assert.equal(giveApricornFromTree(f.state,0,0),true);
});

test('Kurt assignment takes submitted stock once, preserves other colors and clears without refunding',()=>{
  const f=fixture();giveApricorn(f.state,2,8);giveApricorn(f.state,6,3);assert.equal(setKurtApricorn(f.state,2,5),true);assert.equal(countApricorn(f.state,2),3);assert.equal(countApricorn(f.state,6),3);assert.equal(kurtApricornQuantity(f.state),5);assert.equal(kurtBall(data,f.state),data.constants.ITEM_LURE_BALL);
  const restored=JSON.parse(JSON.stringify(f.state));assert.equal(totalApricornCount(restored),6);assert.equal(kurtApricornQuantity(restored),5);const before=restored.apricornBox;assert.equal(setKurtApricorn(restored,2,4),false);assert.equal(restored.apricornBox,before);
  clearKurtApricorn(restored);assert.equal(kurtApricornQuantity(restored),0);assert.equal(kurtBall(data,restored),data.constants.ITEM_LEVEL_BALL);assert.deepEqual(restored.apricornBox.apricorns,[0,0,3,0,0,0,3]);assert.equal(f.state.apricornBox!.kurtQuantity,5,'JSON restored instance is independent');
});

test('native Ball table and invalid-u8-color fallback are preserved rather than hardcoded to one reward',async()=>{
  const f=fixture();for(let index=0;index<7;index++){giveApricorn(f.state,index,2);assert.equal(setKurtApricorn(f.state,index,2),true);assert.equal(kurtBall(data,f.state),data.constants[APRICORN_BALL_ITEMS[index]]);}
  for(const invalid of[7,255]){f.state.apricornBox!.kurtApricorn=invalid;assert.equal(kurtBall(data,f.state),data.constants.ITEM_POKE_BALL);}
  const source=await readFile(new URL('../../../asm/apricorn_box_data.s',import.meta.url),'utf8'),native=source.split('gApricornBallItems:')[1].split('.public')[0].match(/ITEM_\w+/g);assert.deepEqual(native,[...APRICORN_BALL_ITEMS]);
});

test('malformed saves and out-of-range arguments fail before any count, job or Bag changes',()=>{
  for(const saved of[{apricorns:[0,0],kurtQuantity:0,kurtApricorn:0},{apricorns:Array(7),kurtQuantity:0,kurtApricorn:0},{apricorns:[100,0,0,0,0,0,0],kurtQuantity:0,kurtApricorn:0},{apricorns:[0,0,0,0,0,0,0],kurtQuantity:100,kurtApricorn:0},{apricorns:[0,0,0,0,0,0,0],kurtQuantity:0,kurtApricorn:256}]){
    const f=fixture();f.state.apricornBox=saved;const before=structuredClone(f.state);assert.throws(()=>totalApricornCount(f.state),/Invalid saved/);assert.throws(()=>clearKurtApricorn(f.state),/Invalid saved/);assert.deepEqual(f.state,before);
  }
  const f=fixture();for(const index of[-1,7,.5,NaN])assert.throws(()=>giveApricorn(f.state,index,1),RangeError);for(const quantity of[-1,256,.5,NaN])assert.throws(()=>giveApricorn(f.state,0,quantity),RangeError);assert.equal(f.state.apricornBox,undefined);
});

test('actual forced Kurt005 empty-box scene gives Fast Ball and reaches original phone registration without unsupported queries',async()=>{
  const f=fixture();f.vm.set('VAR_UNK_4080',2);await f.vm.run(map,'scr_seq_T23R0501_005');assert.equal(f.vm.lastUnsupported,null);assert.equal(f.state.bag.ITEM_FAST_BALL,1);assert.equal(f.state.flags.FLAG_UNK_07C,true);assert.equal(f.state.vars.VAR_UNK_4080,4);assert.ok(f.state.pokegear?.contacts.includes('PHONE_CONTACT_KURT'));assert.equal(f.state.apricornBox,undefined,'read-only zero queries do not invent a crafting job');
  const frame=map.initTriggers.find(t=>f.vm.value(t.var,map)===t.value);assert.equal(frame,undefined);await f.vm.run(map,'scr_seq_T23R0501_001');assert.equal(f.state.bag.ITEM_FAST_BALL,1,'normal repeat conversation does not grant the one-time scene reward');
});

test('actual populated Kurt jobs survive waiting and return their real Ball type/count then clear on collection',async()=>{
  const waiting=fixture();giveApricorn(waiting.state,6,5);setKurtApricorn(waiting.state,6,3);waiting.state.flags.FLAG_UNK_07C=true;waiting.state.flags.FLAG_DAILY_KURT_MAKING_BALLS=true;const before=structuredClone(waiting.state.apricornBox);await waiting.vm.run(map,'scr_seq_T23R0501_001');assert.deepEqual(waiting.state.apricornBox,before);assert.equal(waiting.state.bag.ITEM_HEAVY_BALL,undefined);
  waiting.state.flags.FLAG_DAILY_KURT_MAKING_BALLS=false;await waiting.vm.run(map,'scr_seq_T23R0501_001');assert.equal(waiting.state.bag.ITEM_HEAVY_BALL,3);assert.equal(countApricorn(waiting.state,6),2);assert.equal(kurtApricornQuantity(waiting.state),0);assert.equal(waiting.state.vars.VAR_UNK_413B,1);await assert.rejects(waiting.vm.run(map,'scr_seq_T23R0501_001'),error=>error instanceof UnsupportedScript&&error.command==='LaunchApricornBoxForKurt');assert.equal(waiting.state.bag.ITEM_HEAVY_BALL,3);
});

test('a populated inventory reaches explicitly unsupported selection instead of being faked empty',async()=>{
  const f=fixture();giveApricorn(f.state,0,1);f.state.flags.FLAG_UNK_07C=true;const before=structuredClone(f.state);await assert.rejects(f.vm.run(map,'scr_seq_T23R0501_001'),error=>error instanceof UnsupportedScript&&error.command==='LaunchApricornBoxForKurt');assert.deepEqual(f.state.apricornBox,before.apricornBox);assert.deepEqual(f.state.bag,before.bag);
});

test('actual Kurt collection failure after clearing the job rolls back box, Bag and source vars through production recovery',async()=>{
  const f=fixture();f.state.flags.FLAG_UNK_07C=true;f.state.apricornBox={apricorns:[0,0,0,0,0,0,0],kurtQuantity:4,kurtApricorn:3};const snapshot=structuredClone(f.state),failure=Error('receipt message failed');let restored=0,sawCleared=false;
  const recovery=new SourceActionRecovery(f.state,{capture:()=>({map:f.state.map}),restore:async()=>{restored++;}});
  f.vm.hooks.message=async()=>{if(f.state.bag.ITEM_FRIEND_BALL===4&&kurtApricornQuantity(f.state)===0){sawCleared=true;throw failure;}};
  await assert.rejects(recovery.run(()=>f.vm.run(map,'scr_seq_T23R0501_001')),error=>error===failure);assert.equal(sawCleared,true);assert.equal(restored,1);assert.deepEqual(f.state,snapshot);assert.equal(kurtApricornQuantity(f.state),4);assert.equal(recovery.busy,false);assert.equal(f.vm.state,f.state);
});

test('native storage and four query ABIs retain seven independent bytes and source zero initialization',async()=>{
  const root=new URL('../../../',import.meta.url),internal=await readFile(new URL('include/apricorn_internal.h',root),'utf8'),native=await readFile(new URL('src/apricorn_box.c',root),'utf8'),commands=await readFile(new URL('src/field/scrcmd_pokemon_misc.c',root),'utf8');
  assert.match(internal,/u8 apricorns\[7\];\s*u8 kurtQuantity;\s*u8 kurtApricorn;/);assert.match(native,/MI_CpuFill8\(apricornBox, 0, sizeof\(SaveApricornBox\)\);/);assert.match(native,/quantity > 99/);assert.match(commands,/ScrCmd_GetTotalApricornCount[\s\S]*?i < 7/);
  for(const command of['GetKurtApricornQuantity','GetTotalApricornCount','GetKurtBall'])assert.match(commands,new RegExp('ScrCmd_'+command+'\\(ScriptContext \\*ctx\\) \\{[\\s\\S]*?ScriptGetVarPointer\\(ctx\\)'));
  assert.match(commands,/ScrCmd_ClearKurtApricorn[\s\S]*?ApricornBox_SetKurtApricorn\(Save_ApricornBox_Get\(ctx->fieldSystem->saveData\), 0, 0\);/);
});
