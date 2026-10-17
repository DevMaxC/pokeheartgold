import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {nativeYawnStart,nativeYawnTick,nativeYawnSleepGate,nativeSleepDuration,nativeSleepTick,type NativeSleepContext} from './battle-binding-yawn.ts';
const root=new URL('../../../',import.meta.url),header=await readFile(new URL('include/constants/battle.h',root),'utf8');
function value(expression:string):number{return Function(`return(${expression.replace(/\b[A-Z][A-Z0-9_]*\b/g,name=>{const definition=header.match(new RegExp(`^#define ${name}\\s+([^\\n]+)`, 'm'));assert.ok(definition,`unknown native constant ${name}`);return String(value(definition[1].split('//')[0]));})})`)();}
type Context=NativeSleepContext&{moldBreaker:boolean;substitute:boolean;safeguard:boolean};
// Small read-only interpreter of the ORIGINAL assembly's branch instructions.
// Display/animation waits are explicit no-ops; unknown opcodes always fail.
async function replay(file:string,context:Context,initialTurns:number,raw=0){
 const source=await readFile(new URL(`files/battledata/script/subscript/${file}`,root),'utf8'),instructions:{op:string;args:string[]}[]=[],labels=new Map<string,number>();
 for(const original of source.split('\n')){const line=original.split('//')[0].trim();if(!line||line.startsWith('.'))continue;if(line.endsWith(':')){labels.set(line.slice(0,-1),instructions.length);continue;}const[op,...rest]=line.split(/\s+/);instructions.push({op,args:rest.join(' ').split(',').map(x=>x.trim())});}
 const vars:Record<string,number>={BSCRIPT_VAR_SIDE_EFFECT_TYPE:value('SIDE_EFFECT_TYPE_MOVE_EFFECT'),BSCRIPT_VAR_FIELD_CONDITION:(context.sun?value('FIELD_CONDITION_SUN_ALL'):0)|(context.uproar?value('FIELD_CONDITION_UPROAR'):0),BSCRIPT_VAR_SIDE_CONDITION_STAT_CHANGE:context.safeguard?value('SIDE_CONDITION_SAFEGUARD'):0,BSCRIPT_VAR_MOVE_STATUS_FLAGS:0,BSCRIPT_VAR_CALC_TEMP:0};
 let status=context.status==='SLP'?3:context.status?value('STATUS_PARALYSIS'):0,turns=initialTurns,draws=0,pc=0;const printed:string[]=[];const number=(x:string)=>vars[x]??value(x);const compare=(op:string,left:number,right:number)=>{switch(op){case'OPCODE_EQU':return left===right;case'OPCODE_NEQ':return left!==right;case'OPCODE_FLAG_SET':return!!(left&right);case'OPCODE_FLAG_NOT':return!(left&right);default:throw Error('Unknown native comparison '+op);}};const go=(label:string)=>{const target=labels.get(label);assert.notEqual(target,undefined,`unknown label ${label}`);pc=target!;};
 for(let steps=0;steps<500;steps++){const row=instructions[pc++];assert.ok(row,'unexpected native script end');const a=row.args;
  switch(row.op){
   case'End':return{turns,status,draws,printed};
   case'GoTo':go(a[0]);break;
   case'CheckAbility':case'CheckIgnorableAbility':if(context.ability===a[2]&&(row.op==='CheckAbility'||!context.moldBreaker))go(a[3]);break;
   case'CheckIgnoreWeather':break; // inputs already denote active, unsuppressed Sun
   case'CheckSubstitute':if(context.substitute)go(a[1]);break;
   case'CompareVarToValue':if(compare(a[0],number(a[1]),number(a[2])))go(a[3]);break;
   case'CompareMonDataToValue':{const datum=a[2]==='BMON_DATA_STATUS'?status:a[2]==='BMON_DATA_STATUS2'||a[2]==='BMON_DATA_MOVE_EFFECT'?0:NaN;assert.ok(!Number.isNaN(datum));if(compare(a[0],datum,number(a[3])))go(a[4]);break;}
   case'TryYawn':if(turns)go(a[0]);else turns=2;break;
   case'Random':draws++;vars.BSCRIPT_VAR_CALC_TEMP=raw%(number(a[0])+1)+number(a[1]);break;
   case'UpdateMonDataFromVar':assert.equal(a[2],'BMON_DATA_STATUS');assert.equal(a[0],'OPCODE_FLAG_ON');status|=number(a[3]);break;
   case'PrintMessage':printed.push(a[0]);break;
   case'UpdateVar':assert.equal(a[0],'OPCODE_FLAG_ON');vars[a[1]]|=number(a[2]);break;
   case'PrintAttackMessage':case'Wait':case'WaitButtonABTime':case'PlayMoveAnimation':case'PlayBattleAnimation':case'SetHealthbarStatus':case'UnlockMoveChoice':break;
   case'Call':assert.ok(['BATTLE_SUBSCRIPT_BUT_IT_FAILED','BATTLE_SUBSCRIPT_MOVE_FAIL_MISSED','BATTLE_SUBSCRIPT_VANISH_OFF'].includes(a[0]),'unexpected native subscript');break;
   default:throw Error(`Uninterpreted native instruction ${row.op}`);
  }
 }
 throw Error('native replay exceeded instruction bound');
}

test('original0141 and0018 assembly replays all relevant Yawn ability/status/field branches, including delayed nonignorable gates',async()=>{
 const abilities=['ABILITY_NONE','ABILITY_INSOMNIA','ABILITY_VITAL_SPIRIT','ABILITY_LEAF_GUARD','ABILITY_SOUNDPROOF'];
 // Read once, then keep branch fixtures deterministic and independent of RNG.
 let fixtures=0;for(const ability of abilities)for(const status of['','SLP','PAR'])for(const sun of[false,true])for(const uproar of[false,true])for(const moldBreaker of[false,true])for(const substitute of[false,true])for(const safeguard of[false,true])for(const turns of[0,1,2]){
  const context={ability,status,sun,uproar,moldBreaker,substitute,safeguard};const original=await replay('subscript_0141_Yawn.s',context,turns),actual=nativeYawnStart(turns,context),reason=original.printed.includes('msg_0197_00734')?'ability':original.printed.includes('msg_0197_00200')?'safeguard':original.printed.includes('msg_0197_00545')?'applied':'failed';assert.deepEqual(actual,{turns:original.turns,outcome:reason});assert.equal(original.draws,0);fixtures++;
 }
 assert.equal(fixtures,1440);
 for(const ability of abilities)for(const status of['','SLP','PAR'])for(const sun of[false,true])for(const uproar of[false,true])for(const moldBreaker of[false,true])for(const substitute of[false,true])for(const safeguard of[false,true]){
  const context={ability,status,sun,uproar,moldBreaker,substitute,safeguard},original=await replay('subscript_0018_FallAsleep.s',context,0,3),gate=nativeYawnSleepGate(context),reason=original.printed.includes('msg_0197_00329')?'ability':original.printed.includes('msg_0197_00057')?'already-asleep':original.printed.some(id=>['msg_0197_00326','msg_0197_00323'].includes(id))?'uproar':original.draws?'sleep':'status';assert.equal(gate,reason);assert.equal(original.draws,gate==='sleep'?1:0);if(gate==='sleep')assert.equal(original.status,nativeSleepDuration(()=>3));
 }
});

test('original TryYawn and UMC_YAWN C preserve other move flags and count down2→1→sleep; sleep raw modulo and EarlyBird are exact',async()=>{
 const commands=await readFile(new URL('src/battle/battle_command.c',root),'utf8'),controller=await readFile(new URL('src/battle/battle_controller_player.c',root),'utf8'),start=commands.indexOf('BOOL BtlCmd_TryYawn('),end=commands.indexOf('\n}',start)+2,fn=commands.slice(start,end),tick=controller.slice(controller.indexOf('        case UMC_STATE_YAWN:'),controller.indexOf('        case UMC_STATE_HELD_ITEM_STATUS:'));
 const fragment=controller.slice(controller.indexOf('int sleepCounterDecrease;'),controller.indexOf('if (ctx->battleMons[ctx->battlerIdAttacker].status & STATUS_SLEEP) {',controller.indexOf('int sleepCounterDecrease;')));
 const random=commands.slice(commands.indexOf('BOOL BtlCmd_Random('),commands.indexOf('BOOL BtlCmd_UpdateVar2(')),temp=await mkdtemp(join(tmpdir(),'hg-yawn-c-'));
 try{const c=`#include<stdio.h>\n#define BOOL int\n#define u32 unsigned int\n#define FALSE 0\n#define UMC_STATE_YAWN 0\n#define STATUS_SLEEP 7\n#define ABILITY_EARLY_BIRD 1\n#define MOVE_EFFECT_FLAG_YAWN ${value('MOVE_EFFECT_FLAG_YAWN')}\n#define MOVE_EFFECT_FLAG_YAWN_SHIFT ${value('MOVE_EFFECT_FLAG_YAWN_SHIFT')}\n#define NARC_a_0_0_1 0\n#define BATTLE_SUBSCRIPT_FALL_ASLEEP 18\n#define CONTROLLER_COMMAND_RUN_SCRIPT 21\ntypedef int BattleSystem;typedef struct{struct{int moveEffectFlags,status;}battleMons[1];int battlerIdAttacker,battlerIdTarget,battlerIdStatChange,statChangeType,commandNext,command,stateUpdateMonCondition,calcTemp;}BattleContext;static int word,raw,script,ability;int GetBattlerAbility(BattleContext*c,int b){return ability;}void BattleScriptIncrementPointer(BattleContext*c,int n){}int BattleScriptReadWord(BattleContext*c){return word++?2:3;}int BattleSystem_Random(BattleSystem*b){return raw;}void ReadBattleScriptFromNarc(BattleContext*c,int n,int s){script=s;}\n${fn}\n${random}\nvoid tick(BattleContext*ctx){int battlerId=0,flag=0;switch(0){${tick}}}\nvoid sleepTick(BattleContext*ctx){${fragment}}\nint main(){for(int prior=0;prior<3;prior++){BattleContext ctx={0};ctx.battleMons[0].moveEffectFlags=(prior<<11)|1;BtlCmd_TryYawn(0,&ctx);printf("%d,",ctx.battleMons[0].moveEffectFlags);for(int t=0;t<3;t++){script=0;tick(&ctx);printf("%d,%d,",ctx.battleMons[0].moveEffectFlags,script);}puts("");}for(raw=0;raw<65536;raw++){BattleContext ctx={0};word=0;BtlCmd_Random(0,&ctx);if(ctx.calcTemp!=raw%4+2)return 3;}for(ability=0;ability<2;ability++)for(int turns=0;turns<8;turns++){BattleContext ctx={0};ctx.battleMons[0].status=turns;sleepTick(&ctx);printf("%d,\\n",ctx.battleMons[0].status);}return 0;}`;await writeFile(join(temp,'oracle.c'),c);execFileSync('cc',['-std=c99','-O2',join(temp,'oracle.c'),'-o',join(temp,'oracle')]);const rows=execFileSync(join(temp,'oracle'),{encoding:'utf8'}).trim().split('\n').map(line=>line.split(',').filter(Boolean).map(Number));for(let prior=0;prior<3;prior++){let count=prior||2;const expected=[(count<<11)|1];for(let t=0;t<3;t++){const result=nativeYawnTick(count);count=result.turns;expected.push((count<<11)|1,result.sleep?18:0);}assert.deepEqual(rows[prior],expected);}for(const early of[false,true])for(let counter=0;counter<8;counter++)assert.equal(nativeSleepTick(counter,early),rows[3+Number(early)*8+counter][0]);
 }finally{await rm(temp,{recursive:true,force:true});}
 // Full-u16 source duration replay plus all native sleep counters. This is a
 // deterministic local tape check, not a claim of global LCG/AI RNG parity.
 for(let raw=0;raw<65536;raw++)assert.equal(nativeSleepDuration(()=>raw),raw%4+2);
 assert.match(fragment,/ABILITY_EARLY_BIRD[\s\S]*sleepCounterDecrease = 2;[\s\S]*sleepCounterDecrease = 1;/);assert.match(fragment,/status -= sleepCounterDecrease/);
 for(const early of[false,true])for(let counter=0;counter<8;counter++)assert.equal(nativeSleepTick(counter,early),Math.max(0,counter-(early?2:1)));
});
