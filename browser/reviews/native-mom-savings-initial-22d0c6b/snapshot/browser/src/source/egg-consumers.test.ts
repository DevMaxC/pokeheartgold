import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Battle} from './battle.ts';
import {loadData,newState,createMon} from './data.ts';
import {giveTogepiEgg,firstFollowerMon,isUsableBattler} from './eggs.ts';
import type {BattleView} from './battle-view.ts';
import type {UI} from './ui.ts';
globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData();
function fixture(){
  const elements=new Map<string,{innerHTML:string;hidden:boolean}>();
  globalThis.document={getElementById(id:string){if(!elements.has(id))elements.set(id,{innerHTML:'',hidden:true});return elements.get(id);},querySelector(){return null;}} as unknown as Document;
  const state=newState(data,'Ethan','boy',()=>.5);state.nativeEggSeed=1;
  giveTogepiEgg(data,state,{now:()=>new Date(2026,9,17)});
  return{state,egg:state.party[0],elements};
}
function fastBattle(state:ReturnType<typeof newState>,view?:BattleView){
  const battle=new Battle(data,state,{} as UI,()=>0,view);Reflect.set(battle,'say',async()=>{});Reflect.set(battle,'nextAction',async()=>({kind:'move',slot:0}));return battle;
}

test('the real gifted Egg is skipped for 3D sendout and never receives battle EXP or EVs',async()=>{
  const{state,egg}=fixture(),before=structuredClone(egg),fighter=createMon(data,152,5,state.name,()=>.5);state.party.push(fighter);
  let sentOut=0;const view:BattleView={location:'Route29',begin:async player=>{assert.equal(player,fighter);sentOut++;},sync:()=>{},attack:async()=>{},hit:async()=>{},capture:async()=>{},orbit:()=>{},end:()=>{}};
  const enemy=createMon(data,19,2,'',()=>.5);enemy.hp=1;const exp=fighter.exp;
  assert.equal(await fastBattle(state,view).start([enemy]),'won');assert.equal(sentOut,1);assert.ok(fighter.exp>exp);assert.deepEqual(egg,before);
});

test('a party with only a healthy Egg and fainted Pokémon cannot start a battle or mark its foe seen',async()=>{
  const{state,egg,elements}=fixture(),fighter=createMon(data,152,5,state.name,()=>.5);fighter.hp=0;state.party.push(fighter);
  const battle=fastBattle(state),before=structuredClone(state);assert.ok(egg.hp>0);
  await assert.rejects(battle.start([createMon(data,19,2,'',()=>.5)]),/No Pokémon is able to battle/);
  assert.equal(battle.active,false);assert.deepEqual(state,before);assert.equal(elements.size,0);
});

test('fainting the last usable Pokémon loses the battle even while an Egg has positive HP',async()=>{
  const{state,egg}=fixture(),fighter=createMon(data,152,5,state.name,()=>.5);fighter.hp=1;state.party.push(fighter);
  const before=structuredClone(egg),enemy=createMon(data,19,10,'',()=>.5);enemy.moves=[{id:data.constants.MOVE_TACKLE,pp:35,maxPP:35}];
  assert.equal(await fastBattle(state).start([enemy]),'lost');assert.equal(fighter.hp,0);assert.deepEqual(egg,before);
});

test('an Egg switch request spends no turn and cannot replace the active battler',async()=>{
  const{state,egg}=fixture(),fighter=createMon(data,152,5,state.name,()=>.5);state.party.push(fighter);const before=structuredClone(egg);
  const battle=fastBattle(state);let choices=0;Reflect.set(battle,'nextAction',async()=>++choices===1?{kind:'switch',index:0}:{kind:'move',slot:0});
  const enemy=createMon(data,19,2,'',()=>.5);enemy.hp=1;
  assert.equal(await battle.start([enemy]),'won');assert.equal(battle.player,fighter);assert.equal(Reflect.get(battle,'turns'),1);assert.deepEqual(egg,before);
});

test('both battle party menus disable the Egg and their click handler rejects it without resolving a switch',()=>{
  const{state,elements}=fixture();state.party.push(createMon(data,152,5,state.name,()=>.5),createMon(data,155,5,state.name,()=>.5));
  const buttons=[0,1,2].map(index=>({dataset:{party:String(index)},onclick:null as null|(()=>void)}));
  document.querySelectorAll=(()=>buttons) as unknown as Document['querySelectorAll'];
  const battle=fastBattle(state);Reflect.set(battle,'playerIndex',1);const choices:unknown[]=[];
  Reflect.set(battle,'actions',(choice:unknown)=>choices.push(choice));
  for(const forced of[false,true]){
    Reflect.get(battle,'partyMenu').call(battle,forced);
    const html=elements.get('battle-actions')!.innerHTML,eggButton=html.match(/<button data-party="0"[^]*?<\/button>/)![0];
    assert.match(eggButton,/disabled/);assert.doesNotMatch(eggButton,/Lv\.|<small>|11\/11/);
    buttons[0].onclick!();buttons[1].onclick!();assert.equal(choices.length,Number(forced));
    buttons[2].onclick!();assert.deepEqual(choices.at(-1),{kind:'switch',index:2});
  }
});

test('Egg exclusion and the native fainted follower fallback survive JSON save and Continue',()=>{
  const{state}=fixture(),fainted=createMon(data,152,5,state.name,()=>.5),live=createMon(data,155,5,state.name,()=>.5);fainted.hp=0;state.party.push(fainted,live);
  const resumed=JSON.parse(JSON.stringify(state));assert.equal(firstFollowerMon(resumed.party),resumed.party[2]);assert.equal(resumed.party.some(isUsableBattler),true);
  resumed.party[2].hp=0;assert.equal(firstFollowerMon(resumed.party),resumed.party[1]);assert.equal(resumed.party.some(isUsableBattler),false);
  resumed.party=resumed.party.slice(0,1);assert.equal(firstFollowerMon(resumed.party),undefined);
});
