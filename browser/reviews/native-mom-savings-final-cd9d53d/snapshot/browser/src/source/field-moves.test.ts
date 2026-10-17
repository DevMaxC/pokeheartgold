import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {loadData,newState,createMon} from './data.ts';
import {sourceJSON,type Mon} from './types.ts';
import {loadNativeFieldMoveData,getPartySlotWithMove,monHasMove,cutFieldResponse,resolveTeachingPersonalIndex,tmhmCompatible,checkTMHMLearning,isHMMove,prepareTMHMTeaching,commitTMHMTeaching,cancelTMHMTeaching,type TMHMTeachingPlan,type NativeTeachingMon} from './field-moves.ts';

globalThis.fetch=async input=>{try{return new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));}catch{return new Response('',{status:404});}};
const data=await loadData(),native=await loadNativeFieldMoveData(),root=new URL('../../../',import.meta.url);
const mapSection=data.constants.MAPSEC_ROUTE_30;
const move=(id:number,pp=data.moves[id].pp)=>({id,pp,maxPP:data.moves[id].pp});
function fixture(species=19){const state=newState(data,'Case','boy',()=>.5);state.map=34;state.x=558.5;state.z=295.5;state.bag.ITEM_HM01=1;const mon=createMon(data,species,8,'Case',()=>.5) as NativeTeachingMon;mon.moves=[move(33)];state.party=[mon];return{state,mon};}
function ready(result:ReturnType<typeof prepareTMHMTeaching>):TMHMTeachingPlan{assert.equal(result.status,'ready');return result as TMHMTeachingPlan;}

test('the native teaching export is reproducible and pins the actual item, form, query and standard sources',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'hg-field-moves-'));
 try{
  const output=path.join(directory,'field-moves.json');execFileSync('python3',[new URL('browser/scripts/export_field_moves.py',root).pathname,'--output',output]);
  assert.deepEqual(await readFile(output),await readFile(new URL('../../public/source/field-moves.json',import.meta.url)));
  for(const[file,sha]of Object.entries(native.sourceSHA256))assert.equal(createHash('sha256').update(await readFile(new URL(file,root))).digest('hex'),sha,file);
 }finally{await rm(directory,{recursive:true,force:true});}
 assert.equal(native.items.length,100);assert.deepEqual(native.items[92],{item:'ITEM_HM01',itemId:420,index:92,move:'MOVE_CUT',moveId:15,kind:'hm',number:1});
 assert.equal(Object.keys(native.mapSections).length,540);
 for(const id of[34,35,117]){const map=await sourceJSON<{fields:Record<string,string>}>(`maps/${id}.json`);assert.equal(native.mapSections[id],data.constants[map.fields.mapsec]);}
 assert.deepEqual(native.cut,{moveId:15,badge:1,standard:10000,bank:'0146',interactionEntry:0,menuEntry:7});
 assert.equal(native.cutCommandClosure.interaction.instructions.length,73);assert.equal(native.cutCommandClosure.menu.instructions.length,51);
 for(const command of['GetPartySlotWithMove','CheckBadge','PlayFieldMoveCutIn','StartFieldMoveEffect','HidePerson','FirstAliveMonHasType','SwapPlayerAndFollowMonPositions'])assert.ok(native.cutCommandClosure.interaction.commands.includes(command));
 const bank=await sourceJSON<{scripts:{entries:string[];labels:Record<string,number>;instructions:[string,string[]][]}}>('scripts/0146.json');
 assert.equal(bank.scripts.instructions[bank.scripts.labels[bank.scripts.entries[0]]+3][0],'GetPartySlotWithMove');
});

test('native move queries skip Eggs and checksum-failed Bad Eggs but retain fainted and zero-PP users',()=>{
 const {mon}=fixture();mon.moves=[move(15,0)];mon.hp=0;mon.status='paralysis';
 const egg={...mon,isEgg:true},bad={...mon,checksumFailed:true};
 assert.equal(getPartySlotWithMove([egg,bad,mon],15),2);assert.equal(monHasMove(mon,15),true);assert.equal(monHasMove(egg,15),false);assert.equal(monHasMove(bad,15),false);
 assert.equal(getPartySlotWithMove([egg,bad],15),6);assert.equal(getPartySlotWithMove([],15),6);
 assert.equal(getPartySlotWithMove([mon],0),0,'Absent packed slots are native MOVE_NONE slots');
 assert.throws(()=>getPartySlotWithMove(Array(7).fill(mon),15),/party size/);
});

test('the Cut menu environment check preserves native map-load/badge/object priority',()=>{
 for(const mapLoadType of Object.values(native.mapLoadTypes))for(const hasHiveBadge of[false,true])for(const facingSpriteId of[null,'SPRITE_TREE','SPRITE_BONGURI']){
  const response=cutFieldResponse({mapLoadType,hasHiveBadge,facingSpriteId});
  assert.equal(response,mapLoadType===2||mapLoadType===3?native.responses.NOT_HERE:!hasHiveBadge?native.responses.NEED_BADGE:facingSpriteId==='SPRITE_TREE'?native.responses.OK:native.responses.NOT_HERE);
 }
 assert.throws(()=>cutFieldResponse({mapLoadType:99,hasHiveBadge:true,facingSpriteId:'SPRITE_TREE'}),/map-load/);
});

