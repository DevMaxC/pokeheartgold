import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {Battle} from './battle.ts';
import {freshStages,moveDamage} from './battle-math.ts';
import {createMon,loadData,newState} from './data.ts';
import type {UI} from './ui.ts';
import type {BattleView} from './battle-view.ts';

globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData(),native=await readFile(new URL('../../../src/battle/battle_util.c',import.meta.url),'utf8');
const nativeContext=await readFile(new URL('../../../include/battle/battle.h',import.meta.url),'utf8');
assert.match(nativeContext,/\bu8 runAttempts;/,'the native attempt counter is also an unsigned byte');
function blockAt(start:number){let depth=0;const brace=native.indexOf('{',start);for(let i=brace;i<native.length;i++){if(native[i]==='{')depth++;if(native[i]==='}'&&!--depth)return native.slice(start,i+1);}throw Error('Native block is incomplete');}
const tryRun=blockAt(native.indexOf('BOOL BattleTryRun(')),range=blockAt(native.indexOf('int ApplyDamageRange('));
const physical=blockAt(native.indexOf('if (moveCategory == CATEGORY_PHYSICAL) {\n        if (crit > 1)'));
const table=native.match(/(?:static )?const u8 sStatChangeTable\[\d*\]\[2\]\s*=\s*\{[\s\S]*?\n\};/)?.[0];
assert.ok(table,'literal native stat-stage table');
// Compile the original C run function, physical damage branch and random-range
// function, rather than a second TypeScript transcription of their arithmetic.
// Other native modifiers are neutral stubs; this fixture adds no engine support.
const directory=await mkdtemp(join(tmpdir(),'heartgold-escape-burn-')),binary=join(directory,'native');
const oracle=`#include <stdint.h>
#include <stdio.h>
typedef uint8_t u8; typedef uint32_t u32; typedef int BOOL;
#define TRUE 1
#define FALSE 0
#define HOLD_EFFECT_FLEE 1
#define BATTLE_TYPE_NO_EXP 2
#define ABILITY_RUN_AWAY 3
#define GAME_STAT_RUN_FAILURES 4
#define STATUS_BURN 1
#define ABILITY_GUTS 5
#define SIDE_CONDITION_REFLECT 1
#define BATTLE_TYPE_DOUBLES 1
#define MOVE_EFFECT_REMOVE_SCREENS 6
#define CATEGORY_PHYSICAL 0
typedef struct { int unused; } BattleSystem;
typedef struct { struct { int speed; } battleMons[2]; struct { int runFlag; } turnData[2]; u8 runAttempts; struct { struct { int effect; } moveData[1]; } trainerAIData; } BattleContext;
static unsigned randomValue,randomCalls;
static u32 BattleSystem_GetBattleType(BattleSystem *system){return 0;}
static int GetBattlerHeldItemEffect(BattleContext *ctx,int battler){return 0;}
static int GetBattlerAbility(BattleContext *ctx,int battler){return 0;}
static unsigned BattleSystem_Random(BattleSystem *system){randomCalls++;return randomValue;}
static void BattleController_EmitIncrementGameStat(BattleSystem *system,int battler,int zero,int stat){}
static int GetMonsHitCount(BattleSystem *system,BattleContext *ctx,int side,int target){return 1;}
${table}
${tryRun}
${range}
static int physicalBase(int level,int movePower,int monAtk,int monDef,int atkStage,int defStage,int burned){
 int dmg=0,dmg2,crit=1,statChangeAtk=atkStage+6,statChangeDef=defStage+6;
 int sideCondition=0,battleType=0,moveNo=0,battlerIdTarget=1,moveCategory=CATEGORY_PHYSICAL; BattleSystem *battleSystem=0;
 BattleContext storage={0},*ctx=&storage; struct {int status,ability;} calcAttacker={burned?STATUS_BURN:0,0};
 ${physical}
 return dmg + 2;
}
int main(void){char mode;while(scanf(" %c",&mode)==1){randomCalls=0;if(mode=='R'){
 int player,enemy,attempts,roll;if(scanf("%d%d%d%d",&player,&enemy,&attempts,&roll)!=4)return 2;
 BattleSystem system={0};BattleContext ctx={0};ctx.battleMons[0].speed=player;ctx.battleMons[1].speed=enemy;ctx.runAttempts=attempts;randomValue=roll;
 int escaped=BattleTryRun(&system,&ctx,0);printf("%d %d %u\\n",escaped,ctx.runAttempts,randomCalls);
 }else if(mode=='D'){
 int level,power,attack,defense,atkStage,defStage,burned,roll;if(scanf("%d%d%d%d%d%d%d%d",&level,&power,&attack,&defense,&atkStage,&defStage,&burned,&roll)!=8)return 3;
 randomValue=100-roll;printf("%d\\n",ApplyDamageRange(0,0,physicalBase(level,power,attack,defense,atkStage,defStage,burned)));
 }else return 4;}return 0;}
`;
await writeFile(join(directory,'native.c'),oracle);
execFileSync(process.env.CC||'cc',['-std=c99','-O0',join(directory,'native.c'),'-o',binary],{stdio:'pipe'});
after(()=>rm(directory,{recursive:true,force:true}));
function nativeRows(rows:string[]){return execFileSync(binary,[],{input:rows.join('\n')+'\n',encoding:'utf8'}).trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number));}
function mon(species:number,level:number){return createMon(data,species,level,'Ethan',()=>.5);}
function dom(){const elements=new Map<string,{innerHTML:string;hidden:boolean}>();globalThis.document={getElementById(id:string){if(!elements.has(id))elements.set(id,{innerHTML:'',hidden:true});return elements.get(id);},querySelector(){return null;}}as unknown as Document;}
async function runCase(player:ReturnType<typeof mon>,enemy:ReturnType<typeof mon>,attempts:number,roll:number,trainer:number|null=null,staged=false){
 dom();const state=newState(data,'Ethan','boy',()=>.5);state.party=[player];let draws=0,enemyTurns=0,selections=0,atNext:number|undefined;
 const messages:string[]=[],battle=new Battle(data,state,{}as UI,()=>{draws++;return(roll+.001)/256;}),stop=Error('observed next Run menu');
 Reflect.set(battle,'say',async(text:string)=>messages.push(text));Reflect.set(battle,'draw',()=>{});Reflect.set(battle,'enemyTurn',async()=>{enemyTurns++;});
 Reflect.set(battle,'nextAction',async()=>{if(selections++){atNext=Reflect.get(battle,'fleeAttempts');throw stop;}Reflect.set(battle,'fleeAttempts',attempts);if(staged){Reflect.set(battle,'playerStages',{...freshStages(),speed:6});Reflect.set(battle,'enemyStages',{...freshStages(),speed:-6});}return{kind:'run'};});
 let result:string;try{result=await battle.start([enemy],trainer);}catch(error){assert.equal(error,stop);result='failed';}
 return{result,attempts:atNext??Reflect.get(battle,'fleeAttempts'),draws,enemyTurns,messages};
}

