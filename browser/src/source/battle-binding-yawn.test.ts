import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {Battle} from './battle.ts';
import {createMon,loadData,newState} from './data.ts';
import {originalTrainerParty} from './trainers.ts';
import {monAbility} from './battle-math.ts';
import {nativeStatus2,nativeBeforeTurnStatus2} from './battle-volatiles.ts';
import {nativeBindingStart,nativeBindingTick,nativeBindingBlocks} from './battle-binding-yawn.ts';
import type {Mon} from './types.ts';
import type {UI} from './ui.ts';
import type {BattleView} from './battle-view.ts';
globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData(),noncrit=32769/65536;
const mon=(species:number,level=15,odd=false)=>createMon(data,species,level,'Ethan',()=>odd?0x80010001/0x100000000:noncrit);
const slot=(subject:Mon,key:string)=>{const index=subject.moves.findIndex(move=>move.id===data.constants[key]);assert.ok(index>=0,`${subject.name} must know ${key}`);return index;};
function legalMove(subject:Mon,key:string,tm?:number){const move=data.moves[data.constants[key]];assert.ok(tm?data.personal[subject.species].tms.includes(tm):data.learnsets[subject.species].some(row=>row.move===move.id&&row.level<=subject.level));subject.moves=[{id:move.id,pp:move.pp,maxPP:move.pp}];}
function fixture(enemies:Mon[],party:Mon[]=[mon(152)],values?:number[]){
 const elements=new Map<string,{innerHTML:string;hidden:boolean}>();globalThis.document={getElementById(id:string){if(!elements.has(id))elements.set(id,{innerHTML:'',hidden:true});return elements.get(id);},querySelector(){return null;}}as unknown as Document;
 const state=newState(data,'Ethan','boy',()=>noncrit);state.party=party;const messages:string[]=[],events:string[]=[];let draws=0;
 const view={begin:async()=>events.push('begin'),sync(){},attack:async(side:boolean)=>events.push(`attack:${side}`),hit:async(side:boolean)=>events.push(`hit:${side}`),end:()=>events.push('end')}as unknown as BattleView;
 const battle=new Battle(data,state,{choose:async()=>4}as unknown as UI,()=>{if(values)assert.ok(draws<values.length,'unexpected gameplay draw');return values?values[draws++]/65536:(draws++,noncrit);},view);Reflect.set(battle,'enemies',enemies);Reflect.set(battle,'trainer',384);Reflect.set(battle,'experienceMask',1);Reflect.set(battle,'say',async(text:string)=>messages.push(text));Reflect.set(battle,'draw',()=>{});
 for(const active of[party[0],enemies[0]])Reflect.get(battle,'initializeWeight').call(battle,active);
 return{battle,state,messages,events,get draws(){return draws;}};
}
type Fixture=ReturnType<typeof fixture>;
const call=(f:Fixture,key:string,...args:unknown[])=>Reflect.get(f.battle,key).apply(f.battle,args);
const act=(f:Fixture,side:boolean,key:string)=>call(f,'attack',side,slot(side?f.battle.player:f.battle.enemy,key));
const count=(f:Fixture,subject:Mon)=>(call(f,'volatile',subject).status2&nativeStatus2.bind)>>>13;
async function turns(f:Fixture,n:number,playerMove:string,enemyMove:string){let selected=0;const stop=new Error('observed end-turn phases');Reflect.set(f.battle,'active',true);Reflect.set(f.battle,'chooseEnemyMove',()=>slot(f.battle.enemy,enemyMove));Reflect.set(f.battle,'nextAction',async()=>{if(selected++===n)throw stop;return{kind:'move',slot:slot(f.battle.player,playerMove)};});await assert.rejects(call(f,'loop'),error=>error===stop);}

