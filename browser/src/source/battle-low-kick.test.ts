import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Battle} from './battle.ts';
import {createMon,loadData,newState} from './data.ts';
import {originalTrainerParty} from './trainers.ts';
import {freshStages,monAbility,moveBaseDamage} from './battle-math.ts';
import {nativeBattleWeight,nativeWeightBasedPower,UnsupportedBattleWeight} from './battle-weight.ts';
import type {Mon} from './types.ts';
import type {UI} from './ui.ts';
import type {BattleView} from './battle-view.ts';
globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData(),noncrit=32769/65536;
const mon=(species:number,level=18,odd=false)=>createMon(data,species,level,'Ethan',()=>odd?0x80010001/0x100000000:noncrit);
const slot=(subject:Mon,key:string)=>{const index=subject.moves.findIndex(move=>move.id===data.constants[key]);assert.ok(index>=0,`${subject.name} must know ${key}`);return index;};
function legalMove(subject:Mon,key:string){const move=data.moves[data.constants[key]];assert.ok(data.learnsets[subject.species].some(row=>row.move===move.id&&row.level<=subject.level));subject.moves=[{id:move.id,pp:move.pp,maxPP:move.pp}];}
function fixture(enemies:Mon[],party:Mon[]=[mon(152)],values?:number[]){
 const elements=new Map<string,{innerHTML:string;hidden:boolean}>();globalThis.document={getElementById(id:string){if(!elements.has(id))elements.set(id,{innerHTML:'',hidden:true});return elements.get(id);},querySelector(){return null;}}as unknown as Document;
 const state=newState(data,'Ethan','boy',()=>noncrit);state.party=party;const messages:string[]=[],events:string[]=[];let draws=0;
 const view={begin:async()=>{events.push('begin');},sync(){},attack:async(side:boolean)=>events.push(`attack:${side}`),hit:async(side:boolean)=>events.push(`hit:${side}`),end:()=>events.push('end')}as unknown as BattleView;
 const battle=new Battle(data,state,{choose:async()=>4}as unknown as UI,()=>{if(values)assert.ok(draws<values.length,'unexpected gameplay draw');return values?values[draws++]/65536:(draws++,noncrit);},view);Reflect.set(battle,'enemies',enemies);Reflect.set(battle,'trainer',61);Reflect.set(battle,'experienceMask',1);Reflect.set(battle,'say',async(text:string)=>messages.push(text));Reflect.set(battle,'draw',()=>{});
 for(const active of[party[0],enemies[0]])Reflect.get(battle,'initializeWeight').call(battle,active);
 return{battle,state,messages,events,get draws(){return draws;}};
}
type Fixture=ReturnType<typeof fixture>;
const call=(f:Fixture,key:string,...args:unknown[])=>Reflect.get(f.battle,key).apply(f.battle,args);
const act=(f:Fixture,side:boolean,key:string)=>call(f,'attack',side,slot(side?f.battle.player:f.battle.enemy,key));
function physical(attacker:Mon,target:Mon,power:number,stab=true,factor=1){const base=Math.floor(Math.floor((Math.floor(attacker.level*2/5)+2)*power*attacker.stats.atk/target.stats.def)/50)+2;let damage=Math.floor(base*93/100);if(stab)damage=Math.floor(damage*15/10);return Math.max(1,Math.floor(damage*factor));}

test('native LowKick command reads live target weight before crit/damage; rain does not modify Fighting power',async()=>{
 const effect=await readFile(new URL('../../../files/battledata/script/effect_script/effect_script_0196.s',import.meta.url),'utf8');assert.match(effect,/CalcWeightBasedPower\s+CalcCrit\s+CalcDamage/);
 const native=await readFile(new URL('../../../src/battle/battle_command.c',import.meta.url),'utf8');assert.match(native,/int weight = ctx->battleMons\[ctx->battlerIdTarget\]\.weight/);
 const headers=await readFile(new URL('../../../src/data/map_headers.h',import.meta.url),'utf8'),route=headers.split('[MAP_ROUTE_33] = {')[1].split('},')[0];assert.match(route,/\.weather = 1,/);
 const util=await readFile(new URL('../../../src/battle/battle_util.c',import.meta.url),'utf8'),rain=util.slice(util.indexOf('if (fieldCondition & FIELD_CONDITION_RAIN_ALL)'),util.indexOf('if ((fieldCondition & FIELD_CONDITION_WEATHER_NO_SUN)'));assert.match(rain,/case TYPE_FIRE:/);assert.match(rain,/case TYPE_WATER:/);assert.doesNotMatch(rain,/TYPE_FIGHTING/);
});

