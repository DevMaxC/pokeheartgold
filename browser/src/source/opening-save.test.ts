import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const main=await readFile(new URL('main.ts',import.meta.url),'utf8');
// Execute the real bootstrap's save callback, without importing WebGL/the
// full game. This is the callback registered for pagehide and autosave.
const saveSource=main.match(/^function save\(\).*$/m)?.[0];assert.ok(saveSource,'main save callback moved; update the fixture');
test('the actual pagehide/save callback cannot replace the old slot after an incomplete or failed first field entry',()=>{
 const old=JSON.stringify({name:'Existing',party:[155],map:63}),slots=new Map([['slot',old]]);let snapshots=0;
 const context={ready:false,started:true,transitioning:false,vm:{busy:false},battle:{active:false},walking:false,state:{name:'New draft',map:64},objects:{save:()=>{snapshots++;return{map:64,actors:[]};}},localStorage:{setItem:(key:string,value:string)=>slots.set(key,value)},SAVE_KEY:'slot',console};
 const save=runInNewContext(saveSource+';save;',context)as()=>void;save();assert.equal(slots.get('slot'),old);assert.equal(snapshots,0);
 context.started=false;save();assert.equal(slots.get('slot'),old);assert.equal(snapshots,0);
 context.ready=true;context.started=true;context.vm.busy=true;save();assert.equal(slots.get('slot'),old);
 context.vm.busy=false;save();assert.equal(JSON.parse(slots.get('slot')!).name,'New draft');assert.equal(snapshots,1);
});
