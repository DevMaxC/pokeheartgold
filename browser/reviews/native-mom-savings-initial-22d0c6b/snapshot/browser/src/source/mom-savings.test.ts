import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {loadData,newState} from './data.ts';
import {sourceJSON} from './types.ts';
import {FieldPhoneHost} from './phone-field-host.ts';
import type {PhoneAdmissionRules} from './phone-random.ts';
import {SourceActionRecovery} from './script-recovery.ts';
import {phoneCall} from './phone.ts';
import {MOM_SAVINGS_MAX,momSavingsActive,readMomSavings,settleMomBattleMoney,type MomSavingsState,type MomGift} from './mom-savings.ts';

globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData(),rules=await sourceJSON<PhoneAdmissionRules>('phone-triggers.json');
const native=Object.fromEntries(await Promise.all(['src/battle/battle_setup.c','src/save_pokegear.c','src/player_data.c','src/mom_gift.c','include/constants/items.h'].map(async path=>[path,await readFile(new URL('../../../'+path,import.meta.url),'utf8')])));
function block(source:string,marker:string){let start=source.indexOf(marker);for(;;){assert.ok(start>=0,'literal native function '+marker);const brace=source.indexOf('{',start),semicolon=source.indexOf(';',start);assert.ok(brace>=0,'literal native block '+marker);if(semicolon>=0&&semicolon<brace){start=source.indexOf(marker,start+marker.length);continue;}let depth=0;for(let i=brace;i<source.length;i++){if(source[i]==='{')depth++;if(source[i]==='}'&&!--depth)return source.slice(start,i+1);}throw Error('Incomplete native function');}}
const saveNames=['u32 PhoneCallPersistentState_MomSavings_BalanceAction(','void PhoneCallPersistentState_MomGift_SetNormalGiftGiven(','BOOL PhoneCallPersistentState_MomGift_IsNormalGiftGiven(','void PhoneCallPersistentState_MomGiftQueue_Put(','BOOL PhoneCallPersistentState_MomGiftQueue_IsFull('];
const saveCode=saveNames.map(name=>block(native['src/save_pokegear.c'],name)).join('\n'),gifts=native['src/mom_gift.c'].split('\n').filter(line=>!line.startsWith('#include')).join('\n');
const keys=[...new Set(gifts.match(/ITEM_[A-Z_]+/g))];
const definitions=keys.map(key=>{const match=native['include/constants/items.h'].match(new RegExp('^#define\\s+'+key+'\\s+(\\d+)\\b','m'));assert.ok(match,key);assert.equal(data.constants[key],Number(match[1]),'exported item matches original header');return'#define '+key+' '+match[1];}).join('\n');
const directory=await mkdtemp(join(tmpdir(),'heartgold-mom-savings-')),binary=join(directory,'native');
const code=`#include <stdint.h>
#include <stdio.h>
typedef uint8_t u8;typedef uint16_t u16;typedef uint32_t u32;typedef int BOOL;
#define TRUE 1
#define FALSE 0
#define MAX_MONEY 999999
#define MOMS_BALANCE_MAX 999999
#define MOMS_BALANCE_GET 0
#define MOMS_BALANCE_SET 1
#define MOMS_BALANCE_ADD 2
#define MOMS_BALANCE_SUB 3
${definitions}
typedef struct {u16 momGiftQueue[5][2];u32 bankBalance;u16 momNormalGiftsGiven;u16 triggers;} PhoneCallPersistentState;
typedef struct {int enabled;} SaveVarsFlags;
typedef struct {PhoneCallPersistentState *savings;int calls,accelerated;} GearPhoneRingManager;
typedef struct {PhoneCallPersistentState savings;SaveVarsFlags flags;GearPhoneRingManager ring;} SaveData;
typedef struct {SaveData *saveData;} FieldSystem;
typedef struct {u32 money;} PlayerProfile;
static unsigned drawValue,drawCalls;
static unsigned LCRandom(void){drawCalls++;return drawValue;}
static SaveVarsFlags *Save_VarsFlags_Get(SaveData *save){return &save->flags;}
static BOOL Save_VarsFlags_MomsSavingsFlagCheck(SaveVarsFlags *flags){return flags->enabled;}
static PhoneCallPersistentState *SaveData_GetPhoneCallPersistentState(SaveData *save){return &save->savings;}
static GearPhoneRingManager *FieldSystem_GetGearPhoneRingManager(FieldSystem *field){return &field->saveData->ring;}
static void GearPhoneRingManager_SetCallTrigger(GearPhoneRingManager *ring,int id,BOOL accelerate){ring->savings->triggers|=1<<id;ring->calls++;ring->accelerated=accelerate;}
${block(native['src/player_data.c'],'u32 PlayerProfile_GetMoney(')}
${block(native['src/player_data.c'],'u32 PlayerProfile_SetMoney(')}
${block(native['src/player_data.c'],'u32 PlayerProfile_AddMoney(')}
${saveCode}
${gifts}
${block(native['src/battle/battle_setup.c'],'static void FieldSystem_DepositBattleMoneyToMomsSavings(')}
int main(void){unsigned mode,before,after,enabled,bank,mask,draw,triggers;while(scanf("%u%u%u%u%u%u%u%u",&mode,&before,&after,&enabled,&bank,&mask,&draw,&triggers)==8){
 SaveData save={0};save.flags.enabled=enabled;save.savings.bankBalance=bank;save.savings.momNormalGiftsGiven=mask;save.savings.triggers=triggers;save.ring.savings=&save.savings;
 for(int i=0;i<5;i++){unsigned item,quantity;if(scanf("%u%u",&item,&quantity)!=2)return 2;save.savings.momGiftQueue[i][0]=item;save.savings.momGiftQueue[i][1]=quantity;}
 FieldSystem field={&save};PlayerProfile original={before},result={after};if(mode){result.money=before;PlayerProfile_AddMoney(&result,after);}unsigned gross=result.money;drawValue=draw;drawCalls=0;
 FieldSystem_DepositBattleMoneyToMomsSavings(&field,&original,&result);
 printf("%u %u %u %u %u %u %d %d",gross,result.money,save.savings.bankBalance,save.savings.momNormalGiftsGiven,save.savings.triggers,drawCalls,save.ring.calls,save.ring.accelerated);
 for(int i=0;i<5;i++)printf(" %u %u",save.savings.momGiftQueue[i][0],save.savings.momGiftQueue[i][1]);printf("\\n");
 }return 0;}
`;
await writeFile(join(directory,'native.c'),code);execFileSync(process.env.CC||'cc',['-std=c99','-O0',join(directory,'native.c'),'-o',binary],{stdio:'pipe'});after(()=>rm(directory,{recursive:true,force:true}));
type Case={before:number;after:number;prize?:boolean;enabled:boolean;balance:number;mask:number;gifts:MomGift[];draw:number;triggers:number[]};
function row(c:Case){const queue=Array.from({length:5},(_,i)=>c.gifts[i]??{item:0,quantity:0}),bits=c.triggers.reduce((bits,id)=>bits|(1<<id),0);return[Number(!!c.prize),c.before,c.after,Number(c.enabled),c.balance,c.mask,c.draw,bits,...queue.flatMap(gift=>[gift.item,gift.quantity])].join(' ');}
function oracle(cases:Case[]){return execFileSync(binary,[],{input:cases.map(row).join('\n')+'\n',encoding:'utf8'}).trim().split('\n').map(line=>{const[gross,money,balance,normalGiftsGiven,triggers,draws,calls,accelerated,...pairs]=line.split(' ').map(Number),gifts:MomGift[]=[];for(let i=0;i<10;i+=2)if(pairs[i+1])gifts.push({item:pairs[i],quantity:pairs[i+1]});return{gross,money,balance,normalGiftsGiven,triggers,draws,calls,accelerated,gifts};});}
function state(c:Case):MomSavingsState{return{money:c.before,flags:{FLAG_SYS_MOMS_SAVINGS:c.enabled},phoneTriggers:[...c.triggers],momSavings:{balance:c.balance,normalGiftsGiven:c.mask,gifts:structuredClone(c.gifts)}};}
const berry=()=>({item:data.constants.ITEM_OCCA_BERRY,quantity:5});
function basic(overrides:Partial<Case>={}):Case{return{before:3000,after:400,prize:true,enabled:true,balance:0,mask:0,gifts:[],draw:0,triggers:[],...overrides};}
function compare(cases:Case[]){const expected=oracle(cases);for(const[index,c]of cases.entries()){const saved=state(c),want=expected[index];let draws=0;const result=settleMomBattleMoney(data,saved,{beforeMoney:c.before,afterMoney:want.gross,random16:()=>{draws++;return c.draw;}});assert.equal(saved.money,want.money,JSON.stringify(c));assert.deepEqual(readMomSavings(saved),{balance:want.balance,normalGiftsGiven:want.normalGiftsGiven,gifts:want.gifts});assert.equal((saved.phoneTriggers??[]).reduce((bits,id)=>bits|(1<<id),0),want.triggers);assert.equal(draws,want.draws);assert.equal(Number(!!result.phoneTrigger),want.calls);if(result.phoneTrigger){assert.deepEqual(result.phoneTrigger,{id:12,accelerate:!!want.accelerated});}assert.equal(result.newGifts.length,want.gifts.length-c.gifts.length);}}

