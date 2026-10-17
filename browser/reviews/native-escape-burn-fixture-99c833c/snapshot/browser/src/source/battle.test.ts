import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Battle} from './battle.ts';
import {loadData,newState,createMon} from './data.ts';
import type {UI} from './ui.ts';
import type {BattleView} from './battle-view.ts';
globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData();
test('an unsupported battle effect rejects and restores party, inventory and capture records',async()=>{
  const elements=new Map<string,{innerHTML:string;hidden:boolean}>();
  globalThis.document={getElementById(id:string){if(!elements.has(id))elements.set(id,{innerHTML:'',hidden:true});return elements.get(id);},querySelector(){return null;}} as unknown as Document;
  const state=newState(data,'Ethan','boy');state.party=[createMon(data,155,5,state.name,()=>.5)];state.bag.ITEM_POTION=5;
  const original=structuredClone(state),enemy=createMon(data,158,5,'Rival',()=>.5),moveID=state.party[0].moves[0].id;
  const broken={...data,moves:{...data.moves,[moveID]:{...data.moves[moveID],effect:999}}};
  const battle=new Battle(broken,state,{} as UI,()=>0);Reflect.set(battle,'say',async()=>{});Reflect.set(battle,'nextAction',async()=>({kind:'move',slot:0}));
  await assert.rejects(battle.start([enemy],497),/Unported original move effect 999/);
  assert.equal(battle.active,false);for(const key of ['party','bag','boxes','seen','caught'] as const)assert.deepEqual(state[key],original[key]);
  assert.equal(elements.get('battle-screen')?.hidden,true);
});

test('winning against the final opponent keeps its sprite available through the victory message',async()=>{
  const elements=new Map<string,{innerHTML:string;hidden:boolean}>();globalThis.document={getElementById(id:string){if(!elements.has(id))elements.set(id,{innerHTML:'',hidden:true});return elements.get(id);},querySelector(){return null;}} as unknown as Document;
  const state=newState(data,'Ethan','boy');state.party=[createMon(data,155,5,state.name,()=>.5)];const enemy=createMon(data,158,5,'Rival',()=>.5);enemy.hp=0;
  const battle=new Battle(data,state,{} as UI,()=>0);Reflect.set(battle,'say',async()=>{Reflect.get(battle,'draw').call(battle);});Reflect.set(battle,'gainExperience',async()=>{});Reflect.set(battle,'nextAction',async()=>({kind:'item',item:'ITEM_NONE'}));Reflect.set(battle,'item',async()=>true);
  assert.equal(await battle.start([enemy],497),'won');assert.equal(battle.active,false);
});

test('3D presentation preserves turn results, damage, PP and EXP',async()=>{
  const elements=new Map<string,{innerHTML:string;hidden:boolean}>();globalThis.document={getElementById(id:string){if(!elements.has(id))elements.set(id,{innerHTML:'',hidden:true});return elements.get(id);},querySelector(){return null;}} as unknown as Document;
  const calls:string[]=[];const view:BattleView={location:'Cherrygrove City',begin:async()=>{calls.push('begin');},sync:()=>{},attack:async()=>{calls.push('attack');},hit:async()=>{calls.push('hit');},capture:async()=>{},orbit:()=>{},end:()=>{calls.push('end');}};
  async function run(presentation?:BattleView){const state=newState(data,'Ethan','boy');state.party=[createMon(data,155,5,state.name,()=>.5)];const enemy=createMon(data,158,5,'Rival',()=>.5);enemy.hp=1;const battle=new Battle(data,state,{} as UI,()=>0,presentation);Reflect.set(battle,'say',async()=>{});Reflect.set(battle,'nextAction',async()=>({kind:'move',slot:0}));return{result:await battle.start([enemy],497),state,enemy};}
  const plain=await run(),world=await run(view);assert.deepEqual(world,plain);assert.ok(calls.includes('attack'));assert.ok(calls.includes('hit'));assert.equal(calls[0],'begin');assert.equal(calls.at(-1),'end');
});