test('equal and faster legal raw speeds guarantee escape without consuming RNG',async()=>{
 for(const [player,enemy]of[[mon(19,5),mon(19,5)],[mon(19,6),mon(19,5)]]){
  const [[escaped,attempts,draws]]=nativeRows([`R ${player.stats.speed} ${enemy.stats.speed} 0 255`]),actual=await runCase(player,enemy,0,255);
  assert.equal(escaped,1);assert.equal(actual.result,'ran');assert.equal(actual.attempts,attempts);assert.equal(actual.draws,draws);assert.equal(actual.enemyTurns,0);
 }
});

test('slower Run uses the old attempt count, exact byte odds and post-roll byte counter wrap',async()=>{
 const player=mon(152,5),enemy=mon(16,5);assert.ok(player.stats.speed<enemy.stats.speed);
 const cases=[0,1,4,5,8,255].flatMap(attempts=>Array.from({length:256},(_,roll)=>({attempts,roll}))),expected=nativeRows(cases.map(({attempts,roll})=>`R ${player.stats.speed} ${enemy.stats.speed} ${attempts} ${roll}`));
 for(const [index,{attempts,roll}]of cases.entries()){
  const [escaped,next,draws]=expected[index],actual=await runCase(structuredClone(player),structuredClone(enemy),attempts,roll);
  assert.equal(actual.result,escaped?'ran':'failed',`attempt${attempts},roll${roll}`);assert.equal(actual.attempts,next);assert.equal(actual.draws,draws);assert.equal(actual.enemyTurns,escaped?0:1);
 }
});

