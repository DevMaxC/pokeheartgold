import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Battle} from './battle.ts';
import {loadData,newState,createMon,calculateStats} from './data.ts';
import {giveTogepiEgg} from './eggs.ts';
import {freshStages} from './battle-math.ts';
import {sourceJSON,type Mon} from './types.ts';
import type {UI} from './ui.ts';
globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData(),messages197=await sourceJSON<Record<string,string>>('messages/197.json');
const nativeUtil=await readFile(new URL('../../../src/battle/battle_util.c',import.meta.url),'utf8'),nativeEffects=await readFile(new URL('../../../include/constants/move_effects.h',import.meta.url),'utf8');
const nativeChargeSwitch=nativeUtil.slice(nativeUtil.indexOf('BOOL BattleCtx_IsIdenticalToCurrentMove('),nativeUtil.indexOf('BOOL GetTypeEffectivnessData('));
const nativeEffectValues=new Map([...nativeEffects.matchAll(/^#define\s+(MOVE_EFFECT_\w+)\s+(\d+)\s*$/gm)].map(match=>[match[1],Number(match[2])]));
const nativeChargeCases=[...nativeChargeSwitch.matchAll(/case\s+(MOVE_EFFECT_\w+)\s*:/g)].map(match=>({name:match[1],effect:nativeEffectValues.get(match[1])!}));
const nativeRanges=await readFile(new URL('../../../include/constants/moves.h',import.meta.url),'utf8');
const nativeRangeValues=new Map([...nativeRanges.matchAll(/^#define\s+(RANGE_\w+)\s+(0|\(1\s*<<\s*(\d+)\))/gm)].map(match=>[match[1],match[2]==='0'?0:1<<Number(match[3])]));
function mon(species:number,level:number){return createMon(data,species,level,'Ethan',()=>.5);}
function moves(mon:Mon,...keys:string[]){mon.moves=keys.map(key=>{const id=data.constants[key],pp=data.moves[id].pp;return{id,pp,maxPP:pp};});}
function fixture(player:Mon,enemies:Mon[],options:{bench?:Mon[];slot?:number;trainer?:number;rng?:()=>number;replace?:number}={}){
  const elements=new Map<string,{innerHTML:string;hidden:boolean}>();globalThis.document={getElementById(id:string){if(!elements.has(id))elements.set(id,{innerHTML:'',hidden:true});return elements.get(id);},querySelector(){return null;}} as unknown as Document;
  const state=newState(data,'Ethan','boy',()=>.5);state.party=[player,...options.bench??[]];
  const messages:string[]=[],events:{text:string;hp:number;maxHP:number;level:number;def:number}[]=[];
  const battle=new Battle(data,state,{choose:async()=>options.replace??4} as unknown as UI,options.rng??(()=>.5));
  Reflect.set(battle,'say',async(text:string)=>{messages.push(text);events.push({text,hp:player.hp,maxHP:player.maxHP,level:player.level,def:player.stats.def});});
  const stop=new Error('observed next turn');let turns=0,observed:ReturnType<typeof snapshot>|undefined;
  function snapshot(){return{player:structuredClone(player),enemies:structuredClone(enemies),playerStages:{...Reflect.get(battle,'playerStages')},enemyStages:{...Reflect.get(battle,'enemyStages')},enemy:battle.enemy,party:structuredClone(state.party)};}
  Reflect.set(battle,'nextAction',async()=>{if(turns++){observed=snapshot();throw stop;}return{kind:'move',slot:options.slot??0};});
  // Supply the same legal bench choice as the UI, without a browser event loop.
  Reflect.set(battle,'partyMenu',(forced:boolean)=>{assert.equal(forced,true);Reflect.get(battle,'actions')({kind:'switch',index:1});});
  return{state,battle,messages,events,async turn(){await assert.rejects(battle.start(enemies,options.trainer??null),error=>error===stop);assert.ok(observed);return observed;},start:()=>battle.start(enemies,options.trainer??null)};
}

test('a living foe still uses native self/field moves after the faster player recoil-faints with a usable bench',async()=>{
  for(const[species,key]of[[11,'MOVE_HARDEN'],[137,'MOVE_RECOVER'],[109,'MOVE_HAZE']] as const){
    const player=mon(16,30),enemy=mon(species,30);player.hp=1;moves(enemy,key);enemy.hp--;
    const f=fixture(player,[enemy],{slot:-1,bench:[mon(152,5)]}),pp=enemy.moves[0].pp;
    Reflect.set(f.battle,'enemyStages',{...freshStages(),def:2});
    // start resets stages; install the meaningful Haze state at action selection.
    const next=Reflect.get(f.battle,'nextAction');let installed=false;Reflect.set(f.battle,'nextAction',async()=>{if(!installed){installed=true;Reflect.set(f.battle,'enemyStages',{...freshStages(),def:2});}return next();});
    const result=await f.turn();assert.equal(result.enemies[0].moves[0].pp,pp-1);
    assert.ok(f.messages.some(text=>text.includes('used '+data.names.moves[data.constants[key]]+'!')));
    if(key==='MOVE_HARDEN')assert.equal(result.enemyStages.def,3);
    if(key==='MOVE_RECOVER')assert.equal(result.enemies[0].hp,result.enemies[0].maxHP);
    if(key==='MOVE_HAZE')assert.equal(result.enemyStages.def,0);
  }
});

test('an opponent-targeting move spends PP and prints original no-target text without damaging the fainted opponent',async()=>{
  const player=mon(16,30),enemy=mon(19,20);player.hp=1;moves(enemy,'MOVE_TACKLE');
  const f=fixture(player,[enemy],{slot:-1,bench:[mon(152,5)]}),pp=enemy.moves[0].pp,result=await f.turn();
  assert.equal(result.enemies[0].moves[0].pp,pp-1);assert.equal(result.player.hp,0);
  assert.ok(f.messages.includes(messages197['1234']));assert.ok(f.messages.includes('The opposing '+enemy.name+' used Tackle!'));
});

test('the surviving actor still processes sleep/waking/paralysis before PP and no-target resolution',async()=>{
  for(const[status,sleepTurns,shouldAct]of[['SLP',2,false],['SLP',1,true],['PAR',0,false]] as const){
    const player=mon(16,30),enemy=mon(11,30);player.hp=1;moves(enemy,'MOVE_HARDEN');Object.assign(enemy,{status,sleepTurns});
    const f=fixture(player,[enemy],{slot:-1,bench:[mon(152,5)],rng:()=>0}),pp=enemy.moves[0].pp,result=await f.turn();
    assert.equal(result.enemies[0].moves[0].pp,pp-Number(shouldAct));
    if(status==='SLP'){assert.equal(result.enemies[0].sleepTurns,sleepTurns-1);assert.equal(result.enemies[0].status,shouldAct?'':'SLP');}
    else assert.ok(f.messages.some(text=>text.includes('paralyzed!')));
    assert.equal(result.enemyStages.def,Number(shouldAct));
  }
});

function learningFixture(final=false){
  // Original Porygon learnset: Recover at18; the selected Tackle slot changes
  // from opponent-target to user-target during the intervening EXP task.
  const player=mon(137,17),enemy=mon(19,23);moves(player,'MOVE_TACKLE','MOVE_CONVERSION','MOVE_CONVERSION_2','MOVE_SHARPEN');
  player.exp=data.growth[data.personal[137].growthRate][18]-1;enemy.hp=1;for(const slot of enemy.moves)slot.pp=0;
  return fixture(player,final?[enemy]:[enemy,mon(19,2)],{trainer:20,replace:0});
}

test('enemy recoil-faint grants EXP/level-up HP and re-reads the selected learned move before the surviving player acts',async()=>{
  const f=learningFixture(),old=f.state.party[0],oldMax=old.maxHP,oldDef=old.stats.def,result=await f.turn();
  assert.equal(result.player.level,18);assert.ok(result.player.maxHP>oldMax);assert.ok(result.player.stats.def>oldDef);
  assert.equal(result.player.moves[0].id,data.constants.MOVE_RECOVER);assert.equal(result.player.moves[0].pp,result.player.moves[0].maxPP-1);assert.equal(result.player.hp,result.player.maxHP);
  const recoil=f.events.find(event=>event.text.includes('hit with recoil'))!,used=f.events.find(event=>event.text===old.name+' used Recover!')!;
  assert.ok(used.hp>recoil.hp);assert.equal(used.level,18);assert.ok(used.maxHP>recoil.maxHP);
  const exp=f.messages.findIndex(text=>text.includes('gained')),level=f.messages.findIndex(text=>text.includes('grew to Lv. 18')),move=f.messages.indexOf(old.name+' used Recover!'),replacement=f.messages.findIndex(text=>text.startsWith('The opposing Trainer sent out'));
  assert.ok(exp>=0&&exp<level&&level<move&&move<replacement);assert.ok(!f.messages.includes(old.name+' used Tackle!'));
});

test('the surviving player spends opponent-target PP against no target before the enemy replacement arrives',async()=>{
  const player=mon(11,30),enemy=mon(19,40),next=mon(19,2);moves(player,'MOVE_TACKLE');enemy.hp=1;for(const slot of enemy.moves)slot.pp=0;
  const f=fixture(player,[enemy,next],{trainer:20}),pp=player.moves[0].pp,exp=player.exp,result=await f.turn();
  assert.ok(result.player.exp>exp);assert.equal(result.player.moves[0].pp,pp-1);assert.equal(result.enemies[1].hp,next.maxHP);
  const award=f.messages.findIndex(text=>text.includes('gained')),used=f.messages.indexOf(player.name+' used Tackle!'),none=f.messages.indexOf(messages197['1234']),replacement=f.messages.findIndex(text=>text.startsWith('The opposing Trainer sent out'));
  assert.ok(award>=0&&award<used&&used<none&&none<replacement);
});

test('a learned unsupported opponent effect still completes native no-target processing without running the effect',async()=>{
  const player=mon(155,18),enemy=mon(19,23),next=mon(19,2);moves(player,'MOVE_TACKLE','MOVE_LEER','MOVE_SMOKE_SCREEN','MOVE_EMBER');
  player.exp=data.growth[data.personal[155].growthRate][19]-1;enemy.hp=1;for(const slot of enemy.moves)slot.pp=0;
  const f=fixture(player,[enemy,next],{trainer:20,slot:3,replace:3}),result=await f.turn();
  assert.equal(result.player.level,19);assert.equal(result.player.moves[3].id,data.constants.MOVE_FLAME_WHEEL);assert.equal(result.player.moves[3].pp,result.player.moves[3].maxPP-1);
  const used=f.messages.indexOf(player.name+' used Flame Wheel!'),none=f.messages.indexOf(messages197['1234']),replacement=f.messages.findIndex(text=>text.startsWith('The opposing Trainer sent out'));
  assert.ok(used>=0&&used<none&&none<replacement);assert.equal(result.enemies[1].hp,next.maxHP);
});

test('a surviving foe with an unsupported opponent effect spends PP and gets no target after player recoil',async()=>{
  const player=mon(16,30),enemy=mon(155,20);player.hp=1;moves(enemy,'MOVE_FLAME_WHEEL');
  const f=fixture(player,[enemy],{slot:-1,bench:[mon(152,5)]}),pp=enemy.moves[0].pp,result=await f.turn();
  assert.equal(result.enemies[0].moves[0].pp,pp-1);assert.equal(result.player.hp,0);assert.ok(f.messages.includes(messages197['1234']));
});

test('unsupported effects still fail when their native target exists, including user/field/opponent-side targets',async()=>{
  const player=mon(155,20),enemy=mon(19,2);moves(player,'MOVE_FLAME_WHEEL');
  await assert.rejects(fixture(player,[enemy]).start(),/Unported original move effect 125/);
  for(const key of ['MOVE_REFLECT','MOVE_SUNNY_DAY','MOVE_SPIKES']){
    const recoil=mon(16,30),survivor=mon(155,20);recoil.hp=1;moves(survivor,key);
    const effect=data.moves[data.constants[key]].effect;
    await assert.rejects(fixture(recoil,[survivor],{slot:-1,bench:[mon(152,5)]}).start(),new RegExp('Unported original move effect '+effect));
  }
});

test('native FRONT targeting distinguishes an unchanged Me First from a newly learned selected slot',async()=>{
  const player=mon(177,20),enemy=mon(19,25);moves(player,'MOVE_ME_FIRST');enemy.hp=1;for(const slot of enemy.moves)slot.pp=0;
  const f=fixture(player,[enemy,mon(19,2)],{trainer:20}),pp=player.moves[0].pp,result=await f.turn();
  assert.equal(result.player.moves[0].pp,pp-1);assert.ok(f.messages.includes(messages197['1234']));
  const learner=mon(177,19),first=mon(19,25);moves(learner,'MOVE_PECK','MOVE_LEER','MOVE_NIGHT_SHADE','MOVE_TELEPORT');learner.exp=data.growth[data.personal[177].growthRate][20]-1;first.hp=1;for(const slot of first.moves)slot.pp=0;
  // FightInput sets its retarget flag when the selected slot changes. FRONT
  // then retains an opposing battler ID, so this unported effect must throw.
  await assert.rejects(fixture(learner,[first,mon(19,2)],{trainer:20,replace:0}).start(),/Unported original move effect 241/);
});

test('the source-owned single-battle target matrix bypasses only the native no-target paths',async t=>{
  const rows=[
    ['RANGE_SINGLE_TARGET','MOVE_FLAME_WHEEL',true],['RANGE_SINGLE_TARGET_SPECIAL','MOVE_METRONOME',false],
    ['RANGE_RANDOM_OPPONENT','MOVE_OUTRAGE',true],['RANGE_ADJACENT_OPPONENTS','MOVE_GROWL',true],['RANGE_ALL_ADJACENT','MOVE_DISCHARGE',true],
    ['RANGE_USER','MOVE_REST',false],['RANGE_USER_SIDE','MOVE_REFLECT',false],['RANGE_FIELD','MOVE_SUNNY_DAY',false],
    ['RANGE_OPPONENT_SIDE','MOVE_SPIKES',false],['RANGE_ALLY','MOVE_HELPING_HAND',false],['RANGE_SINGLE_TARGET_USER_SIDE','MOVE_ACUPRESSURE',false],['RANGE_FRONT','MOVE_ME_FIRST',true],
  ] as const;
  assert.equal(rows.length,nativeRangeValues.size);
  for(const[range,key,noTarget]of rows)await t.test(range,async()=>{
    const player=mon(16,30),enemy=mon(11,30);player.hp=0;moves(enemy,key);const nativeMove=data.moves[data.constants[key]];
    assert.equal(nativeMove.target,nativeRangeValues.get(range));
    // This directly exercises the target/unsupported-effect boundary; the
    // public turn fixtures above separately prove how this state is reached.
    const f=fixture(player,[enemy],{bench:[mon(152,5)]}),pp=enemy.moves[0].pp;Reflect.set(f.battle,'enemies',[enemy]);
    const action=()=>Reflect.get(f.battle,'attack').call(f.battle,false,0,nativeMove.id);
    if(noTarget){await action();assert.equal(enemy.moves[0].pp,pp-1);assert.ok(f.messages.includes(messages197['1234']));}
    else await assert.rejects(action(),new RegExp('Unported original move effect '+nativeMove.effect));
  });
});

test('the native predicate table keeps every unmodeled first-turn charge effect unsupported without a live opponent',async t=>{
  assert.ok(nativeChargeCases.length>0,'read the actual native charge predicate switch');
  for(const row of nativeChargeCases)await t.test(row.name,async()=>{
    assert.ok(Number.isInteger(row.effect));assert.equal(data.constants[row.name],row.effect);
    const move=data.moves.find(move=>move.effect===row.effect);assert.ok(move,'native exported move for '+row.name);
    const player=mon(16,30),enemy=mon(11,30);player.hp=1;moves(enemy,move.key);
    const f=fixture(player,[enemy],{slot:-1,bench:[mon(152,5)]});
    await assert.rejects(f.start(),new RegExp('Unported original move effect '+row.effect));
    if(row.name!=='MOVE_EFFECT_BIDE')assert.ok(f.messages.some(text=>text===player.name+' is hit with recoil!'));
  });
});

test('the original Diglett17→18 learnset cannot silently turn its unported Dig charge into a no-target completion',async()=>{
  const player=mon(50,17),enemy=mon(19,30);moves(player,'MOVE_MUD_SLAP','MOVE_SCRATCH','MOVE_SAND_ATTACK','MOVE_GROWL');
  // Legal prior training lets this low-HP species survive the faster foe's
  // Struggle; no unsupported Focus Sash or manually invented HP is involved.
  player.evs=[252,0,252,0,0,0];const stats=calculateStats(data.personal[50],player.level,player.ivs,player.evs,player.nature);player.stats=stats.stats;player.hp=player.maxHP=stats.maxHP;
  player.exp=data.growth[data.personal[50].growthRate][18]-1;enemy.hp=1;for(const slot of enemy.moves)slot.pp=0;
  const f=fixture(player,[enemy,mon(19,2)],{trainer:20,replace:0});await assert.rejects(f.start(),/Unported original move effect 256/);
  assert.ok(f.messages.some(text=>text===player.name+' grew to Lv. 18!'));
});

test('a final enemy recoil-KO ends after EXP/learning with none of the surviving player move PP spent',async()=>{
  const f=learningFixture(true);assert.equal(await f.start(),'won');
  const player=f.state.party[0];assert.equal(player.moves[0].id,data.constants.MOVE_RECOVER);assert.equal(player.moves[0].pp,player.moves[0].maxPP);
  assert.ok(!f.messages.some(text=>text===player.name+' used Recover!'));assert.ok(!f.messages.some(text=>text.startsWith('The opposing Trainer sent out')));
});

test('fainting the last player by recoil stops before a surviving foe spends its selected move PP',async()=>{
  const player=mon(16,30),enemy=mon(11,30);player.hp=1;moves(enemy,'MOVE_HARDEN');
  const f=fixture(player,[enemy],{slot:-1}),pp=enemy.moves[0].pp;assert.equal(await f.start(),'lost');assert.equal(enemy.moves[0].pp,pp);assert.ok(!f.messages.some(text=>text.includes('used Harden')));
});

test('a recoil-fainted participant gets no EXP while a living Share holder receives its pool and the gifted Egg stays unchanged',async()=>{
  const player=mon(16,30),enemy=mon(19,2),holder=mon(152,5);player.hp=1;enemy.hp=1;holder.heldItem='ITEM_EXP__SHARE';
  const f=fixture(player,[enemy],{slot:-1,bench:[holder]}),exp=player.exp,holderExp=holder.exp;f.state.nativeEggSeed=1;giveTogepiEgg(data,f.state,{now:()=>new Date(2026,9,17)});const egg=structuredClone(f.state.party[2]);
  assert.equal(await f.start(),'won');assert.equal(player.exp,exp);assert.deepEqual(player.evs,[0,0,0,0,0,0]);assert.ok(holder.exp>holderExp);assert.deepEqual(f.state.party[2],egg);
});
