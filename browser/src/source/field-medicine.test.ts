import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData,newState,createMon} from './data.ts';
import {giveTogepiEgg} from './eggs.ts';
import {SourceActionRecovery} from './script-recovery.ts';
import {planFieldMedicine,applyFieldMedicine,type FieldMedicineInventory,type FieldMedicineRequest} from './field-medicine.ts';
import type {GameData,Mon} from './types.ts';
globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData();
function fixture(item='ITEM_POTION',count=2){const mon=createMon(data,155,10,'Case',()=>.5);mon.hp=1;return{party:[mon,createMon(data,152,10,'Case',()=>.5)],bag:{[item]:count}};}
function apply(inventory:FieldMedicineInventory,item:string,moveSlot?:number){const result=applyFieldMedicine(data,inventory,{item,partySlot:0,moveSlot});assert.equal(result.kind,'applied');if(result.kind!=='applied')throw Error('Expected actual native effect');return result;}
function moves(mon:Mon){mon.moves=['MOVE_TACKLE','MOVE_GROWL','MOVE_SMOKE_SCREEN'].map(key=>{const id=data.constants[key],maxPP=data.moves[id].pp;return{id,pp:0,maxPP};});}
function deepFreeze(value:any){if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))deepFreeze(child);}return value;}
function alteredItem(key:string,overrides:Record<string,string>):GameData{return{...data,items:data.items.map(row=>row.item===key?{...row,...overrides}:row)};}

