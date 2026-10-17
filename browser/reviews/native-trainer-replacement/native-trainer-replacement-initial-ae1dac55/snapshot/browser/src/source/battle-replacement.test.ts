import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {loadData} from './data.ts';
import {originalTrainerParty} from './trainers.ts';
import {nativePostKOTrainerReplacement,nativeTrainerReplacement,nativeTrainerMoveType,nativeReplacementTypeScore,nativeReplacementMoveFlags,type TrainerReplacementMon,type TrainerReplacementContext,type TrainerReplacementEvaluator} from './battle-replacement.ts';

globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData(),c=data.constants;
const controller=await readFile(new URL('../../../src/battle/battle_controller_opponent.c',import.meta.url),'utf8'),util=await readFile(new URL('../../../src/battle/battle_util.c',import.meta.url),'utf8');
function extract(source:string,signature:string){
  const pattern=new RegExp(signature.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'[^;{]*\\{'),match=pattern.exec(source);assert.ok(match,`native definition ${signature}`);
  const start=match.index,brace=source.indexOf('{',start);let depth=0;
  for(let i=brace;i<source.length;i++){if(source[i]==='{')depth++;if(source[i]==='}'&&!--depth)return source.slice(start,i+1);}throw Error('Incomplete native definition');
}
const table=util.match(/static const u8 sTypeEffectiveness\[\]\[3\] = \{[\s\S]*?\n\};/)?.[0];assert.ok(table,'literal source-ordered type table');
const include=fileURLToPath(new URL('../../../include',import.meta.url)),directory=await mkdtemp(join(tmpdir(),'heartgold-replacement-')),binary=join(directory,'native');
// Execute the actual native selector, move-type and flags routines. The two
// heavyweight damage calls are explicit neutral test ports, not a second damage
// implementation. They log the already-byte-truncated argument passed by C.
const fields=['SPECIES_OR_EGG','HP','TYPE_1','TYPE_2','ABILITY','HELD_ITEM','HP_IV','ATK_IV','DEF_IV','SPEED_IV','SPATK_IV','SPDEF_IV','MOVE1'];
for(const key of fields)assert.ok(Number.isInteger(c[`MON_DATA_${key}`]),key);
const oracle=`#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "constants/battle.h"
#include "constants/pokemon.h"
#include "constants/species.h"
#include "constants/items.h"
#include "constants/moves.h"
#include "constants/move_effects.h"
#include "constants/abilities.h"
typedef uint8_t u8;typedef uint16_t u16;typedef uint32_t u32;typedef int BOOL;
#define TRUE 1
#define FALSE 0
#define PARTY_SIZE 6
#define MOVE_STATUS_IMMUNE (MOVE_STATUS_NO_EFFECT|MOVE_STATUS_WONDER_GUARD_IMMUNE|MOVE_STATUS_LEVITATE_IMMUNE|MOVE_STATUS_MAGNET_RISE_IMMUNE)
${fields.map(key=>`#define MON_DATA_${key} ${c[`MON_DATA_${key}`]}`).join('\n')}
#define BMON_DATA_TYPE_1 ${c.BMON_DATA_TYPE_1}
#define BMON_DATA_TYPE_2 ${c.BMON_DATA_TYPE_2}
typedef struct{int species,egg,hp,type1,type2,ability,item,naturalGift,ivs[6],moves[4];}Pokemon;
typedef struct{int power,type,effect;}Move;
typedef struct{int selectedMonIndex[3],aiSwitchedPartySlot[3];u32 fieldSideConditionFlags[2],fieldCondition,battleStatus;struct{Move moveData[600];}trainerAIData;}BattleContext;
typedef struct{BattleContext ctx;int size;Pokemon party[6];int opponentType1,opponentType2,opponentAbility,opponentItem,suppressed;}BattleSystem;
typedef BattleSystem Party;typedef int SysTask;
typedef struct{BattleSystem*battleSystem;int battlerId,selectedMonIndex[3],command;}OpponentShowMonListWork;
static BattleSystem bs;static int damage[600],numerator[600],denominator[600],offset[600],immune[600],reply,calcCount,typeCount,firstByte,heldEffects[6];
int MaskOfFlagNo(int i){return 1<<i;}int BattleSystem_GetBattleType(BattleSystem*b){return 0;}
BattleContext*BattleSystem_GetBattleContext(BattleSystem*b){return &b->ctx;}
int BattleSystem_GetBattlerIdPartner(BattleSystem*b,int i){return 1;}
int Battler_GetRandomOpposingBattlerId(BattleSystem*b,BattleContext*c,int i){return 2;}
int BattleSystem_GetPartySize(BattleSystem*b,int i){return b->size;}Pokemon*BattleSystem_GetPartyMon(BattleSystem*b,int actor,int i){return &b->party[i];}
Party*BattleSystem_GetParty(BattleSystem*b,int actor){return b;}int Party_GetCount(Party*p){return p->size;}
int GetMonData(Pokemon*p,int key,void*out){
 if(key>=MON_DATA_MOVE1&&key<MON_DATA_MOVE1+4)return p->moves[key-MON_DATA_MOVE1];
 switch(key){case MON_DATA_SPECIES_OR_EGG:return p->egg?SPECIES_EGG:p->species;case MON_DATA_HP:return p->hp;case MON_DATA_TYPE_1:return p->type1;case MON_DATA_TYPE_2:return p->type2;case MON_DATA_ABILITY:return p->ability;case MON_DATA_HELD_ITEM:return p->item;
 ${['HP','ATK','DEF','SPEED','SPATK','SPDEF'].map((key,i)=>`case MON_DATA_${key}_IV:return p->ivs[${i}];`).join('\n')} }return 0;}
