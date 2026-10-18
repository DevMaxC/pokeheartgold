import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseNativeEvolutionData,loadNativeEvolutionData,selectNativeEvolution,selectNativeLevelEvolution,nativeEvolutionNight,nativeMapEvolutionMethod,NATIVE_EVOLUTION_METHOD,NATIVE_EVOLUTION_METHODS,UnsupportedNativeEvolutionData,type NativeEvolutionMon,type NativeEvolutionContext} from './evolution-native.ts';
import type {GameData} from './types.ts';

const json=async(path:string)=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const [raw,constants,items,personal]=await Promise.all([json('../../public/source/evolutions.json'),json('../../public/source/constants.json'),json('../../public/source/items.json'),json('../../public/source/pokemon.json')]);
const source={constants,items,personal:personal.baseStats}as Pick<GameData,'constants'|'items'|'personal'>;
const data=parseNativeEvolutionData(raw,source);
function mon(species=155,level=14):NativeEvolutionMon{return{species,level,friendship:70,personality:0,heldItem:null,form:0,stats:{atk:52,def:43,spatk:60,spdef:50,speed:65},moves:[]};}
const level=(value:NativeEvolutionMon,environment={evolutionLocation:0,night:false},party:Parameters<typeof selectNativeLevelEvolution>[1]=[])=>selectNativeLevelEvolution(data,party,value,environment);
function target(value:ReturnType<typeof level>){assert.notEqual(value.kind,'unsupported',JSON.stringify(value));return value.kind==='eligible'?value.target:0;}

test('original230 declarations/247 rules compile to229 species/246 rules; all26 methods/seven slots and native enum retained',async()=>{
 assert.equal(data.sourceRows.length,230);assert.equal(data.declaredRuleCount,247);assert.equal(data.speciesWithRules,229);assert.equal(data.ruleCount,246);assert.equal(data.tables.length,494);assert.ok(data.tables.every(table=>table.length===7));
 assert.equal(data.sourceRows.filter(row=>row.species===70).length,2,'unchanged duplicate native Weepinbell declaration');
 assert.equal(new Set(data.tables.flat().filter(row=>row.method).map(row=>row.method)).size,26);
 const header=await readFile(new URL('../../../include/constants/pokemon.h',import.meta.url),'utf8');
 const keys=header.match(/typedef enum EvoMethod\s*\{([\s\S]*?)\}/)![1].match(/EVO_[A-Z0-9_]+/g)!;assert.deepEqual(NATIVE_EVOLUTION_METHODS,keys);
 assert.equal(NATIVE_EVOLUTION_METHOD.EVO_LEVEL,4);assert.equal(NATIVE_EVOLUTION_METHOD.EVO_LEVEL_SHEDINJA,14);
 assert.deepEqual(data.tables[155][0],{method:4,methodKey:'EVO_LEVEL',target:156,param:14,rowIndex:0});assert.ok(data.tables[157].every(row=>row.method===0&&row.target===0));
});

test('actual three starters select only at native thresholds; fainted HP does not invent an eligibility guard',()=>{
 for(const[species,threshold,evolution]of[[152,16,153],[155,14,156],[158,18,159]]){
  assert.equal(target(level(mon(species,threshold-1))),0);assert.equal(target(level(mon(species,threshold))),evolution);assert.equal(target(level(mon(species,100))),evolution);
 }
 assert.equal(target(level(Object.assign(mon(),{hp:0}))),156);
 const before=mon();const copy=structuredClone(before);level(before);assert.deepEqual(before,copy);
});

test('Everstone uses raw held effect despite ability, while Kadabra and item-use retain original exceptions',()=>{
 const held=Object.assign(mon(),{heldItem:'ITEM_EVERSTONE',ability:'ABILITY_KLUTZ'});assert.deepEqual(level(held),{kind:'ineligible',methodRet:null,reason:'everstone'});
 assert.equal(target(selectNativeEvolution(data,[],{...mon(64),heldItem:'ITEM_EVERSTONE'},{kind:'trade'})),65);
 const pikachu={...mon(25),heldItem:'ITEM_EVERSTONE'};
 assert.equal(target(selectNativeEvolution(data,[],pikachu,{kind:'item-check',usedItem:constants.ITEM_THUNDERSTONE})),0);
 const used=selectNativeEvolution(data,[],pikachu,{kind:'item-use',usedItem:constants.ITEM_THUNDERSTONE});assert.equal(target(used),26);assert.equal(used.kind==='eligible'&&used.methodRet,0);
 const custom=structuredClone(source);custom.items.find(row=>row.item==='ITEM_ORAN_BERRY')!.holdEffect='HOLD_EFFECT_NO_EVOLVE';const changed=parseNativeEvolutionData(raw,custom);
 assert.equal(selectNativeLevelEvolution(changed,[],{...mon(),heldItem:'ITEM_ORAN_BERRY'},{}).kind,'ineligible','raw source effect, not comparison with item name');
 assert.equal(level({...mon(),heldItem:'ITEM_NOT_EXPORTED'}).kind,'unsupported');
});

