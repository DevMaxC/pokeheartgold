import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadData,newState,createMon} from './data.ts';
import {ScriptVM,UnsupportedScript,type ScriptHooks} from './script.ts';
import {sourceJSON,type SourceMap} from './types.ts';
import {addSpecialGameStat,gameStat,gameStatMaximum,giveBadge,countBadges} from './game-stats.ts';
import {NATIVE_GAME_STAT_RULES as rules} from './game-stat-rules.ts';
import {trainerDefeated,TRAINER_FLAG_BASE} from './trainer-script-state.ts';
import {takeBagItem} from './bag.ts';

globalThis.fetch=async input=>{try{return new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));}catch{return new Response('',{status:404});}};
const data=await loadData();
async function fixture(){
 const map=await sourceJSON<SourceMap>('maps/135.json'),npc=map.events.objects.find(n=>n.spriteId==='SPRITE_GSLEADER1')!;assert.ok(npc);const state=newState(data,'Case','girl');state.map=135;state.flags.FLAG_HIDE_NEW_BARK_FRIENDS_ROOM_FRIEND=true;
 const messages:string[]=[],battles:{id:number;options:Parameters<ScriptHooks['battle']>[1]}[]=[];let won=true,whiteouts=0;
 const hooks:ScriptHooks={message:async text=>{messages.push(text);},choice:async()=>0,move:async()=>{},position:()=>{},face:()=>{},visible:()=>{},chooseStarter:async()=>{},nickname:async()=>1,refresh:async()=>{},battle:async(id,options)=>{battles.push({id,options});return won;},warp:async()=>{},whiteOut:async()=>{whiteouts++;}};
 let active=state;const run=()=>new ScriptVM(data,active,hooks).run(map,npc.scriptId,npc.id);
 return{state,map,npc,hooks,messages,battles,run,win:(value:boolean)=>{won=value;},whiteouts:()=>whiteouts,reload:()=>{active=JSON.parse(JSON.stringify(active));return active;}};
}
function assertVictoryFlags(state:ReturnType<typeof newState>){
 assert.deepEqual(state.badges,[data.constants.BADGE_ZEPHYR]);assert.equal(gameStat(state,data.constants.GAME_STAT_SCORE),30);assert.equal(state.gameStats?.[data.constants.SCORE_EVENT_BADGE_GET],undefined,'event22 is not a separate score counter');
 for(const trainer of['TRAINER_BIRD_KEEPER_GS_ABE','TRAINER_BIRD_KEEPER_GS_ROD']){assert.equal(trainerDefeated(state,data.constants[trainer]),true);assert.equal(state.flags['#'+(TRAINER_FLAG_BASE+data.constants[trainer])],true);}
 for(const flag of['FLAG_UNK_192','FLAG_UNK_0F4','FLAG_HIDE_WIFI_CLUB_CLOSED_LADY'])assert.equal(state.flags[flag],true);
 for(const[key,value]of[['VAR_SCENE_VIOLET_CITY_OW',1],['VAR_SCENE_ELMS_LAB',6]]as const){assert.equal(state.vars[key],value);assert.equal(state.vars['#'+data.constants[key]],value);}
}
test('actual0859 reward script consumes a reported victory, grants native badge/30score/flags and delivers TM51 through COMMON0003',async()=>{
 const f=await fixture();await f.run();assert.deepEqual(f.battles,[{id:data.constants.TRAINER_LEADER_FALKNER_FALKNER,options:{second:0,canLose:false,suppressFollower:false}}]);assertVictoryFlags(f.state);assert.equal(f.state.bag.ITEM_TM51,1);assert.equal(f.state.flags.FLAG_GOT_TM51_FROM_FALKNER,true);assert.equal(f.state.flags.FLAG_HIDE_NEW_BARK_FRIENDS_ROOM_FRIEND,false);assert.ok(f.messages.some(text=>text.includes('Case received\nthe Zephyr Badge')));assert.ok(f.messages.some(text=>text.includes('TM51 contains Roost')));assert.ok(!f.messages.join('').includes('STRVAR'));
});
test('actual reported loss whiteouts without badge, score, defeated gym trainers or post-victory scene/quest flags',async()=>{
 const f=await fixture();f.win(false);await f.run();assert.equal(f.whiteouts(),1);assert.deepEqual(f.state.badges,[]);assert.equal(gameStat(f.state,2),0);assert.equal(f.state.vars.VAR_BATTLE_RESULT,2);assert.equal(f.state.vars.VAR_SCENE_ELMS_LAB,undefined);assert.equal(f.state.flags.FLAG_GOT_TM51_FROM_FALKNER,undefined);assert.equal(f.state.flags.FLAG_UNK_192,undefined);assert.equal(trainerDefeated(f.state,data.constants.TRAINER_BIRD_KEEPER_GS_ABE),false);assert.equal(f.state.bag.ITEM_TM51,undefined);
});
test('a rejected battle host cannot cross the actual reward boundary',async()=>{
 const f=await fixture();f.hooks.battle=async()=>{throw Error('battle failed');};await assert.rejects(f.run(),/battle failed/);assert.deepEqual(f.state.badges,[]);assert.equal(gameStat(f.state,2),0);assert.equal(f.state.flags.FLAG_GOT_TM51_FROM_FALKNER,undefined);assert.equal(f.state.bag.ITEM_TM51,undefined);
});
test('full native TM stack retains earned badge/story changes but defers item/friend flag; persisted retry never battles or awards score twice',async()=>{
 const f=await fixture();f.state.bag.ITEM_TM51=data.constants.BAG_TMHM_QUANTITY_MAX;await f.run();assertVictoryFlags(f.state);assert.equal(f.state.bag.ITEM_TM51,99);assert.equal(f.state.flags.FLAG_GOT_TM51_FROM_FALKNER,undefined);assert.equal(f.state.flags.FLAG_HIDE_NEW_BARK_FRIENDS_ROOM_FRIEND,true);assert.ok(f.messages.at(-1)?.includes('Bag is full'));
 const restored=f.reload();assert.equal(takeBagItem(restored.bag,'ITEM_TM51',1),true);await f.run();assertVictoryFlags(restored);assert.equal(restored.bag.ITEM_TM51,99);assert.equal(restored.flags.FLAG_GOT_TM51_FROM_FALKNER,true);assert.equal(restored.flags.FLAG_HIDE_NEW_BARK_FRIENDS_ROOM_FRIEND,false);assert.equal(f.battles.length,1);await f.run();assert.equal(f.battles.length,1);assert.equal(restored.bag.ITEM_TM51,99);assert.equal(gameStat(restored,2),30);
});
test('accepted native rewards persist and repeat conversation gives the original after-badge text without another gift or score',async()=>{
 const f=await fixture();await f.run();const restored=f.reload();f.messages.length=0;await f.run();assertVictoryFlags(restored);assert.equal(restored.bag.ITEM_TM51,1);assert.equal(f.battles.length,1);assert.ok(f.messages[0].includes('greatest Bird Keeper'));
});
test('native imported40-event weights and149 stat-width flags match exact C/header hashes and source arrays',async()=>{
 const root=new URL('../../../',import.meta.url);for(const source of rules.sources)assert.equal(createHash('sha256').update(await readFile(new URL(source.path,root))).digest('hex'),source.sha256);
 const c=await readFile(new URL('src/game_stats.c',root),'utf8'),array=(name:string)=>c.match(new RegExp('\\b'+name+'\\[\\]\\s*=\\s*\\{(.*?)\\};','s'))![1].match(/\b(?:\d+|TRUE|FALSE)\b/g)!;
 assert.deepEqual([...rules.scoreModifiers],array('sScoreMods').map(Number));assert.deepEqual([...rules.extraWide],array('sIsExtraWide').map(value=>value==='TRUE'));assert.equal(rules.scoreModifiers.length,40);assert.equal(rules.extraWide.length,149);assert.equal(rules.scoreModifiers[data.constants.SCORE_EVENT_BADGE_GET],30);
});
test('native score uses event weights, the99,999,999 cap and absent legacy counters; no per-event counter is fabricated',()=>{
 const state=newState(data,'Case','boy');delete state.gameStats;assert.equal(addSpecialGameStat(state,22),30);assert.equal(addSpecialGameStat(state,25),530);assert.equal(addSpecialGameStat(state,26),10530);
 for(const current of[99999969,99999970,99999999,999999999]){state.gameStats![2]=current;assert.equal(addSpecialGameStat(state,22),99999999);}assert.equal(gameStatMaximum(2),999999999);assert.equal(gameStatMaximum(4),999999);assert.equal(gameStatMaximum(72),65535);assert.equal(gameStatMaximum(74),9999);const before=structuredClone(state);assert.throws(()=>addSpecialGameStat(state,40));assert.deepEqual(state,before);
});
test('GiveBadge and SetTrainerFlag resolve VAR operands while AddSpecialGameStat/2 require their native literal event ABI',async()=>{
 const f=await fixture();f.map.scripts={entries:['start'],labels:{start:0},instructions:[['GiveBadge',['VAR_TEMP_x4000']],['SetTrainerFlag',['VAR_TEMP_x4001']],['CountBadges',['VAR_SPECIAL_RESULT']],['AddSpecialGameStat2',['SCORE_EVENT_BADGE_GET']],['End',[]]]};const vm=new ScriptVM(data,f.state,f.hooks);vm.set('VAR_TEMP_x4000',0);vm.set('VAR_TEMP_x4001',50);await vm.run(f.map,1);assert.deepEqual(f.state.badges,[0]);assert.equal(f.state.vars.VAR_SPECIAL_RESULT,1);assert.equal(trainerDefeated(f.state,50),true);assert.equal(gameStat(f.state,2),30);
 f.map.scripts.instructions=[['AddSpecialGameStat',['VAR_TEMP_x4000']],['End',[]]];vm.set('VAR_TEMP_x4000',22);await assert.rejects(vm.run(f.map,1),UnsupportedScript);assert.equal(vm.lastUnsupported?.command,'AddSpecialGameStat');assert.equal(gameStat(f.state,2),30);
});
test('all16 native badge bits are idempotent and invalid badge IDs cannot mutate the set',()=>{
 const state=newState(data,'Case','boy');for(let badge=0;badge<16;badge++){giveBadge(state,badge);giveBadge(state,badge);}assert.equal(countBadges(state),16);assert.deepEqual(state.badges,Array.from({length:16},(_,i)=>i));assert.throws(()=>giveBadge(state,16));assert.equal(countBadges(state),16);
});
test('the real post-badge Violet frame script completes Elm phone call and exposes the shop aide',async()=>{
 const f=await fixture();await f.run();const city=await sourceJSON<SourceMap>('maps/73.json');f.state.map=73;await new ScriptVM(data,f.state,f.hooks).run(city,'scr_seq_T22_000');assert.equal(f.state.flags.FLAG_GOT_PICK_UP_EGG_CALL_FROM_ELM,true);assert.equal(f.state.vars.VAR_SCENE_VIOLET_CITY_OW,2);assert.equal(f.state.flags.FLAG_HIDE_VIOLET_SHOP_LAB_AIDE,false);assert.equal(f.state.flags.FLAG_HIDE_ELMS_LAB_AIDE,true);assert.ok(f.messages.some(text=>/Egg/i.test(text)&&/assistant/i.test(text)));
});
test('accepting the actual aide gift gives a real Egg before advancing the original receipt and scene flags',async()=>{
 const f=await fixture();await f.run();const mart=await sourceJSON<SourceMap>('maps/157.json'),aide=mart.events.objects.find(n=>n.id.includes('assistantm'))!;assert.ok(aide);f.state.map=157;f.hooks.eggContext={random:()=>.5,now:()=>new Date(2026,9,17)};const vm=new ScriptVM(data,f.state,f.hooks);await vm.run(mart,aide.scriptId,aide.id);assert.equal(vm.lastUnsupported,null);assert.equal(f.state.party.length,1);assert.equal(f.state.party[0].isEgg,true);assert.equal(f.state.party[0].name,'Egg');assert.equal(f.state.flags.FLAG_GOT_EGG_FROM_ELMS_ASSISTANT,true);assert.equal(f.state.vars.VAR_SCENE_ELMS_LAB,7);assert.equal(f.state.vars.VAR_SCENE_VIOLET_CITY_OW,3);
});
test('the actual aide refusal and full-party retry branches finish without issuing or pretending to implement the Egg',async()=>{
 for(const full of[false,true]){const f=await fixture();const mart=await sourceJSON<SourceMap>('maps/157.json'),aide=mart.events.objects.find(n=>n.id.includes('assistantm'))!;f.state.map=157;f.hooks.choice=async()=>full?0:1;if(full)f.state.party=Array.from({length:6},()=>createMon(data,155,5,f.state.name,()=>.5));await new ScriptVM(data,f.state,f.hooks).run(mart,aide.scriptId,aide.id);assert.equal(f.state.flags.FLAG_UNK_06F,true);assert.equal(f.state.flags.FLAG_GOT_EGG_FROM_ELMS_ASSISTANT,undefined);assert.equal(f.state.party.length,full?6:0);assert.equal(f.state.vars.VAR_SCENE_VIOLET_CITY_OW,undefined);assert.ok(f.messages.at(-1)?.includes(full?'party is full':'say no'));}
});