int GetItemVar(BattleContext*c,int item,int key){if(!item)return 0;Pokemon*p=&bs.party[item-1];return key==ITEMATTR_NATURAL_GIFT_TYPE?p->naturalGift:heldEffects[item-1];}
int GetBattlerVar(BattleContext*c,int actor,int key,void*out){return key==BMON_DATA_TYPE_1?bs.opponentType1:bs.opponentType2;}
int GetBattlerAbility(BattleContext*c,int actor){return bs.opponentAbility;}int GetBattlerHeldItemEffect(BattleContext*c,int actor){return bs.opponentItem;}
int CheckAbilityActive(BattleSystem*b,BattleContext*c,int mode,int actor,int ability){return b->suppressed;}
int BattleSystem_GetFieldSide(BattleSystem*b,int actor){return 1;}
int CalcMoveDamage(BattleSystem*b,BattleContext*c,int move,int side,int field,int power,int type,int actor,int target,int crit){if(actor!=0||target!=2||crit!=1)abort();calcCount++;return damage[move];}
int BattleSystem_ApplyTypeEffectiveness(BattleSystem*b,BattleContext*c,int move,int type,int actor,int target,int score,u32*flags){if(!typeCount)firstByte=score;typeCount++;if(immune[move])*flags|=MOVE_STATUS_NO_EFFECT;return score*numerator[move]/denominator[move]+offset[move];}
void BattleController_ReplyPartySelection(BattleSystem*b,int actor,int value){reply=value;}
void BattleController_EmitCommandComplete(BattleSystem*b,int actor,int command){}void Heap_Free(void*p){}void SysTask_Destroy(SysTask*t){}
${table}
static int CheckChargeMoveHitTurn(BattleContext*,int);static BOOL CheckFlyingImmunity(BattleContext*,int,int);static void ApplyEffectivenessFlags(int,u32*);
${extract(util,'static int CheckChargeMoveHitTurn(')}
${extract(util,'static BOOL CheckFlyingImmunity(')}
${extract(util,'static void ApplyEffectivenessFlags(')}
${extract(util,'int CalculateTypeEffectiveness(')}
${extract(util,'void CalcTypeEffectivenessFlags(')}
${extract(controller,'int TrainerAI_GetMoveType(')}
${extract(controller,'int TrainerAI_PostKOSwitchIn(')}
${extract(controller,'int TrainerAI_GetSwitchedPartySlot(')}
${extract(controller,'void Task_AIShowMonList(')}
static void setup(void){int active,partner,chosen,otherChosen,gravity,weather,suppressed,charge;
 memset(&bs,0,sizeof(bs));calcCount=typeCount=0;firstByte=-1;
 scanf("%d%d%d%d%d%d%d%d%d%d%d%d%d",&bs.size,&active,&partner,&chosen,&otherChosen,&bs.opponentType1,&bs.opponentType2,&bs.opponentAbility,&bs.opponentItem,&gravity,&weather,&suppressed,&charge);
 bs.ctx.selectedMonIndex[0]=active;bs.ctx.selectedMonIndex[1]=partner;bs.ctx.aiSwitchedPartySlot[0]=chosen;bs.ctx.aiSwitchedPartySlot[1]=otherChosen;
 bs.ctx.fieldCondition=(gravity?FIELD_CONDITION_GRAVITY:0)|(weather&1?FIELD_CONDITION_RAIN:0)|(weather&2?FIELD_CONDITION_SANDSTORM:0)|(weather&4?FIELD_CONDITION_SUN:0)|(weather&8?FIELD_CONDITION_HAIL:0);bs.suppressed=suppressed;bs.ctx.battleStatus=charge?BATTLE_STATUS_CHARGE_MOVE_HIT:0;
 for(int i=0;i<bs.size;i++){Pokemon*p=&bs.party[i];int held;
 scanf("%d%d%d%d%d%d%d%d",&p->species,&p->egg,&p->hp,&p->type1,&p->type2,&p->ability,&held,&p->naturalGift);p->item=i+1;
 for(int j=0;j<6;j++)scanf("%d",&p->ivs[j]);for(int j=0;j<4;j++)scanf("%d",&p->moves[j]);
 // GetItemVar needs the native held EFFECT for Judgment, not its ability.
 heldEffects[i]=held;
 }
 for(int i=0;i<600;i++){damage[i]=0;numerator[i]=denominator[i]=1;offset[i]=0;immune[i]=0;}
 ${data.moves.map(m=>`bs.ctx.trainerAIData.moveData[${m.id}]=(Move){${m.power},${m.type},${m.effect}};`).join('\n')}
}
int main(void){char mode;while(scanf(" %c",&mode)==1){
 if(mode=='T'){int move,a,b;scanf("%d%d%d",&move,&a,&b);printf("%d\\n",CalculateTypeEffectiveness(move,a,b));continue;}
 setup();int move,over;
 if(mode=='G'){scanf("%d",&move);printf("%d\\n",TrainerAI_GetMoveType(&bs,&bs.ctx,&bs.party[0],move));continue;}
 if(mode=='F'){u32 flags=0;scanf("%d%d",&move,&over);CalcTypeEffectivenessFlags(&bs.ctx,move,over,bs.party[0].ability,bs.opponentAbility,bs.opponentItem,bs.opponentType1,bs.opponentType2,&flags);printf("%u\\n",flags);continue;}
 int n;scanf("%d",&n);for(int i=0;i<n;i++){int m;scanf("%d",&m);scanf("%d%d%d%d%d",&damage[m],&numerator[m],&denominator[m],&offset[m],&immune[m]);}
 int post=TrainerAI_PostKOSwitchIn(&bs,0);calcCount=typeCount=0;firstByte=-1;OpponentShowMonListWork work={.battleSystem=&bs,.battlerId=0};memcpy(work.selectedMonIndex,bs.ctx.selectedMonIndex,sizeof(work.selectedMonIndex));Task_AIShowMonList(NULL,&work);printf("%d %d %d %d %d\\n",post,reply-1,calcCount,typeCount,firstByte);
 }return 0;}
