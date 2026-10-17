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
import {nativeBindingStart,nativeBindingTick,nativeBindingBlocks,nativeYawnStart,nativeYawnTick,nativeYawnSleepGate,nativeSleepDuration,nativeSleepTick} from './battle-binding-yawn.ts';
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

test('actual Larry Slowpoke11 Yawn has no hit draw, never refreshes, and sleeps at the second real end-turn before Chesto/Lum',async()=>{
 const native=(await originalTrainerParty(data,23))[0];assert.deepEqual([native.species,native.level],[79,11]);
 for(const berry of[null,'ITEM_CHESTO_BERRY','ITEM_LUM_BERRY']){const actor=structuredClone(native),target=mon(152,20),f=fixture([actor],[target],[0,0,2]);target.heldItem=berry;legalMove(target,'MOVE_GROWL');const pp=actor.moves[slot(actor,'MOVE_YAWN')].pp;Reflect.set(f.battle,'active',true);let n=0;const stop=new Error('two actual turns');Reflect.set(f.battle,'nextAction',async()=>{if(n++===2)throw stop;return{kind:'move',slot:slot(target,'MOVE_GROWL')};});Reflect.set(f.battle,'chooseEnemyMove',()=>slot(actor,'MOVE_YAWN'));await assert.rejects(call(f,'loop'),error=>error===stop);assert.equal(actor.moves[slot(actor,'MOVE_YAWN')].pp,pp-2);assert.equal(f.draws,3,'two Growl accuracy draws and one delayed sleep duration');assert.equal(target.status,berry?'':'SLP');assert.equal(target.sleepTurns,berry?0:4);assert.equal(target.heldItem,null);assert.equal(f.messages.filter(m=>m.includes('made')&&m.includes('drowsy')).length,1);assert.equal(f.messages.filter(m=>m.includes('fell asleep')).length,1);assert.equal(f.events.filter(e=>e==='attack:false').length,1);assert.equal(Reflect.get(f.battle,'yawnTurns').size,0);}
});

test('Yawn fails on existing status and sleep-blocking abilities; Soundproof itself does not block drowsiness',async()=>{
 for(const[species,status]of[[152,'PAR'],[163,''],[56,''],[293,'']]as const){const actor=(await originalTrainerParty(data,23))[0],target=mon(species,20),f=fixture([actor],[target]);target.status=status;await act(f,false,'MOVE_YAWN');const blocked=species!==293;assert.equal(Reflect.get(f.battle,'yawnTurns').has(target),!blocked);assert.equal(f.draws,0);assert.equal(f.events.filter(e=>e==='attack:false').length,blocked?0:1);}
});

test('native delayed sleep ignores the vanished caster MoldBreaker and rechecks current status without consuming a draw',async()=>{
 // Smeargle can legally Sketch Yawn; Sketch itself remains unadmitted. The
 // selected ability is Pinsir's native MoldBreaker, never an invented override.
 const actor=mon(127,20,true),target=mon(163,20),move=data.moves[data.constants.MOVE_YAWN],f=fixture([actor],[target]);assert.equal(monAbility(data,actor),'ABILITY_MOLD_BREAKER');
 // Pure initial gate covers legal MoldBreaker+Yawn via Sketch/SkillSwap state;
 // live engine probe supplies that source-script boundary deliberately, not a
 // claim that Pinsir learns Yawn or unported SkillSwap has been implemented.
 const result=nativeYawnStart(0,{ability:monAbility(data,target),status:'',sun:false,uproar:false,moldBreaker:true,substitute:false,safeguard:false});assert.equal(result.outcome,'applied');Reflect.get(f.battle,'yawnTurns').set(target,result.turns);await call(f,'yawnResidual',target);await call(f,'yawnResidual',target);assert.equal(target.status,'');assert.equal(f.draws,0);assert.ok(f.messages.some(m=>m.includes('stayed awake')));
 const slow=(await originalTrainerParty(data,23))[0],chikorita=mon(152,20),g=fixture([slow],[chikorita]);await act(g,false,'MOVE_YAWN');chikorita.status='PAR';await call(g,'yawnResidual',chikorita);await call(g,'yawnResidual',chikorita);assert.equal(chikorita.status,'PAR');assert.equal(g.draws,0);assert.equal(Reflect.get(g.battle,'yawnTurns').size,0);
});