test('Run retains native raw-speed and status ordering rather than using staged/paralyzed Fight speed',async()=>{
 for(const status of['PAR','SLP','FRZ']){
  const equal=mon(19,5),enemy=mon(19,5);equal.status=status;equal.sleepTurns=2;
  const actual=await runCase(equal,enemy,0,255,null,true);assert.equal(actual.result,'ran');assert.equal(actual.draws,0);
  const slower=mon(152,5),faster=mon(16,5);slower.status=status;slower.sleepTurns=2;
  const [[escaped,next,draws]]=nativeRows([`R ${slower.stats.speed} ${faster.stats.speed} 0 127`]),changed=await runCase(slower,faster,0,127,null,true);
  assert.equal(changed.result,escaped?'ran':'failed');assert.equal(changed.attempts,next);assert.equal(changed.draws,draws);
 }
});

test('a trainer Run rejection neither rolls escape nor increments its attempt counter',async()=>{
 const actual=await runCase(mon(19,5),mon(16,5),0,255,20);assert.equal(actual.result,'failed');assert.equal(actual.attempts,0);assert.equal(actual.draws,0);assert.equal(actual.enemyTurns,0);assert.ok(actual.messages.some(text=>text.includes('no running')));
});

test('legal physical Tackle burn damage matches literal native C before+2 and random-range truncation',()=>{
 const move=data.moves[data.constants.MOVE_TACKLE];assert.equal(move.category,0);assert.equal(move.type,data.constants.TYPE_NORMAL);
 for(const level of[5,10,20,50])for(const burned of[false,true])for(const attackStage of[-2,0,2])for(const defenseStage of[-1,0,1])for(const roll of[85,91,100]){
  const player=mon(152,level),enemy=mon(16,level);assert.ok(data.learnsets[player.species].some(row=>row.move===move.id&&row.level<=level));
  assert.ok(!data.personal[player.species].types.includes('TYPE_NORMAL'),'neutral, no STAB fixture');player.status=burned?'BRN':'';
  const [[expected]]=nativeRows([`D ${level} ${move.power} ${player.stats.atk} ${enemy.stats.def} ${attackStage} ${defenseStage} ${Number(burned)} ${roll}`]);
  const actual=moveDamage(data,player,enemy,move,{...freshStages(),atk:attackStage},{...freshStages(),def:defenseStage},roll);
  assert.equal(actual.effectiveness,1);assert.equal(actual.damage,expected,`level${level},burn${burned},stages${attackStage}/${defenseStage},roll${roll}`);
 }
});

test('the actual attack applies native burned damage, spends one PP and retains its attack/hit view callbacks',async()=>{
 const player=mon(152,5),enemy=mon(16,5),move=data.moves[data.constants.MOVE_TACKLE];player.status='BRN';player.moves=[{id:move.id,pp:move.pp,maxPP:move.pp}];
 const [[expected]]=nativeRows([`D 5 ${move.power} ${player.stats.atk} ${enemy.stats.def} 0 0 1 100`]),state=newState(data,'Ethan','boy',()=>.5);state.party=[player];
 const events:string[]=[],draws=[0,.5,.999],view={attack:async()=>{events.push('attack');},hit:async()=>{events.push('hit');}}as unknown as BattleView;
 const battle=new Battle(data,state,{}as UI,()=>{assert.ok(draws.length,'unexpected gameplay draw');return draws.shift()!;},view);Reflect.set(battle,'enemies',[enemy]);Reflect.set(battle,'say',async()=>{});Reflect.set(battle,'draw',()=>{});
 const before=enemy.hp;await Reflect.get(battle,'attack').call(battle,true,0);assert.equal(before-enemy.hp,expected);assert.equal(player.moves[0].pp,move.pp-1);assert.deepEqual(events,['attack','hit']);assert.equal(draws.length,0);
});
