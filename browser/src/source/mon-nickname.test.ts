import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createMon,loadData} from './data.ts';
import {canonicalNativeSpeciesName,nativeNicknameCodes,resolveNativeNicknameInput,resolveNativeFieldNicknameInput,applyNativeNicknameResult,applyNativeFieldNicknameInput,migrateLegacyBrowserNicknames,UnsupportedNativeNickname} from './mon-nickname.ts';
import {NATIVE_SPECIES_NICKNAMES,NATIVE_SPECIES_NICKNAME_CODES,NATIVE_NICKNAME_GLYPHS,NATIVE_NICKNAME_AMBIGUOUS_GLYPHS,NATIVE_NICKNAME_PROVENANCE} from './nickname-data.ts';
import type {Mon,State,GameData} from './types.ts';

globalThis.fetch=async input=>{try{return new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));}catch{return new Response('',{status:404});}};
const data=await loadData(),root=fileURLToPath(new URL('../../../',import.meta.url));
const subject=(name='CYNDAQUIL',hasNickname?:boolean)=>({species:155,name,...(hasNickname===undefined?{}:{hasNickname})});
function legacy(party:unknown[],boxes:unknown[]=[]){return{version:2,party,boxes}as Pick<State,'version'|'party'|'boxes'>;}
const migrate=(state:Pick<State,'version'|'party'|'boxes'>)=>migrateLegacyBrowserNicknames(data,state,{origin:'local-browser-v2'});

test('all496 original237 English rows/glyph units are source-pinned and regeneration is byte-identical',async()=>{
 for(const source of NATIVE_NICKNAME_PROVENANCE.sources)assert.equal(createHash('sha256').update(await readFile(root+source.path)).digest('hex'),source.sha256,source.path);
 assert.equal(NATIVE_SPECIES_NICKNAMES.length,496);assert.equal(Object.keys(NATIVE_NICKNAME_GLYPHS).length,2870);
 assert.deepEqual(NATIVE_NICKNAME_AMBIGUOUS_GLYPHS,{'ｚ':[223,245]});
 for(let species=0;species<496;species++){
  assert.equal(canonicalNativeSpeciesName(data,species),data.names.species[species]);
  assert.deepEqual(nativeNicknameCodes(data.names.species[species]),NATIVE_SPECIES_NICKNAME_CODES[species]);
 }
 const command=()=>execFileSync('python3',['browser/scripts/export_nickname_data.py','--check'],{cwd:root,encoding:'utf8'});
 assert.equal(command(),command());
});

test('fresh createMon explicitly stores original default false without changing eight RNG draws or other generated fields',()=>{
 let draws=0;const mon=createMon(data,155,5,'Case',()=>{draws++;return .5;});
 assert.equal(mon.name,'CYNDAQUIL');assert.equal(mon.hasNickname,false);assert.equal(draws,8);
 assert.deepEqual(mon.ivs,[16,16,16,16,16,16]);assert.equal(mon.personality,0x80000000);assert.equal(mon.id,0x7fffffff);assert.equal(mon.nature,0x80000000%25);
 assert.equal(mon.gender,'female');assert.equal(mon.ot,'Case');assert.equal(mon.hp,mon.maxHP);
 for(const species of[152,158,29,32,83,122,439])assert.equal(createMon(data,species,5,'Case',()=>.5).name,NATIVE_SPECIES_NICKNAMES[species]);
});

test('named input compares exact original glyphs; canonical clears flag, custom/case/space differences retain it',()=>{
 for(const input of['Cinder','cyndaquil','CYNDAQUIL ']){
  const mon=subject();assert.equal(applyNativeNicknameResult(data,mon,{kind:'named',name:input}),0);assert.equal(mon.name,input);assert.equal(mon.hasNickname,true);
 }
 const mon=subject('Cinder',true);assert.equal(applyNativeNicknameResult(data,mon,{kind:'named',name:'CYNDAQUIL'}),0);assert.equal(mon.hasNickname,false);
 for(const[species,name]of[[29,'NIDORAN♀'],[32,'NIDORAN♂'],[83,'FARFETCH’D'],[122,'MR. MIME']]as const){const value={species,name:'Custom',hasNickname:true};applyNativeNicknameResult(data,value,{kind:'named',name});assert.equal(value.hasNickname,false);}
});

