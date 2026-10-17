import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
import {loadData} from './data.ts';
import {nativeSpeciesWeight,nativeBattleWeight,nativeWeightBasedPower,UnsupportedBattleWeight} from './battle-weight.ts';
import {NATIVE_SPECIES_WEIGHTS as weights} from './species-weights-data.ts';

const root=new URL('../../../',import.meta.url),requests:string[]=[];
const source=async(path:string)=>readFile(new URL(path,root),'utf8');
const digest=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
globalThis.fetch=async input=>{requests.push(String(input));return new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));};
const data=await loadData(),native=JSON.parse(await source('files/application/zukanlist/zkn_data/zukan_data.json')).mon_stats;
const dir=await mkdtemp(join(tmpdir(),'hg-native-weight-'));after(()=>rm(dir,{recursive:true,force:true}));
function run(command:string,args:string[],input?:string){const result=spawnSync(command,args,{encoding:'utf8',input,maxBuffer:4*1024*1024});assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);return result.stdout;}
function functionSource(text:string,signature:string){const start=text.indexOf(signature);assert.ok(start>=0,signature);const brace=text.indexOf('{',start);let depth=1,end=brace+1;for(;depth&&end<text.length;end++){if(text[end]==='{')depth++;else if(text[end]==='}')depth--;}assert.equal(depth,0);return text.slice(start,end);}
const command=await source('src/battle/battle_command.c'),dex=await source('src/dex_mon_measures.c'),header=await source('include/battle/battle.h'),pokemon=await source('include/constants/pokemon.h');
const asm=await source('asm/overlay_12_battle_command.s');
const tableBody=asm.split('sLowKickDamageTable:')[1].split('.public')[0];
const table=[...tableBody.matchAll(/\.short\s+(\w+),\s*(\w+)/g)].map(row=>[Number(row[1]),Number(row[2])]);
const regular=native.map((row:{weight:number|{altered:number}})=>typeof row.weight==='number'?row.weight:row.weight.altered);
const gira=native.map((row:{weight:number|{origin:number}})=>typeof row.weight==='number'?row.weight:row.weight.origin);
const filesystem=await source('include/filesystem_files_def.h');
const narcId=(name:string)=>Number(filesystem.match(new RegExp(`^\\s*${name}\\s*=\\s*(\\d+),`,'m'))![1]);
const regularNarc=narcId('NARC_application_zukanlist_zkn_data_zukan_data'),giraNarc=narcId('NARC_application_zukanlist_zkn_data_zukan_data_gira');
const member=[...(await source('files/application/zukanlist/zkn_data/zukan_data.json.txt')).matchAll(/\.type\s+(\w+),\s*@object/g)].findIndex(row=>row[1]==='mon_stats_weight');
const altered=Number(pokemon.match(/GIRATINA_ALTERED\s*=\s*(\d+)/)![1]);
const prefix=header.slice(header.indexOf('typedef struct BattleMon {'),header.indexOf('    u32 sendOutFlag : 1;'))+'} BattleMon;';
const copiedLoop=functionSource(command,'BOOL BtlCmd_Transform(').match(/for \(i = 0; i < 40; i\+\+\) \{[\s\S]*?\n    \}/)![0];
const macros=['MAX_MON_MOVES','NUM_STATS','NUM_BATTLE_STATS'].map(key=>pokemon.match(new RegExp(`^#define ${key} +[^\\n]+`,'m'))![0]).join('\n');
const c=`#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>
#include <assert.h>
typedef uint8_t u8;typedef int8_t s8;typedef uint16_t u16;typedef uint32_t u32;typedef int32_t s32;typedef int BOOL;typedef int BattleSystem;
#define FALSE 0
#define TRUE 1
#define GF_ASSERT assert
${macros}
${prefix}
typedef struct {BattleMon battleMons[2];int battlerIdTarget;int movePower;int pointer;} BattleContext;
void BattleScriptIncrementPointer(BattleContext *ctx,int count){ctx->pointer+=count;}
u16 sLowKickDamageTable[6][2]={${table.map(row=>`{${row.join(',')}}`).join(',')}};
${functionSource(command,'BOOL BtlCmd_CalcWeightBasedPower(')}
enum {NARC_application_zukanlist_zkn_data_zukan_data=${regularNarc},NARC_application_zukanlist_zkn_data_zukan_data_gira=${giraNarc},NARC_msg_msg_0812_bin=12,NARC_msg_msg_0813_bin=13,NARC_msg_msg_0814_bin=14,NARC_msg_msg_0815_bin=15,GIRATINA_ALTERED=${altered},HEAP_ID_3=3};
int sDataNarcId,sWeightMsgBank,sHeightMsgBank;
s32 regular[494]={${regular.join(',')}},gira[494]={${gira.join(',')}};
s32 *GfGfxLoader_LoadFromNarc(int narc,int member,int compressed,int heap,int atEnd){assert(narc==${regularNarc}&&member==${member}&&!compressed&&heap==3&&atEnd);return regular;}
void Heap_Free(void *ptr){assert(ptr==regular);}
${functionSource(command,'static s32 GetMonWeight(u16 species) {')}
${functionSource(dex,'void SetDexBanksByGiratinaForm(')}
struct PokedexData {u32 *weight;};
${functionSource(dex,'u32 PokedexData_GetWeight(')}
int main(int argc,char **argv){assert(argc==2);
 if(argv[1][0]=='p'){int weight;while(scanf("%d",&weight)==1){BattleContext ctx={0};ctx.battleMons[1].weight=weight;ctx.battlerIdTarget=1;BtlCmd_CalcWeightBasedPower(NULL,&ctx);assert(ctx.pointer==1);printf("%d\\n",ctx.movePower);}}
 else if(argv[1][0]=='b'){int species,form;while(scanf("%d %d",&species,&form)==2){assert(species>=1&&species<=493);SetDexBanksByGiratinaForm(form);struct PokedexData zkn={(u32*)(sDataNarcId==${giraNarc}?gira:regular)};printf("%u %d\\n",PokedexData_GetWeight(&zkn,species),GetMonWeight(species));}}
 else if(argv[1][0]=='t'){BattleMon a={0},b={0};u32 i;u8 *src=(u8*)&a,*dest=(u8*)&b;b.weight=7500;b.species=487;b.form=1;
 ${copiedLoop}
 printf("%zu %zu %d %u %u\\n",offsetof(BattleMon,weight),sizeof(BattleMon),a.weight,a.species,a.form);}
 return 0;
}`;
await writeFile(join(dir,'oracle.c'),c);
const cc=process.env.CC||'cc',binary=join(dir,'oracle');run(cc,['-std=c99','-Wall','-Wextra','-Wno-unused-parameter','-Werror',join(dir,'oracle.c'),'-o',binary]);