test('exported item parameters are the exact native CSV, including all party flags and restoration sentinels',async()=>{
 const csv=(await readFile(new URL('../../../files/itemtool/itemdata/item_data.csv',import.meta.url),'utf8')).trim().split(/\r?\n/),fields=csv.shift()!.split(',');
 const rows=csv.map(line=>{const cells=line.split(',');assert.equal(cells.length,fields.length);return Object.fromEntries(fields.map((field,i)=>[field,cells[i]]));});assert.deepEqual(data.items,rows);
 for(const[key,hp,pp]of[['ITEM_POTION','20','0'],['ITEM_REVIVE','254','0'],['ITEM_MAX_REVIVE','255','0'],['ITEM_SITRUS_BERRY','253','0'],['ITEM_MAX_ETHER','0','127'],['ITEM_MAX_ELIXIR','0','127']]){const row=data.items.find(r=>r.item===key)!;assert.equal(row.hp_restore_param,hp);assert.equal(row.pp_restore_param,pp);}
});
test('Potion computes from native data and returns both whole records atomically without mutating even frozen inputs',()=>{
 const inventory=fixture();Object.assign(inventory.party[0],{unknownNested:{a:[1,{b:'kept'}]}});const before=structuredClone(inventory);deepFreeze(inventory);
 const result=apply(inventory,'ITEM_POTION');assert.equal(result.party[0].hp,21);assert.deepEqual(result.bag,{ITEM_POTION:1});assert.deepEqual(inventory,before);assert.equal(result.party[1],inventory.party[1]);assert.notEqual(result.party[0],inventory.party[0]);
 const expected=structuredClone(before.party[0]);expected.hp=21;assert.deepEqual(result.party[0],expected);assert.deepEqual(result.effect,{hp:{before:1,after:21},status:{before:'',after:''},pp:[]});
});
test('ordinary HP medicine caps at maximum and a full target has no effect or consumption',()=>{
 const inventory=fixture();inventory.party[0].hp=inventory.party[0].maxHP-1;const result=apply(inventory,'ITEM_POTION');assert.equal(result.party[0].hp,result.party[0].maxHP);
 const after={party:result.party,bag:result.bag},snapshot=structuredClone(after);assert.deepEqual(planFieldMedicine(data,after,{item:'ITEM_POTION',partySlot:0}),{kind:'no-effect',reason:'no-change'});assert.deepEqual(after,snapshot);
});
test('Full Restore independently cures each major status at full HP and resets the native sleep counter',()=>{
 for(const status of['SLP','PSN','TOX','BRN','FRZ','PAR']){const inventory=fixture('ITEM_FULL_RESTORE');inventory.party[0].hp=inventory.party[0].maxHP;inventory.party[0].status=status;inventory.party[0].sleepTurns=status==='SLP'?5:0;const result=apply(inventory,'ITEM_FULL_RESTORE');assert.equal(result.party[0].status,'');assert.equal(result.party[0].sleepTurns,0);assert.equal(result.party[0].hp,inventory.party[0].maxHP);assert.equal(result.bag.ITEM_FULL_RESTORE,1);}
 const inventory=fixture('ITEM_FULL_RESTORE');inventory.party[0].hp=inventory.party[0].maxHP;assert.equal(planFieldMedicine(data,inventory,{item:'ITEM_FULL_RESTORE',partySlot:0}).kind,'no-effect');
});
test('source status admission precedes HP: fainted status cures and Full Restore are not blocked by an invented blanket check',()=>{
 const antidote=fixture('ITEM_ANTIDOTE');antidote.party[0].hp=0;antidote.party[0].status='TOX';let result=apply(antidote,'ITEM_ANTIDOTE');assert.equal(result.party[0].hp,0);assert.equal(result.party[0].status,'');
 const full=fixture('ITEM_FULL_RESTORE');full.party[0].hp=0;full.party[0].status='PSN';result=apply(full,'ITEM_FULL_RESTORE');assert.equal(result.party[0].hp,full.party[0].maxHP);assert.equal(result.party[0].status,'');
 const ordinary=fixture();ordinary.party[0].hp=0;assert.equal(planFieldMedicine(data,ordinary,{item:'ITEM_POTION',partySlot:0}).kind,'no-effect');
});
test('Revive restores floor-half, Max Revive restores all, and living targets are ineligible',()=>{
 const inventory=fixture('ITEM_REVIVE');inventory.party[0].maxHP=41;inventory.party[0].hp=0;let result=apply(inventory,'ITEM_REVIVE');assert.equal(result.party[0].hp,20);
 inventory.party[0].hp=1;assert.equal(planFieldMedicine(data,inventory,{item:'ITEM_REVIVE',partySlot:0}).kind,'no-effect');
 const full=fixture('ITEM_MAX_REVIVE');full.party[0].hp=0;result=apply(full,'ITEM_MAX_REVIVE');assert.equal(result.party[0].hp,full.party[0].maxHP);
 const shed=fixture('ITEM_REVIVE');shed.party[0]=createMon(data,292,1,'Case',()=>.5);assert.equal(shed.party[0].maxHP,1);shed.party[0].hp=0;assert.equal(apply(shed,'ITEM_REVIVE').party[0].hp,1);
});
test('native quarter/all/fixed restoration uses integer truncation and level100 still accepts ordinary medicine',()=>{
 const quarter=fixture('ITEM_SITRUS_BERRY');quarter.party[0].maxHP=41;assert.equal(apply(quarter,'ITEM_SITRUS_BERRY').party[0].hp,11);
 const fixed=fixture('ITEM_ORAN_BERRY');assert.equal(apply(fixed,'ITEM_ORAN_BERRY').party[0].hp,11);
 const full=fixture('ITEM_MAX_POTION');assert.equal(apply(full,'ITEM_MAX_POTION').party[0].hp,full.party[0].maxHP);
 const max=fixture();max.party[0]=createMon(data,155,100,'Case',()=>.5);max.party[0].hp=1;assert.equal(apply(max,'ITEM_POTION').party[0].hp,21);
});
test('native major status flags choose only their own cures; confusion-only has no field effect',()=>{
 for(const[item,status]of[['ITEM_AWAKENING','SLP'],['ITEM_ANTIDOTE','TOX'],['ITEM_BURN_HEAL','BRN'],['ITEM_ICE_HEAL','FRZ'],['ITEM_PARLYZ_HEAL','PAR'],['ITEM_FULL_HEAL','TOX'],['ITEM_LUM_BERRY','PAR']]){const inventory=fixture(item);inventory.party[0].status=status;assert.equal(apply(inventory,item).party[0].status,'');}
 const wrong=fixture('ITEM_ANTIDOTE');wrong.party[0].status='BRN';assert.equal(planFieldMedicine(data,wrong,{item:'ITEM_ANTIDOTE',partySlot:0}).kind,'no-effect');
 const persim=fixture('ITEM_PERSIM_BERRY');assert.equal(planFieldMedicine(data,persim,{item:'ITEM_PERSIM_BERRY',partySlot:0}).kind,'no-effect');
});
test('single-move PP medicine requests selection, includes full moves, and changes only the selected nonempty slot',()=>{
 const inventory=fixture('ITEM_ETHER');moves(inventory.party[0]);inventory.party[0].moves[1].pp=inventory.party[0].moves[1].maxPP;const preview=planFieldMedicine(data,inventory,{item:'ITEM_ETHER',partySlot:0});assert.equal(preview.kind,'select-move');if(preview.kind==='select-move')assert.deepEqual(preview.moves.map(move=>[move.slot,move.canRestore]),[[0,true],[1,false],[2,true]]);
 const result=apply(inventory,'ITEM_ETHER',2);assert.deepEqual(result.party[0].moves.map(move=>move.pp),[0,inventory.party[0].moves[1].maxPP,10]);assert.deepEqual(result.effect.pp,[{slot:2,before:0,after:10}]);assert.equal(planFieldMedicine(data,inventory,{item:'ITEM_ETHER',partySlot:0,moveSlot:1}).kind,'no-effect');
 inventory.party[0].moves.push({id:0,pp:0,maxPP:0});const empty=planFieldMedicine(data,inventory,{item:'ITEM_ETHER',partySlot:0,moveSlot:3});assert.equal(empty.kind,'no-effect');
});
test('Max Ether uses127, Elixir restores all eligible moves, and boosted capacities survive on fainted level100 mons',()=>{
 const inventory=fixture('ITEM_MAX_ETHER');inventory.party[0]=createMon(data,155,100,'Case',()=>.5);inventory.party[0].hp=0;moves(inventory.party[0]);inventory.party[0].moves[0].maxPP=56;assert.equal(data.moves[inventory.party[0].moves[0].id].pp,35);let result=apply(inventory,'ITEM_MAX_ETHER',0);assert.equal(result.party[0].moves[0].pp,56);assert.equal(result.party[0].moves[0].maxPP,56);assert.equal(result.party[0].hp,0);
 const all=fixture('ITEM_ELIXIR');moves(all.party[0]);all.party[0].moves[1].pp=all.party[0].moves[1].maxPP-1;result=apply(all,'ITEM_ELIXIR');assert.deepEqual(result.party[0].moves.map(move=>move.pp),[10,all.party[0].moves[1].maxPP,10]);
 const maximum=fixture('ITEM_MAX_ELIXIR');moves(maximum.party[0]);result=apply(maximum,'ITEM_MAX_ELIXIR');assert.ok(result.party[0].moves.every(move=>move.pp===move.maxPP));assert.equal(planFieldMedicine(data,{party:result.party,bag:result.bag},{item:'ITEM_MAX_ELIXIR',partySlot:0}).kind,'no-effect');
});
test('actual gifted Eggs reject HP/status/revive/PP use even with internally valid stats, while cancellation never consumes',()=>{
 const state=newState(data,'Case','boy',()=>.5);giveTogepiEgg(data,state,{now:()=>new Date(2026,9,17)});state.party[0].hp=0;state.party[0].status='PSN';for(const item of['ITEM_POTION','ITEM_REVIVE','ITEM_FULL_RESTORE','ITEM_ETHER'])state.bag[item]=1;const before=structuredClone(state);
 for(const item of Object.keys(state.bag))assert.deepEqual(planFieldMedicine(data,state,{item,partySlot:0,moveSlot:0}),{kind:'no-effect',reason:'egg'});
 assert.deepEqual(applyFieldMedicine(data,state,{item:'ITEM_POTION',partySlot:null}),{kind:'cancelled'});assert.deepEqual(applyFieldMedicine(data,state,{item:'ITEM_ETHER',partySlot:0,moveSlot:null}),{kind:'cancelled'});assert.deepEqual(state,before);
});
test('native unsupported dependencies reject the entire item, especially bitter friendship/mood, without a partial heal',()=>{
 for(const item of['ITEM_ENERGYPOWDER','ITEM_ENERGY_ROOT','ITEM_HEAL_POWDER','ITEM_REVIVAL_HERB','ITEM_RARE_CANDY','ITEM_HP_UP','ITEM_PROTEIN','ITEM_PP_UP','ITEM_PP_MAX','ITEM_FIRE_STONE','ITEM_SACRED_ASH','ITEM_X_ATTACK']){const inventory=fixture(item);inventory.party[0].status='PSN';const before=structuredClone(inventory),result=applyFieldMedicine(data,inventory,{item,partySlot:0,moveSlot:0});assert.equal(result.kind,'unsupported',item);assert.deepEqual(inventory,before,item);}
 const inventory=fixture();const result=planFieldMedicine(alteredItem('ITEM_POTION',{friendship_mod_hi:'true',friendship_mod_hi_param:'-15'}),inventory,{item:'ITEM_POTION',partySlot:0});assert.equal(result.kind,'unsupported');
});
test('one-stack use removes the bag slot, unavailable/stale previews do not commit, and data parameters rather than item names drive effects',()=>{
 const inventory=fixture('ITEM_POTION',1);assert.deepEqual(apply(inventory,'ITEM_POTION').bag,{});assert.equal(planFieldMedicine(data,inventory,{item:'ITEM_POTION',partySlot:0}).kind,'ready');delete inventory.bag.ITEM_POTION;assert.deepEqual(applyFieldMedicine(data,inventory,{item:'ITEM_POTION',partySlot:0}),{kind:'no-effect',reason:'unavailable'});assert.equal(inventory.party[0].hp,1);
 const changed=fixture();changed.party[0].maxHP=100;const result=applyFieldMedicine(alteredItem('ITEM_POTION',{hp_restore_param:'60'}),changed,{item:'ITEM_POTION',partySlot:0});assert.equal(result.kind,'applied');if(result.kind==='applied')assert.equal(result.party[0].hp,61);
});
test('malformed parameters, PP capacity, target or inventory fail without modifying whole Mon or bag',()=>{
 for(const change of[(f:ReturnType<typeof fixture>)=>{f.bag.ITEM_POTION=-1;},(f:ReturnType<typeof fixture>)=>{f.party[0].hp=-1;},(f:ReturnType<typeof fixture>)=>{f.party[0].status='unknown';}]){const f=fixture();change(f);const before=structuredClone(f);assert.throws(()=>applyFieldMedicine(data,f,{item:'ITEM_POTION',partySlot:0}));assert.deepEqual(f,before);}
 const pp=fixture('ITEM_ETHER');moves(pp.party[0]);pp.party[0].moves[0].maxPP++;const before=structuredClone(pp);assert.throws(()=>applyFieldMedicine(data,pp,{item:'ITEM_ETHER',partySlot:0,moveSlot:0}),/capacity/);assert.deepEqual(pp,before);
 const f=fixture(),snapshot=structuredClone(f);for(const request of[{item:'ITEM_POTION',partySlot:-1},{item:'ITEM_POTION',partySlot:6},{item:'ITEM_MISSING',partySlot:0}]as FieldMedicineRequest[])assert.throws(()=>applyFieldMedicine(data,f,request));assert.throws(()=>applyFieldMedicine(alteredItem('ITEM_POTION',{hp_restore:'maybe'}),f,{item:'ITEM_POTION',partySlot:0}),/flag/);assert.deepEqual(f,snapshot);
});
test('caller source transaction can roll back committed party and bag together after an awaited field effect fails',async()=>{
 const state=newState(data,'Case','boy',()=>.5),inventory=fixture();state.party=inventory.party;state.bag=inventory.bag;const before=structuredClone(state);const recovery=new SourceActionRecovery(state,{capture:()=>null,restore:async()=>{}});
 await assert.rejects(recovery.run(async()=>{const result=apply(state,'ITEM_POTION');state.party=result.party;state.bag=result.bag;assert.equal(state.party[0].hp,21);await Promise.resolve();throw Error('field effect interrupted');}),/field effect interrupted/);assert.deepEqual(state,before);assert.equal(recovery.busy,false);
});