test('withdrawing Yawn caster retains drowsiness; target leaving or fainting clears it; Rage retains its separate move-effect countdown',async()=>{
 for(const leaving of['source','target','target-faint']as const){const actor=(await originalTrainerParty(data,23))[0],target=mon(152,20),f=fixture([actor,mon(129)],[target,mon(155)],[0]);await act(f,false,'MOVE_YAWN');if(leaving==='source'){await call(f,'sendEnemy',1);assert.equal(Reflect.get(f.battle,'yawnTurns').get(target),2);await call(f,'yawnResidual',target);await call(f,'yawnResidual',target);assert.equal(target.status,'SLP');assert.equal(target.sleepTurns,2);assert.equal(f.draws,1);}else{if(leaving==='target')await call(f,'switch',1);else{target.hp=0;call(f,'clearOnLeave',target);}assert.equal(Reflect.get(f.battle,'yawnTurns').has(target),false);assert.equal(f.draws,0);}}
 const actor=(await originalTrainerParty(data,23))[0],target=mon(95,15),f=fixture([actor],[target]);await act(f,false,'MOVE_YAWN');Reflect.get(f.battle,'raging').add(target);call(f,'volatile',target).status2|=nativeStatus2.rage;call(f,'prepareRageTurn',target,slot(target,'MOVE_ROCK_THROW'));assert.equal(Reflect.get(f.battle,'yawnTurns').get(target),2);assert.equal(call(f,'volatile',target).status2,nativeStatus2.rage);const before=structuredClone(f.state.party);call(f,'clearBattleVolatiles');assert.equal(Reflect.get(f.battle,'yawnTurns').size,0);assert.deepEqual(f.state.party,before);
});

test('Yawn sleep uses native raw modulo and EarlyBird checks before PP, then permits the wake-up action',async()=>{
 for(const[species,early]of[[152,false],[84,true]]as const){const actor=(await originalTrainerParty(data,23))[0],target=mon(species,20,early),f=fixture([actor],[target],[3,0]);legalMove(target,'MOVE_GROWL');assert.equal(monAbility(data,target)==='ABILITY_EARLY_BIRD',early);await act(f,false,'MOVE_YAWN');await call(f,'yawnResidual',target);await call(f,'yawnResidual',target);assert.equal(target.sleepTurns,5);const key=early?'MOVE_GROWL':'MOVE_GROWL',i=slot(target,key),pp=target.moves[i].pp;let attempts=0;while(target.status==='SLP'){await act(f,true,key);attempts++;assert.ok(attempts<=5);}assert.equal(attempts,early?3:5);assert.equal(target.moves[i].pp,pp-1);assert.equal(target.sleepTurns,0);assert.equal(f.draws,2,'one duration draw plus the waking Growl accuracy; no repeated sleep/Yawn draws');}
});

test('actual native UnionCave Onix6 and SlowpokeWell Slowpoke6 expose the admitted effects without extra side effects',async()=>{
 for(const[map,species,level,key]of[['D25R0101',95,6,'MOVE_BIND'],['D26R0102',79,6,'MOVE_YAWN']]as const){const source=data.encounters.find(row=>row.map===map);assert.ok(source,`${map} exists`);assert.ok(source.land.mons.some(row=>row.level===level&&JSON.stringify(row.species).includes(species===95?'SPECIES_ONIX':'SPECIES_SLOWPOKE')),`${map}/${species}/${level} native encounter`);const wild=mon(species,level),target=mon(152,20),f=fixture([wild],[target]);Reflect.set(f.battle,'trainer',null);await act(f,false,key);assert.equal(key==='MOVE_BIND'?count(f,target)>0:Reflect.get(f.battle,'yawnTurns').get(target)===2,true);}
});