test('all 493 weights plus NONE match original JSON, personal indices and exact source pins',async()=>{
  assert.equal(weights.species.length,494);assert.equal(native.length,494);assert.equal(weights.maxSpecies,493);assert.equal(weights.unit,'hectogram');assert.match(command,/4096\) \{ \/\/ 409\.6 kg/,'native Heavy Ball weight comment establishes kg*10 units');assert.equal(weights.regular[0],69);assert.equal(weights.species[0],'SPECIES_NONE');
  assert.equal(data.nativeWeights,weights,'loadData exposes the compiled pinned banks, without another resource version/fetch');assert.ok(!requests.some(path=>/weight/i.test(path)));
  assert.equal(weights.archives.regular.id,regularNarc);assert.equal(weights.archives.gira.id,giraNarc);assert.equal(weights.archives.member,member);assert.equal(member,1);assert.deepEqual(weights.lowKickTable,table);assert.equal(altered,weights.giraSelectedForm);
  assert.deepEqual(weights.regular,regular);assert.deepEqual(weights.gira,gira);
  for(let species=1;species<=493;species++){assert.equal(weights.species[species],native[species].species);assert.equal(nativeSpeciesWeight(data,species),regular[species]);assert.equal(data.constants[native[species].species],species);}
  assert.deepEqual(weights.regular.flatMap((value,index)=>value===weights.gira[index]?[]:[index]),[487],'the two original banks differ only at Giratina');
  for(const pin of weights.sources)assert.equal(digest(await readFile(new URL(pin.path,root))),pin.sha256,pin.path);
  assert.deepEqual(JSON.parse(await source('browser/public/source/pokemon.json')),JSON.parse(await source('files/poketool/personal/personal.json')),'existing imported personal JSON retains all original source values');
});

test('exporter is deterministic with Python optimization and does not rewrite public source bytes',async()=>{
  const publicPath=new URL('browser/public/source/pokemon.json',root),before=digest(await readFile(publicPath));
  const generated=await source('browser/src/source/species-weights-data.ts'),out=join(dir,'export.ts');
  for(const optimization of[[],['-O']]){run('python3',[...optimization,fileURLToPath(new URL('browser/scripts/export_species_weights.py',root)),'--output',out]);assert.equal(await readFile(out,'utf8'),generated);}
  assert.equal(digest(await readFile(publicPath)),before);
});