test('all native personal compatibility entries and alternate-form offsets are retained',async()=>{
 const original=JSON.parse(await readFile(new URL('files/poketool/personal/personal.json',root),'utf8')).baseStats;
 assert.deepEqual(data.personal,original);
 const source=await readFile(new URL('src/pokemon.c',root),'utf8');assert.match(source,/GetMonTMHMCompat[\s\S]*MON_DATA_SPECIES_OR_EGG/);assert.match(source,/ResolveMonForm[\s\S]*SPECIES_DEOXYS_ATK \+ form - DEOXYS_ATTACK/);
 assert.equal(resolveTeachingPersonalIndex(native,386,1),496);assert.equal(resolveTeachingPersonalIndex(native,413,2),500);assert.equal(resolveTeachingPersonalIndex(native,487,1),501);assert.equal(resolveTeachingPersonalIndex(native,492,1),502);assert.equal(resolveTeachingPersonalIndex(native,479,5),507);assert.equal(resolveTeachingPersonalIndex(native,479,6),479);
 for(let species=1;species<original.length;species++)for(const item of native.items){
  const expected=species===494?false:original[species][item.kind==='hm'?'hms':'tms'].includes(item.number);
  assert.equal(tmhmCompatible(data,native,{species,form:0},item.item),expected,`${species}/${item.item}`);
 }
 for(const[species,records]of Object.entries(native.alternateForms))for(let form=0;form<records.length;form++)for(const item of native.items){
  const expected=original[records[form]][item.kind==='hm'?'hms':'tms'].includes(item.number);
  assert.equal(tmhmCompatible(data,native,{species:Number(species),form},item.item),expected,`${species}/${form}/${item.item}`);
 }
 assert.equal(tmhmCompatible(data,native,{species:19,isEgg:true},'ITEM_HM01'),false);
 assert.equal(tmhmCompatible(data,native,{species:19,checksumFailed:true},'ITEM_HM01'),false);
});

test('HM01 teaching uses a first empty slot, requires no badge or HP, restores base PP and retains the HM',()=>{
 const {state,mon}=fixture();mon.hp=0;mon.status='poison';mon.moves=[move(33,1)];const before=structuredClone(state);
 const plan=ready(prepareTMHMTeaching(data,native,state,0,'ITEM_HM01'));assert.deepEqual(state,before,'Preparation cannot mutate provisional state');
 assert.equal(plan.slot,1);assert.equal(plan.consumesItem,false);assert.equal(commitTMHMTeaching(state,plan).status,'learned');
 assert.deepEqual(mon.moves,[move(33,1),move(15)]);assert.equal(mon.hp,0);assert.equal(mon.status,'poison');assert.deepEqual(state.badges,[]);assert.equal(state.bag.ITEM_HM01,1);assert.equal(mon.mood,40);
 const expected=structuredClone(before);Object.assign(expected.party[0],{moves:[move(33,1),move(15)],friendship:mon.friendship,mood:40});assert.deepEqual(state,expected);
 assert.deepEqual(commitTMHMTeaching(state,plan),{status:'cancelled',reason:'inactive'});
});

test('full native sets require a decision and cannot replace an existing HM',()=>{
 const {state,mon}=fixture();state.bag.ITEM_HM06=1;mon.moves=[move(15,2),move(33),move(39),move(98)];const before=structuredClone(state);
 assert.deepEqual(checkTMHMLearning(data,native,mon,'ITEM_HM06'),{kind:'full',nativeResponse:254});
 assert.deepEqual(prepareTMHMTeaching(data,native,state,0,'ITEM_HM06'),{status:'chooseReplacement',partyIndex:0,item:'ITEM_HM06',move:249,protectedSlots:[0]});
 assert.deepEqual(prepareTMHMTeaching(data,native,state,0,'ITEM_HM06',null),{status:'noEffect',reason:'cancelled'});
 assert.deepEqual(prepareTMHMTeaching(data,native,state,0,'ITEM_HM06',0),{status:'noEffect',reason:'cannotForgetHM'});
 assert.deepEqual(prepareTMHMTeaching(data,native,state,0,'ITEM_HM06',4),{status:'noEffect',reason:'invalidReplacement'});assert.deepEqual(state,before);
 const plan=ready(prepareTMHMTeaching(data,native,state,0,'ITEM_HM06',1));assert.equal(plan.replacingMove,33);commitTMHMTeaching(state,plan);assert.deepEqual(mon.moves,[move(15,2),move(249),move(39),move(98)]);assert.equal(state.bag.ITEM_HM06,1);
 for(const row of native.items.filter(row=>row.kind==='hm'))assert.equal(isHMMove(native,row.moveId),true);
});

