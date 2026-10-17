import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Battle} from './battle.ts';
import {createMon,loadData,newState} from './data.ts';
import {fieldBattleWeather,freshStages,moveDamage,multiHitCount,typeEffectiveness,weatherHPRecovery} from './battle-math.ts';
import {originalTrainerParty} from './trainers.ts';
import type {BattleView} from './battle-view.ts';
import type {Mon} from './types.ts';
import type {UI} from './ui.ts';
globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData();
function sequence(values:number[]){let calls=0;return{rng:()=>{assert.ok(calls<values.length,'unexpected gameplay RNG draw');return values[calls++];},get calls(){return calls;}};}
function moves(mon:Mon,...keys:string[]){mon.moves=keys.map(key=>{const id=data.constants[key],pp=data.moves[id].pp;return{id,pp,maxPP:pp};});}
function harness(playerSpecies=21,enemySpecies=19,rng:()=>number=()=>.5){
  const elements=new Map<string,{innerHTML:string;hidden:boolean;onclick?:()=>void}>();globalThis.document={getElementById(id:string){if(!elements.has(id))elements.set(id,{innerHTML:'',hidden:true});return elements.get(id);},querySelector(){return null;}}as unknown as Document;
  const state=newState(data,'Ethan','boy'),player=createMon(data,playerSpecies,20,state.name,()=>.5),enemy=createMon(data,enemySpecies,20,'Opponent',()=>.5);state.party=[player];for(const mon of[player,enemy]){mon.hp=mon.maxHP=200;mon.stats={atk:50,def:50,spatk:50,spdef:50,speed:50};}moves(player,'MOVE_TACKLE');moves(enemy,'MOVE_TACKLE');
  const calls:string[]=[],messages:string[]=[],view:BattleView={location:'Johto',begin:async()=>{calls.push('begin');},sync:()=>{calls.push('sync');},attack:async()=>{calls.push('attack');},hit:async()=>{calls.push('hit');},capture:async()=>{},orbit:()=>{},end:()=>{calls.push('end');}};
  const battle=new Battle(data,state,{choose:async()=>0}as unknown as UI,rng,view);Reflect.set(battle,'enemies',[enemy]);Reflect.set(battle,'say',async(text:string)=>{messages.push(text);});return{battle,state,player,enemy,calls,messages};
}
type Harness=ReturnType<typeof harness>;
async function attack(h:Harness,playerSide=true,slot=0){await Reflect.get(h.battle,'attack').call(h.battle,playerSide,slot);}
function stages(h:Harness,playerSide=true){return Reflect.get(h.battle,playerSide?'playerStages':'enemyStages')as ReturnType<typeof freshStages>;}
async function oneAction(h:Harness,action:{kind:'move';slot:number}|{kind:'item';item:string}|{kind:'switch';index:number}|{kind:'run'},enemySlot=0){const stop=new Error('unit turn boundary');let selections=0;Reflect.set(h.battle,'active',true);Reflect.set(h.battle,'chooseEnemyMove',()=>enemySlot);Reflect.set(h.battle,'nextAction',async()=>{if(selections++)throw stop;return action;});await assert.rejects(Reflect.get(h.battle,'loop').call(h.battle),(error:unknown)=>error===stop);}
async function oneTurn(h:Harness,playerSlot=0,enemySlot=0){await oneAction(h,{kind:'move',slot:playerSlot},enemySlot);}
async function rageVolatiles(playerSide=true){
  // All legal native GenIV moves: Dunsparce learns Rage/DefenseCurl/Glare,
  // accepts TM32 DoubleTeam, and Sentret learns Foresight at level1.
  const h=harness(playerSide?206:161,playerSide?161:206,()=>.9),rager=playerSide?h.player:h.enemy,foe=playerSide?h.enemy:h.player;
  assert.ok(data.personal[206].tms.includes(32));for(const key of['MOVE_RAGE','MOVE_DEFENSE_CURL','MOVE_GLARE'])assert.ok(data.learnsets[206].some(m=>m.move===data.constants[key]&&m.level<=20));assert.ok(data.learnsets[161].some(m=>m.move===data.constants.MOVE_FORESIGHT&&m.level===1));
  moves(rager,'MOVE_RAGE','MOVE_DOUBLE_TEAM','MOVE_DEFENSE_CURL','MOVE_GLARE');moves(foe,'MOVE_FORESIGHT','MOVE_TACKLE');await attack(h,playerSide,1);await attack(h,playerSide,2);await oneTurn(h,0,0);rager.hp=foe.hp=200;rager.stats.speed=1;foe.stats.speed=100;return{h,rager,foe};
}

