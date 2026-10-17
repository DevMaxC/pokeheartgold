import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {loadData,createMon} from './data.ts';
import {spriteGender,genderSymbol} from './gender.ts';
import {partyPortrait,partyHUD,partyRow,partySummary} from './party-display.ts';
import {WorldBattleView} from './battle-stage.ts';
import type {OriginalWorld} from './world.ts';

globalThis.fetch=async input=>{try{return new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));}catch{return new Response('',{status:404});}};
const data=await loadData(),repo=new URL('../../../',import.meta.url),icon='/source/eggs/egg-icon.png';
const proof=JSON.parse(await readFile(new URL('../../reviews/native-mon-gender/sprite-resources.json',import.meta.url),'utf8')) as {pins:{path:string;sha256:string}[];symbols:Record<'party'|'battle',Record<'male'|'female'|'genderless',string>>;rows:{species:number;facing:string;source:{path:string;sha256:string};normalPalette:{path:string;sha256:string};export:{path:string;sha256:string};width:number;height:number;visiblePixels:number}[]};
const genderless=data.personal.flatMap((base,species)=>species>=1&&species<=493&&base.genderRatio>1?[species]:[]);

test('sprite sex and printed symbol follow native distinctions without converting gameplay gender',()=>{
 assert.equal(spriteGender('male'),'male');assert.equal(spriteGender('female'),'female');assert.equal(spriteGender('genderless'),'male');
 for(const messages of Object.values(proof.symbols))for(const gender of['male','female','genderless']as const)assert.equal(genderSymbol(gender),messages[gender]);
});

test('all54 genderless base species have source-pinned visible original front/back male-slot resources, including Magnemite and Voltorb',async()=>{
 assert.equal(genderless.length,54);assert.ok(genderless.includes(81)&&genderless.includes(100));
 assert.deepEqual(proof.rows.map(row=>[row.species,row.facing]),genderless.flatMap(species=>[[species,'front'],[species,'back']]));
 const pins=new Map([...proof.pins,...proof.rows.flatMap(row=>[row.source,row.normalPalette,row.export])].map(pin=>[pin.path,pin.sha256]));
 for(const[path,sha]of pins)assert.equal(createHash('sha256').update(await readFile(new URL(path,repo))).digest('hex'),sha,path);
 for(const row of proof.rows){const png=await readFile(new URL(row.export.path,repo));assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.equal(png.readUInt32BE(16),80);assert.equal(png.readUInt32BE(20),80);assert.ok(row.visiblePixels>0);assert.equal(row.width,80);assert.equal(row.height,80);}
});

test('all party views request existing genderless art while preserving genderless identity and hiding Egg details',()=>{
 for(const species of genderless){const mon=createMon(data,species,5,'Ethan',()=>.5),before=structuredClone(mon),path=`/source/pokemon/${species}-male-front.png`;
  assert.equal(mon.gender,'genderless');assert.equal(partyPortrait(mon,icon),path);
  for(const html of[partyHUD(mon,icon),partyRow(mon,0,icon),partySummary(data,mon,icon)]){assert.ok(html.includes(path));assert.doesNotMatch(html,/genderless-(?:front|back)|[♂♀]/);}
  const egg={...mon,isEgg:true,name:'Egg'};assert.equal(partyPortrait(egg,icon),icon);assert.doesNotMatch(partySummary(data,egg,icon),/pokemon\/|[♂♀]|Lv\.|HP|PP /);assert.deepEqual(mon,before);
 }
 const female=createMon(data,29,5,'Ethan',()=>.5);assert.equal(partyPortrait(female,icon),'/source/pokemon/29-female-front.png');
});

test('actual 3D battle sync loads native male-slot front/back artwork for genderless fighters and female-slot artwork for female fighters',async()=>{
 const paths:string[]=[],view=new WorldBattleView({}as OriginalWorld,()=>({x:0,z:0,facing:0,location:'field',gender:'boy',actors:[]}));
 // Run real sync/key-reuse/visibility logic; replace the whole asynchronous art loader.
 const runtime=view as any,fighter=()=>({root:new THREE.Group(),plane:new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.MeshBasicMaterial()),key:'',hidden:false});
 runtime.fighters=[fighter(),fighter()];runtime.loadArt=async(path:string)=>{paths.push(path);return{texture:new THREE.Texture(),aspect:1};};view.active=true;
 for(const species of genderless){const player=createMon(data,species,5,'Ethan',()=>.5),female=createMon(data,29,5,'Trainer',()=>.5),before=structuredClone(player);view.sync(player,female);await new Promise<void>(resolve=>setImmediate(resolve));
  assert.equal(runtime.fighters[0].key,`${species}-male`);assert.equal(runtime.fighters[1].key,'29-female');assert.ok(runtime.fighters.every((f:any)=>f.plane.visible&&f.front&&f.back));assert.deepEqual(player,before);
 }
 assert.deepEqual(paths.filter(path=>!path.includes('/29-')),genderless.flatMap(species=>['front','back'].map(facing=>`/source/pokemon/${species}-male-${facing}.png`)));
 assert.deepEqual(paths.filter(path=>path.includes('/29-')),['/source/pokemon/29-female-front.png','/source/pokemon/29-female-back.png']);
 for(const f of runtime.fighters){f.plane.geometry.dispose();f.plane.material.dispose();}
});