test('a successful TM consumes one item while Egg, known, incompatible and missing-item attempts are exact no-ops',()=>{
 const {state,mon}=fixture();state.bag.ITEM_TM10=2;
 const plan=ready(prepareTMHMTeaching(data,native,state,0,'ITEM_TM10'));commitTMHMTeaching(state,plan);assert.equal(state.bag.ITEM_TM10,1);assert.equal(mon.moves[1].id,237);
 let before=structuredClone(state);assert.deepEqual(prepareTMHMTeaching(data,native,state,0,'ITEM_TM10'),{status:'noEffect',reason:'known'});assert.deepEqual(state,before);
 for(const checksumFailed of[false,true]){mon.isEgg=!checksumFailed;mon.checksumFailed=checksumFailed;before=structuredClone(state);assert.deepEqual(prepareTMHMTeaching(data,native,state,0,'ITEM_HM01'),{status:'noEffect',reason:'egg'});assert.deepEqual(state,before);}mon.isEgg=false;mon.checksumFailed=false;
 const other=fixture(175);before=structuredClone(other.state);assert.deepEqual(prepareTMHMTeaching(data,native,other.state,0,'ITEM_HM01'),{status:'noEffect',reason:'incompatible'});assert.deepEqual(other.state,before);
 delete state.bag.ITEM_HM01;before=structuredClone(state);assert.deepEqual(prepareTMHMTeaching(data,native,state,0,'ITEM_HM01'),{status:'noEffect',reason:'missingItem'});assert.deepEqual(state,before);
});

test('cancelled and stale prompts cannot teach, consume or alter party data',()=>{
 for(const mutation of['cancel','map','position','party','moves','bag'] as const){
  const {state,mon}=fixture();state.bag.ITEM_TM10=1;const plan=ready(prepareTMHMTeaching(data,native,state,0,'ITEM_TM10'));
  if(mutation==='cancel')assert.equal(cancelTMHMTeaching(plan),true);
  if(mutation==='map')state.map=35;if(mutation==='position')state.x++;if(mutation==='party')state.party=[mon];if(mutation==='moves')mon.moves[0].pp--;if(mutation==='bag')state.bag.ITEM_TM10=2;
  const before=structuredClone(state);assert.equal(commitTMHMTeaching(state,plan).status,'cancelled');assert.deepEqual(state,before,mutation);
 }
});

test('native affinity uses egg location, positive-tier bonuses, Soothe Bell and signed mood saturation',()=>{
 for(const friendship of[70,150,200,255]){
  const {state,mon}=fixture();mon.friendship=friendship;mon.mood=110;mon.heldItem='ITEM_SOOTHE_BELL';
  mon.provenance={otId:1,otGender:'boy',language:2,gameVersion:7,metLevel:1,pokeball:11,metLocation:0,metDate:{year:0,month:0,day:0},eggLocation:mapSection,eggDate:{year:0,month:0,day:0},fatefulEncounter:false};
  const plan=ready(prepareTMHMTeaching(data,native,state,0,'ITEM_HM01'));assert.equal(plan.after.friendship,friendship<200?friendship+4:friendship);assert.equal(plan.after.mood,127);commitTMHMTeaching(state,plan);assert.equal(mon.mood,127);
 }
 const {state,mon}=fixture();mon.friendship=70;mon.provenance={otId:1,otGender:'boy',language:2,gameVersion:7,metLevel:1,pokeball:4,metLocation:mapSection,metDate:{year:0,month:0,day:0},eggLocation:999,eggDate:{year:0,month:0,day:0},fatefulEncounter:false};
 const plan=ready(prepareTMHMTeaching(data,native,state,0,'ITEM_HM01'));assert.equal(plan.friendshipDelta,1,'Met location alone is not the native bonus');mon.provenance.eggLocation=mapSection;state.map=35;const otherMap=ready(prepareTMHMTeaching(data,native,state,0,'ITEM_HM01'));assert.equal(otherMap.friendshipDelta,1,'Map35 derives Route31 rather than accepting Route30 as a host bonus');
 mon.provenance.pokeball=11;assert.equal(ready(prepareTMHMTeaching(data,native,state,0,'ITEM_HM01')).friendshipDelta,2,'Luxury Ball alone adds one to the positive native base');
});

test('invalid source data is rejected before a single mutation and a source change invalidates a prepared plan',()=>{
 const {state,mon}=fixture(),before=structuredClone(state);assert.deepEqual(prepareTMHMTeaching(data,native,state,0,'ITEM_HM01',null),{status:'noEffect',reason:'cancelled'});assert.deepEqual(state,before);state.map=65535;assert.throws(()=>prepareTMHMTeaching(data,native,state,0,'ITEM_HM01'),/map section/);state.map=34;mon.mood=128;assert.throws(()=>prepareTMHMTeaching(data,native,state,0,'ITEM_HM01'),/mood/);delete mon.mood;assert.deepEqual(state,before);
 const changed={...data,moves:data.moves.map(row=>({...row}))};const plan=ready(prepareTMHMTeaching(changed,native,state,0,'ITEM_HM01'));changed.moves[15].pp++;
 assert.deepEqual(commitTMHMTeaching(state,plan),{status:'cancelled',reason:'stale'});assert.deepEqual(state,before);
});