test('native multi-hit sampling has GenIV probabilities and SkillLink consumes no count draw',()=>{
  const counts=[0,0,0,0,0,0];for(let first=0;first<4;first++)for(let second=0;second<4;second++){const draws=sequence([(first+.1)/4,(second+.1)/4]);counts[multiHitCount(draws.rng)]++;assert.equal(draws.calls,first<2?1:2);}assert.deepEqual(counts.slice(2),[6,6,2,2]);assert.equal(multiHitCount(()=>{throw Error('SkillLink must not roll hit count');},true),5);
});
test('FuryAttack spends one PP and accuracy check, recalculating critical damage per hit',async()=>{
  const draws=sequence([0,.75,.5,0,0,.5,.9999,.5,0,.5,0]),h=harness(21,19,draws.rng);moves(h.player,'MOVE_FURY_ATTACK');const pp=h.player.moves[0].pp;
  await attack(h);assert.equal(h.enemy.hp,169,'native base5: critical85%=12, ordinary100%=7,85%=6+6');assert.equal(h.player.moves[0].pp,pp-1);assert.equal(draws.calls,11);assert.equal(h.calls.filter(x=>x==='attack').length,4);assert.equal(h.calls.filter(x=>x==='hit').length,4);assert.equal(h.messages.filter(x=>x.includes('used Fury Attack')).length,1);assert.equal(h.messages.filter(x=>x==='A critical hit!').length,1);assert.ok(h.messages.includes('Hit 4 times!'));
});
test('missed FuryAttack rolls no count or damage, and fainting stops remaining hits',async()=>{
  const missed=sequence([.99]),h=harness(21,19,missed.rng);moves(h.player,'MOVE_FURY_ATTACK');const pp=h.player.moves[0].pp;await attack(h);assert.equal(h.enemy.hp,200);assert.equal(h.player.moves[0].pp,pp-1);assert.equal(missed.calls,1);assert.equal(h.calls.filter(x=>x==='hit').length,0);
  const draws=sequence([0,.75,.99,.5,0]),ko=harness(21,19,draws.rng);moves(ko.player,'MOVE_FURY_ATTACK');ko.enemy.hp=1;await attack(ko);assert.equal(ko.enemy.hp,0);assert.equal(draws.calls,5);assert.equal(ko.calls.filter(x=>x==='hit').length,1);assert.ok(ko.messages.includes('Hit 1 time!'));
});
test('SkillLink makes five hits; Ghost immunity stops without a hit-count message',async()=>{
  const skill=harness(91);skill.player.personality=1;moves(skill.player,'MOVE_FURY_ATTACK');await attack(skill);assert.equal(skill.calls.filter(x=>x==='hit').length,5);assert.ok(skill.messages.includes('Hit 5 times!'));
  const immune=harness(21,92);moves(immune.player,'MOVE_FURY_ATTACK');await attack(immune);assert.equal(immune.enemy.hp,200);assert.equal(immune.calls.filter(x=>x==='hit').length,0);assert.ok(!immune.messages.some(x=>/^Hit \d/.test(x)));
});
test('native fixed-two DoubleKick rolls accuracy once and critical damage independently per hit',async()=>{
  const draws=sequence([0,0,0,.5,.9999]),h=harness(29,19,draws.rng);moves(h.player,'MOVE_DOUBLE_KICK');const pp=h.player.moves[0].pp;
  await attack(h);assert.equal(h.enemy.hp,158,'base8: critical85% against Normal=26, ordinary100%=16');assert.equal(h.player.moves[0].pp,pp-1);assert.equal(draws.calls,5,'no random hit-count draw');assert.equal(h.calls.filter(x=>x==='attack').length,2);assert.equal(h.calls.filter(x=>x==='hit').length,2);assert.equal(h.messages.filter(x=>x==='A critical hit!').length,1);assert.ok(h.messages.includes('Hit 2 times!'));
  const koDraws=sequence([0,.5,0]),ko=harness(29,19,koDraws.rng);moves(ko.player,'MOVE_DOUBLE_KICK');ko.enemy.hp=1;await attack(ko);assert.equal(ko.enemy.hp,0);assert.equal(koDraws.calls,3,'fainting skips the second critical/damage rolls');assert.equal(ko.calls.filter(x=>x==='attack').length,1);assert.ok(ko.messages.includes('Hit 1 time!'));
});
test('DoubleKick builds surviving Rage once for each native hit',async()=>{
  const h=harness(158,29);moves(h.player,'MOVE_RAGE');moves(h.enemy,'MOVE_DOUBLE_KICK');await attack(h);h.player.hp=200;await attack(h,false);assert.equal(stages(h).atk,2);assert.equal(h.messages.filter(x=>x.includes('rage is building')).length,2);assert.ok(h.messages.includes('Hit 2 times!'));stages(h).atk=5;await attack(h,false);assert.equal(stages(h).atk,6,'the two hits still respect the native stat cap');
});
test('Roost heals half rounded down and suppresses only Flying matchups without changing species',async()=>{
  const h=harness(17);moves(h.player,'MOVE_ROOST');h.player.maxHP=41;h.player.hp=10;const types=[...data.personal[17].types];await attack(h);assert.equal(h.player.hp,30);assert.ok(Reflect.get(h.battle,'roosting').has(h.player));assert.equal(typeEffectiveness(data,data.constants.TYPE_GROUND,17),0);assert.equal(typeEffectiveness(data,data.constants.TYPE_GROUND,17,false,true),1);assert.equal(typeEffectiveness(data,data.constants.TYPE_FIGHTING,17,false,true),2);assert.equal(typeEffectiveness(data,data.constants.TYPE_GROUND,146,false,true),2);assert.deepEqual(data.personal[17].types,types);
});
test('faster Roost changes the later Ground hit, while slower or failed Roost does not',async()=>{
  for(const mode of['fast','slow','full']as const){const h=harness(74,17);moves(h.player,'MOVE_MUD_SLAP');moves(h.enemy,'MOVE_ROOST');h.enemy.maxHP=41;h.enemy.hp=mode==='full'?41:20;h.player.stats.speed=mode==='slow'?100:1;h.enemy.stats.speed=mode==='slow'?1:100;await oneTurn(h);assert.equal(Reflect.get(h.battle,'roosting').size,0,'typing restores next turn');if(mode==='fast')assert.ok(h.enemy.hp<40);else assert.equal(h.enemy.hp,mode==='full'?41:40);assert.equal(typeEffectiveness(data,data.constants.TYPE_GROUND,17),0);}
});
test('full-HP recovery spends PP without an attack animation or temporary typing',async()=>{
  for(const move of['MOVE_ROOST','MOVE_SYNTHESIS','MOVE_RECOVER']){const h=harness(17);moves(h.player,move);Reflect.set(h.battle,'weather','sun');const pp=h.player.moves[0].pp;await attack(h);assert.equal(h.player.hp,200);assert.equal(h.player.moves[0].pp,pp-1);assert.ok(!Reflect.get(h.battle,'roosting').has(h.player));assert.equal(h.calls.filter(x=>x==='attack').length,0);assert.ok(h.messages.includes(`${h.player.name}’s HP is full!`));}
});
test('Synthesis uses native battle weather and integer recovery, not daylight or diamond dust',async()=>{
  assert.deepEqual([0,1,2,3,4,5,6,7,8,9,10,11,13,1001].map(fieldBattleWeather),['clear','rain','rain','rain','hail','hail','hail','sandstorm','clear','fog','fog','clear','clear','sun']);
  for(const[id,amount]of[[0,20],[1001,27],[1,10],[4,10],[7,10],[9,10],[8,20]]){const h=harness(152);moves(h.player,'MOVE_SYNTHESIS');h.player.maxHP=41;h.player.hp=1;Reflect.set(h.battle,'weather',fieldBattleWeather(id));await attack(h);assert.equal(h.player.hp,1+amount,`weather${id}`);}
  assert.equal(weatherHPRecovery(1,'sun'),1);assert.equal(weatherHPRecovery(1,'rain'),1);assert.equal(weatherHPRecovery(1,'clear'),0);
});
test('living CloudNine/AirLock suppress Synthesis weather, while fainted suppressors do not',async()=>{
  for(const[species,pid,hp,expected]of[[55,1,200,21],[384,0,200,21],[55,1,0,28]]){const h=harness(152,species);h.enemy.personality=pid;h.enemy.hp=hp;moves(h.player,'MOVE_SYNTHESIS');h.player.maxHP=41;h.player.hp=1;Reflect.set(h.battle,'weather','sun');await attack(h);assert.equal(h.player.hp,expected);}
});
test('Battle.start captures weather before asynchronous presentation begins',async()=>{
  const h=harness(152);moves(h.player,'MOVE_SYNTHESIS');h.player.hp=5;h.player.maxHP=41;const options={weather:1001};Reflect.set(h.battle.view!,'begin',async()=>{options.weather=1;});Reflect.set(h.battle,'loop',async()=>{await attack(h);Reflect.get(h.battle,'finish').call(h.battle,'ran');});assert.equal(await h.battle.start([h.enemy],null,options),'ran');assert.equal(h.player.hp,32);
});
test('Gust deals ordinary damage and its source Fly modifier doubles power before calculation',async()=>{
  const h=harness(17,19);moves(h.player,'MOVE_GUST');await attack(h);assert.ok(h.enemy.hp<200);assert.ok(h.messages.some(x=>x.includes('used Gust')));
  const move=data.moves[data.constants.MOVE_GUST],a=freshStages(),b=freshStages(),ordinary=moveDamage(data,h.player,h.enemy,move,a,b,100),airborne=moveDamage(data,h.player,h.enemy,move,a,b,100,false,false,{flying:true}),doublePower=moveDamage(data,h.player,h.enemy,{...move,power:move.power*2,effect:0},a,b,100);assert.deepEqual(airborne,doublePower);assert.ok(airborne.damage>ordinary.damage);
});
test('Rage activates on successful hits and builds Attack per surviving damaging hit',async()=>{
  const h=harness(158,21);moves(h.player,'MOVE_RAGE');moves(h.enemy,'MOVE_FURY_ATTACK');await attack(h);assert.ok(Reflect.get(h.battle,'raging').has(h.player));await attack(h,false);assert.equal(stages(h).atk,4);assert.equal(h.messages.filter(x=>x.includes('rage is building')).length,4);
  moves(h.enemy,'MOVE_GROWL');await attack(h,false);assert.equal(stages(h).atk,3);stages(h).atk=6;moves(h.enemy,'MOVE_TACKLE');await attack(h,false);assert.equal(stages(h).atk,6);
  const missed=harness(158,19,()=>.999);moves(missed.player,'MOVE_RAGE');stages(missed).accuracy=-1;await attack(missed);assert.ok(!Reflect.get(missed.battle,'raging').has(missed.player));const immune=harness(158,92);moves(immune.player,'MOVE_RAGE');await attack(immune);assert.ok(!Reflect.get(immune.battle,'raging').has(immune.player));
});
test('Rage survives selection and a faster foe, then clears after another move executes',async()=>{
  for(const playerSide of[true,false])for(const repeat of[false,true]){const h=harness(158,19),rager=playerSide?h.player:h.enemy,foe=playerSide?h.enemy:h.player;moves(rager,'MOVE_RAGE','MOVE_TACKLE');await attack(h,playerSide);h.player.hp=h.enemy.hp=200;stages(h,playerSide).atk=0;rager.stats.speed=1;foe.stats.speed=100;await oneTurn(h,playerSide?(repeat?0:1):0,playerSide?0:(repeat?0:1));assert.equal(stages(h,playerSide).atk,1);assert.equal(Reflect.get(h.battle,'raging').has(rager),repeat);}
});
test('Rage persists through successful item use and failed escape, and rejected menu choices',async()=>{
  for(const mode of['potion','escape','no-effect-item','trainer-run']as const){const h=harness(158,19);moves(h.player,'MOVE_RAGE');await attack(h);h.player.hp=mode==='no-effect-item'?200:100;h.player.stats.speed=1;h.enemy.stats.speed=1000;h.state.bag.ITEM_POTION=1;if(mode==='trainer-run')Reflect.set(h.battle,'trainer',20);const before=h.player.hp;await oneAction(h,mode==='potion'||mode==='no-effect-item'?{kind:'item',item:'ITEM_POTION'}:{kind:'run'});assert.ok(Reflect.get(h.battle,'raging').has(h.player),mode);assert.equal(stages(h).atk,mode==='potion'||mode==='escape'?1:0,mode);if(mode==='potion')assert.equal(h.state.bag.ITEM_POTION,undefined);if(mode==='no-effect-item'||mode==='trainer-run')assert.equal(h.player.hp,before);}
});
test('Rage survives inability to act, but a missed or failed different move clears it',async()=>{
  for(const mode of['sleep','paralysis','flinch','miss','failed-recovery']as const){let blocked=false;const h=harness(158,19,()=>blocked?mode==='miss'?.999:0:.5);moves(h.player,'MOVE_RAGE','MOVE_TACKLE','MOVE_ROOST');await attack(h);blocked=true;const pp=h.player.moves[mode==='failed-recovery'?2:1].pp;if(mode==='sleep'){h.player.status='SLP';h.player.sleepTurns=2;}if(mode==='paralysis')h.player.status='PAR';if(mode==='flinch')Reflect.set(h.battle,'flinch',true);if(mode==='miss')stages(h).accuracy=-1;await attack(h,true,mode==='failed-recovery'?2:1);const cannotAct=['sleep','paralysis','flinch'].includes(mode);assert.equal(Reflect.get(h.battle,'raging').has(h.player),cannotAct,mode);assert.equal(h.player.moves[mode==='failed-recovery'?2:1].pp,pp-(cannotAct?0:1));}
});
test('native Rage before-turn masking clears Foresight and DefenseCurl before either side attacks',async()=>{
  for(const playerSide of[true,false])for(const repeat of[false,true]){
    const{h,rager}=await rageVolatiles(playerSide);let checked=false;const say=Reflect.get(h.battle,'say');Reflect.set(h.battle,'say',async(text:string)=>{if(text.includes('SENTRET used Tackle')){checked=true;assert.ok(Reflect.get(h.battle,'raging').has(rager),'Rage survives until another move executes');assert.equal(Reflect.get(h.battle,'identified').has(rager),repeat);assert.equal(Reflect.get(h.battle,'curled').has(rager),repeat);}await say(text);});
    await oneTurn(h,playerSide?(repeat?0:3):1,playerSide?1:(repeat?0:3));assert.ok(checked);assert.equal(stages(h,playerSide).atk,repeat?1:0);assert.equal(Reflect.get(h.battle,'raging').has(rager),repeat);assert.equal(Reflect.get(h.battle,'identified').has(rager),repeat);assert.equal(Reflect.get(h.battle,'curled').has(rager),repeat);assert.equal(stages(h,playerSide).def,1,'masking the curl flag preserves its Defense boost');assert.equal(stages(h,playerSide).evasion,1);
    // Native Tackle accuracy95 *75/100 truncates to71; the port's older
    // fractional threshold is71.25. Roll90 misses under either calculation.
    if(repeat)assert.ok(rager.hp<200);else assert.equal(rager.hp,200);
  }
});
test('Rage masks other status2 flags on selection even when the chosen move cannot act',async()=>{
  for(const playerSide of[true,false]){const{h,rager}=await rageVolatiles(playerSide);rager.status='SLP';rager.sleepTurns=2;const pp=rager.moves[3].pp;await oneTurn(h,playerSide?3:1,playerSide?1:3);assert.ok(Reflect.get(h.battle,'raging').has(rager));assert.ok(!Reflect.get(h.battle,'identified').has(rager));assert.ok(!Reflect.get(h.battle,'curled').has(rager));assert.equal(rager.moves[3].pp,pp);assert.equal(rager.hp,200);}
});
test('accepted non-Fight actions mask Rage volatiles; rejected menu choices preserve them',async()=>{
  for(const mode of['potion','escape','no-effect-item','trainer-run','switch']as const){const{h,rager}=await rageVolatiles();h.state.bag.ITEM_POTION=1;if(mode==='potion')rager.hp=100;if(mode==='escape')h.enemy.stats.speed=1000;if(mode==='trainer-run')Reflect.set(h.battle,'trainer',20);if(mode==='switch')h.state.party.push(createMon(data,152,20,'Ethan',()=>.5));const rejected=mode==='no-effect-item'||mode==='trainer-run';await oneAction(h,mode==='potion'||mode==='no-effect-item'?{kind:'item',item:'ITEM_POTION'}:mode==='switch'?{kind:'switch',index:1}:{kind:'run'},1);assert.equal(Reflect.get(h.battle,'identified').has(rager),rejected,mode);assert.equal(Reflect.get(h.battle,'curled').has(rager),rejected,mode);assert.equal(Reflect.get(h.battle,'raging').has(rager),mode!=='switch',mode);if(mode==='potion')assert.equal(rager.hp,120);if(mode==='escape')assert.equal(rager.hp,200);}
});
test('native no-PP selection retains the last Rage slot until Struggle actually executes',async()=>{
  for(const playerSide of[true,false]){const{h,rager}=await rageVolatiles(playerSide);for(const move of rager.moves)move.pp=0;let checked=false;const say=Reflect.get(h.battle,'say');Reflect.set(h.battle,'say',async(text:string)=>{if(text.includes('SENTRET used Tackle')){checked=true;assert.ok(Reflect.get(h.battle,'identified').has(rager));assert.ok(Reflect.get(h.battle,'curled').has(rager));assert.ok(Reflect.get(h.battle,'raging').has(rager));}await say(text);});await oneTurn(h,playerSide?-1:1,playerSide?1:-1);assert.ok(checked);assert.equal(stages(h,playerSide).atk,1);assert.ok(!Reflect.get(h.battle,'raging').has(rager));assert.ok(Reflect.get(h.battle,'identified').has(rager));assert.ok(Reflect.get(h.battle,'curled').has(rager));assert.ok(rager.moves.every(m=>m.pp===0));}
});
test('switching and battle completion clear Rage/Roost without storing them on Pokémon',async()=>{
  const h=harness(158);moves(h.player,'MOVE_RAGE');await attack(h);Reflect.get(h.battle,'roosting').add(h.player);const old=h.player;h.state.party.push(createMon(data,152,10,'Ethan',()=>.5));await Reflect.get(h.battle,'switch').call(h.battle,1);assert.ok(!Reflect.get(h.battle,'raging').has(old));assert.ok(!Reflect.get(h.battle,'roosting').has(old));Reflect.get(h.battle,'raging').add(h.battle.player);Reflect.get(h.battle,'roosting').add(h.battle.player);Reflect.get(h.battle,'finish').call(h.battle,'ran');assert.equal(Reflect.get(h.battle,'raging').size,0);assert.equal(Reflect.get(h.battle,'roosting').size,0);assert.ok(!('roosting'in old)&&!('raging'in old));
});
test('actual Abe/Falkner moves execute, and starter level-ups learn usable Rage/Synthesis',async()=>{
  for(const[id,species,move]of[[50,21,'MOVE_FURY_ATTACK'],[20,17,'MOVE_ROOST'],[20,17,'MOVE_GUST']]as const){const team=await originalTrainerParty(data,id),mon=team.find(m=>m.species===species)!,slot=mon.moves.findIndex(m=>m.id===data.constants[move]);assert.ok(slot>=0);const h=harness();mon.hp=Math.max(1,mon.maxHP-1);Reflect.set(h.battle,'enemies',[mon]);await attack(h,false,slot);assert.ok(h.messages.some(x=>x.includes('used ')));}
  for(const[species,fromLevel,toLevel,learned]of[[158,7,8,'MOVE_RAGE'],[152,11,12,'MOVE_SYNTHESIS']]as const){const h=harness(species),learner=createMon(data,species,fromLevel,'Ethan',()=>.5);learner.exp=data.growth[data.personal[species].growthRate][toLevel]-1;h.state.party=[learner];h.enemy.hp=0;await Reflect.get(h.battle,'gainExperience').call(h.battle);assert.ok(learner.level>=toLevel);const slot=learner.moves.findIndex(m=>m.id===data.constants[learned]);assert.ok(slot>=0);learner.hp=Math.max(1,learner.maxHP-1);h.enemy.hp=200;await attack(h,true,slot);}
});
