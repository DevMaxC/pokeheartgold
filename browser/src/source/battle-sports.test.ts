import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Battle} from './battle.ts';
import {createMon,loadData,newState} from './data.ts';
import {originalTrainerParty} from './trainers.ts';
import {freshStages,monAbility,moveBaseDamage} from './battle-math.ts';
import {nativeStatus2} from './battle-volatiles.ts';
import type {Mon} from './types.ts';
import type {UI} from './ui.ts';
import type {BattleView} from './battle-view.ts';

globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData(),noncrit=32769/65536;
const mon=(species:number,level=10,odd=false)=>createMon(data,species,level,'Ethan',()=>odd?0x80010001/0x100000000:noncrit);
const slot=(subject:Mon,key:string)=>{const index=subject.moves.findIndex(move=>move.id===data.constants[key]);assert.ok(index>=0,`${subject.name} must know ${key}`);return index;};
function legalMove(subject:Mon,key:string,tm?:number){const move=data.moves[data.constants[key]];assert.ok(tm?data.personal[subject.species].tms.includes(tm):data.learnsets[subject.species].some(row=>row.move===move.id&&row.level<=subject.level));subject.moves=[{id:move.id,pp:move.pp,maxPP:move.pp}];}
function fixture(enemies:Mon[],party:Mon[]=[mon(155,18)]){
 const elements=new Map<string,{innerHTML:string;hidden:boolean}>();globalThis.document={getElementById(id:string){if(!elements.has(id))elements.set(id,{innerHTML:'',hidden:true});return elements.get(id);},querySelector(){return null;}}as unknown as Document;
 const state=newState(data,'Ethan','boy',()=>noncrit);state.party=party;const messages:string[]=[],events:string[]=[];let draws=0;
 const view={sync(){},attack:async(side:boolean)=>{events.push(`attack:${side}`);},hit:async(side:boolean)=>{events.push(`hit:${side}`);},end:()=>events.push('end')}as unknown as BattleView;
 const battle=new Battle(data,state,{}as UI,()=>{draws++;return noncrit;},view);Reflect.set(battle,'enemies',enemies);Reflect.set(battle,'trainer',60);Reflect.set(battle,'experienceMask',1);Reflect.set(battle,'say',async(text:string)=>messages.push(text));Reflect.set(battle,'draw',()=>{});
 return{battle,state,messages,events,get draws(){return draws;}};
}
type Fixture=ReturnType<typeof fixture>;
const call=(f:Fixture,key:string,...args:unknown[])=>Reflect.get(f.battle,key).apply(f.battle,args);
const act=(f:Fixture,side:boolean,key:string)=>call(f,'attack',side,slot(side?f.battle.player:f.battle.enemy,key));
// Literal CalcMoveDamage arithmetic for these clear-weather special moves:
// power modifiers precede stat formula/+2, then native range/STAB/type.
function expectedSpecial(attacker:Mon,defender:Mon,power:number,stab=false,type=1){const base=Math.floor(Math.floor((Math.floor(attacker.level*2/5)+2)*power*attacker.stats.spatk/defender.stats.spdef)/50)+2;let damage=Math.floor(base*93/100);if(stab)damage=Math.floor(damage*15/10);return Math.max(1,Math.floor(damage*type));}

test('literal native effect scripts use per-user moveEffectFlags; field query has no HP predicate',async()=>{
 for(const [effect,flag]of[['0201','MUD_SPORT'],['0210','WATER_SPORT']]){const source=await readFile(new URL(`../../../files/battledata/script/effect_script/effect_script_${effect}.s`,import.meta.url),'utf8');assert.match(source,new RegExp(`CompareMonDataToValue OPCODE_FLAG_SET, BATTLER_CATEGORY_ATTACKER, BMON_DATA_MOVE_EFFECT, MOVE_EFFECT_FLAG_${flag}`));assert.match(source,/MOVE_STATUS_FAILED/);}
 const util=await readFile(new URL('../../../src/battle/battle_util.c',import.meta.url),'utf8'),query=util.slice(util.indexOf('BOOL CheckMoveEffectOnField('),util.indexOf('void BattleContext_ResetMoveStatus('));assert.match(query,/battleMons\[battlerId\]\.moveEffectFlags & moveEffect/);assert.doesNotMatch(query,/\.hp/);
 const damage=util.slice(util.indexOf('int CalcMoveDamage('));assert.ok(damage.indexOf('ABILITY_TECHNICIAN')<damage.indexOf('MOVE_EFFECT_FLAG_MUD_SPORT'));assert.ok(damage.indexOf('MOVE_EFFECT_FLAG_WATER_SPORT')<damage.indexOf('ABILITY_BLAZE'));
});