test('literal native binding controller and Random C replay all u16 durations and complete countdowns',async()=>{
 const command=await readFile(new URL('../../../src/battle/battle_command.c',import.meta.url),'utf8'),controller=await readFile(new URL('../../../src/battle/battle_controller_player.c',import.meta.url),'utf8'),util=await readFile(new URL('../../../src/battle/battle_util.c',import.meta.url),'utf8');
 const random=command.slice(command.indexOf('BOOL BtlCmd_Random('),command.indexOf('BOOL BtlCmd_UpdateVar2('));const division=util.slice(util.indexOf('int DamageDivide('),util.indexOf('\n}',util.indexOf('int DamageDivide('))+2);const binding=controller.slice(controller.indexOf('        case UMC_STATE_BINDING:'),controller.indexOf('        case UMC_STATE_BAD_DREAMS:'));
 const start=await readFile(new URL('../../../files/battledata/script/subscript/subscript_0058_BindStart.s',import.meta.url),'utf8');assert.match(start,/Random 3, 3[\s\S]*HOLD_EFFECT_EXTEND_TRAPPING[\s\S]*0x00000006/);assert.match(start,/STATUS2_BIND, _043/);
 const temp=await mkdtemp(join(tmpdir(),'hg-binding-c-'));
 try{const c=`#include <stdio.h>\n#include <stdint.h>\n#define BOOL int\n#define FALSE 0\n#define STATUS2_BIND (7<<13)\n#define STATUS2_BINDING_SHIFT 13\n#define UMC_STATE_BINDING 0\n#define NARC_a_0_0_1 0\n#define BATTLE_SUBSCRIPT_BIND_EFFECT 59\n#define BATTLE_SUBSCRIPT_BIND_END 60\n#define CONTROLLER_COMMAND_RUN_SCRIPT 21\ntypedef int BattleSystem; typedef struct { struct {int status2,hp,maxHp;struct{int bindingMove;}moveEffectData;}battleMons[1];int calcTemp,hpCalc,moveTemp,battlerIdTemp,commandNext,command,stateUpdateMonCondition; } BattleContext;static int raw,word,script;void BattleScriptIncrementPointer(BattleContext*c,int n){} int BattleScriptReadWord(BattleContext*c){return word++?3:3;}int BattleSystem_Random(BattleSystem*b){return raw;}void ReadBattleScriptFromNarc(BattleContext*c,int n,int s){script=s;}\n${random}\n${division}\nvoid tick(BattleContext*ctx){int battlerId=0,flag=0;switch(0){${binding}}}\nint main(){for(int grip=0;grip<2;grip++){uint32_t hash=2166136261u;for(raw=0;raw<65536;raw++){BattleContext ctx={0};word=0;BtlCmd_Random(0,&ctx);if(grip)ctx.calcTemp=6;ctx.battleMons[0].status2=ctx.calcTemp<<13;ctx.battleMons[0].hp=ctx.battleMons[0].maxHp=31;for(int t=0;t<7;t++){script=0;ctx.hpCalc=0;tick(&ctx);hash=(hash^(uint32_t)ctx.battleMons[0].status2)*16777619u;hash=(hash^(uint32_t)(-ctx.hpCalc))*16777619u;hash=(hash^(uint32_t)script)*16777619u;}}printf("%u\\n",hash);}return 0;}`;
 await writeFile(join(temp,'oracle.c'),c);execFileSync('cc',['-std=c99','-O2',join(temp,'oracle.c'),'-o',join(temp,'oracle')]);const expected=execFileSync(join(temp,'oracle'),{encoding:'utf8'}).trim().split('\n').map(Number);
 for(const grip of[false,true]){let hash=2166136261;for(let raw=0;raw<65536;raw++){let value=nativeBindingStart(0,()=>raw,grip).status2;for(let t=0;t<7;t++){const next=nativeBindingTick(value,31,31,false);value=next.status2;for(const n of[value,next.damage,next.outcome==='bound'?59:next.outcome==='ended'?60:0])hash=Math.imul(hash^n,16777619)>>>0;}}assert.equal(hash,expected[+grip]);}
 }finally{await rm(temp,{recursive:true,force:true});}
 for(const hp of[1,15,16,17,31,32,65535]){assert.equal(nativeBindingTick(3<<13,hp,hp,false).damage,Math.max(1,Math.floor(hp/16)));assert.equal(nativeBindingTick(3<<13,hp,hp,true).damage,0);}assert.deepEqual(nativeBindingTick(1<<13,0,31,false),{status2:1<<13,outcome:'none',damage:0});
});

