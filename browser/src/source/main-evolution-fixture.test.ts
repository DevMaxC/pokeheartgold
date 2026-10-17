// Explicit service ports for legacy host tests that simulate combat without
// awarding EXP. Real XP/evolution/leases run in main-evolution.test.ts.
import assert from 'node:assert/strict';
export function noLevelUpHostFixture(state:any){return{active:false,cameraActive:false,view:{active:false},cancel(){assert.equal(this.active,false);},async settled(){assert.equal(this.active,false);},async run(completion:any){assert.ok(completion&&completion.isCurrent());assert.equal(completion.levelUpMask,0,'this bounded combat fixture cannot discard earned evolution');assert.equal(completion.party.length,state.party.length);assert.ok(completion.party.every((mon:any,index:number)=>mon===state.party[index]),'zero-mask completion retains actual party identity');return{evolved:[],cancelled:[],ineligible:[]};}};}
export function noLevelUpBattleFixture(battle:any,state:any,_declaredResult?:()=>string){
 let serial=0,completion:any=null;
 const wrap=(start:(...args:any[])=>Promise<string>)=>async function(this:any,...args:any[]){
  const before=state.party.map((mon:any)=>({mon,level:mon.level,exp:mon.exp}));const outcome=await start.apply(this,args);
  for(const row of before)if(state.party.includes(row.mon)){assert.equal(row.mon.level,row.level,'no-EXP fixture cannot invent a zero mask after a level change');assert.equal(row.mon.exp,row.exp,'no-EXP fixture cannot hide earned EXP');}
  const party=[...state.party],current={serial:++serial,result:outcome,levelUpMask:0,party,isCurrent:()=>completion===current&&party.length===state.party.length&&party.every((mon,index)=>mon===state.party[index])};completion=current;return outcome;
 };
 let start=wrap(battle.start);Object.defineProperty(battle,'start',{configurable:true,get:()=>start,set:next=>{start=wrap(next);}});Object.defineProperty(battle,'evolutionCompletion',{configurable:true,get:()=>completion});return battle;
}

// Negative controls prevent this narrowly declared no-EXP port becoming a
// blanket bypass when later legacy fixtures start simulating level changes.
import {test} from 'node:test';
test('legacy no-EXP service ports reject absent, stale, nonzero and actual changed-level/EXP completion',async()=>{
 const state={party:[{level:5,exp:100}]},battle=noLevelUpBattleFixture({async start(){return'won';}},state),host=noLevelUpHostFixture(state);await assert.rejects(host.run(battle.evolutionCompletion));await battle.start();await host.run(battle.evolutionCompletion);const stale=battle.evolutionCompletion;state.party=[{level:5,exp:100}];await assert.rejects(host.run(stale));await battle.start();await assert.rejects(host.run({...battle.evolutionCompletion,levelUpMask:1}),/cannot discard earned evolution/);
 battle.start=async()=>{state.party[0].level++;return'won';};await assert.rejects(battle.start(),/level change/);battle.start=async()=>{state.party[0].exp++;return'won';};await assert.rejects(battle.start(),/earned EXP/);
});