test('Yawn preflights Pressure, unsupported consumption abilities and unresolved weather without spending PP',async()=>{
 for(const species of[243,425]){const actor=(await originalTrainerParty(data,23))[0],target=mon(species,20,species===425),f=fixture([actor],[target]);if(species===425)target.heldItem='ITEM_CHESTO_BERRY';const before=structuredClone({actor,target});await assert.rejects(act(f,false,'MOVE_YAWN'),/Unsupported native (Yawn|volatile held-item)/);assert.deepEqual({actor,target},before);assert.equal(f.draws,0);}
 const actor=(await originalTrainerParty(data,23))[0],f=fixture([actor]);Reflect.set(f.battle,'weather','sun');const before=structuredClone(actor);await assert.rejects(act(f,false,'MOVE_YAWN'),/Unsupported native Yawn weather/);assert.deepEqual(actor,before);assert.equal(f.draws,0);
});

test('native trainer battles resolve via actual actions and clean both new states, without injected victories',async()=>{
 for(const[id,key,wait]of[[384,'MOVE_BIND',1],[23,'MOVE_YAWN',2]]as const){const team=await originalTrainerParty(data,id),player=mon(152,18);const growl=data.moves[data.constants.MOVE_GROWL];assert.ok(data.learnsets[152].some(row=>row.move===growl.id&&row.level<=20));const razor=player.moves[slot(player,'MOVE_RAZOR_LEAF')];player.moves=[razor,{id:growl.id,pp:growl.pp,maxPP:growl.pp}];const f=fixture(team,[player]);let n=0;Reflect.set(f.battle,'nextAction',async()=>{assert.ok(++n<30,'native action sequence should terminate');return{kind:'move',slot:slot(f.battle.player,n<=wait?'MOVE_GROWL':'MOVE_RAZOR_LEAF')};});Reflect.set(f.battle,'chooseEnemyMove',()=>slot(f.battle.enemy,key));assert.equal(await f.battle.start(team,id),'won');assert.ok(team.every(subject=>subject.hp===0));assert.ok(f.messages.some(message=>message.includes(key==='MOVE_BIND'?'was trapped':'fell asleep')));for(const state of['bindings','yawnTurns'])assert.equal(Reflect.get(f.battle,state).size,0);assert.ok(f.events.includes('begin')&&f.events.includes('end'));}
});

test('ordinary bound switch/run rejection consumes no turn; a legal Uturn bypasses binding and targets the replacement correctly',async()=>{
 const actor=(await originalTrainerParty(data,384))[0],player=mon(129,20),f=fixture([actor],[player,mon(155)]);await act(f,false,'MOVE_BIND');Reflect.set(f.battle,'trainer',null);legalMove(actor,'MOVE_HARDEN');let n=0;const stop=new Error('after one accepted turn');Reflect.set(f.battle,'active',true);Reflect.set(f.battle,'chooseEnemyMove',()=>0);Reflect.set(f.battle,'nextAction',async()=>{n++;if(n===1)return{kind:'switch',index:1};if(n===2)return{kind:'run'};if(n===3)return{kind:'move',slot:slot(player,'MOVE_SPLASH')};throw stop;});await assert.rejects(call(f,'loop'),error=>error===stop);assert.equal(Reflect.get(f.battle,'turns'),1);assert.equal(f.battle.player,player);assert.equal(f.messages.filter(m=>m.includes('used Harden')).length,1);assert.ok(f.messages.some(m=>m.includes('can’t be switched'))&&f.messages.includes('Can’t escape!'));
 const source=(await originalTrainerParty(data,384))[0],pivot=mon(123,17),reserve=mon(152,20);legalMove(pivot,'MOVE_U_TURN',89);legalMove(source,'MOVE_HARDEN');const g=fixture([source],[pivot,reserve]);source.moves.push({id:data.constants.MOVE_BIND,pp:20,maxPP:20});await act(g,false,'MOVE_BIND');assert.ok(call(g,'trapped','switch'));Reflect.set(g.battle,'partyMenu',(forced:boolean)=>{assert.equal(forced,true);Reflect.get(g.battle,'actions')({kind:'switch',index:1});});let actions=0;Reflect.set(g.battle,'nextAction',async()=>{if(actions++)throw stop;return{kind:'move',slot:0};});Reflect.set(g.battle,'chooseEnemyMove',()=>slot(source,'MOVE_HARDEN'));Reflect.set(g.battle,'active',true);await assert.rejects(call(g,'loop'),error=>error===stop);assert.equal(g.battle.player,reserve);assert.equal(count(g,pivot),0);assert.equal(Reflect.get(g.battle,'bindings').size,0);assert.ok(g.messages.some(m=>m.includes('used U-turn')));
});