test('actual Daniel Onix11 and SlowpokeWell Grunt Ekans11 bind once after damage, without resetting count on a second hit',async()=>{
 for(const[id,member,key]of[[384,0,'MOVE_BIND'],[13,1,'MOVE_WRAP']]as const){const actor=(await originalTrainerParty(data,id))[member],target=mon(152,20),f=fixture([actor],[target],[0,32769,32769,0,0,32769,32769]);assert.equal(actor.level,11);const index=slot(actor,key),pp=actor.moves[index].pp,hp=target.hp;await act(f,false,key);assert.ok(target.hp<hp);assert.equal(count(f,target),3);assert.equal(f.draws,4);assert.deepEqual(Reflect.get(f.battle,'bindings').get(target),{source:1,move:data.constants[key]});const afterHit=target.hp;await call(f,'bindingResidual',target,true);assert.equal(count(f,target),2);assert.equal(afterHit-target.hp,Math.max(1,Math.floor(target.maxHP/16)));const after=target.hp;await act(f,false,key);assert.ok(target.hp<after);assert.equal(count(f,target),2);assert.equal(f.draws,7);assert.equal(actor.moves[index].pp,pp-2);assert.equal(f.messages.filter(m=>m.includes('was trapped')).length,1);}
});

test('native hit gates do not draw or bind after a miss, Normal immunity or a knockout',async()=>{
 const native=(await originalTrainerParty(data,384))[0];for(const mode of['miss','immune','KO']as const){const actor=mode==='KO'?mon(95,50):structuredClone(native),target=mode==='immune'?mon(92,20):mon(129,mode==='KO'?1:20),raw=mode==='miss'?[65535]:[0,32769,32769],f=fixture([actor],[target],raw),hp=target.hp;if(mode==='KO')legalMove(actor,'MOVE_BIND');await act(f,false,'MOVE_BIND');assert.equal(count(f,target),0);assert.equal(Reflect.get(f.battle,'bindings').size,0);assert.equal(f.draws,raw.length);if(mode==='KO')assert.equal(target.hp,0);else assert.equal(target.hp,hp);}
});

test('GripClaw keeps the native draw then forces six; MagicGuard still ticks and the expiration turn does no damage',async()=>{
 const actor=(await originalTrainerParty(data,384))[0],target=mon(35,20,true);assert.equal(monAbility(data,target),'ABILITY_MAGIC_GUARD');actor.heldItem='ITEM_GRIP_CLAW';const f=fixture([actor],[target],[0,32769,32769,0]);await act(f,false,'MOVE_BIND');assert.equal(f.draws,4);assert.equal(count(f,target),6);const hp=target.hp;for(let t=0;t<6;t++)await call(f,'bindingResidual',target,true);assert.equal(target.hp,hp);assert.equal(count(f,target),0);assert.equal(f.messages.filter(m=>m.includes('was freed')).length,1);assert.ok(!f.messages.some(m=>m.includes('is hurt by')));
 const ordinary=fixture([(await originalTrainerParty(data,384))[0]],[mon(152,20)],[0,32769,32769,0]);await act(ordinary,false,'MOVE_BIND');const before=ordinary.battle.player.hp,damage=Math.max(1,Math.floor(ordinary.battle.player.maxHP/16));for(let t=0;t<3;t++)await call(ordinary,'bindingResidual',ordinary.battle.player,true);assert.equal(before-ordinary.battle.player.hp,2*damage);assert.equal(count(ordinary,ordinary.battle.player),0);
});

test('switch and escape use distinct native bypasses; source or target departure releases binding',async()=>{
 const flags={shedShell:false,smokeBall:false,runAway:false,noExperienceBattle:false};for(const mask of[nativeStatus2.bind,nativeStatus2.meanLook]){assert.equal(nativeBindingBlocks(mask,'switch',flags),true);assert.equal(nativeBindingBlocks(mask,'escape',flags),true);assert.equal(nativeBindingBlocks(mask,'switch',{...flags,shedShell:true}),false);assert.equal(nativeBindingBlocks(mask,'escape',{...flags,shedShell:true}),true);for(const key of['smokeBall','runAway','noExperienceBattle'])assert.equal(nativeBindingBlocks(mask,'escape',{...flags,[key]:true}),false);}
 for(const leaving of['source','target']as const){const actor=(await originalTrainerParty(data,384))[0],target=mon(152,20),f=fixture([actor,mon(129)],[target,mon(155)],[0,32769,32769,0]);await act(f,false,'MOVE_BIND');assert.equal(call(f,'trapped','switch'),true);target.heldItem='ITEM_SHED_SHELL';assert.equal(call(f,'trapped','switch'),false);assert.equal(call(f,'trapped','escape'),true);target.heldItem='ITEM_SMOKE_BALL';assert.equal(call(f,'trapped','escape'),false);assert.equal(call(f,'trapped','switch'),true);if(leaving==='source')await call(f,'sendEnemy',1);else await call(f,'switch',1);assert.equal(count(f,target),0);assert.equal(Reflect.get(f.battle,'bindings').has(target),false);}
});

