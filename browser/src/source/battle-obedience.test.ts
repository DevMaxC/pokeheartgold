import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {nativeObedience,nativeDisobedienceMessage,type NativeObedienceContext} from './battle-obedience.ts';

const root=new URL('../../../',import.meta.url);
const base=():NativeObedienceContext=>({level:80,badges:[],playerOT:false,linkOrFrontier:false,opponentSide:false,aiPartner:false,canSelectAction:true,bideChargeHit:false,move:33,moveSlot:0,status:0,status2:0,ability:0,uproar:false,blockedMoves:()=>0});
function tape(words:number[]){let count=0;return{draw:()=>{const at=count++;return words[at]??((at-words.length)&3);},count:()=>count};}

test('native obedience bypasses without RNG and preserves the selected Rage state',()=>{
  for(const changed of[{playerOT:true},{linkOrFrontier:true},{opponentSide:true},{aiPartner:true},{canSelectAction:false},{move:117,bideChargeHit:true},{badges:[0,1,2,3,4,5,6,7]},{level:10}]){
    const c={...base(),move:99,status2:1<<23,...changed};assert.deepEqual(nativeObedience(c,()=>{throw Error('unexpected draw');}),{outcome:'obey',returnCode:0,status2:c.status2});
  }
  for(const[badges,level]of[[[],10],[[0],20],[[0,1],30],[[3],50],[[5],70]] as [number[],number][]){assert.equal(nativeObedience({...base(),badges,level},()=>{throw Error('unexpected draw');}).outcome,'obey');}
});

test('native disobedience branches retain draw order, blocked selection, and signed subtraction',()=>{
  const run=(change:Partial<NativeObedienceContext>,words:number[])=>{const rng=tape(words);return{...nativeObedience({...base(),...change},rng.draw),draws:rng.count()};};
  assert.deepEqual(run({},[0]),{outcome:'obey',returnCode:0,status2:0,draws:1});
  assert.deepEqual(run({move:173,status:2},[255]),{outcome:'asleep',returnCode:1,status2:0,draws:1});
  assert.deepEqual(run({move:99,status2:(1<<23)|7},[255,0,0,2]),{outcome:'other-move',returnCode:2,status2:7,slot:2,draws:4});
  assert.deepEqual(run({blockedMoves:()=>14},[255,0]),{outcome:'nothing',returnCode:1,status2:0,draws:2});
  assert.equal(run({},[255,255,0]).outcome,'nap');
  // Failed nap still subtracts delta; this can make the signed value negative.
  for(const change of[{status:8},{ability:15},{ability:72},{uproar:true}])assert.equal(run(change,[255,255,0]).outcome,'self-hit');
  assert.equal(run({},[255,255,100]).outcome,'self-hit');assert.equal(run({},[255,255,200]).outcome,'nothing');
  for(let raw=0;raw<65536;raw++)assert.equal(nativeDisobedienceMessage(()=>raw),raw%4);
});

test('malformed data rejects before any RNG or move availability callbacks',()=>{
  for(const change of[{badges:[3,3]},{badges:[16]},{moveSlot:-1},{level:101},{ability:124},{playerOT:1},{status2:-1}] as Partial<NativeObedienceContext>[]){assert.throws(()=>nativeObedience({...base(),...change,blockedMoves:()=>{throw Error('availability reached');}},()=>{throw Error('RNG reached');}),/Invalid native obedience/);}
});