test('Unsupported after a real Yawn restores saved data and clears drowsiness and owned binding state',async()=>{
 const team=await originalTrainerParty(data,23),player=mon(152,15);legalMove(player,'MOVE_GROWL');assert.ok(data.personal[152].tms.includes(17));const protect=data.moves[data.constants.MOVE_PROTECT];player.moves.push({id:protect.id,pp:protect.pp,maxPP:protect.pp});const f=fixture(team,[player]),before=structuredClone(f.state);let n=0;Reflect.set(f.battle,'nextAction',async()=>({kind:'move',slot:n++?1:0}));Reflect.set(f.battle,'chooseEnemyMove',()=>slot(team[0],'MOVE_YAWN'));await assert.rejects(f.battle.start(team,23),/Unported original move effect/);assert.deepEqual(f.state,before);assert.ok(f.messages.some(message=>message.includes('drowsy')));assert.equal(Reflect.get(f.battle,'yawnTurns').size,0);assert.equal(Reflect.get(f.battle,'bindings').size,0);assert.equal(f.battle.active,false);assert.equal(f.events.at(-1),'end');
});

test('new binding effects reject unported typed absorption and Yawn rejects BadDreams before any PP or random draw',async()=>{
 for(const[species,key,targetSpecies,odd]of[[4,'MOVE_FIRE_SPIN',77,true],[90,'MOVE_CLAMP',134,false]]as const){const actor=mon(species,species===4?37:30),target=mon(targetSpecies,30,odd),f=fixture([actor],[target]);legalMove(actor,key);const before=structuredClone({actor,target});await assert.rejects(act(f,false,key),/Unsupported native binding immunity/);assert.deepEqual({actor,target},before);assert.equal(f.draws,0);}
 const actor=(await originalTrainerParty(data,23))[0],target=mon(491,50),f=fixture([actor],[target]),before=structuredClone({actor,target});assert.equal(monAbility(data,target),'ABILITY_BAD_DREAMS');await assert.rejects(act(f,false,'MOVE_YAWN'),/Unsupported native Yawn BadDreams/);assert.deepEqual({actor,target},before);assert.equal(f.draws,0);
});

test('review regression: an actual PowderSnow freeze is thawed by FireSpin after binding and held-status recovery',async()=>{
 const freezer=mon(220,10),fire=mon(4,37),target=mon(152,30);legalMove(freezer,'MOVE_POWDER_SNOW');legalMove(fire,'MOVE_FIRE_SPIN');const f=fixture([target],[freezer,fire],[0,32769,32769,0,0,32769,32769,0]);await act(f,true,'MOVE_POWDER_SNOW');assert.equal(target.status,'FRZ');const frozen=structuredClone(target);await call(f,'switch',1);await act(f,true,'MOVE_FIRE_SPIN');assert.ok(target.hp>0);assert.equal(target.status,'');assert.equal(count(f,target),3);assert.equal(f.draws,8,'freeze hit/secondary and binding hit/duration; no random thaw roll');assert.ok(f.messages.some(message=>message.includes('thawed out')));
 for(const mode of['miss','normal','berry']as const){const victim=structuredClone(frozen),attacker=mode==='normal'?(await originalTrainerParty(data,384))[0]:mon(4,37);if(mode!=='normal')legalMove(attacker,'MOVE_FIRE_SPIN');if(mode==='berry')victim.heldItem='ITEM_ASPEAR_BERRY';const g=fixture([victim],[attacker],mode==='miss'?[65535]:[0,32769,32769,0]);await act(g,true,mode==='normal'?'MOVE_BIND':'MOVE_FIRE_SPIN');assert.equal(victim.status,mode==='berry'?'':'FRZ');assert.equal(g.messages.some(message=>message.includes('thawed out')),false);if(mode==='berry'){assert.equal(victim.heldItem,null);assert.ok(g.messages.some(message=>message.includes('used its')));}}
 const ember=mon(4,37),victim=structuredClone(frozen);legalMove(ember,'MOVE_EMBER');const g=fixture([victim],[ember],[0,32769,32769,65535]);await act(g,true,'MOVE_EMBER');assert.ok(victim.hp>0);assert.equal(victim.status,'');assert.equal(g.draws,4,'existing Ember secondary check, no extra thaw draw');
 const finisher=mon(4,37),faint=mon(129,1);legalMove(finisher,'MOVE_FIRE_SPIN');faint.status='FRZ';const h=fixture([faint],[finisher],[0,32769,32769]);await act(h,true,'MOVE_FIRE_SPIN');assert.equal(faint.hp,0);assert.equal(faint.status,'FRZ','native HP gate prevents thaw on a KO');assert.equal(count(h,faint),0);assert.equal(h.messages.some(message=>message.includes('thawed out')),false);
});

