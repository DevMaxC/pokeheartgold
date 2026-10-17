import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mapBlackoutSpawn,originalSpawn} from './spawns.ts';

test('a failed spawn download retries and both callers retain the recovered native rows',async()=>{
 const bytes=await readFile(new URL('../../public/source/spawns.json',import.meta.url),'utf8'),native=JSON.parse(bytes) as Record<number,{id:number;blackout:boolean;death:{map:number}}>,expected=Object.values(native).find(row=>row.blackout)!;
 const fetcher=globalThis.fetch;let attempts=0;
 globalThis.fetch=async input=>{assert.equal(String(input),'/source/spawns.json');attempts++;return attempts===1?new Response('temporarily unavailable',{status:503}):new Response(bytes,{status:200,headers:{'Content-Type':'application/json'}});};
 try{
  await assert.rejects(mapBlackoutSpawn(expected.death.map),/Original data could not load: spawns\.json \(503\)/);assert.equal(attempts,1);
  const recovered=await mapBlackoutSpawn(expected.death.map);assert.deepEqual(recovered,expected);assert.equal(attempts,2,'Retry must fetch again after the rejected download');
  assert.equal(await originalSpawn(expected.id),recovered,'Both APIs must share the recovered parsed rows');assert.equal(await mapBlackoutSpawn(expected.death.map),recovered);assert.equal(attempts,2,'A successful response stays cached');
 }finally{globalThis.fetch=fetcher;}
});