test('PP restore parameter is nativeu8;127alone is all-PP sentinel and255uses ordinary u8 addition',()=>{
 const inventory=fixture('ITEM_ETHER');moves(inventory.party[0]);inventory.party[0].moves[0].pp=10;const before=structuredClone(inventory);const result=applyFieldMedicine(alteredItem('ITEM_ETHER',{pp_restore_param:'255'}),inventory,{item:'ITEM_ETHER',partySlot:0,moveSlot:0});assert.equal(result.kind,'applied');if(result.kind==='applied')assert.equal(result.party[0].moves[0].pp,9);assert.deepEqual(inventory,before);assert.throws(()=>applyFieldMedicine(alteredItem('ITEM_ETHER',{pp_restore_param:'256'}),inventory,{item:'ITEM_ETHER',partySlot:0,moveSlot:0}),/pp_restore_param/);
});
test('native Berry healing route supports LeppaPP while reusable/direct-use flute routes remain explicit and untouched',()=>{
 const leppa=fixture('ITEM_LEPPA_BERRY',1);moves(leppa.party[0]);const result=apply(leppa,'ITEM_LEPPA_BERRY',1);assert.equal(result.party[0].moves[1].pp,10);assert.deepEqual(result.bag,{});
 for(const item of['ITEM_BLUE_FLUTE','ITEM_YELLOW_FLUTE','ITEM_RED_FLUTE','ITEM_BLACK_FLUTE','ITEM_WHITE_FLUTE']){const inventory=fixture(item);inventory.party[0].status='SLP';const before=structuredClone(inventory);assert.equal(applyFieldMedicine(data,inventory,{item,partySlot:0}).kind,'unsupported');assert.deepEqual(inventory,before);}
});