test('review regression: native sleep decrements or wakes before an actual Bite flinch without spending PP',async()=>{
 // Combined source mons are a legal controller boundary, not a claimed native
 // trainer roster: LarrySlowpoke casts, Grunt13Ekans replaces it and Bites.
 for(const counter of[5,1]){const sleep=(await originalTrainerParty(data,23))[0],biter=(await originalTrainerParty(data,13))[1],target=mon(152,18);legalMove(target,'MOVE_GROWL');const f=fixture([sleep,biter],[target],[3,0,32769,32769,0]);await act(f,false,'MOVE_YAWN');await call(f,'yawnResidual',target);await call(f,'yawnResidual',target);for(let i=5;i>counter;i--)await act(f,true,'MOVE_GROWL');assert.equal(target.sleepTurns,counter);await call(f,'sendEnemy',1);await act(f,false,'MOVE_BITE');assert.equal(Reflect.get(f.battle,'flinch'),true);const pp=target.moves[0].pp;await act(f,true,'MOVE_GROWL');assert.equal(target.sleepTurns,counter-1);assert.equal(target.status,counter===1?'':'SLP');assert.equal(target.moves[0].pp,pp);assert.equal(f.draws,5);}
});

test('review regression: sleeping Snore and SleepTalk fail explicitly before changing sleep, PP or RNG',async()=>{
 for(const key of['MOVE_SNORE','MOVE_SLEEP_TALK']){const actor=(await originalTrainerParty(data,23))[0],target=mon(216,43);legalMove(target,key,key==='MOVE_SLEEP_TALK'?82:undefined);const f=fixture([actor],[target],[3]);assert.equal(monAbility(data,target),'ABILITY_PICKUP');await act(f,false,'MOVE_YAWN');await call(f,'yawnResidual',target);await call(f,'yawnResidual',target);const before=structuredClone(target);await assert.rejects(act(f,true,key),/Unsupported native sleeping action/);assert.deepEqual(target,before);assert.equal(f.draws,1);}
});

test('review regression: Yawn rejects newly sleep-activated unported abilities and a Truant caster before PP',async()=>{
 for(const species of[216,350]){const actor=(await originalTrainerParty(data,23))[0],target=mon(species,30,species===216),f=fixture([actor],[target]),before=structuredClone({actor,target});assert.ok(['ABILITY_QUICK_FEET','ABILITY_MARVEL_SCALE'].includes(monAbility(data,target)));await assert.rejects(act(f,false,'MOVE_YAWN'),/Unsupported native Yawn status ability/);assert.deepEqual({actor,target},before);assert.equal(f.draws,0);}
 const actor=mon(287,7);legalMove(actor,'MOVE_YAWN');const target=mon(152,18),f=fixture([actor],[target]),before=structuredClone({actor,target});assert.equal(monAbility(data,actor),'ABILITY_TRUANT');await assert.rejects(act(f,false,'MOVE_YAWN'),/Unsupported native Yawn Truant/);assert.deepEqual({actor,target},before);assert.equal(f.draws,0);
});

