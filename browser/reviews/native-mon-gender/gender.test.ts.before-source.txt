import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createMon,loadData} from './data.ts';
import {nativeEggGender} from './eggs.ts';
globalThis.fetch=async input=>{try{return new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));}catch{return new Response('',{status:404});}};
const data=await loadData(),root=new URL('../../../',import.meta.url),oracle=JSON.parse(await readFile(new URL('../../reviews/native-mon-gender/native-oracle.json',import.meta.url),'utf8')) as {sources:{path:string;sha256:string}[];rows:{ratio:number;rawRatio:number;genders:number[]}[]};
const genders=['male','female','genderless'] as const;
function ordinary(species:number,pid:number){let draws=0;const mon=createMon(data,species,5,'Case',()=>++draws===7?pid/0x100000000:.5);return{mon,draws};}

test('gender oracle is compiled from unchanged native function/header and covers every imported native ratio',async()=>{
 for(const source of oracle.sources)assert.equal(createHash('sha256').update(await readFile(new URL(source.path,root))).digest('hex'),source.sha256,source.path);
 const personal=JSON.parse(await readFile(new URL('files/poketool/personal/personal.json',root),'utf8')).baseStats;
 assert.deepEqual(data.personal.map(row=>[row.species,row.genderRatio]),personal.map((row:{species:string;genderRatio:number})=>[row.species,row.genderRatio]));
 assert.deepEqual(oracle.rows.map(row=>[row.ratio,row.rawRatio]),[[0,0],[.125,31],[.25,63],[.5,127],[.75,191],[1,254],[2,255]]);
 assert.deepEqual([...new Set(data.personal.map(row=>row.genderRatio))].sort((a,b)=>a-b),oracle.rows.map(row=>row.ratio));for(const row of oracle.rows)assert.equal(row.genders.length,256);
});

test('ordinary starter Chikorita is male at native PID boundary31',()=>{
 assert.equal(ordinary(data.constants.SPECIES_CHIKORITA,31).mon.gender,'male');assert.equal(ordinary(data.constants.SPECIES_CHIKORITA,30).mon.gender,'female');
});
test('ordinary Pidgey is male at native half-ratio PID boundary127',()=>{
 assert.equal(ordinary(data.constants.SPECIES_PIDGEY,127).mon.gender,'male');assert.equal(ordinary(data.constants.SPECIES_PIDGEY,126).mon.gender,'female');
});
test('ordinary Magnemite is genderless at both extreme PID low bytes',()=>{
 for(const pid of[0,255,0x80000000,0xffffffff])assert.equal(ordinary(data.constants.SPECIES_MAGNEMITE,pid).mon.gender,'genderless');
});

test('ordinary createMon matches the literal native C oracle for all256 PID bytes and all7 source ratios without changing its RNG consumption',()=>{
 let checked=0;
 for(const row of oracle.rows){const species=data.personal.findIndex(base=>base.genderRatio===row.ratio&&!['NONE','EGG','BAD_EGG'].includes(base.species));assert.ok(species>0);
  for(const high of[0,0x80000000,0xffffff00])for(let low=0;low<256;low++){
   const pid=high+low,{mon,draws}=ordinary(species,pid);assert.equal(mon.gender,genders[row.genders[low]],`${data.personal[species].species}, PID${pid}`);assert.equal(mon.personality,pid);assert.equal(draws,8);assert.deepEqual(mon.ivs,[16,16,16,16,16,16]);assert.equal(mon.nature,pid%25);assert.equal(mon.id,0x7fffffff);checked++;
  }
 }
 assert.equal(checked,5376);
});

test('existing native Egg gender API preserves every source-ratio/PID result including fixed sexes and genderless',()=>{
 let checked=0;for(const row of oracle.rows)for(const high of[0,0x80000000,0xffffff00])for(let low=0;low<256;low++){assert.equal(nativeEggGender(row.ratio,high+low),genders[row.genders[low]]);checked++;}assert.equal(checked,5376);
});