test('native noInput ABI1 is unchanged; only field task treats existing text as noInput',()=>{
 for(const input of[null,'',' ','   ']){
  const mon=subject('CYNDAQUIL',true),before=structuredClone(mon);
  assert.deepEqual(resolveNativeNicknameInput(input),{kind:'no-input'});assert.equal(applyNativeFieldNicknameInput(data,mon,input),1);assert.deepEqual(mon,before);
 }
 const field=subject('CYNDAQUIL',true);assert.equal(applyNativeFieldNicknameInput(data,field,'CYNDAQUIL'),1);assert.equal(field.hasNickname,true);
 const capture=subject('CYNDAQUIL',true);assert.equal(applyNativeNicknameResult(data,capture,resolveNativeNicknameInput('CYNDAQUIL')),0);assert.equal(capture.hasNickname,false);
 assert.equal(resolveNativeNicknameInput('\u3000').kind,'named','source CHAR_SPACE478 differs from U3000/native1');
 assert.equal(applyNativeNicknameResult(data,subject(),resolveNativeNicknameInput('\u3000')),0);
});

test('unsupported glyphs/length/missing data reject atomically without fallback, normalization or implicit noInput',()=>{
 for(const input of['😀','ｚ','12345678901','\ud800']){const mon=subject('Cinder',true),before=structuredClone(mon);assert.throws(()=>applyNativeFieldNicknameInput(data,mon,input),UnsupportedNativeNickname);assert.deepEqual(mon,before);}
 const mon=subject('Cinder',true),before=structuredClone(mon);
 for(const result of[{kind:'named',name:''},{kind:'named',name:' '},{kind:'bad'}])assert.throws(()=>applyNativeNicknameResult(data,mon,result as never),UnsupportedNativeNickname);
 const absent={names:{species:{155:'Cyndaquil'}}}as Pick<GameData,'names'>;
 assert.throws(()=>applyNativeNicknameResult(absent,mon,{kind:'named',name:'CYNDAQUIL'}),UnsupportedNativeNickname);assert.deepEqual(mon,before);
 for(const index of[-1,496,NaN,1.1])assert.throws(()=>canonicalNativeSpeciesName(data,index),UnsupportedNativeNickname);
 assert.throws(()=>applyNativeNicknameResult(data,undefined as never,{kind:'no-input'}),UnsupportedNativeNickname);
 assert.throws(()=>applyNativeFieldNicknameInput(data,undefined as never,'Cinder'),UnsupportedNativeNickname);
});

test('explicit local-v2 migration admits old default starters and preserves all existing custom/legacy text across party and boxes',()=>{
 const party=[subject(),{species:152,name:'CHIKORITA'},{species:158,name:'TOTODILE'},subject('Cinder'),subject('Cyndaquil'),subject('🐭 old name')];
 const boxes=[subject('CYNDAQUIL',true),subject('Different',false),subject('BOX NAME')],state=legacy(party,boxes),beforeNames=[...party,...boxes].map(mon=>mon.name);
 const result=migrate(state);assert.equal(result.kind,'complete');assert.equal(result.changed.length,7);assert.equal(result.retained,2);
 assert.deepEqual(party.map(mon=>('hasNickname'in mon?mon.hasNickname:undefined)),[false,false,false,true,true,true]);assert.equal(boxes[0].hasNickname,true);assert.equal(boxes[1].hasNickname,false);assert.equal(boxes[2].hasNickname,true);
 assert.deepEqual([...party,...boxes].map(mon=>mon.name),beforeNames);assert.equal(result.changed.filter(row=>row.basis==='exact-canonical').length,3);
 const again=migrate(state);assert.equal(again.changed.length,0);assert.equal(again.retained,9);assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.changed));
});