test('review regression: delayed Yawn rechecks an incoming BadDreams provider before sleep mutation or draw',async()=>{
 const actor=(await originalTrainerParty(data,23))[0],darkrai=mon(491,50),target=mon(152,18),f=fixture([actor,darkrai],[target],[0]);await act(f,false,'MOVE_YAWN');await call(f,'sendEnemy',1);await call(f,'yawnResidual',target);assert.equal(Reflect.get(f.battle,'yawnTurns').get(target),1);const before=structuredClone(target);await assert.rejects(call(f,'yawnResidual',target),/Unsupported native Yawn BadDreams/);assert.deepEqual(target,before);assert.equal(f.draws,0);assert.equal(Reflect.get(f.battle,'yawnTurns').get(target),1);
});

test('binding and Yawn reject unhosted Trace/weather entry, and target Intimidate cannot silently change binding damage',async()=>{
 for(const species of[280,382,383,449,460])for(const effect of['MOVE_BIND','MOVE_YAWN']){const actor=(await originalTrainerParty(data,effect==='MOVE_BIND'?384:23))[0],target=mon(species,50,species===280),f=fixture([actor],[target]),before=structuredClone({actor,target});assert.ok(['ABILITY_TRACE','ABILITY_DRIZZLE','ABILITY_DROUGHT','ABILITY_SAND_STREAM','ABILITY_SNOW_WARNING'].includes(monAbility(data,target)));await assert.rejects(act(f,false,effect),/Unsupported native (binding|Yawn) entry ability/);assert.deepEqual({actor,target},before);assert.equal(f.draws,0);}
 const actor=(await originalTrainerParty(data,384))[0],target=mon(130,20),f=fixture([actor],[target]),before=structuredClone({actor,target});assert.equal(monAbility(data,target),'ABILITY_INTIMIDATE');await assert.rejects(act(f,false,'MOVE_BIND'),/Unsupported native binding target Intimidate/);assert.deepEqual({actor,target},before);assert.equal(f.draws,0);
});

test('history regression: native Intimidate Attack context survives its provider leaving before the source Ekans Wrap',async()=>{
 const team=await originalTrainerParty(data,13),lead=mon(95,30),gyarados=mon(130,20),reserve=mon(129,20);legalMove(lead,'MOVE_ROCK_THROW');const f=fixture(team,[lead,gyarados,reserve]),before=structuredClone(f.state.party),wrap=team[1].moves[slot(team[1],'MOVE_WRAP')],pp=wrap.pp;let selections=0;const stop=new Error('old guard missed prior Intimidate');Reflect.set(f.battle,'nextAction',async()=>{selections++;if(selections===1)return{kind:'move',slot:0};if(selections===2)return{kind:'switch',index:1};if(selections===3)return{kind:'switch',index:2};throw stop;});Reflect.set(f.battle,'chooseEnemyMove',()=>slot(f.battle.enemy,f.battle.enemy.species===41?'MOVE_ASTONISH':selections===2?'MOVE_LEER':'MOVE_WRAP'));await assert.rejects(f.battle.start(team,13),/Unsupported native binding prior Intimidate entry/);assert.equal(team[0].hp,0,'Zubat fainted through native RockThrow damage');assert.equal(wrap.pp,pp,'guard runs before the later Wrap PP');assert.ok(f.messages.some(message=>message.includes('fainted')));assert.deepEqual(f.state.party,before);assert.equal(f.battle.active,false);
});

test('history regression: permanent ability weather stays unknown after a native provider switches out before Bind or Yawn',async()=>{
 for(const[species,key,trainer]of[[449,'MOVE_BIND',384],[382,'MOVE_YAWN',23]]as const){const team=await originalTrainerParty(data,trainer),provider=mon(species,50),reserve=mon(152,18),f=fixture(team,[provider,reserve]),pp=team[0].moves[slot(team[0],key)].pp;let selection=0;const stop=new Error('old guard missed permanent ability weather');Reflect.set(f.battle,'nextAction',async()=>{if(selection++)throw stop;return{kind:'switch',index:1};});Reflect.set(f.battle,'chooseEnemyMove',()=>slot(team[0],key));await assert.rejects(f.battle.start(team,trainer),/Unsupported native (binding|Yawn) prior ability weather/);assert.equal(team[0].moves[slot(team[0],key)].pp,pp);assert.ok(f.messages.some(message=>message.includes('Come back')));assert.equal(f.battle.active,false);
 // Start the next native battle with the ordinary lead and the former weather
 // provider only on the bench. A previous aborted battle must not taint it.
 f.state.party.reverse();let turns=0;Reflect.set(f.battle,'nextAction',async()=>{assert.ok(++turns<20);return{kind:'move',slot:slot(f.battle.player,'MOVE_RAZOR_LEAF')};});const plain=await originalTrainerParty(data,23),yawnPP=plain[0].moves[slot(plain[0],'MOVE_YAWN')].pp;Reflect.set(f.battle,'chooseEnemyMove',()=>slot(plain[0],'MOVE_YAWN'));assert.equal(await f.battle.start(plain,23),'won');assert.ok(plain[0].moves[slot(plain[0],'MOVE_YAWN')].pp<yawnPP,'the fresh battle actually exercises Yawn preflight');assert.ok(f.messages.some(message=>message.includes('made CHIKORITA drowsy')));}
});