test('exporter rejects invalid source weights even under Python optimization',async()=>{
  const copy=join(dir,'invalid-source');
  for(const path of[...weights.sources.map(pin=>pin.path),'browser/scripts/export_species_weights.py']){const target=join(copy,path);await mkdir(join(target,'..'),{recursive:true});await writeFile(target,await readFile(new URL(path,root)));}
  const damaged=JSON.parse(await source(weights.sources[0].path));damaged.mon_stats[1].weight=0;await writeFile(join(copy,weights.sources[0].path),JSON.stringify(damaged));
  const output=join(copy,'weights.ts'),result=spawnSync('python3',['-O',join(copy,'browser/scripts/export_species_weights.py'),'--output',output],{encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stderr,/Invalid native s32 weight at 1/);assert.equal(result.stdout,'');
});

test('inclusive source thresholds retain actual legal species witnesses and adjacent positive integer boundaries',()=>{
  for(const[name,weight,power]of[['KAKUNA',100,20],['MAGIKARP',100,20],['SEADRA',250,40],['CROCONAW',250,40],['VENUSAUR',1000,80],['TROPIUS',1000,80],['SCYTHER',560,80]]as const){assert.equal(nativeSpeciesWeight(data,data.constants[`SPECIES_${name}`]),weight);assert.equal(nativeWeightBasedPower(weight),power);}
  const edges=[[1,20],[99,20],[100,20],[101,40],[249,40],[250,40],[251,60],[499,60],[500,60],[501,80],[999,80],[1000,80],[1001,100],[1999,100],[2000,100],[2001,120],[65535,120],[0x7fffffff,120]];
  for(const[weight,power]of edges)assert.equal(nativeWeightBasedPower(weight),power);
  // Only the species rows above are encounter-capable species claims; numeric
  // boundary probes also cover thresholds having no exactly matching species.
});

test('compiled literal native weight command agrees for 10000 positive inputs, all species/banks and s32 upper bound',()=>{
  const inputs=[...Array.from({length:10000},(_,i)=>i+1),...regular.slice(1),...gira.slice(1),65535,65536,0x7fffffff];
  const output=run(binary,['p'],inputs.join('\n')+'\n').trim().split('\n').map(Number);assert.equal(output.length,inputs.length);
  inputs.forEach((weight,index)=>assert.equal(nativeWeightBasedPower(weight),output[index],String(weight)));
});

test('compiled native bank setter/getters preserve every species and the counterintuitive Giratina form choice',()=>{
  const pairs=Array.from({length:493},(_,index)=>[index+1,0]).concat([[487,1],[487,31],[1,1]]);
  const output=run(binary,['b'],pairs.map(row=>row.join(' ')).join('\n')+'\n').trim().split('\n').map(line=>line.split(' ').map(Number));
  pairs.forEach(([species,form],index)=>assert.deepEqual([nativeBattleWeight(data,species,form),nativeSpeciesWeight(data,species)],output[index]));
  assert.equal(nativeBattleWeight(data,487,0),7500);assert.equal(nativeBattleWeight(data,487,1),6500);assert.equal(nativeSpeciesWeight(data,487),6500);
  assert.equal(altered,0);assert.equal(Number(pokemon.match(/GIRATINA_ORIGIN\s*=\s*(\d+)/)![1]),1,'native enum value, not a missing browser constant export');
});

test('literal native Transform prefix includes live weight: future engine must copy, not recompute',async()=>{
  assert.equal(run(binary,['t']).trim(),'32 40 7500 487 1');
  const util=await source('src/battle/battle_util.c');assert.ok(util.includes('SetDexBanksByGiratinaForm(ctx->battleMons[battlerId].form);'));assert.ok(util.includes('ctx->battleMons[battlerId].weight = PokedexData_GetWeight(dexData, ctx->battleMons[battlerId].species);'));
  // The copied weight7500 + form1 deliberately differ from recomputing form1.
  assert.notEqual(nativeBattleWeight(data,487,1),7500);
});

test('missing/mixed data, NONE/Egg/extended personal indices and uninitialized live weights fail explicitly',()=>{
  for(const species of[0,-1,494,495,501,507,1.5,NaN,Infinity])assert.throws(()=>nativeSpeciesWeight(data,species),UnsupportedBattleWeight);
  for(const weight of[0,-1,1.5,NaN,Infinity,undefined,0x80000000])assert.throws(()=>nativeWeightBasedPower(weight as number),UnsupportedBattleWeight);
  for(const form of[-1,32,.5,NaN,undefined])assert.throws(()=>nativeBattleWeight(data,487,form as number),UnsupportedBattleWeight);
  assert.throws(()=>nativeBattleWeight({...data,nativeWeights:undefined},1,0),/Missing or incompatible/);
  assert.throws(()=>nativeSpeciesWeight({...data,personal:[]},1),/index mismatch/);
  assert.throws(()=>nativeSpeciesWeight({...data,constants:{...data.constants,SPECIES_BULBASAUR:2}},1),/index mismatch/);
  assert.throws(()=>nativeSpeciesWeight({...data,nativeWeights:{...weights,regular:weights.regular.slice(1)}},1),/incompatible/);
  const broken=[...weights.regular];broken[1]=0;assert.throws(()=>nativeSpeciesWeight({...data,nativeWeights:{...weights,regular:broken}},1),/initialized positive/);
  const before=structuredClone(data.nativeWeights);nativeSpeciesWeight(data,1);nativeBattleWeight(data,487,0);nativeWeightBasedPower(100);assert.deepEqual(data.nativeWeights,before,'helpers do not mutate data or a live battler');
});