test('actual Anthony Machop11 LowKick uses inclusive Magikarp100→20 and Seadra250→40, with one PP and per-hit draws',async()=>{
 const team=await originalTrainerParty(data,61),attacker=team[1];assert.equal(attacker.species,66);assert.equal(attacker.level,11);assert.equal(monAbility(data,attacker),'ABILITY_NO_GUARD');
 for(const[species,weight,power,factor]of[[129,100,20,1],[117,250,40,1],[357,1000,80,.5]]as const){const target=mon(species,20,species===117);const f=fixture([structuredClone(attacker)],[target]),active=f.battle.enemy,index=slot(active,'MOVE_LOW_KICK'),pp=active.moves[index].pp,hp=target.hp;assert.equal(call(f,'targetWeight',target),weight);await act(f,false,'MOVE_LOW_KICK');assert.equal(hp-target.hp,physical(active,target,power,true,factor));assert.equal(active.moves[index].pp,pp-1);assert.equal(f.draws,3,'accuracy, critical and range draws remain distinct');assert.ok(f.events.includes('hit:true'));}
});

test('native NoGuard clears a drawn miss in either direction, including a MoldBreaker attacker; ordinary control still misses',async()=>{
 const source=await readFile(new URL('../../../src/battle/battle_controller_player.c',import.meta.url),'utf8'),hit=source.slice(source.indexOf('static BOOL BattleSystem_CheckMoveHit(BattleSystem *battleSystem, BattleContext *ctx, int battlerIdAttacker, int battlerIdTarget, int move) {'),source.indexOf('static BOOL BattleControllerPlayer_CheckMagicCoat(BattleSystem *battleSystem, BattleContext *ctx) {'));assert.ok(hit.indexOf('BattleSystem_Random(battleSystem) % 100')<hit.indexOf('GetBattlerAbility(ctx, battlerIdAttacker) == ABILITY_NO_GUARD'));assert.match(hit,/GetBattlerAbility\(ctx, battlerIdTarget\) == ABILITY_NO_GUARD/);assert.match(hit,/moveStatusFlag &= ~MOVE_STATUS_MISSED/);
 const native=(await originalTrainerParty(data,61))[1];for(const noGuard of[true,false]){const attacker=noGuard?structuredClone(native):mon(66,11),target=mon(129,20);assert.equal(monAbility(data,attacker),noGuard?'ABILITY_NO_GUARD':'ABILITY_GUTS');const f=fixture([attacker],[target],noGuard?[65535,32769,32769]:[65535]);Reflect.get(f.battle,'enemyStages').accuracy=-6;const hp=target.hp;await act(f,false,'MOVE_LOW_KICK');assert.equal(target.hp<hp,noGuard);assert.equal(f.draws,noGuard?3:1);}
 const pinsir=mon(127,18,true),machop=structuredClone(native);assert.equal(monAbility(data,pinsir),'ABILITY_MOLD_BREAKER');legalMove(pinsir,'MOVE_VICE_GRIP');const f=fixture([machop],[pinsir],[65535,32769,32769]);Reflect.get(f.battle,'playerStages').accuracy=-6;const hp=machop.hp;await act(f,true,'MOVE_VICE_GRIP');assert.ok(machop.hp<hp);assert.equal(f.draws,3);
});

test('initialized live weight is retained until leaving; ordinary player/enemy reentry captures fresh weight and end clears it',async()=>{
 const target=mon(129),reserve=mon(117),team=await originalTrainerParty(data,61),f=fixture(team,[target,reserve]);assert.equal(call(f,'targetWeight',target),100);assert.equal(call(f,'targetWeight',team[0]),200);
 // A literal live-state persistence probe, not implemented Transform/form support.
 target.form=1;assert.equal(call(f,'targetWeight',target),100);await call(f,'switch',1);assert.throws(()=>call(f,'targetWeight',target),/Missing initialized/);assert.equal(call(f,'targetWeight',reserve),250);target.form=0;await call(f,'switch',0);assert.equal(call(f,'targetWeight',target),100);await call(f,'sendEnemy',1);assert.equal(call(f,'targetWeight',team[1]),195);assert.throws(()=>call(f,'targetWeight',team[0]),/Missing initialized/);const saved=structuredClone(f.state.party);call(f,'clearBattleVolatiles');assert.equal(Reflect.get(f.battle,'liveWeights').size,0);assert.deepEqual(f.state.party,saved);
});