test('battle settlement matches literal native C across capped prize, loss/zero, balance and queue boundaries',()=>{
 const cases:Case[]=[];
 for(const enabled of[false,true])for(const balance of[0,899,900,3999,4000,6999,7000,999998,999999])for(const profile of[{mask:0,count:0},{mask:511,count:0},{mask:511,count:4},{mask:511,count:5}])for(const money of[{before:3000,after:32,prize:true},{before:999998,after:32,prize:true},{before:999999,after:1560,prize:true},{before:3000,after:3000,prize:false},{before:3000,after:1,prize:false}])cases.push(basic({...money,enabled,balance,mask:profile.mask,gifts:Array.from({length:profile.count},berry),draw:(cases.length*1237)&65535,triggers:[0]}));
 assert.equal(cases.length,360);compare(cases);
});

test('all17 source berry choices use one raw16-bit modulo draw, including16/17/65535 and multi-tier gains',()=>{
 const cases=Array.from({length:18},(_,i)=>basic({balance:2900,mask:511,after:4000,draw:i<17?i:65535}));cases.push(basic({balance:2900,mask:511,after:120000,draw:17}));compare(cases);
 for(const [index,want]of oracle(cases).entries()){assert.equal(want.gifts.length,1);assert.equal(want.gifts[0].quantity,5);assert.equal(want.draws,1);if(index===0)assert.equal(want.gifts[0].item,data.constants.ITEM_OCCA_BERRY);}
});