test('original C Technician branch boosts Pound but explicitly excludes confusion Struggle',async()=>{
 const source=await readFile(new URL('src/battle/battle_util.c',root),'utf8'),start=source.indexOf('    if (calcAttacker.ability == ABILITY_TECHNICIAN && moveNo != MOVE_STRUGGLE && movePower <= 60) {'),end=source.indexOf('\n    }',start)+6;assert.ok(start>0&&end>start);
 const abilityHeader=await readFile(new URL('include/constants/abilities.h',root),'utf8'),movesHeader=await readFile(new URL('include/constants/moves.h',root),'utf8'),ability=Number(abilityHeader.match(/#define ABILITY_TECHNICIAN\s+(\d+)/)![1]),pound=Number(movesHeader.match(/#define MOVE_POUND\s+(\d+)/)![1]),struggle=Number(movesHeader.match(/#define MOVE_STRUGGLE\s+(\d+)/)![1]);
 const temp=await mkdtemp(join(tmpdir(),'hg-disobedience-power-'));try{await writeFile(join(temp,'oracle.c'),`#include<stdio.h>\n#define ABILITY_TECHNICIAN ${ability}\n#define MOVE_STRUGGLE ${struggle}\nint main(){for(int a=0;a<=123;a++)for(int m=0;m<2;m++){struct{int ability;}calcAttacker={a};int moveNo=m?MOVE_STRUGGLE:${pound},movePower=40;${source.slice(start,end)}printf("%d\\n",movePower);}}`);execFileSync('cc',['-std=c99',join(temp,'oracle.c'),'-o',join(temp,'oracle')]);const rows=execFileSync(join(temp,'oracle'),{encoding:'utf8'}).trim().split('\n').map(Number);for(let a=0;a<=123;a++){assert.equal(rows[a*2],a===ability?60:40);assert.equal(rows[a*2+1],40);}}finally{await rm(temp,{recursive:true,force:true});}
 const controller=await readFile(new URL('src/battle/battle_controller_player.c',root),'utf8'),sub=await readFile(new URL('files/battledata/script/subscript/subscript_0258_DisobeyHitSelf.s',root),'utf8');
 assert.match(controller,/ctx->hpCalc = CalcMoveDamage\(battleSystem, ctx, MOVE_POUND, 0, 0, 40, 0, ctx->battlerIdAttacker, ctx->battlerIdAttacker, 1\)/);assert.match(sub,/GoToSubscript BATTLE_SUBSCRIPT_UPDATE_HP/);
 const tryMove=controller.slice(controller.indexOf('static void BattleControllerPlayer_TryMove(BattleSystem *battleSystem, BattleContext *ctx) {'),controller.indexOf('static void BattleControllerPlayer_CheckMoveHit(BattleSystem *battleSystem, BattleContext *ctx) {'));
 assert.match(tryMove,/case 3:\s+ctx->commandNext = CONTROLLER_COMMAND_34;/);assert.match(controller,/\[CONTROLLER_COMMAND_34\] = BattleControllerPlayer_FaintAfterMove/);
});

test('literal original C TryDisobedience agrees on outcomes, Rage, slot and exact RNG count',async()=>{
  const source=await readFile(new URL('src/battle/battle_controller_player.c',root),'utf8');
  const start=source.indexOf('static u32 TryDisobedience(BattleSystem *battleSystem, BattleContext *ctx, int *script) {'),end=source.indexOf('\n}',start)+2;assert.ok(start>0&&end>start);
  const headers=await Promise.all(['battle','moves','abilities','battle_subscript'].map(name=>readFile(new URL('include/constants/'+name+'.h',root),'utf8')));
  const definitions=headers.join('\n');const constants=new Set([...source.slice(start,end).matchAll(/\b(?:BATTLE_(?:TYPE|STATUS)_[A-Z_]+|MOVE_[A-Z_]+|STATUS2?_\w+|ABILITY_\w+|FIELD_CONDITION_\w+|BATTLE_SUBSCRIPT_\w+|BATTLER_NONE)\b/g)].map(m=>m[0]));
  const defs:string[]=[];function define(name:string){if(defs.some(d=>d.startsWith('#define '+name+' ')))return;const row=definitions.match(new RegExp('^#define '+name+'\\s+([^\\n]+)','m'));assert.ok(row,'missing original constant '+name);const expression=row[1].split('//')[0].trim();for(const dep of expression.matchAll(/\b[A-Z][A-Z0-9_]+\b/g))define(dep[0]);defs.push('#define '+name+' '+expression);}
  // Types/side bits outside these native constant headers are explicit test ports.
  constants.delete('BATTLER_NONE');for(const name of constants)define(name);
  const c=`#include <stdio.h>\n#include <stdint.h>\n#define u32 uint32_t\n#define u8 uint8_t\n#define TRUE 1\n#define BATTLER_NONE 255\n${defs.join('\n')}\n typedef struct {unsigned badges;} PlayerProfile;typedef struct {int unused;} BattleSystem;typedef struct {struct {int level;unsigned status,status2;int moves[4];}battleMons[1];int battlerIdAttacker,moveNoCur,battleStatus,movePos[1],moveNoTemp,battlerIdTarget;struct{int battlerIdTarget;}playerActions[1];unsigned moveCheckSkipFlags,fieldCondition;int battlerIdTemp,hpCalc;unsigned blocked;}BattleContext;static PlayerProfile profile;static unsigned battleType,words[3];static int reads,ot,canSelect,side,partner,ability;\n unsigned BattleSystem_GetBattleType(BattleSystem*b){return battleType;}PlayerProfile*BattleSystem_GetPlayerProfile(BattleSystem*b,int n){return &profile;}int BattleSystem_GetFieldSide(BattleSystem*b,int n){return side;}int BattleSystem_GetBattlerType(BattleSystem*b,int n){return partner?4:0;}int BattleContext_IsAttackerPlayerOT(BattleSystem*b,BattleContext*c){return ot;}int Battler_CanSelectAction(BattleContext*c,int n){return canSelect;}int PlayerProfile_CountBadges(PlayerProfile*p){return __builtin_popcount(p->badges);}int PlayerProfile_TestBadgeFlag(PlayerProfile*p,int n){return(p->badges>>n)&1;}unsigned BattleSystem_Random(BattleSystem*b){int n=reads++;return n<3?words[n]:((n-3)&3);}unsigned MaskOfFlagNo(int n){return 1u<<n;}unsigned StruggleCheck(BattleSystem*b,BattleContext*c,int n,unsigned mask,int flags){return c->blocked|mask;}int BattleSystem_GetMoveTarget(BattleSystem*b,BattleContext*c,int a,int m,int x,int y){return 1;}int Battler_GetRandomOpposingBattlerId(BattleSystem*b,BattleContext*c,int a){return 1;}int GetBattlerAbility(BattleContext*c,int n){return ability;}int CalcMoveDamage(BattleSystem*b,BattleContext*c,int m,int x,int y,int p,int z,int a,int d,int f){return 100;}int ApplyDamageRange(BattleSystem*b,BattleContext*c,int d){return d*(100-BattleSystem_Random(b)%16)/100;}\n${source.slice(start,end)}\nint main(){int level,badges,move,slot,status,stat2,blocked,flags,a,b,c;while(scanf("%d%d%d%d%d%d%d%d%d%d%d%d",&level,&badges,&move,&slot,&status,&stat2,&blocked,&flags,&ability,&a,&b,&c)==12){BattleContext ctx={0};profile.badges=badges;ctx.battleMons[0].level=level;ctx.battleMons[0].status=status;ctx.battleMons[0].status2=stat2;ctx.moveNoCur=move;ctx.movePos[0]=slot;ctx.blocked=blocked;for(int n=0;n<4;n++)ctx.battleMons[0].moves[n]=n+1;ot=flags&1;canSelect=!(flags&2);side=!!(flags&4);partner=!!(flags&8);battleType=(flags&16?BATTLE_TYPE_LINK:0)|(flags&32?BATTLE_TYPE_AI:0);ctx.battleStatus=flags&64?BATTLE_STATUS_CHARGE_MOVE_HIT:0;ctx.fieldCondition=flags&128?FIELD_CONDITION_UPROAR:0;words[0]=a;words[1]=b;words[2]=c;reads=0;int script=0;unsigned ret=TryDisobedience(0,&ctx,&script);printf("%u %d %u %d %d\\n",ret,script,ctx.battleMons[0].status2,ctx.movePos[0],reads);}}`;
  const rows:{context:NativeObedienceContext;words:number[]}[]=[];
  for(const badges of[[],[0],[0,1],[3],[5],[0,1,2,3,4,5,6,7]])for(const level of[10,11,20,21,30,31,50,51,70,71,100])for(const words of[[0,0,0],[255,0,2],[255,255,0],[255,255,100],[255,255,255]])for(const change of[{}, {move:99,status2:(1<<23)|7},{status:8},{ability:15},{ability:72},{uproar:true},{move:173,status:2},{blockedMoves:()=>14}])rows.push({context:{...base(),badges,level,...change},words});
  for(let bit=0;bit<8;bit++)rows.push({context:{...base(),playerOT:bit===0,canSelectAction:bit!==1,opponentSide:bit===2,aiPartner:bit===3,linkOrFrontier:bit===4,move:bit===6?117:33,bideChargeHit:bit===6,uproar:bit===7},words:[255,255,0]});
  const input=rows.map(({context:x,words:w})=>[x.level,x.badges.reduce((mask,b)=>mask|1<<b,0),x.move,x.moveSlot,x.status,x.status2,x.blockedMoves(),Number(x.playerOT)|Number(!x.canSelectAction)<<1|Number(x.opponentSide)<<2|Number(x.aiPartner)<<3|Number(x.linkOrFrontier)<<4|Number(x.aiPartner)<<5|Number(x.bideChargeHit)<<6|Number(x.uproar)<<7,x.ability,...w].join(' ')).join('\n')+'\n';
  const temp=await mkdtemp(join(tmpdir(),'hg-obedience-'));try{await writeFile(join(temp,'oracle.c'),c);execFileSync('cc',['-std=c99','-O2',join(temp,'oracle.c'),'-o',join(temp,'oracle')]);const output=execFileSync(join(temp,'oracle'),{input,encoding:'utf8',maxBuffer:2*1024*1024}).trim().split('\n');assert.equal(output.length,rows.length);const scripts={obey:0,asleep:254,nothing:255,'other-move':256,nap:257,'self-hit':258};for(let i=0;i<rows.length;i++){const x=rows[i],rng=tape(x.words),r=nativeObedience(x.context,rng.draw);if(r.outcome==='self-hit')rng.draw();assert.deepEqual(output[i].split(' ').map(Number),[r.returnCode,scripts[r.outcome],r.status2,r.slot??x.context.moveSlot,rng.count()],JSON.stringify({i,...x.context,words:x.words}));}}finally{await rm(temp,{recursive:true,force:true});}
});