test('actual Route32 Wooper6 and UnionCave Geodude6 cast MudSport with no gameplay draw; repeat spends PP but does not animate',async()=>{
 const route=data.encounters.find(row=>row.map==='R32')!;assert.ok(route.land.mons.some(row=>row.level===6&&JSON.stringify(row.species).includes('SPECIES_WOOPER')));
 const cave=data.encounters.find(row=>row.map==='D25R0101')!;assert.ok(cave.land.mons.some(row=>row.level===6&&JSON.stringify(row.species).includes('SPECIES_GEODUDE')),'native Union Cave6 encounter');
 for(const species of[194,74]){const target=mon(species,6),f=fixture([target]),index=slot(target,'MOVE_MUD_SPORT'),pp=target.moves[index].pp;await act(f,false,'MOVE_MUD_SPORT');assert.equal(f.draws,0);assert.equal(target.moves[index].pp,pp-1);assert.equal(call(f,'sportContext').mudSport,true);assert.equal(f.events.length,1);await act(f,false,'MOVE_MUD_SPORT');assert.equal(target.moves[index].pp,pp-2);assert.equal(f.events.length,1);assert.equal(f.draws,0);assert.equal(call(f,'volatile',target).previousMove,data.constants.MOVE_MUD_SPORT);assert.equal(f.messages.at(-1),'But it failed!');}
});

test('actual Cherrygrove OldRod Krabby10 weakens Mareep ThunderShock power, rather than halving final damage',async()=>{
 const source=data.encounters.find(row=>row.map==='T21')!;assert.ok(JSON.stringify(source.fishing.old_rod).includes('SPECIES_KRABBY'));
 const krabby=mon(98),mareep=mon(179),f=fixture([krabby],[mareep]);await act(f,false,'MOVE_MUD_SPORT');const before=krabby.hp;await act(f,true,'MOVE_THUNDER_SHOCK');assert.equal(before-krabby.hp,expectedSpecial(mareep,krabby,20,true,2));assert.notEqual(before-krabby.hp,Math.floor(expectedSpecial(mareep,krabby,40,true,2)/2));
});

test('actual Henry Poliwag8 weakens Cyndaquil Ember with GenIV half-power; no five-turn expiry',async()=>{
 const team=await originalTrainerParty(data,60),player=mon(155,18),f=fixture(team,[player]);assert.deepEqual(team.map(m=>[m.species,m.level]),[[60,8],[60,8]]);await act(f,false,'MOVE_WATER_SPORT');let selections=0;const stop=new Error('six real end-turn phases');Reflect.set(f.battle,'active',true);Reflect.set(f.battle,'chooseEnemyMove',()=>slot(team[0],'MOVE_WATER_SPORT'));Reflect.set(f.battle,'nextAction',async()=>{if(selections++===6)throw stop;return{kind:'move',slot:slot(player,'MOVE_LEER')};});await assert.rejects(call(f,'loop'),error=>error===stop);const before=team[0].hp;await act(f,true,'MOVE_EMBER');assert.equal(before-team[0].hp,expectedSpecial(player,team[0],20,true,.5));assert.equal(call(f,'sportContext').waterSport,true);assert.ok(f.messages.includes('Fire’s power was weakened!'));
});

test('both users can own WaterSport, it never stacks, and withdrawing one leaves the other flag active',async()=>{
 const team=await originalTrainerParty(data,60),player=mon(60),reserve=mon(155),f=fixture(team,[player,reserve]);await act(f,true,'MOVE_WATER_SPORT');await act(f,false,'MOVE_WATER_SPORT');assert.equal(f.events.filter(e=>e.startsWith('attack:')).length,2);await call(f,'switch',1);assert.equal(call(f,'sportContext').waterSport,true);const hp=team[0].hp;await act(f,true,'MOVE_EMBER');assert.equal(hp-team[0].hp,expectedSpecial(reserve,team[0],20,true,.5));await call(f,'sendEnemy',1);assert.equal(call(f,'sportContext').waterSport,false);const freshHP=team[1].hp;await act(f,true,'MOVE_EMBER');assert.equal(freshHP-team[1].hp,expectedSpecial(reserve,team[1],40,true,.5));await call(f,'switch',0);assert.equal(call(f,'sportContext').waterSport,false,'ordinary return does not restore a withdrawn flag');
});

