import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EncounterChecks,landSlot} from './encounter.ts';

test('the first three completed steps after a warp/battle cannot encounter',()=>{const c=new EncounterChecks();for(let i=0;i<3;i++){c.step();assert.equal(c.roll(100,0,false,false,()=>0),false);}c.step();assert.equal(c.roll(100,0,false,false,()=>0),true);c.reset();assert.equal(c.inhibitSteps,0);});
test('walking uses independent 20-percent movement and original table-rate rolls',()=>{
  const c=new EncounterChecks();c.inhibitSteps=4;let rolls=0;assert.equal(c.roll(20,0,false,false,()=>{rolls++;return .2;}),false);assert.equal(rolls,1);
  const values=[.19,.2];assert.equal(c.roll(20,0,false,false,()=>values.shift()!),false);
  const success=[.19,.19];assert.equal(c.roll(20,0,false,false,()=>success.shift()!),true);
  const run=[.39,.19];assert.equal(c.roll(20,0,true,false,()=>run.shift()!),true);
});
test('only reversals increase the source turn boost; perpendicular turns do not',()=>{const c=new EncounterChecks();c.inhibitSteps=4;for(const facing of [2,0,3])c.roll(100,facing,false,false,()=>.99);assert.equal(c.reverseTurns,0);for(const facing of [2,3])c.roll(100,facing,false,false,()=>.99);assert.equal(c.reverseTurns,2);assert.equal(c.roll(100,3,false,false,()=>.49),true);assert.equal(c.roll(100,3,false,false,()=>.5),false);});
test('all 100 original weighted land slots have the exact source distribution',()=>{const slots=Array(12).fill(0);for(let i=0;i<100;i++)slots[landSlot(()=>i/100)]++;assert.deepEqual(slots,[20,20,10,10,10,10,5,5,4,4,1,1]);});