test('LowKick requires initialized live weight and refuses unsupported initial forms/data before PP/HP mutation',async()=>{
 for(const mode of['missing','form','data']as const){const attacker=(await originalTrainerParty(data,61))[1],target=mon(129),f=fixture([attacker],[target]);if(mode==='missing')Reflect.get(f.battle,'liveWeights').delete(target);if(mode==='form'){target.form=1;call(f,'initializeWeight',target);}if(mode==='data'){Reflect.set(f.battle,'data',{...data,nativeWeights:undefined});call(f,'initializeWeight',target);}const before=structuredClone({attacker,target});await assert.rejects(act(f,false,'MOVE_LOW_KICK'),UnsupportedBattleWeight);assert.deepEqual({attacker,target},before);assert.equal(f.draws,0);}
 const move=data.moves[data.constants.MOVE_LOW_KICK];assert.throws(()=>moveBaseDamage(data,mon(66),mon(129),move,freshStages(),freshStages()),/initialized positive/);
});

test('dynamic LowKick power precedes Technician and uses the initial BattleMon bank deliberately',()=>{
 const actor=mon(235,30,true),target=mon(129,30);assert.equal(monAbility(data,actor),'ABILITY_TECHNICIAN');const move=data.moves[data.constants.MOVE_LOW_KICK],base=(power:number)=>Math.floor(Math.floor((Math.floor(actor.level*2/5)+2)*power*actor.stats.atk/target.stats.def)/50)+2;
 // Smeargle can legally Sketch LowKick; this is a pure native damage fixture,
 // not a claim that the unported Sketch action is now supported by Battle.
 assert.equal(moveBaseDamage(data,actor,target,move,freshStages(),freshStages(),false,{targetWeight:100}),base(30));assert.equal(moveBaseDamage(data,actor,target,move,freshStages(),freshStages(),false,{targetWeight:501}),base(80));
 const gira=mon(487);gira.form=0;const f=fixture([gira]);assert.equal(call(f,'targetWeight',gira),7500);assert.equal(nativeBattleWeight(data,487,0),7500);assert.equal(nativeWeightBasedPower(call(f,'targetWeight',gira)),120);
});

test('actual Anthony party resolves through legal actions in Route33 rain, including its native NoGuard LowKick',async()=>{
 const team=await originalTrainerParty(data,61),player=mon(152),f=fixture(team,[player]);let selections=0;Reflect.set(f.battle,'nextAction',async()=>{assert.ok(++selections<20);return{kind:'move',slot:slot(f.battle.player,'MOVE_RAZOR_LEAF')};});Reflect.set(f.battle,'chooseEnemyMove',()=>slot(f.battle.enemy,f.battle.enemy.species===74?'MOVE_ROCK_THROW':'MOVE_LOW_KICK'));const result=await f.battle.start(team,61,{weather:1});assert.equal(result,'won');assert.ok(team.every(subject=>subject.hp===0));assert.ok(f.messages.some(text=>text.includes('used Low Kick')));assert.equal(Reflect.get(f.battle,'liveWeights').size,0);assert.ok(f.events.includes('begin')&&f.events.includes('end'));
});

test('LowKick guards relevant rain hooks, on-hit abilities, Pressure and unresolved entry callbacks before PP/HP',async()=>{
 for(const[species,weather]of[[116,'rain'],[270,'rain'],[29,'clear'],[243,'clear'],[130,'clear']]as const){const attacker=(await originalTrainerParty(data,61))[1],target=mon(species,20);const f=fixture([attacker],[target]);Reflect.set(f.battle,'weather',weather);const before=structuredClone({attacker,target});await assert.rejects(act(f,false,'MOVE_LOW_KICK'),/Unsupported native LowKick/);assert.deepEqual({attacker,target},before);assert.equal(f.draws,0);}
});

test('actual Anthony NoGuard LowKick retains the supported native Static contact phase after damage',async()=>{
 const attacker=(await originalTrainerParty(data,61))[1],target=mon(179,20),f=fixture([attacker],[target],[65535,32769,32769,0]);assert.equal(monAbility(data,target),'ABILITY_STATIC');Reflect.get(f.battle,'enemyStages').accuracy=-6;const hp=target.hp;await act(f,false,'MOVE_LOW_KICK');assert.ok(target.hp<hp);assert.equal(attacker.status,'PAR');assert.equal(f.draws,4,'ordinary accuracy, critical, damage range and contact ability coin');assert.ok(f.messages.some(message=>message.includes('Static paralyzed')));
});
