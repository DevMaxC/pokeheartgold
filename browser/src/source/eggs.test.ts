import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadData,newState,createMon,giveMon} from './data.ts';
import {sourceJSON,type SourceMap} from './types.ts';
import {ScriptVM,type ScriptHooks} from './script.ts';
import {SourceActionRecovery} from './script-recovery.ts';
import {advanceLCRNG,sampleUint32} from './native-rng.ts';
import {giveTogepiEgg,isOriginalTogepiGift,isUsableBattler,firstUsableBattlerIndex,firstFollowerMon,partyMonSpecies,nativeEggGender} from './eggs.ts';
globalThis.fetch=async input=>{try{return new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));}catch{return new Response('',{status:404});}};
const data=await loadData(),now=()=>new Date(2026,9,17,12);
function state(){const s=newState(data,'Case','girl',()=>0);s.trainerId=0xffffffff;s.nativeEggSeed=1;return s;}
const context={now,random:()=>{throw Error('Seeded Egg must not draw new browser entropy');}};
test('native four-draw seed1 fixture preserves unsigned PID, packed IV order, normal stats, Egg cycles/name and Extrasensory',()=>{
 const s=state();assert.equal(giveTogepiEgg(data,s,context),true);const egg=s.party[0];assert.equal(egg.personality,0xac2141c6);assert.ok(egg.personality>0x7fffffff);assert.equal(s.nativeEggSeed,0x1fb75cf5);assert.deepEqual(egg.ivs,[14,23,20,23,29,7]);assert.equal(egg.nature,egg.personality%25);assert.equal(egg.gender,'male');assert.equal(egg.isEgg,true);assert.equal(egg.species,175);assert.equal(egg.level,1);assert.equal(egg.name,'Egg');assert.equal(egg.friendship,10);assert.deepEqual(egg.evs,[0,0,0,0,0,0]);assert.equal(egg.hp,11);assert.deepEqual(egg.moves.map(m=>m.id),[45,204,326]);for(const move of egg.moves)assert.equal(move.pp,data.moves[move.id].pp);assert.deepEqual(s.seen,[]);assert.deepEqual(s.caught,[]);assert.deepEqual(s.boxes,[]);
 assert.deepEqual(egg.provenance,{otId:0xffffffff,otGender:'girl',language:2,gameVersion:7,metLevel:0,pokeball:4,metLocation:0,metDate:{year:0,month:0,day:0},eggLocation:2013,eggDate:{year:26,month:10,day:17},fatefulEncounter:false});assert.deepEqual(s.togepiGiftIdentity,{personality:0xac2141c6,gender:'male'});assert.equal(egg.ot,'Case');
});
test('LCG matches native u32 arithmetic, including high seeds, and browser seeds/profile IDs use the entire uint32 range',()=>{
 for(const seed of[0,1,0x80000000,0xffffffff]){const exact=Number((BigInt(seed)*1103515245n+24691n)&0xffffffffn),result=advanceLCRNG(seed);assert.equal(result.seed,exact);assert.equal(result.value,Math.floor(exact/65536));assert.ok(result.value>=0&&result.value<=65535);}
 assert.equal(sampleUint32(()=>0),0);assert.equal(sampleUint32(()=>1-Number.EPSILON),0xffffffff);for(const bad of[-1,1,NaN,Infinity])assert.throws(()=>sampleUint32(()=>bad));assert.throws(()=>advanceLCRNG(-1));assert.throws(()=>advanceLCRNG(0x100000000));assert.equal(newState(data,'Case','boy',()=>1-Number.EPSILON).trainerId,0xffffffff);
});
test('gender uses the native31 boundary and native genderless/fixed-sex cases',()=>{
 assert.equal(nativeEggGender(.125,30),'female');assert.equal(nativeEggGender(.125,31),'male');assert.equal(nativeEggGender(.125,32),'male');assert.equal(nativeEggGender(0,0),'male');assert.equal(nativeEggGender(1,255),'female');assert.equal(nativeEggGender(2,0),'genderless');
});
test('full party is an exact non-award: no PC fallback, profile mutation, RNG/date calls or saved gift identity',()=>{
 const s=state();s.party=Array.from({length:6},()=>createMon(data,155,5,s.name,()=>.5));delete s.trainerId;delete s.nativeEggSeed;const before=structuredClone(s);assert.equal(giveTogepiEgg(data,s,{random:()=>{throw Error('capacity check must precede RNG');},now:()=>{throw Error('capacity check must precede RTC');}}),false);assert.deepEqual(s,before);
});
test('legacy saves lazily acquire one persisted trainer ID/seed; subsequent gift draws continue the saved LCG without fresh IDs',()=>{
 const s=state();delete s.trainerId;delete s.nativeEggSeed;const samples=[1-Number.EPSILON,1/0x100000000];let draws=0;giveTogepiEgg(data,s,{now,random:()=>{draws++;return samples.shift()!;}});assert.equal(draws,2);assert.equal(s.trainerId,0xffffffff);const restored=JSON.parse(JSON.stringify(s));giveTogepiEgg(data,restored,context);assert.equal(restored.trainerId,0xffffffff);assert.notEqual(restored.party[0].personality,restored.party[1].personality);assert.equal(restored.party[0].isEgg,true);assert.equal(restored.party[0].friendship,10);
});
test('native gift identity survives save/restore and evolutions but rejects every original OT/language/game/PID/gender mismatch',()=>{
 const s=state();giveTogepiEgg(data,s,context);const restored=JSON.parse(JSON.stringify(s)),egg=restored.party[0];assert.equal(isOriginalTogepiGift(data,restored,egg),true);
 for(const species of[175,176,468]){egg.species=species;assert.equal(isOriginalTogepiGift(data,restored,egg),true);}egg.species=175;
 for(const mutate of[(m:typeof egg)=>m.species=155,(m:typeof egg)=>m.provenance.otId=1,(m:typeof egg)=>m.provenance.otGender='boy',(m:typeof egg)=>m.provenance.language=1,(m:typeof egg)=>m.provenance.gameVersion=8,(m:typeof egg)=>m.personality=0,(m:typeof egg)=>m.gender='female']){const other=structuredClone(egg);mutate(other);assert.equal(isOriginalTogepiGift(data,restored,other),false);}delete restored.togepiGiftIdentity;assert.equal(isOriginalTogepiGift(data,restored,egg),false);
});
test('positive Egg HP cannot make it battle-usable, selectable as follower or visible to native party species queries; Pokédex stays untouched',()=>{
 const s=state();giveTogepiEgg(data,s,context);const egg=s.party[0],mon=createMon(data,155,5,s.name,()=>.5);assert.ok(egg.hp>0);assert.equal(isUsableBattler(egg),false);assert.equal(firstUsableBattlerIndex(s.party),-1);assert.equal(firstFollowerMon(s.party),undefined);assert.equal(partyMonSpecies(egg),0);s.party.push(mon);assert.equal(firstUsableBattlerIndex(s.party),1);assert.equal(firstFollowerMon(s.party),mon);mon.hp=0;assert.equal(firstUsableBattlerIndex(s.party),-1);assert.equal(firstFollowerMon(s.party),mon);const other=state();assert.equal(giveMon(other,structuredClone(egg)),true);assert.deepEqual(other.caught,[]);assert.deepEqual(other.seen,[]);
});
test('real aide acceptance runs native receipt text/flags and moves party5→6 with a saved unhatched Egg',async()=>{
 const s=state(),map=await sourceJSON<SourceMap>('maps/157.json'),aide=map.events.objects.find(n=>n.id.includes('assistantm'))!;s.map=157;s.party=Array.from({length:5},()=>createMon(data,155,5,s.name,()=>.5));const messages:string[]=[],visible:string[]=[];const hooks:ScriptHooks={message:async text=>{messages.push(text);},choice:async()=>0,move:async()=>{},position:()=>{},face:()=>{},visible:id=>{visible.push(id);},chooseStarter:async()=>{},nickname:async()=>{},refresh:async()=>{},battle:async()=>{throw Error('Egg gift cannot battle');},warp:async()=>{},eggContext:context};await new ScriptVM(data,s,hooks).run(map,aide.scriptId,aide.id);assert.equal(s.party.length,6);assert.equal(s.party[5].isEgg,true);assert.equal(s.flags.FLAG_GOT_EGG_FROM_ELMS_ASSISTANT,true);assert.equal(s.flags.FLAG_HIDE_VIOLET_SHOP_LAB_AIDE,true);assert.equal(s.flags.FLAG_HIDE_VIOLET_KIMONO_GIRL,false);assert.equal(s.flags.FLAG_HIDE_ELMS_LAB_AIDE,false);assert.equal(s.vars.VAR_SCENE_VIOLET_CITY_OW,3);assert.equal(s.vars.VAR_SCENE_ELMS_LAB,7);assert.ok(messages.some(text=>text.includes('Case received')&&text.includes('Egg')));assert.ok(visible.includes(aide.id));
});
test('VM Egg queries preserve native species masking, count and recorded gift identity',async()=>{
 const s=state();giveTogepiEgg(data,s,context);s.party.push(createMon(data,155,5,s.name,()=>.5));const map=await sourceJSON<SourceMap>('maps/157.json');map.scripts={entries:['start'],labels:{start:0},instructions:[['PartyCountEgg',['VAR_TEMP_x4000']],['PartyCountNotEgg',['VAR_TEMP_x4001']],['GetPartyMonSpecies',['0','VAR_TEMP_x4002']],['MonIsFromTogepiEgg',['0','VAR_TEMP_x4003']],['GetPartyLeadAlive',['VAR_TEMP_x4004']],['End',[]]]};const hooks:ScriptHooks={message:async()=>{},choice:async()=>0,move:async()=>{},position:()=>{},face:()=>{},visible:()=>{},chooseStarter:async()=>{},nickname:async()=>{},refresh:async()=>{},battle:async()=>true,warp:async()=>{}};await new ScriptVM(data,s,hooks).run(map,1);assert.deepEqual([0,1,2,3,4].map(i=>s.vars['VAR_TEMP_x400'+i]),[1,1,0,1,1]);
});
test('a failed original gift scene rolls back acquired Egg, saved PID, lazily initialized profile and LCG before retry',async()=>{
 const s=state();delete s.trainerId;delete s.nativeEggSeed;const before=structuredClone(s),recovery=new SourceActionRecovery(s,{capture:()=>({}),restore:async()=>{}});await assert.rejects(recovery.run(async()=>{giveTogepiEgg(data,s,{now,random:()=>.5});throw Error('later receipt scene failed');}),/later receipt scene failed/);assert.deepEqual(s,before);assert.equal(recovery.busy,false);giveTogepiEgg(data,s,{now,random:()=>.5});assert.equal(s.party.length,1);assert.equal(s.party[0].isEgg,true);
});
test('native Egg icon export retains original501 source hash,32x32frame and required C/header provenance',async()=>{
 const root=new URL('../../../',import.meta.url),meta=JSON.parse(await readFile(new URL('../../public/source/eggs/provenance.json',import.meta.url),'utf8'));assert.equal(meta.sourceIconIndex,501);assert.equal(meta.paletteBank,1);for(const source of meta.sources)assert.equal(createHash('sha256').update(await readFile(new URL(source.path,root))).digest('hex'),source.sha256);const image=await readFile(new URL('../../public/source/eggs/egg-icon.png',import.meta.url));assert.equal(image.readUInt32BE(16),32);assert.equal(image.readUInt32BE(20),32);
});