test('normal gifts retain source ordering/costs and capacity; a zero-gain battle still purchases without a berry draw',()=>{
 const c=basic({after:3000,prize:false,balance:100000}),saved=state(c),result=settleMomBattleMoney(data,saved,{beforeMoney:3000,afterMoney:3000,random16:()=>{throw Error('normal gifts must not draw');}});
 assert.deepEqual(result.newGifts.map(gift=>gift.item),['ITEM_SUPER_POTION','ITEM_REPEL','ITEM_SUPER_POTION','ITEM_SILK_SCARF','ITEM_MOON_STONE'].map(key=>data.constants[key]));assert.equal(result.deposited,0);assert.equal(saved.momSavings!.balance,95430);assert.equal(saved.momSavings!.normalGiftsGiven,31);compare([c]);
});

test('full-bank display is captured separately; purchases can free space but never retroactively enlarge this deposit',()=>{
 for(const balance of[999998,999999]){const c=basic({balance}),saved=state(c),active=momSavingsActive(saved),result=settleMomBattleMoney(data,saved,{beforeMoney:c.before,afterMoney:c.before+c.after});assert.equal(active,balance!==MOM_SAVINGS_MAX);assert.equal(result.deposited,balance===MOM_SAVINGS_MAX?0:1);assert.equal(result.newGifts.length,5);assert.ok(readMomSavings(saved).balance<MOM_SAVINGS_MAX);compare([c]);}
});

test('native zero/partial initialization, toggle and JSON reload preserve funds/gift identity without inferred fresh events',()=>{
 const saved:MomSavingsState={money:3000,flags:{FLAG_SYS_MOMS_SAVINGS:true}};assert.deepEqual(readMomSavings(saved),{balance:0,normalGiftsGiven:0,gifts:[]});assert.equal(Object.hasOwn(saved,'momSavings'),false);
 saved.momSavings={balance:50};settleMomBattleMoney(data,saved,{beforeMoney:3000,afterMoney:3100});assert.deepEqual(saved.momSavings,{balance:75,normalGiftsGiven:0,gifts:[]});
 const reloaded=JSON.parse(JSON.stringify(saved))as MomSavingsState;reloaded.flags.FLAG_SYS_MOMS_SAVINGS=false;const bank=structuredClone(reloaded.momSavings);settleMomBattleMoney(data,reloaded,{beforeMoney:3075,afterMoney:3475});assert.equal(reloaded.money,3475);assert.deepEqual(reloaded.momSavings,bank);assert.equal(reloaded.phoneTriggers,undefined);
 reloaded.flags.FLAG_SYS_MOMS_SAVINGS=true;settleMomBattleMoney(data,reloaded,{beforeMoney:3475,afterMoney:3875});assert.equal(reloaded.money,3775);assert.equal(reloaded.momSavings!.balance,175);
});