test('freeze is checked before a Bite flinch and uses its thaw draw before returning without PP',async()=>{
 for(const raw of[0,32769]){const freezer=mon(220,10),biter=(await originalTrainerParty(data,13))[1],target=mon(152,18);legalMove(freezer,'MOVE_POWDER_SNOW');legalMove(target,'MOVE_GROWL');const f=fixture([freezer,biter],[target],[0,32769,32769,0,0,32769,32769,0,raw]);await act(f,false,'MOVE_POWDER_SNOW');assert.equal(target.status,'FRZ');await call(f,'sendEnemy',1);await act(f,false,'MOVE_BITE');assert.equal(Reflect.get(f.battle,'flinch'),true);const pp=target.moves[0].pp;await act(f,true,'MOVE_GROWL');assert.equal(f.draws,9,'four freeze-action draws, four Bite draws and the thaw check');assert.equal(target.moves[0].pp,pp);assert.equal(target.status,raw===0?'':'FRZ');assert.equal(f.messages.some(message=>message.includes('flinched')),raw===0);}
 // These representative tape values agree with both native modulo5 and the
 // older host float mapping; this proves phase order, not all-u16 freeze RNG.
});

test('the native thaw callback treats Normalize as Normal without executing unported Normalize damage or Mimic',async()=>{
 const source=await readFile(new URL('../../../src/battle/battle_controller_player.c',import.meta.url),'utf8'),after=source.slice(source.indexOf('// Check for unfreeze via move')-500,source.indexOf('// Check for unfreeze via move')+1200);assert.match(after,/ABILITY_NORMALIZE[\s\S]*moveType = TYPE_NORMAL/);assert.match(after,/moveType == TYPE_FIRE/);
 for(const normalized of[false,true]){const actor=normalized?mon(301,30,true):mon(4,37),target=mon(152,30),f=fixture([target],[actor]);assert.equal(monAbility(data,actor)==='ABILITY_NORMALIZE',normalized);target.status='FRZ';await call(f,'thawAfterHit',actor,target,data.moves[data.constants.MOVE_EMBER],1);assert.equal(target.status,normalized?'FRZ':'');assert.equal(f.draws,0);}
 // A post-hit C-state boundary only: no fabricated Fire move is put into
 // Delcatty's moves, and no damage/PP/Mimic/Normalize support is claimed.
});

test('an affected actor leaving resets unresolved Attack context, while its provider leaving does not',async()=>{
 const actor=(await originalTrainerParty(data,13))[1],provider=mon(130,20),target=mon(129,20),f=fixture([actor,mon(129)],[provider,target],[0,32769,32769,0]);call(f,'noteNativeEntry',provider,actor);await call(f,'switch',1);const pp=actor.moves[slot(actor,'MOVE_WRAP')].pp;await assert.rejects(act(f,false,'MOVE_WRAP'),/Unsupported native binding prior Intimidate entry/);assert.equal(actor.moves[slot(actor,'MOVE_WRAP')].pp,pp);await call(f,'sendEnemy',1);await call(f,'sendEnemy',0);await act(f,false,'MOVE_WRAP');assert.equal(actor.moves[slot(actor,'MOVE_WRAP')].pp,pp-1);assert.equal(f.draws,4);assert.ok(count(f,target)>0);
});