`;
await writeFile(join(directory,'native.c'),oracle);
execFileSync(process.env.CC||'cc',['-std=c99','-O0','-I',include,join(directory,'native.c'),'-o',binary],{stdio:'pipe'});
after(()=>rm(directory,{recursive:true,force:true}));
function nativeRows(lines:string[]){return execFileSync(binary,[],{input:lines.join('\n')+'\n',encoding:'utf8'}).trim().split('\n').map(line=>line.split(/\s+/).map(Number));}
function mon(types:readonly[number,number]=[0,0],moves:readonly number[]=[c.MOVE_TACKLE]):TrainerReplacementMon{return{species:c.SPECIES_RATTATA,hp:20,types,ability:c.ABILITY_NONE,heldEffect:c.HOLD_EFFECT_NONE,ivs:[0,0,0,0,0,0],naturalGiftType:0,moves};}
function context(party:TrainerReplacementMon[],opponent:readonly[number,number]=[0,0]):TrainerReplacementContext{return{party,activePartyIndex:0,opponent:{types:opponent,ability:0,heldEffect:0}};}
function setup(ctx:TrainerReplacementContext){const e=ctx.environment,weather=(e?.weather||[]).reduce((bits,w)=>bits|({rain:1,sandstorm:2,sun:4,hail:8}[w]),0);return[ctx.party.length,ctx.activePartyIndex,ctx.partnerPartyIndex??6,ctx.aiSwitchedPartyIndex??6,ctx.partnerAISwitchedPartyIndex??6,...ctx.opponent.types,ctx.opponent.ability,ctx.opponent.heldEffect,Number(e?.gravity||false),weather,Number(e?.weatherSuppressed||false),Number(e?.chargeMoveHit||false),...ctx.party.flatMap(p=>[p.species,Number(p.isEgg||false),p.hp,...p.types,p.ability,p.heldEffect,p.naturalGiftType??0,...(p.ivs||[0,0,0,0,0,0]),...Array.from({length:4},(_,i)=>p.moves[i]??0)])].join(' ');}
type DamagePorts=Record<number,[raw:number,numerator:number,denominator:number,offset:number,immune:number]>;
function compare(ctx:TrainerReplacementContext,ports:DamagePorts={},expected?:number,message?:string){
  const calls:number[][]=[],values=(move:number)=>ports[move]||[0,1,1,0,0];
  const evaluator:TrainerReplacementEvaluator={currentActorDamage:move=>values(move)[0],applyCurrentActorType:(move,type,score)=>{calls.push([move,type,score]);const v=values(move);return{damage:Math.trunc(score*v[1]/v[2])+v[3],immune:!!v[4]};}};
  const rows=Object.entries(ports).map(([move,values])=>[move,...values].join(' '));
  const [[post,selected,calcCount,typeCount,firstByte]]=nativeRows([`S ${setup(ctx)} ${rows.length} ${rows.join(' ')}`]);
  assert.equal(nativePostKOTrainerReplacement(data,ctx,evaluator),post);
  calls.length=0;const actual=nativeTrainerReplacement(data,ctx,evaluator);assert.equal(actual,selected);assert.equal(calls.length,typeCount);assert.equal(calcCount,typeCount);assert.equal(calls[0]?.[2]??-1,firstByte);if(expected!==undefined)assert.equal(actual,expected,message);return{actual,calls};
}

test('all native type scores and ordered flag rows match actual C, including duplicated mono-types',()=>{
  const lines:string[]=[],keys:number[][]=[];for(let move=0;move<18;move++)for(let a=0;a<18;a++)for(let b=0;b<18;b++){lines.push(`T ${move} ${a} ${b}`);keys.push([move,a,b]);}
  const native=nativeRows(lines);for(let i=0;i<keys.length;i++){const[m,a,b]=keys[i];assert.equal(nativeReplacementTypeScore(data,m,[a,b]),native[i][0]);}
  assert.equal(nativeReplacementTypeScore(data,c.TYPE_BUG,[c.TYPE_GRASS,c.TYPE_GRASS]),80,'defensive mono-type not applied twice');
});
test('Stage1 preserves u8 offensive-score overflow, mono-own-type double-counting, and party-order ties',()=>{
  const party=[{...mon(),hp:0},mon([c.TYPE_FIRE,c.TYPE_FIRE],[c.MOVE_EMBER]),mon([c.TYPE_ROCK,c.TYPE_NORMAL],[c.MOVE_ROCK_THROW])];
  compare(context(party,[c.TYPE_GRASS,c.TYPE_BUG]),{},2); // Fire160+160 wraps64, Rock80+40=120.
  compare(context([party[0],mon([c.TYPE_FIRE,c.TYPE_FIRE],[c.MOVE_EMBER]),mon([c.TYPE_FIRE,c.TYPE_NORMAL],[c.MOVE_EMBER])],[c.TYPE_GRASS,c.TYPE_GRASS]),{},1);
  compare(context([party[0],party[1],{...party[1]}],[c.TYPE_GRASS,c.TYPE_GRASS]),{},1);
});
test('Stage1 repeatedly discards best matchup without an SE move before evaluating next reserve',()=>{
  compare(context([{...mon(),hp:0},mon([c.TYPE_FIRE,c.TYPE_FIRE],[c.MOVE_LEER]),mon([c.TYPE_NORMAL,c.TYPE_NORMAL],[c.MOVE_EMBER])],[c.TYPE_GRASS,c.TYPE_GRASS]),{},2);
  // Native flags can retain SE alongside immunity. Do not replace flags by net type factor.
  const m=mon([0,0],[c.MOVE_THUNDER_SHOCK]),ctx=context([{...mon(),hp:0},m],[c.TYPE_GROUND,c.TYPE_FLYING]);compare(ctx,{},1);
  assert.equal(nativeReplacementMoveFlags(data,m,c.MOVE_THUNDER_SHOCK,0,ctx.opponent),2|8);
});
test('actual native flag helpers include candidate ability, target held effect, charge state and source ordering',()=>{
  const rows:{ctx:TrainerReplacementContext;move:number;override:number}[]=[];
  for(const ability of[c.ABILITY_NONE,c.ABILITY_NORMALIZE,c.ABILITY_MOLD_BREAKER,c.ABILITY_SCRAPPY])for(const targetAbility of[c.ABILITY_NONE,c.ABILITY_LEVITATE,c.ABILITY_WONDER_GUARD])for(const type of[[c.TYPE_GROUND,c.TYPE_FLYING],[c.TYPE_GHOST,c.TYPE_GRASS],[c.TYPE_GRASS,c.TYPE_STEEL]]as const)for(const gravity of[false,true])for(const held of[c.HOLD_EFFECT_NONE,c.HOLD_EFFECT_SPEED_DOWN_GROUNDED])for(const move of[c.MOVE_EARTHQUAKE,c.MOVE_TACKLE,c.MOVE_EMBER,c.MOVE_SOLAR_BEAM,c.MOVE_STRUGGLE]){
    const ctx={...context([{...mon(),ability}],type),environment:{gravity,chargeMoveHit:gravity}};ctx.opponent.ability=targetAbility;ctx.opponent.heldEffect=held;rows.push({ctx,move,override:0});
  }
  const expected=nativeRows(rows.map(row=>`F ${setup(row.ctx)} ${row.move} ${row.override}`));for(let i=0;i<rows.length;i++){const row=rows[i];assert.equal(nativeReplacementMoveFlags(data,row.ctx.party[0],row.move,row.override,row.ctx.opponent,row.ctx.environment),expected[i][0]);}
});
test('native move-type overrides use source item/IV order and active weather precedence',()=>{
  const rows:{ctx:TrainerReplacementContext;move:number}[]=[];
  for(let bits=0;bits<64;bits++)rows.push({ctx:context([{...mon(),ivs:Array.from({length:6},(_,i)=>bits>>i&1)}]),move:c.MOVE_HIDDEN_POWER});
  for(const item of data.items){const heldEffect=c[item.holdEffect];if(item.holdEffect.startsWith('HOLD_EFFECT_ARCEUS_')||item.item==='ITEM_NONE')rows.push({ctx:context([{...mon(),heldEffect}]),move:c.MOVE_JUDGMENT});if(Number(item.naturalGiftPower))rows.push({ctx:context([{...mon(),naturalGiftType:c[item.naturalGiftType]}]),move:c.MOVE_NATURAL_GIFT});}
  for(const weather of[['rain'],['sandstorm'],['sun'],['hail'],['rain','sun','hail']]as const)rows.push({ctx:{...context([mon()]),environment:{weather}},move:c.MOVE_WEATHER_BALL});
  rows.push({ctx:context([mon()]),move:c.MOVE_TACKLE});
  const expected=nativeRows(rows.map(row=>`G ${setup(row.ctx)} ${row.move}`));for(let i=0;i<rows.length;i++)assert.equal(nativeTrainerMoveType(data,rows[i].ctx.party[0],rows[i].move,rows[i].ctx.environment),expected[i][0]);
  assert.throws(()=>nativeTrainerMoveType(data,mon(),c.MOVE_WEATHER_BALL),/Unsupported native AI Weather Ball/);
  assert.throws(()=>nativeTrainerMoveType(data,mon(),c.MOVE_WEATHER_BALL,{weather:['sun'],weatherSuppressed:true}),/Unsupported/);
  assert.throws(()=>nativeTrainerMoveType(data,{...mon(),ivs:undefined},c.MOVE_HIDDEN_POWER),/six/);
  assert.throws(()=>nativeTrainerMoveType(data,{...mon(),naturalGiftType:undefined},c.MOVE_NATURAL_GIFT),/item type/);
});
test('Stage2 makes separate byte assignments before/after type application and reuses skipped-move score',()=>{
  const ctx=context([{...mon(),hp:0},mon([0,0],[c.MOVE_TACKLE]),mon([0,0],[c.MOVE_SCRATCH])]);
  const result=compare(ctx,{[c.MOVE_TACKLE]:[300,3,2,0,0],[c.MOVE_SCRATCH]:[100,1,1,0,0]},2);assert.equal(result.calls[0][2],44,'300 wraps BEFORE STAB, so66 loses to100');
  compare(ctx,{[c.MOVE_TACKLE]:[200,3,2,0,0],[c.MOVE_SCRATCH]:[100,1,1,0,0]},2,'after-type300 also wraps44');
  compare(context([{...mon(),hp:0},mon([0,0],[c.MOVE_SEISMIC_TOSS]),mon([0,0],[c.MOVE_TACKLE])]),{[c.MOVE_TACKLE]:[20,1,1,0,0]},1); // power1 reuses Stage1 score80.
  compare(ctx,{[c.MOVE_TACKLE]:[200,1,1,0,1],[c.MOVE_SCRATCH]:[10,1,1,0,0]},2,'native immune flags clear the wrapped score');
  const zeroPower=context([{...mon(),hp:0},mon([0,0],[c.MOVE_LEER]),mon([0,0],[c.MOVE_TACKLE])]);compare(zeroPower,{[c.MOVE_LEER]:[22,1,1,0,0],[c.MOVE_TACKLE]:[20,1,1,0,0]},1);
});
test('Task preselection, active/partner exclusions and firstHP fallback match literal source',()=>{
  const party=[{...mon(),hp:0},mon(),mon()];compare({...context(party),aiSwitchedPartyIndex:2},{},2);
  compare({...context(party),partnerPartyIndex:1},{[c.MOVE_TACKLE]:[10,1,1,0,0]},2);
  compare(context(party),{},1,'all zero damage scores fall back to first HP reserve');
  const ctx=context([{...mon(),hp:0},{...mon(),hp:0}]);compare(ctx,{},2,'no replacement source sentinel is party count');
  const egg={...mon(),isEgg:true};const none={...mon(),species:0};const eligible=context([{...mon(),hp:0},egg,none,mon()]);compare(eligible,{[c.MOVE_TACKLE]:[20,1,1,0,0]},3);
});
test('real Bugsy21 living Scyther/Kakuna/Metapod reserves use moves/types, not first-living order',async()=>{
  const actual=await originalTrainerParty(data,21);assert.deepEqual(actual.map(m=>m.species),[c.SPECIES_SCYTHER,c.SPECIES_KAKUNA,c.SPECIES_METAPOD]);
  const party=actual.map(m=>{const personal=data.personal[m.species],item=data.items.find(item=>item.item===(m.heldItem||'ITEM_NONE'))!;return{species:m.species,hp:m.hp,types:[c[personal.types[0]],c[personal.types[1]||personal.types[0]]]as const,ability:c[personal.abilities[m.personality%2]||personal.abilities[0]],heldEffect:c[item.holdEffect],naturalGiftType:c[item.naturalGiftType],ivs:m.ivs,moves:m.moves.map(slot=>slot.id)};});
  assert.equal(party[0].ability,c.ABILITY_TECHNICIAN);assert.equal(party[0].heldEffect,c.HOLD_EFFECT_HP_PCT_RESTORE,'native Sitrus effect');
  const ports:DamagePorts={[c.MOVE_POISON_STING]:[11,1,1,0,0],[c.MOVE_TACKLE]:[23,1,1,0,0],[c.MOVE_QUICK_ATTACK]:[23,1,1,0,0],[c.MOVE_U_TURN]:[39,1,1,0,0],[c.MOVE_LEER]:[2,1,1,0,0],[c.MOVE_FOCUS_ENERGY]:[2,1,1,0,0]};
  compare(context(party,[c.TYPE_FIRE,c.TYPE_FIRE]),ports,2,'neutral damage port favors Metapod over Kakuna');
  compare(context(party,[c.TYPE_GRASS,c.TYPE_GRASS]),ports,1,'native Poison Sting SE chooses Kakuna even though later Tackle damage port is larger');
  compare(context(party,[c.TYPE_WATER,c.TYPE_WATER]),ports,2);
  compare({...context(party,[c.TYPE_GRASS,c.TYPE_GRASS]),activePartyIndex:1},ports,0,'withdrawn living Scyther is selectable');
  assert.equal(party[0].moves[2],c.MOVE_U_TURN);assert.deepEqual(actual.map(m=>m.hp),party.map(m=>m.hp),'selection is pure');
});
test('context and damage are not mutated; illegal indices/noninteger damage remain explicit',()=>{
  const ctx=context([{...mon(),hp:0},mon()]),before=structuredClone(ctx);compare(ctx,{[c.MOVE_TACKLE]:[12,1,1,0,0]},1);assert.deepEqual(ctx,before);
  const evaluator:TrainerReplacementEvaluator={currentActorDamage:()=>1.5,applyCurrentActorType:()=>({damage:1,immune:false})};assert.throws(()=>nativeTrainerReplacement(data,ctx,evaluator),/integer/);
  assert.throws(()=>nativeTrainerReplacement(data,{...ctx,activePartyIndex:-1},evaluator),/slot/);
  assert.throws(()=>nativePostKOTrainerReplacement(data,{...ctx,party:Array(7).fill(mon())},evaluator),/six/);
});
