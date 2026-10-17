import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Battle} from './battle.ts';
import {stageHitChance} from './battle-math.ts';
import {createMon,loadData,newState} from './data.ts';
import type {Mon} from './types.ts';
import type {BattleView} from './battle-view.ts';
import type {UI} from './ui.ts';

globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData();
function setMoves(mon:Mon,...keys:string[]){mon.moves=keys.map(key=>{const move=data.moves[data.constants[key]];assert.ok(data.learnsets[mon.species].some(entry=>entry.move===move.id&&entry.level<=mon.level)||key==='MOVE_DOUBLE_TEAM'&&data.personal[mon.species].tms.includes(32),`${key} must be legal on species${mon.species}`);return{id:move.id,pp:move.pp,maxPP:move.pp};});}
function fixture(playerSpecies=19,enemySpecies=16){
  const state=newState(data,'Ethan','boy'),player=createMon(data,playerSpecies,30,state.name,()=>.5),enemy=createMon(data,enemySpecies,30,'Opponent',()=>.5);state.party=[player];
  const events:string[]=[],messages:string[]=[];let draws:number[]=[],used=0;
  const view={attack:async()=>{events.push('attack');},hit:async()=>{events.push('hit');},sync:()=>{}}as unknown as BattleView;
  const battle=new Battle(data,state,{}as UI,()=>{assert.ok(draws.length,'unexpected RNG draw');used++;return draws.shift()!;},view);
  Reflect.set(battle,'enemies',[enemy]);Reflect.set(battle,'say',async(text:string)=>{messages.push(text);});Reflect.set(battle,'draw',()=>{});
  return{battle,player,enemy,events,messages,async attack(side:boolean,slot:number,rolls:number[]){draws=[...rolls];used=0;events.length=messages.length=0;await Reflect.get(battle,'attack').call(battle,side,slot);assert.equal(draws.length,0,'unused gameplay RNG draw');return used;}};
}

test('all native accuracy stages use literal source ratios and integer truncation',async()=>{
  const source=await readFile(new URL('../../../src/battle/battle_controller_player.c',import.meta.url),'utf8');
  const table=source.match(/sHitChanceTable\[13\]\[2\]\s*=\s*\{([\s\S]*?)\n\};/)![1];
  const ratios=[...table.matchAll(/\{\s*(\d+)\s*,\s*(\d+)\s*\}/g)].map(match=>[Number(match[1]),Number(match[2])]);assert.equal(ratios.length,13);
  const accuracies=new Set(Object.values(data.moves).map(move=>move.accuracy).filter(accuracy=>accuracy>0));
  for(const accuracy of accuracies)for(let attack=-6;attack<=6;attack++)for(let evasion=-6;evasion<=6;evasion++)for(const identified of[false,true]){
    const nativeStage=Math.max(0,Math.min(12,6+attack-(identified?Math.min(0,evasion):evasion))),[numerator,denominator]=ratios[nativeStage],expected=Math.trunc(accuracy*numerator/denominator);
    assert.equal(stageHitChance(accuracy,attack,evasion,identified),expected,`${accuracy}/${attack}/${evasion}/${identified}`);
  }
  assert.equal(stageHitChance(95,0,1),71);assert.equal(stageHitChance(60,0,5),21);assert.equal(stageHitChance(75,0,-1),99);
});

test('legal Tackle modifiers truncate71.25 to71 and combined57 exactly on either side',async()=>{
  for(const modifier of['evasion','accuracy','both']as const)for(const side of[true,false])for(const offset of[-1,0,1]){
    const h=fixture(side?19:16,side?16:19),attacker=side?h.player:h.enemy,defender=side?h.enemy:h.player;setMoves(attacker,'MOVE_TACKLE');setMoves(defender,'MOVE_SAND_ATTACK','MOVE_DOUBLE_TEAM');
    if(modifier!=='accuracy')await h.attack(!side,1,[]);
    if(modifier!=='evasion')await h.attack(!side,0,[0]);
    const threshold=modifier==='both'?57:71,roll=threshold+offset,pp=attacker.moves[0].pp,before=defender.hp;
    const used=await h.attack(side,0,offset<0?[(roll+.01)/100,.5,.5]:[(roll+.01)/100]);
    assert.equal(attacker.moves[0].pp,pp-1);assert.equal(used,offset<0?3:1);assert.equal(defender.hp<before,offset<0);
    assert.deepEqual(h.events,offset<0?['attack','hit']:[]);assert.equal(h.messages.some(text=>text.includes('attack missed')),offset>=0);
  }
});

test('SweetScent lowers actual evasion before SleepPowder uses native133/100 rather than4/3',async()=>{
  for(const roll of[98,99]){const h=fixture(69,16);setMoves(h.player,'MOVE_SWEET_SCENT','MOVE_SLEEP_POWDER');await h.attack(true,0,[0]);assert.equal(Reflect.get(h.battle,'enemyStages').evasion,-1);const pp=h.player.moves[1].pp;await h.attack(true,1,roll===98?[(roll+.01)/100,0]:[(roll+.01)/100]);assert.equal(h.player.moves[1].pp,pp-1);assert.equal(h.enemy.status,roll===98?'SLP':'');assert.deepEqual(h.events,roll===98?['attack']:[]);}
});

test('Foresight ignores only raised evasion and combines remaining accuracy changes before truncating',async()=>{
  for(const roll of[70,71,72]){const h=fixture(163,16);setMoves(h.player,'MOVE_TACKLE','MOVE_FORESIGHT');setMoves(h.enemy,'MOVE_SAND_ATTACK','MOVE_DOUBLE_TEAM');await h.attack(false,1,[]);await h.attack(false,0,[0]);await h.attack(true,1,[]);assert.equal(Reflect.get(h.battle,'playerStages').accuracy,-1);assert.equal(Reflect.get(h.battle,'enemyStages').evasion,1);const before=h.enemy.hp;await h.attack(true,0,roll===70?[(roll+.01)/100,.5,.5]:[(roll+.01)/100]);assert.equal(h.enemy.hp<before,roll===70);}
  assert.equal(stageHitChance(75,0,-1,true),99,'identification preserves lowered evasion');assert.equal(stageHitChance(75,-6,6),24,'combined stages clamp after subtraction');
});

test('accuracy-zero, always-hit effects and tutorial retain existing no-draw bypasses',async()=>{
  const h=fixture(163,16);setMoves(h.player,'MOVE_FORESIGHT','MOVE_TACKLE');await h.attack(true,0,[]);assert.deepEqual(h.events,['attack']);Reflect.set(h.battle,'tutorial',true);await h.attack(true,1,[.5,.5]);assert.deepEqual(h.events,['attack','hit']);
  const swift=fixture(190,16);setMoves(swift.player,'MOVE_SWIFT');await swift.attack(true,0,[.5,.5]);assert.deepEqual(swift.events,['attack','hit']);
});
