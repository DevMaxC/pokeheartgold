import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData,calculateStats} from './data.ts';
import {originalTrainerParty} from './trainers.ts';
import type {GameData,Trainer} from './types.ts';
globalThis.fetch=async input=>{try{return new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));}catch{return new Response('',{status:404});}};
const data=await loadData(),rules=JSON.parse(await readFile(new URL('../../public/source/trainer-rules.json',import.meta.url),'utf8')) as {genders:Record<string,string>},oracle=JSON.parse(await readFile(new URL('../../reviews/native-mon-gender/native-oracle.json',import.meta.url),'utf8')) as {rows:{ratio:number;genders:number[];overrides:{initial:number;packed:number;selector:number}[]}[]};
const sexes=['male','female','genderless'] as const,mask=0xffffffffn;
async function party(game:GameData,id:number){const previous=Math.random;let draws=0;Math.random=()=>{draws++;return .5;};try{return{mons:await originalTrainerParty(game,id),draws};}finally{Math.random=previous;}}
function expected(game:GameData,id:number){const trainer=game.trainers[id];let selector=rules.genders[trainer.class]==='TRAINER_FEMALE'?0x78:0x88;
 return trainer.party.map(row=>{const species=game.constants[row.species],base=game.personal[species],native=oracle.rows.find(r=>r.ratio===base.genderRatio)!;
  const packed=game.constants[String(row.genderOverride)]|(game.constants[String(row.abilityOverride)]<<4),override=native.overrides.find(r=>r.initial===selector&&r.packed===packed);assert.ok(override,`literal native override fixture ${selector}/${packed}`);selector=override.selector;
  let seed=BigInt(row.difficulty+row.level+species+id)&mask,word=seed;for(let i=0;i<game.constants[trainer.class];i++){seed=(seed*1103515245n+24691n)&mask;word=seed>>16n;}
  const pid=Number(((word<<8n)+BigInt(selector))&mask);return{pid,gender:sexes[native.genders[pid&255]],ivs:Array(6).fill(Math.floor(row.difficulty*31/255))};
 });
}
function custom(template:Trainer,rows:Trainer['party']){const trainers=[...data.trainers,{...template,party:rows}];return{game:{...data,trainers},id:trainers.length-1};}

for(const[id,name]of[[7,'Irwin'],[33,'Jasmine']] as const)test(`actual ${name} party retains native PID/IV/move overrides and correctly gives genderless Pokémon no sex`,async()=>{
 const {mons,draws}=await party(data,id),source=data.trainers[id];assert.ok(source.name.includes(name));assert.equal(draws,8*source.party.length);const wanted=expected(data,id);
 for(let i=0;i<mons.length;i++){const mon=mons[i],row=source.party[i];assert.equal(mon.personality,wanted[i].pid);assert.equal(mon.gender,wanted[i].gender);assert.deepEqual(mon.ivs,wanted[i].ivs);assert.equal(mon.nature,wanted[i].pid%25);assert.equal(mon.id,0x7fffffff);
  if(data.personal[mon.species].genderRatio===2)assert.equal(mon.gender,'genderless');const stats=calculateStats(data.personal[mon.species],row.level,mon.ivs,mon.evs,mon.nature);assert.deepEqual(mon.stats,stats.stats);assert.equal(mon.hp,stats.maxHP);assert.equal(mon.heldItem,row.item&&row.item!=='ITEM_NONE'?row.item:null);
  if(row.moves)assert.deepEqual(mon.moves,row.moves.map(key=>{const move=data.moves[data.constants[key]];return{id:move.id,pp:move.pp,maxPP:move.pp};}));
 }
});

test('both trainer genders and every forced-gender/ability case match literal native C selectors for all7 personal ratios',async()=>{
 const templates=['TRAINER_MALE','TRAINER_FEMALE'].map(gender=>data.trainers.find(trainer=>trainer.party.length&&rules.genders[trainer.class]===gender)!);assert.ok(templates.every(Boolean));let checked=0;
 const genders=['TRPOKE_GENDER_OVERRIDE_OFF','TRPOKE_GENDER_OVERRIDE_MALE','TRPOKE_GENDER_OVERRIDE_FEMALE'],abilities=['TRPOKE_ABILITY_OVERRIDE_OFF','TRPOKE_ABILITY_OVERRIDE_FIRST','TRPOKE_ABILITY_OVERRIDE_SECOND'];
 for(const template of templates)for(const ratio of oracle.rows){const species=data.personal.find(base=>base.genderRatio===ratio.ratio&&!['NONE','EGG','BAD_EGG'].includes(base.species))!;
  for(const genderOverride of genders)for(const abilityOverride of abilities){const row={...template.party[0],species:'SPECIES_'+species.species,difficulty:77,genderOverride,abilityOverride},sample=custom(template,[row]),wanted=expected(sample.game,sample.id)[0],{mons,draws}=await party(sample.game,sample.id);assert.equal(draws,8);assert.equal(mons[0].personality,wanted.pid,`${species.species}, ${genderOverride}/${abilityOverride}`);assert.equal(mons[0].gender,wanted.gender);assert.deepEqual(mons[0].ivs,wanted.ivs);checked++;}
 }
 assert.equal(checked,126);
});

test('native PID selector and ability-bit carry across a multi-Pokémon trainer party are retained',async()=>{
 const template=data.trainers[7],off='TRPOKE_GENDER_OVERRIDE_OFF',none='TRPOKE_ABILITY_OVERRIDE_OFF',base=template.party[0],rows=[
  {...base,species:'SPECIES_CHIKORITA',genderOverride:'TRPOKE_GENDER_OVERRIDE_FEMALE',abilityOverride:none},
  {...base,species:'SPECIES_CHIKORITA',genderOverride:off,abilityOverride:none},
  {...base,species:'SPECIES_CHIKORITA',genderOverride:off,abilityOverride:'TRPOKE_ABILITY_OVERRIDE_FIRST'},
  {...base,species:'SPECIES_PIDGEY',genderOverride:'TRPOKE_GENDER_OVERRIDE_MALE',abilityOverride:none},
  {...base,species:'SPECIES_PIDGEY',genderOverride:off,abilityOverride:none},
 ],sample=custom(template,rows),wanted=expected(sample.game,sample.id),{mons,draws}=await party(sample.game,sample.id);assert.equal(draws,40);assert.deepEqual(mons.map(mon=>mon.personality),wanted.map(mon=>mon.pid));assert.deepEqual(mons.map(mon=>mon.gender),wanted.map(mon=>mon.gender));assert.deepEqual(mons.map(mon=>mon.personality&255),[29,29,28,129,129]);
});