test('Pichu requires actual form and spiky-ear form1 is blocked in every source context',()=>{
 const pichu={...mon(172),friendship:220};assert.equal(target(level(pichu)),25);
 assert.equal(level({...pichu,form:undefined}).kind,'unsupported');assert.equal(target(level({...mon(),form:undefined})),156,'ordinary level evolution does not need form');
 for(const context of[{kind:'levelup',evolutionLocation:0,night:false},{kind:'trade'},{kind:'item-check',usedItem:0},{kind:'item-use',usedItem:0}]as const)assert.deepEqual(selectNativeEvolution(data,[],{...pichu,form:1},context),{kind:'ineligible',methodRet:null,reason:'spiky-ear-pichu'});
});

test('malformed inherited held-item keys remain unsupported instead of acting like native ITEM_NONE',()=>{
 for(const heldItem of['constructor','toString','__proto__']){
  const result=level({...mon(),heldItem});assert.equal(result.kind,'unsupported',heldItem);if(result.kind==='unsupported')assert.deepEqual(result.requirements,['held-item']);
 }
 assert.equal(Object.getPrototypeOf(data.items),null);
});

test('level-up wrapper owns the native context even when a structurally widened environment carries kind',()=>{
 const environment={night:false,evolutionLocation:0,kind:'trade'as const};
 assert.equal(target(selectNativeLevelEvolution(data,[],mon(64),environment)),0,'Kadabra must not trade-evolve through the level-up wrapper');
 assert.equal(target(selectNativeEvolution(data,[],mon(64),{kind:'trade'})),65,'the actual explicit native trade call still works');
});

test('RTC uses exact native four-hour late bucket; map location is always EVO_NONE in HGSS and first matching row wins',()=>{
 for(let hour=0;hour<24;hour++)assert.equal(nativeEvolutionNight(hour),hour<4||hour>=20);
 assert.throws(()=>nativeEvolutionNight(24),RangeError);assert.throws(()=>nativeEvolutionNight(NaN),RangeError);
 for(const id of[0,21,46,180,539])assert.equal(nativeMapEvolutionMethod(id),0);
 const eevee={...mon(133),friendship:220};assert.equal(target(level(eevee)),196);assert.equal(target(level(eevee,{evolutionLocation:0,night:true})),197);
 assert.equal(target(level(eevee,{evolutionLocation:25,night:true})),470,'earlier literal location row beats later friendship/night row');
 assert.equal(selectNativeLevelEvolution(data,[],eevee,{night:true}).kind,'unsupported','missing earlier location cannot be guessed false');
 const magneton=mon(82,1);assert.equal(target(level(magneton,{evolutionLocation:24,night:false})),462);assert.equal(target(level(magneton)),0,'no fabricated HGSS mountain proximity');
});

test('gender methods use new personal/PID calculation, never the cached gender label',()=>{
 const male=Object.assign(mon(281),{personality:255,gender:'female'}),female=Object.assign(mon(281),{personality:0,gender:'male'}),usedItem=constants.ITEM_DAWN_STONE;
 assert.equal(target(selectNativeEvolution(data,[],male,{kind:'item-use',usedItem})),475);assert.equal(target(selectNativeEvolution(data,[],female,{kind:'item-use',usedItem})),0);
 assert.equal(target(level({...mon(412,20),personality:255})),414);assert.equal(target(level({...mon(412,20),personality:0})),413);
 assert.equal(target(level({...mon(415,21),personality:0})),416);assert.equal(target(level({...mon(415,21),personality:255})),0);
});

test('native Atk/Def and PID-high-word branches, learned moves and raw held item/time all match source',()=>{
 for(const[atk,def,evolution]of[[99,100,107],[100,100,237],[101,100,106]])assert.equal(target(level({...mon(236,20),stats:{...mon().stats,atk,def}})),evolution);
 assert.equal(target(level({...mon(265,7),personality:4<<16})),266);assert.equal(target(level({...mon(265,7),personality:5<<16})),268);
 assert.equal(target(level({...mon(190),moves:[{id:constants.MOVE_DOUBLE_HIT,pp:1,maxPP:1}]})),424);assert.equal(target(level(mon(190))),0);
 assert.equal(target(level({...mon(440),heldItem:'ITEM_OVAL_STONE'})),113);assert.equal(target(level({...mon(440),heldItem:'ITEM_OVAL_STONE'},{evolutionLocation:0,night:true})),0);
});

test('party species-or-egg semantics exclude Eggs/corruption, retain fainted Remoraid and accept actual NULL party',()=>{
 const mantyke=mon(458);assert.equal(target(level(mantyke,undefined,[{species:223}])),226);
 assert.equal(target(level(mantyke,undefined,[Object.assign({species:223},{hp:0})])),226);
 for(const party of[null,[],[{species:223,isEgg:true}],[{species:223,checksumFailed:true}]])assert.equal(target(level(mantyke,undefined,party)),0);
 assert.equal(selectNativeLevelEvolution(data,undefined as never,mantyke,{}).kind,'unsupported','missing party pointer is distinct from explicit source NULL');
});