test('native Rage mask removes Bind and battle cleanup preserves saved party identity and data',async()=>{
 const actor=mon(95),target=mon(95),f=fixture([actor],[target],[0,32769,32769,0]);await act(f,false,'MOVE_BIND');Reflect.get(f.battle,'raging').add(target);call(f,'volatile',target).status2|=nativeStatus2.rage;call(f,'prepareRageTurn',target,slot(target,'MOVE_ROCK_THROW'));assert.equal(count(f,target),0);assert.equal(nativeBeforeTurnStatus2(nativeStatus2.rage|nativeStatus2.bind,33,99),nativeStatus2.rage);const before=structuredClone(f.state.party);call(f,'clearBattleVolatiles');assert.equal(Reflect.get(f.battle,'bindings').size,0);assert.deepEqual(f.state.party,before);assert.equal(f.state.party[0],target);
});

test('real end-turn loop ticks Bind and a preceding burn KO releases the source before its slower victim ticks',async()=>{
 const actor=(await originalTrainerParty(data,384))[0],target=mon(129,30),f=fixture([actor],[target],[0,32769,32769,0]);await act(f,false,'MOVE_BIND');Reflect.set(f.battle,'rng',()=>noncrit);legalMove(actor,'MOVE_HARDEN');await turns(f,2,'MOVE_SPLASH','MOVE_HARDEN');assert.equal(count(f,target),1);assert.equal(f.messages.filter(m=>m.includes('is hurt by Bind')).length,2);
 // Legal already-damaged controller state: native burn KO before
 // Bind phase, releasing the provider's trap before the later battler runs.
 const owner=mon(95,15),victim=mon(129,5),g=fixture([owner],[victim],[0,32769,32769,0]);await act(g,false,'MOVE_BIND');assert.ok(victim.hp>0);owner.status='BRN';owner.hp=1;Reflect.set(g.battle,'rng',()=>noncrit);legalMove(owner,'MOVE_HARDEN');const originalHP=victim.hp;Reflect.set(g.battle,'gainExperience',async()=>{});Reflect.set(g.battle,'finish',()=>{Reflect.set(g.battle,'active',false);});Reflect.set(g.battle,'nextAction',async()=>({kind:'move',slot:slot(victim,'MOVE_SPLASH')}));Reflect.set(g.battle,'chooseEnemyMove',()=>0);Reflect.set(g.battle,'active',true);await call(g,'loop');assert.equal(owner.hp,0);assert.equal(victim.hp,originalHP);assert.equal(count(g,victim),0);
});

test('native binding admits no unported adjacent effects and preflights unresolved on-hit/weather/Pressure before PP',async()=>{
 for(const species of[29,243]){const actor=(await originalTrainerParty(data,384))[0],target=mon(species,20),f=fixture([actor],[target]),before=structuredClone({actor,target});await assert.rejects(act(f,false,'MOVE_BIND'),/Unsupported native binding/);assert.deepEqual({actor,target},before);assert.equal(f.draws,0);}
 const actor=(await originalTrainerParty(data,384))[0],f=fixture([actor]);Reflect.set(f.battle,'weather','rain');const before=structuredClone(actor);await assert.rejects(act(f,false,'MOVE_BIND'),/Unsupported native binding weather/);assert.deepEqual(actor,before);assert.equal(f.draws,0);
 const engine=await readFile(new URL('./battle.ts',import.meta.url),'utf8'),effects=engine.match(/implementedEffects=new Set\(\[([^\]]*)\]/)![1].split(',').map(Number);for(const id of[129,261,79,127])assert.ok(!effects.includes(id));
});
