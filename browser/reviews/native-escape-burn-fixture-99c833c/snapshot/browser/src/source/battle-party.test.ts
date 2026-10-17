import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Battle} from './battle.ts';
import {createMon,loadData,newState} from './data.ts';
import type {Mon} from './types.ts';
import type {UI} from './ui.ts';
globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData();
function mon(species=155,level=5){return createMon(data,species,level,'Ethan',()=>.5);}
// Production already persists optional isEgg. This is a legacy save fixture,
// not a gift-acquisition or hatching implementation.
function egg(){return{...mon(175,1),isEgg:true,name:'Egg'};}
function fixture(party:Mon[]){
  const elements=new Map<string,{innerHTML:string;hidden:boolean}>();
  globalThis.document={getElementById(id:string){if(!elements.has(id))elements.set(id,{innerHTML:'',hidden:true});return elements.get(id);},querySelector(){return null;}} as unknown as Document;
  const state=newState(data,'Ethan','boy');state.party=party;
  const messages:string[]=[],battle=new Battle(data,state,{choose:async()=>4} as unknown as UI,()=>.5);
  Reflect.set(battle,'say',async(text:string)=>messages.push(text));
  return{state,battle,messages};
}
function tackle(target:Mon){const id=data.constants.MOVE_TACKLE,pp=data.moves[id].pp;target.moves=[{id,pp,maxPP:pp}];}

test('reloaded production party starts with its first usable non-Egg and awards no Egg EXP or EVs',async()=>{
  const fighter=mon(155,20);tackle(fighter);
  const party=JSON.parse(JSON.stringify([egg(),{...mon(16),hp:0},fighter])) as Mon[],before=structuredClone(party[0]);
  const {battle,messages}=fixture(party),enemy=mon(19,2);enemy.hp=1;
  Reflect.set(battle,'nextAction',async()=>({kind:'move',slot:0}));
  assert.equal(await battle.start([enemy]),'won');assert.equal(battle.player,party[2]);
  assert.ok(messages.includes('Go! '+party[2].name+'!'));assert.deepEqual(party[0],before);
});

test('a party containing only Eggs and fainted Pokémon cannot start a battle',async()=>{
  const {battle}=fixture([egg(),{...mon(),hp:0}]);
  await assert.rejects(battle.start([mon(19)]),/No Pokémon is able to battle/);assert.equal(battle.active,false);
});

test('an injected Egg switch spends no turn, makes no participation bit and leaves the current actor in place',async()=>{
  const player=mon(155,20);tackle(player);const {battle,state}=fixture([player,egg()]),enemy=mon(19,2);enemy.hp=1;
  let choices=0;Reflect.set(battle,'nextAction',async()=>++choices===1?{kind:'switch',index:1}:{kind:'move',slot:0});
  const before=structuredClone(state.party[1]);
  assert.equal(await battle.start([enemy]),'won');assert.equal(Reflect.get(battle,'turns'),1);assert.equal(battle.player,player);assert.deepEqual(state.party[1],before);
});

test('fainting the last usable actor loses even when a positive-HP Egg remains',async()=>{
  const player=mon(152,1);player.hp=1;tackle(player);const {battle,state}=fixture([player,egg()]),enemy=mon(19,30);tackle(enemy);
  Reflect.set(battle,'nextAction',async()=>({kind:'move',slot:0}));
  const before=structuredClone(state.party[1]);assert.equal(await battle.start([enemy]),'lost');assert.equal(player.hp,0);assert.deepEqual(state.party[1],before);
});
