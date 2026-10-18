import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Battle} from './battle.ts';
import {loadData,newState,createMon,calculateStats} from './data.ts';
import type {Mon} from './types.ts';
import type {UI} from './ui.ts';
globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData();
function fixture(words:number[]=[],level=80){
 const state=newState(data,'Ethan','boy',()=>.5),mon=createMon(data,95,level,'Rudy',()=>.5),foe=createMon(data,16,5,'',()=>.5);
 // Original trade0 OT/PID/IV identity; source factory coverage is separate.
 Object.assign(mon,{name:'Rocky',hasNickname:true,personality:9711,nature:9711%25,ivs:[25,20,25,15,15,15],provenance:{otId:48926,otGender:'boy',language:2,gameVersion:7,metLevel:level,pokeball:4,metLocation:2001,metDate:{year:26,month:10,day:17},eggLocation:0,eggDate:{year:0,month:0,day:0},fatefulEncounter:false}});
 Object.assign(mon,calculateStats(data.personal[95],level,mon.ivs,mon.evs,mon.nature));mon.hp=mon.maxHP;
 mon.moves=[{id:data.constants.MOVE_HARDEN,pp:30,maxPP:30}];state.party=[mon];let reads=0;
 const messages:string[]=[],battle=new Battle(data,state,{} as UI,()=>{const at=reads++;if(at>=words.length)throw Error('Unexpected RNG draw '+at);return words[at]/65536;});
 Reflect.set(battle,'enemies',[foe]);Reflect.set(battle,'say',async(text:string)=>{messages.push(text);});Reflect.set(battle,'draw',()=>{});
 return{state,mon,foe,battle,messages,reads:()=>reads,attack:(slot=0,player=true)=>Reflect.get(battle,'attack').call(battle,player,slot)};
}

test('actual attack obeys original trainer, eight badges and explicit legacy identity with no obedience draw',async()=>{
 for(const kind of['original','badges','legacy'] as const){const f=fixture([],100);if(kind==='original'){f.mon.ot=f.state.name;f.mon.provenance!.otId=f.state.trainerId!;f.mon.provenance!.otGender=f.state.gender;}if(kind==='badges')f.state.badges=[0,1,2,3,4,5,6,7];if(kind==='legacy')delete f.mon.provenance;await f.attack();assert.equal(f.reads(),0);assert.equal(f.mon.moves[0].pp,29);assert.equal(Reflect.get(f.battle,'playerStages').def,1);assert.ok(f.messages.includes('Rocky used Harden!'));}
});

test('actual traded Rocky loafs without PP/HP changes and consumes the native fourth-message draw',async()=>{
 const f=fixture([255,255,255,3]),before=structuredClone(f.mon),foe=structuredClone(f.foe);await f.attack();assert.deepEqual(f.mon,before);assert.deepEqual(f.foe,foe);assert.deepEqual(f.messages,['Rocky pretended not to notice!']);assert.equal(f.reads(),4);
});

test('actual trade disobedience nap uses native Random3,2 and bypasses the selected move',async()=>{
 const f=fixture([255,255,0,15]),hp=f.mon.hp;await f.attack();assert.equal(f.mon.status,'SLP');assert.equal(f.mon.sleepTurns,5);assert.equal(f.mon.hp,hp);assert.equal(f.mon.moves[0].pp,30);assert.equal(f.reads(),4);assert.deepEqual(f.messages,['Rocky began to nap!','Rocky fell asleep!']);
});

test('actual self-hit damages only Rocky, spends no PP and follows controller34 Rage cleanup',async()=>{
 const f=fixture([255,255,100,15]),hp=f.mon.hp,foe=structuredClone(f.foe);Reflect.get(f.battle,'volatile').call(f.battle,f.mon).status2=1<<23;Reflect.get(f.battle,'raging').add(f.mon);await f.attack();assert.ok(f.mon.hp<hp&&f.mon.hp>0);assert.deepEqual(f.foe,foe);assert.equal(f.mon.moves[0].pp,30);assert.equal(f.reads(),4);assert.equal(Reflect.get(f.battle,'volatile').call(f.battle,f.mon).status2&(1<<23),0);assert.deepEqual(f.messages,['Rocky won’t obey!','It hurt itself in its confusion!']);
});

test('actual alternate-move branch rejects selected/empty slots, spends only replacement PP, and clears selected Rage',async()=>{
 const f=fixture([255,0,0,1]);f.mon.moves.unshift({id:data.constants.MOVE_RAGE,pp:20,maxPP:20});Reflect.get(f.battle,'volatile').call(f.battle,f.mon).status2=1<<23;Reflect.get(f.battle,'raging').add(f.mon);const foe=structuredClone(f.foe);await f.attack();assert.deepEqual(f.messages,['Rocky ignored orders!','Rocky used Harden!','Rocky’s Defense rose!']);assert.equal(f.mon.moves[0].pp,20);assert.equal(f.mon.moves[1].pp,29);assert.equal(f.reads(),4);assert.deepEqual(f.foe,foe);assert.equal(Reflect.get(f.battle,'playerStages').def,1);assert.equal(Reflect.get(f.battle,'selectedMoveSlots').get(f.mon),1);assert.equal(Reflect.get(f.battle,'volatile').call(f.battle,f.mon).status2&(1<<23),0);
});

test('actual no-alternative branch goes to native message without spending selected PP',async()=>{
 const f=fixture([255,0,2]);await f.attack();assert.deepEqual(f.messages,['Rocky turned away!']);assert.equal(f.mon.moves[0].pp,30);assert.equal(f.reads(),3);
});

test('status inability precedes obedience and malformed present identity precedes even status RNG/state',async()=>{
 const asleep=fixture([]);asleep.mon.status='SLP';asleep.mon.sleepTurns=2;await asleep.attack();assert.equal(asleep.mon.sleepTurns,1);assert.deepEqual(asleep.messages,['Rocky is fast asleep.']);assert.equal(asleep.reads(),0);assert.equal(asleep.mon.moves[0].pp,30);
 const bad=fixture([]);bad.mon.provenance!.otId=-1;bad.mon.status='SLP';bad.mon.sleepTurns=2;const before=structuredClone(bad.mon);await assert.rejects(bad.attack(),/Malformed present native Mon OT identity/);assert.deepEqual(bad.mon,before);assert.equal(bad.reads(),0);
});

test('opposing actor bypasses player obedience and original supplied level10 Rocky obeys before badge1',async()=>{
 const f=fixture([]);f.foe.moves=[{id:data.constants.MOVE_HARDEN,pp:30,maxPP:30}];await f.attack(0,false);assert.equal(f.reads(),0);assert.equal(f.foe.moves[0].pp,29);
 const early=fixture([],10);await early.attack();assert.equal(early.reads(),0);assert.equal(early.mon.moves[0].pp,29);
});