test('Sport flags survive native Rage status2 masking and can run without a living opponent',async()=>{
 const onix=mon(95,14),target=mon(98),f=fixture([target],[onix]);const mud=data.moves[data.constants.MOVE_MUD_SPORT];assert.ok(data.learnsets[95].some(row=>row.move===mud.id&&row.level===1));onix.moves[0]={id:mud.id,pp:mud.pp,maxPP:mud.pp};assert.equal(onix.moves.length,4);await act(f,true,'MOVE_MUD_SPORT');await act(f,true,'MOVE_RAGE');call(f,'volatile',onix).status2|=nativeStatus2.focusEnergy;call(f,'prepareRageTurn',onix,slot(onix,'MOVE_ROCK_THROW'));assert.equal(call(f,'volatile',onix).status2,nativeStatus2.rage);assert.equal(call(f,'sportContext').mudSport,true);
 // Literal fainted-opponent action boundary; not a forced battle victory.
 const poliwag=mon(60),empty=fixture([mon(98)],[poliwag]);empty.battle.enemy.hp=0;await act(empty,true,'MOVE_WATER_SPORT');assert.equal(call(empty,'sportContext').waterSport,true);assert.ok(!empty.messages.includes('But there was no target...'));
});

test('actual Henry caster faint clears WaterSport before its reserve takes the pending turn',async()=>{
 const team=await originalTrainerParty(data,60),player=mon(152,18),f=fixture(team,[player]);await act(f,false,'MOVE_WATER_SPORT');let selections=0;const stop=new Error('next turn');Reflect.set(f.battle,'active',true);Reflect.set(f.battle,'chooseEnemyMove',()=>slot(f.battle.enemy,'MOVE_WATER_SPORT'));Reflect.set(f.battle,'nextAction',async()=>{if(selections++)throw stop;return{kind:'move',slot:slot(player,'MOVE_RAZOR_LEAF')};});await assert.rejects(call(f,'loop'),error=>error===stop);assert.equal(team[0].hp,0);assert.equal(f.battle.enemy,team[1]);assert.equal(call(f,'sportContext').waterSport,false);assert.equal(Reflect.get(f.battle,'waterSport').has(team[0]),false);
});

test('source-compatible Technician Thunderbolt95 is tested before MudSport halves its power to47',async()=>{
 // Legal GenIV TM fixture; no early-game TM acquisition claim.
 const attacker=mon(52,24,true),target=mon(98,30);assert.equal(monAbility(data,attacker),'ABILITY_TECHNICIAN');legalMove(attacker,'MOVE_THUNDERBOLT',24);legalMove(target,'MOVE_MUD_SPORT');const f=fixture([target],[attacker]);await act(f,false,'MOVE_MUD_SPORT');const hp=target.hp;await act(f,true,'MOVE_THUNDERBOLT');assert.equal(hp-target.hp,expectedSpecial(attacker,target,47,false,2));assert.notEqual(hp-target.hp,expectedSpecial(attacker,target,70,false,2));
});

test('Blaze odd-power rounding follows WaterSport95→47 then lowHP47→70, not142→71',async()=>{
 // Legal GenIV TM/low-HP phase fixture, not an injected victory.
 const player=mon(155,15),target=mon(60,50);legalMove(player,'MOVE_FLAMETHROWER',35);player.hp=Math.floor(player.maxHP/3);assert.equal(monAbility(data,player),'ABILITY_BLAZE');legalMove(target,'MOVE_WATER_SPORT');const move=data.moves[data.constants.MOVE_FLAMETHROWER],f=fixture([target],[player]);await act(f,false,'MOVE_WATER_SPORT');const actual=moveBaseDamage(data,player,target,move,freshStages(),freshStages(),false,{waterSport:true}),base=(power:number)=>Math.floor(Math.floor((Math.floor(player.level*2/5)+2)*power*player.stats.spatk/target.stats.spdef)/50)+2;assert.equal(actual,base(70));assert.notEqual(actual,base(71));const hp=target.hp;await act(f,true,'MOVE_FLAMETHROWER');assert.equal(hp-target.hp,expectedSpecial(player,target,70,true,.5));
});

test('fixed DragonRage remains40 under WaterSport and cleanup clears flags without touching saved party data',async()=>{
 const player=mon(147,20),target=mon(60,30);legalMove(target,'MOVE_WATER_SPORT');const f=fixture([target],[player]);await act(f,false,'MOVE_WATER_SPORT');const hp=target.hp;await act(f,true,'MOVE_DRAGON_RAGE');assert.equal(hp-target.hp,40);const saved=structuredClone(f.state.party);call(f,'clearBattleVolatiles');assert.deepEqual(f.state.party,saved);assert.deepEqual(call(f,'sportContext'),{mudSport:false,waterSport:false});
});