test('missing beauty/night/state is explicit unsupported; Nincada preserves method_ret-only row and no Shedinja target',()=>{
 const beauty=level(mon(349));assert.equal(beauty.kind,'unsupported');if(beauty.kind==='unsupported')assert.deepEqual(beauty.requirements,['beauty']);
 assert.equal(target(level({...mon(349),beauty:169})),0);assert.equal(target(level({...mon(349),beauty:170})),350);
 assert.equal(selectNativeLevelEvolution(data,[],{...mon(133),friendship:220},{evolutionLocation:0}).kind,'unsupported');
 assert.deepEqual(level(mon(290,19)),{kind:'ineligible',methodRet:14,reason:'no-match'});const nincada=level(mon(290,20));assert.equal(target(nincada),291);assert.equal(nincada.kind==='eligible'&&nincada.methodRet,13);
 assert.equal(level({...mon(),checksumFailed:true}).kind,'unsupported');
});

test('loader is explicit, immutable, validates every method/parameter and propagates I/O failure without fallback',async()=>{
 const requested:string[]=[];assert.equal((await loadNativeEvolutionData(source,async path=>{requested.push(path);return raw;})).ruleCount,246);assert.deepEqual(requested,['evolutions.json']);
 const failure=Error('source unavailable');await assert.rejects(loadNativeEvolutionData(source,async()=>{throw failure;}),error=>error===failure);
 assert.throws(()=>parseNativeEvolutionData({evoTable:[{baseSpecies:'SPECIES_CYNDAQUIL',evos:[{method:'EVO_FAKE',param:14,target:'SPECIES_QUILAVA'}]}]},source),UnsupportedNativeEvolutionData);
 const duplicate=parseNativeEvolutionData({evoTable:[raw.evoTable[0],{...raw.evoTable[0],evos:[{method:'EVO_LEVEL',param:17,target:'SPECIES_IVYSAUR'}]}]},source);assert.equal(duplicate.sourceRows.length,2);assert.equal(duplicate.tables[1][0].param,17,'last designated native initializer wins');assert.equal(duplicate.tables[1][1].method,0);
 const invalid=structuredClone(raw);invalid.evoTable[0].evos[0].param='MOVE_UNAVAILABLE';assert.throws(()=>parseNativeEvolutionData(invalid,source),UnsupportedNativeEvolutionData);
 assert.throws(()=>{(data.tables[155][0]as{param:number}).param=1;},TypeError);assert.throws(()=>{(data.items.ITEM_EVERSTONE as{holdEffect:number}).holdEffect=0;},TypeError);
 assert.equal(selectNativeLevelEvolution({...data},[],mon(),{}).kind,'unsupported','caller cannot fabricate an unparsed data object');
});

test('differential all real evolution records against seven unchanged original C kernels and original headers',{timeout:120000},()=>{
 const root=fileURLToPath(new URL('../../../',import.meta.url));
 const oracle=JSON.parse(execFileSync('python3',['browser/scripts/test_evolution_native.py','--oracle'],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024}));
 assert.equal(oracle.cases.length,9359);assert.equal(Object.keys(oracle.functions).length,7);
 const observed=new Set<number>();
 for(const entry of oracle.cases){
  const context:NativeEvolutionContext=entry.context.kind==='levelup'?{...entry.context,night:nativeEvolutionNight(entry.hour)}:entry.context;
  const decision=selectNativeEvolution(data,entry.party,entry.mon,context);
  assert.notEqual(decision.kind,'unsupported',JSON.stringify({entry,decision}));
  const actualTarget=decision.kind==='eligible'?decision.target:0,actualMethod=decision.kind==='unsupported'?null:decision.methodRet;
  if(decision.kind==='eligible')observed.add(decision.method);else if(decision.kind==='ineligible'&&decision.methodRet===14)observed.add(14);
  assert.equal(actualTarget,entry.expected.target,JSON.stringify({entry,decision}));assert.equal(actualMethod,entry.expected.methodRet===-777?null:entry.expected.methodRet,JSON.stringify({entry,decision}));
  assert.equal(nativeEvolutionNight(entry.hour),!!entry.expected.night);assert.equal(nativeMapEvolutionMethod(0),entry.expected.mapMethod);
 }
 assert.deepEqual([...observed].sort((a,b)=>a-b),Array.from({length:26},(_,i)=>i+1),'every native method selected or literal Shedinja method_ret-only write exercised');
 console.log(JSON.stringify({originalCComparisons:oracle.cases.length,observedMethods:[...observed].sort((a,b)=>a-b),functions:oracle.functions,wrapperSHA256:oracle.wrapperSHA256}));
});
