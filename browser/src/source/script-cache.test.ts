import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData,newState} from './data.ts';
import {ScriptVM,type ScriptHooks} from './script.ts';
import {trainerContacts} from './trainer-script-state.ts';
import {sourceJSON,type SourceMap} from './types.ts';

let failedPath='',failures=0,attempts=0;
globalThis.fetch=async input=>{const path=String(input);if(path===failedPath){attempts++;if(failures-->0)return new Response('',{status:503});}try{return new Response(await readFile(new URL('../../public'+path,import.meta.url)));}catch{return new Response('',{status:404});}};
const data=await loadData();
const hooks:ScriptHooks={message:async()=>{},choice:async()=>0,move:async()=>{},position:()=>{},face:()=>{},visible:()=>{},chooseStarter:async()=>{},nickname:async()=>1,refresh:async()=>{},battle:async()=>true,warp:async()=>{}};
test('a transient native common-bank fetch can be retried by a fresh VM without duplicating the item gift',async()=>{
 const bank=data.index.stdScripts.filter(row=>row.min<=2033).sort((a,b)=>b.min-a.min)[0].bank,state=newState(data,'Ethan','boy'),map=await sourceJSON<SourceMap>('maps/61.json');failedPath=`/source/scripts/${bank}.json`;failures=1;attempts=0;
 const first=new ScriptVM(data,state,hooks);first.set('VAR_SPECIAL_x8004',data.constants.ITEM_POTION);first.set('VAR_SPECIAL_x8005',5);await assert.rejects(first.run(map,2033),/503/);assert.equal(state.bag.ITEM_POTION,undefined);assert.equal(first.busy,false);
 await new ScriptVM(data,state,hooks).run(map,2033);assert.equal(state.bag.ITEM_POTION,5);assert.equal(attempts,2);failedPath='';
});
test('a transient native trainer phone-table fetch is evicted rather than poisoning future retries',async()=>{failedPath='/source/trainer-contacts.json';failures=1;attempts=0;await assert.rejects(trainerContacts(),/503/);assert.equal((await trainerContacts()).contacts[13].trainer,4);assert.equal(attempts,2);failedPath='';});