test('actual native replacement damage port uses the outgoing actor and active WaterSport, without a gameplay draw',async()=>{
 // Legal controller snapshot, not an assertion that a source NPC has this roster.
 const actor=mon(155),fire=mon(155),rat=mon(19),player=mon(60,20);legalMove(fire,'MOVE_EMBER');legalMove(rat,'MOVE_TACKLE');legalMove(player,'MOVE_WATER_SPORT');const f=fixture([actor,fire,rat],[player]);
 assert.equal(call(f,'chooseEnemyReplacement'),1);await act(f,true,'MOVE_WATER_SPORT');assert.equal(call(f,'chooseEnemyReplacement'),2);assert.equal(f.draws,0);
 // The same source selector must keep using the current actor, not reserve
 // levels/stats. Changing those legal reserve levels cannot change its score.
 const strongFire=mon(155,60);legalMove(strongFire,'MOVE_EMBER');Reflect.get(f.battle,'enemies')[1]=strongFire;assert.equal(call(f,'chooseEnemyReplacement'),2);
 const base=(power:number,special:boolean)=>Math.floor(Math.floor((Math.floor(actor.level*2/5)+2)*power*actor.stats[special?'spatk':'atk']/player.stats[special?'spdef':'def'])/50)+2;
 const before=Math.floor(Math.floor(base(40,true)*15/10)*.5),after=Math.floor(Math.floor(base(20,true)*15/10)*.5),normal=base(data.moves[data.constants.MOVE_TACKLE].power,false);assert.ok(before>=normal&&after<normal,'source strict-greater tie keeps earlier fire reserve before Sport');
});

test('native field flag remains queryable at HP0 until InitFaintedWork cleanup, then clears',async()=>{
 const caster=mon(60),f=fixture([caster]);await act(f,false,'MOVE_WATER_SPORT');caster.hp=0;assert.equal(call(f,'sportContext').waterSport,true);call(f,'clearOnLeave',caster);assert.equal(call(f,'sportContext').waterSport,false);
});

test('new affected damage rejects unported immunity/weather/held callbacks before PP or HP changes',async()=>{
 for(const mode of['flashfire','voltabsorb','motordrive','weather','item']as const){const electric=mode==='voltabsorb'||mode==='motordrive',player=mon(electric?179:155,18),caster=mon(electric?98:60,20),target=mon(mode==='flashfire'?37:mode==='voltabsorb'?170:mode==='motordrive'?466:60,25),f=fixture([caster,target],[player]);legalMove(caster,electric?'MOVE_MUD_SPORT':'MOVE_WATER_SPORT');await act(f,false,electric?'MOVE_MUD_SPORT':'MOVE_WATER_SPORT');if(mode==='flashfire')assert.equal(monAbility(data,target),'ABILITY_FLASH_FIRE');if(mode==='voltabsorb'){assert.equal(monAbility(data,target),'ABILITY_VOLT_ABSORB');}if(mode==='motordrive')assert.equal(monAbility(data,target),'ABILITY_MOTOR_DRIVE');
  // Keep the caster active, but use a separate affected recipient to examine
  // the same preflight port; the real action below tests weather/item rollback.
  const move=data.moves[data.constants[electric?'MOVE_THUNDER_SHOCK':'MOVE_EMBER']];if(['flashfire','voltabsorb','motordrive'].includes(mode)){assert.throws(()=>call(f,'assertSportDamageScope',player,target,move),/Unsupported native Sport damage immunity/);continue;}
  if(mode==='weather')Reflect.set(f.battle,'weather','rain');else player.heldItem='ITEM_LIFE_ORB';const before=structuredClone({player,caster});await assert.rejects(act(f,true,'MOVE_EMBER'),/Unsupported native/);assert.deepEqual({player,caster},before);
 }
 const pressure=mon(243,30),caster=mon(60),f=fixture([pressure],[caster]),before=structuredClone(caster);await assert.rejects(act(f,true,'MOVE_WATER_SPORT'),/Sport Pressure PP/);assert.deepEqual(caster,before);
});


test('a real loop clears a fainted Sport caster before native stage2 replacement scores its legal reserves',async()=>{
 const actor=createMon(data,60,13,'Ethan',()=>15/0x100000000),fire=mon(155),rat=mon(19),player=mon(19,30);assert.equal(actor.nature,15);assert.equal(actor.moves.length,4);legalMove(fire,'MOVE_EMBER');legalMove(rat,'MOVE_TACKLE');legalMove(player,'MOVE_TACKLE');const f=fixture([actor,fire,rat],[player]);assert.equal(call(f,'chooseEnemyReplacement'),1);await act(f,false,'MOVE_WATER_SPORT');assert.equal(call(f,'chooseEnemyReplacement'),2);
 let selections=0;const stop=new Error('next turn after native faint/replacement');Reflect.set(f.battle,'active',true);Reflect.set(f.battle,'chooseEnemyMove',()=>slot(actor,'MOVE_WATER_SPORT'));Reflect.set(f.battle,'nextAction',async()=>{if(selections++)throw stop;return{kind:'move',slot:slot(player,'MOVE_TACKLE')};});await assert.rejects(call(f,'loop'),error=>error===stop);assert.equal(actor.hp,0);assert.equal(f.battle.enemy,fire,'fainted caster flag must clear before the current-actor damage evaluator');assert.equal(call(f,'sportContext').waterSport,false);
});
