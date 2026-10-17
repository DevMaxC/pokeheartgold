import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Battle} from './battle.ts';
import {loadData,newState,createMon} from './data.ts';
import type {Mon} from './types.ts';
import type {UI} from './ui.ts';
globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData();
function move(mon:Mon,key:string){const id=data.constants[key],pp=data.moves[id].pp;mon.moves=[{id,pp,maxPP:pp}];}
function fixture(player:Mon,rng:()=>number=()=>0){
  const elements=new Map<string,{innerHTML:string;hidden:boolean}>();globalThis.document={getElementById(id:string){if(!elements.has(id))elements.set(id,{innerHTML:'',hidden:true});return elements.get(id);},querySelector(){return null;}} as unknown as Document;
  const state=newState(data,'Ethan','boy',()=>.5);state.party=[player];const messages:string[]=[],battle=new Battle(data,state,{choose:async()=>4} as unknown as UI,rng);
  Reflect.set(battle,'say',async(text:string)=>messages.push(text));Reflect.set(battle,'nextAction',async()=>({kind:'move',slot:0}));return{battle,state,messages};
}
function mon(species:number,level:number){return createMon(data,species,level,'Ethan',()=>.5);}

test('a final action KO grants EXP/EVs and ends battle before poison can damage the winner',async()=>{
  const player=mon(152,5);Object.assign(player,{hp:1,status:'PSN'});move(player,'MOVE_TACKLE');
  const enemy=mon(19,2);enemy.hp=1;const before=player.exp,{battle,messages}=fixture(player);
  assert.equal(await battle.start([enemy]),'won');assert.equal(player.hp,1);assert.ok(player.exp>before);assert.equal(player.evs[3],1);assert.ok(!messages.some(text=>text.includes('hurt by')));
});

test('a nonfinal KO levels the active Pokémon before poison and delays the next sendout until afterward',async()=>{
  const player=mon(152,5);Object.assign(player,{hp:1,status:'PSN',exp:data.growth[data.personal[152].growthRate][6]-1});move(player,'MOVE_TACKLE');
  const first=mon(19,2);first.hp=1;const next=mon(19,2),{battle,messages}=fixture(player),stop=new Error('observed end of native turn');
  let turns=0,observed:{level:number;hp:number;enemy:Mon}|undefined;
  Reflect.set(battle,'nextAction',async()=>{if(turns++){observed={level:player.level,hp:player.hp,enemy:battle.enemy};throw stop;}return{kind:'move',slot:0};});
  await assert.rejects(battle.start([first,next],20),error=>error===stop);
  assert.equal(observed?.level,6);assert.equal(observed?.hp,1);assert.equal(observed?.enemy,next);
  const level=messages.findIndex(text=>text.includes('grew to Lv. 6')),poison=messages.findIndex(text=>text.includes('hurt by poison')),replacement=messages.findIndex(text=>text.startsWith('The opposing Trainer sent out'));
  assert.ok(level>=0&&level<poison&&poison<replacement);
});

test('Struggle recoil fainting remains ineligible for EXP even though final-foe EXP precedes residuals',async()=>{
  const player=mon(152,5);player.hp=1;for(const slot of player.moves)slot.pp=0;
  const enemy=mon(19,2);enemy.hp=1;const{battle,state}=fixture(player),before=player.exp;state.party.push(mon(16,5));
  Reflect.set(battle,'nextAction',async()=>({kind:'move',slot:-1}));
  assert.equal(await battle.start([enemy]),'won');assert.equal(player.hp,0);assert.equal(player.exp,before);assert.deepEqual(player.evs,[0,0,0,0,0,0]);
});

test('each poison faint is adjudicated immediately in speed order rather than poisoning both last battlers',async()=>{
  for(const faster of['player','enemy'] as const){
    const player=mon(faster==='player'?16:19,faster==='player'?20:5),enemy=mon(faster==='player'?19:16,faster==='player'?5:20);
    move(player,player.species===16?'MOVE_SAND_ATTACK':'MOVE_TAIL_WHIP');move(enemy,enemy.species===16?'MOVE_SAND_ATTACK':'MOVE_TAIL_WHIP');
    for(const battler of[player,enemy])Object.assign(battler,{hp:1,status:'PSN'});
    const{battle,messages}=fixture(player);assert.equal(await battle.start([enemy]),faster==='player'?'lost':'won');
    assert.equal(messages.filter(text=>text.includes('hurt by poison')).length,1);
    if(faster==='player'){assert.equal(player.hp,0);assert.equal(enemy.hp,1);}else{assert.ok(player.hp>0);assert.equal(enemy.hp,0);}
  }
});

test('equal-speed residuals use a fresh native low-bit tie instead of reusing the Fight tie',async()=>{
  for(const residualBit of[0,1]){
    const player=mon(19,5),enemy=mon(19,5);for(const battler of[player,enemy]){move(battler,'MOVE_TAIL_WHIP');Object.assign(battler,{hp:1,status:'PSN'});}
    const draws=[0,0,0,0,residualBit/0x10000];let used=0;const{battle}=fixture(player,()=>{assert.ok(used<draws.length);return draws[used++];});
    assert.equal(await battle.start([enemy]),residualBit?'won':'lost');assert.equal(used,5);
  }
});