test('the existing actual Mother phone choice toggles only saving policy, retaining purchased gifts, funds and pending calls',async()=>{
 const saved=Object.assign(newState(data,'Ethan','boy'),{momSavings:{balance:75,normalGiftsGiven:1,gifts:[{item:data.constants.ITEM_SUPER_POTION,quantity:1}]},phoneTriggers:[12]}),before=structuredClone(saved.momSavings);
 for(const choice of[0,1,0]){await phoneCall(data,saved,data.constants.PHONE_CONTACT_MOTHER,2,0,async()=>{},async()=>choice);assert.equal(saved.flags.FLAG_SYS_MOMS_SAVINGS,choice===0);assert.equal(saved.flags.FLAG_TALKED_TO_MOM_AFTER_NAMING_RIVAL,true);assert.deepEqual(saved.momSavings,before);assert.deepEqual(saved.phoneTriggers,[12]);}
});

test('a fresh purchase reports phone12 even if its bit is already set, and returned/read objects cannot mutate saved gifts',()=>{
 const saved=state(basic({balance:899,triggers:[0,12]})),result=settleMomBattleMoney(data,saved,{beforeMoney:3000,afterMoney:3004});assert.deepEqual(saved.phoneTriggers,[0,12]);assert.deepEqual(result.phoneTrigger,{id:12,accelerate:true});
 result.savings.gifts[0].item=1;result.newGifts[0].quantity=99;const reading=readMomSavings(saved);reading.gifts.length=0;assert.deepEqual(saved.momSavings!.gifts,[{item:data.constants.ITEM_SUPER_POTION,quantity:1}]);
});

test('invalid/missing RNG, malformed stored data and missing source items fail before ANY state write',()=>{
 for(const random16 of[undefined,()=>-1,()=>65536,()=>NaN,()=>{throw Error('draw failed');}]){const saved=state(basic({balance:2900,mask:511})),before=structuredClone(saved);assert.throws(()=>settleMomBattleMoney(data,saved,{beforeMoney:3000,afterMoney:7000,random16}));assert.deepEqual(saved,before);}
 for(const partial of[{balance:-1},{balance:MOM_SAVINGS_MAX+1},{normalGiftsGiven:512},{gifts:Array.from({length:6},berry)}]){const saved:MomSavingsState={money:3000,flags:{FLAG_SYS_MOMS_SAVINGS:true},momSavings:partial},before=structuredClone(saved);assert.throws(()=>settleMomBattleMoney(data,saved,{beforeMoney:3000,afterMoney:3400}));assert.deepEqual(saved,before);}
 const saved=state(basic({balance:899})),before=structuredClone(saved);assert.throws(()=>settleMomBattleMoney({constants:{...data.constants,ITEM_SUPER_POTION:0}},saved,{beforeMoney:3000,afterMoney:3004}));assert.deepEqual(saved,before);
});

test('the actual outer source checkpoint restores funds/gifts/phone manager after a later host failure; Retry commits once',async()=>{
 const saved=Object.assign(newState(data,'Ethan','boy'),{momSavings:{balance:899,normalGiftsGiven:0,gifts:[]as MomGift[]}});saved.flags.FLAG_SYS_MOMS_SAVINGS=true;
 const phone=new FieldPhoneHost(rules,0,12),before=structuredClone(saved),field=phone.snapshot(),recovery=new SourceActionRecovery(saved,{capture:()=>phone.snapshot(),restore:async snapshot=>phone.restore(snapshot)});
 const award=()=>{const result=settleMomBattleMoney(data,saved,{beforeMoney:3000,afterMoney:3004});assert.ok(result.phoneTrigger);phone.triggerQueued(result.phoneTrigger.id,result.phoneTrigger.accelerate);return result;};
 await assert.rejects(recovery.run(async()=>{award();assert.notDeepEqual(phone.snapshot(),field);throw Error('post-battle presentation failed');}),/presentation failed/);assert.deepEqual(saved,before);assert.deepEqual(phone.snapshot(),field);assert.equal(recovery.busy,false);
 await recovery.run(async()=>award());assert.equal(saved.money,3003);assert.equal(saved.momSavings.balance,300);assert.deepEqual(saved.momSavings.gifts,[{item:data.constants.ITEM_SUPER_POTION,quantity:1}]);assert.deepEqual(saved.phoneTriggers,[12]);
});