test('migration preserves Eggs/corruption/foreign/missing data as explicit exclusions, never fabricated false',()=>{
 const party=[{...subject(),isEgg:true},{...subject(),checksumFailed:true},{...subject(),provenance:{language:1}},subject('',undefined),{...subject(),hasNickname:'no'},{species:999,name:'Other'},null,subject()];
 const result=migrate(legacy(party));assert.equal(result.kind,'partial');assert.equal(result.skippedEggs,1);assert.equal(result.unresolved.length,6);assert.equal(result.changed.length,1);
 for(const value of party.slice(0,7))if(value&&value.hasNickname!=='no')assert.equal(value.hasNickname,undefined);
 assert.equal(party[7]!.hasNickname,false);
 const incompatible={names:{species:{155:'Cyndaquil'}}}as Pick<GameData,'names'>,mon=subject();
 const missing=migrateLegacyBrowserNicknames(incompatible,legacy([mon]),{origin:'local-browser-v2'});assert.equal(missing.kind,'partial');assert.equal(missing.unresolved[0].reason,'missing-original-canonical-name');assert.equal(mon.hasNickname,undefined);
 assert.throws(()=>migrateLegacyBrowserNicknames(data,legacy([subject()]),{origin:'raw-native-sav'}as never),UnsupportedNativeNickname);
 assert.throws(()=>migrate({...legacy([]),version:1}as never),UnsupportedNativeNickname);
});

test('historical exact Main naming body changes text without flag/return; proposed field binding returns exact0/1',async()=>{
 const fixture=JSON.parse(await readFile(root+'browser/reviews/native-mon-nickname/legacy-main-naming.json','utf8'));
 const body=fixture.fieldHookBody;
 assert.equal(createHash('sha256').update(body).digest('hex'),fixture.fieldHookBodySHA256);assert.equal(fixture.sourceCommit,'41493524d78b6d62ff5b0a3656bb1fcce0bee985');
 assert.ok(body.includes('mon.name=await ui.input'));
 const old=subject('CYNDAQUIL',false);const actualOld=Function('state','ui',`return(async i=>{${body}})(0)`);
 assert.equal(await actualOld({party:[old]},{input:async()=> 'Cinder'}),undefined);assert.equal(old.name,'Cinder');assert.equal(old.hasNickname,false,'known old Main binding is explicitly NOT repaired by this leaf');
 const proposed=subject('CYNDAQUIL',false);assert.equal(applyNativeFieldNicknameInput(data,proposed,'Cinder'),0);assert.equal(proposed.hasNickname,true);assert.equal(applyNativeFieldNicknameInput(data,proposed,'Cinder'),1);
});

test('23480 source-C FLAT_COMPARE/blank/field-task results agree, including original flag and unchanged-name distinction',{timeout:120000},()=>{
 const oracle=JSON.parse(execFileSync('python3',['browser/scripts/test_mon_nickname.py','--oracle'],{cwd:root,encoding:'utf8',maxBuffer:24*1024*1024}));assert.equal(oracle.cases.length,23480);
 for(const row of oracle.cases){
  const mon={species:row.species,name:row.oldName,hasNickname:row.oldFlag};
  const result=row.mode==='field'?resolveNativeFieldNicknameInput(mon,row.input):resolveNativeNicknameInput(row.input);
  const code=applyNativeNicknameResult(data,mon,result);
  assert.equal(code,row.expected.noInput,JSON.stringify(row));assert.equal(mon.hasNickname,row.expected.hasNickname,JSON.stringify(row));assert.deepEqual(nativeNicknameCodes(mon.name),row.expected.codes,JSON.stringify(row));
 }
 console.log(JSON.stringify({nativeComparisons:oracle.cases.length,wrapperSHA256:oracle.wrapperSHA256,kernels:oracle.kernels}));
});
