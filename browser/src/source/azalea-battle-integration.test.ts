import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {Battle} from './battle.ts';
import {createMon,loadData,newState} from './data.ts';
import {originalTrainerParty} from './trainers.ts';
import {confusionDamage,freshStages,monAbility,moveBaseDamage,moveDamage} from './battle-math.ts';
import {nativeStatus2 as bit} from './battle-volatiles.ts';
import type {Mon} from './types.ts';
import type {UI} from './ui.ts';
import type {BattleView} from './battle-view.ts';
globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData(),noncrit=32769/65536;
function rawTape(...values:number[]){let calls=0;return{rng:()=>{assert.ok(calls<values.length,'unexpected native gameplay draw');return values[calls++]/65536;},get calls(){return calls;}};}
function sourceMove(mon:Mon,key:string){const slot=mon.moves.findIndex(move=>move.id===data.constants[key]);assert.ok(slot>=0,`${mon.name} must naturally know ${key}`);return slot;}
function fieldMon(species=155,level=18){return createMon(data,species,level,'Ethan',()=>noncrit);}
function fixture(enemies:Mon[],party:Mon[]=[fieldMon()],rng:()=>number=()=>noncrit){
 const elements=new Map<string,{innerHTML:string;hidden:boolean;onclick?:()=>void}>();globalThis.document={getElementById(id:string){if(!elements.has(id))elements.set(id,{innerHTML:'',hidden:true});return elements.get(id);},querySelector(){return null;}}as unknown as Document;
 const state=newState(data,'Ethan','boy',()=>noncrit);state.party=party;const messages:string[]=[],events:string[]=[],view={begin:async()=>{events.push('begin');},sync:(player:Mon,enemy:Mon)=>events.push(`sync:${player.species}/${enemy.species}`),attack:async(side:boolean)=>events.push(`attack:${side}`),hit:async(side:boolean)=>events.push(`hit:${side}`),end:()=>events.push('end')}as unknown as BattleView;
 const battle=new Battle(data,state,{choose:async()=>4}as unknown as UI,rng,view);Reflect.set(battle,'enemies',enemies);Reflect.set(battle,'trainer',21);Reflect.set(battle,'experienceMask',1);Reflect.set(battle,'say',async(text:string)=>{messages.push(text);Reflect.get(battle,'draw').call(battle);});return{battle,state,messages,events};
}
type Fixture=ReturnType<typeof fixture>;
const invoke=(f:Fixture,key:string,...args:unknown[])=>Reflect.get(f.battle,key).apply(f.battle,args);
const volatile=(f:Fixture,mon:Mon)=>invoke(f,'volatile',mon)as{status2:number;previousMove:number;meanLookSource:number};
async function action(f:Fixture,side:boolean,key:string){await invoke(f,'attack',side,sourceMove(side?f.battle.player:f.battle.enemy,key));}
async function oneTurn(f:Fixture,playerSlot:number,enemySlot:number){const stop=new Error('observed next native turn');let selections=0;Reflect.set(f.battle,'active',true);Reflect.set(f.battle,'chooseEnemyMove',()=>enemySlot);Reflect.set(f.battle,'nextAction',async()=>{if(selections++)throw stop;return{kind:'move',slot:playerSlot};});await assert.rejects(invoke(f,'loop'),error=>error===stop);}

test('actual Proton Supersonic self-hit precedes paralysis/PP; leaving clears only volatile status',async()=>{
 const team=await originalTrainerParty(data,486),tape=rawTape(0,2,0,0),player=fieldMon(),f=fixture(team,[player,fieldMon(158)],tape.rng);assert.equal(team[0].species,41);
 await action(f,false,'MOVE_SUPERSONIC');assert.equal(volatile(f,player).status2&7,4);player.status='PAR';const slot=sourceMove(player,'MOVE_EMBER'),pp=player.moves[slot].pp,hp=player.hp;
 await invoke(f,'attack',true,slot);assert.equal(player.hp,hp-confusionDamage(data,player,freshStages(),0));assert.equal(player.moves[slot].pp,pp);assert.equal(tape.calls,4);assert.equal(volatile(f,player).previousMove,0);assert.equal(volatile(f,player).status2&7,3);assert.ok(f.events.includes('hit:true'));
 await invoke(f,'switch',1);assert.ok(!Reflect.get(f.battle,'volatiles').has(player));assert.equal(player.status,'PAR');
});
test('snap-out consumes no confusion coin/range and permits the selected natural move',async()=>{
 const player=fieldMon(),team=await originalTrainerParty(data,486),tape=rawTape(0,1,0,65535),f=fixture(team,[player],tape.rng);volatile(f,player).status2=1;const slot=sourceMove(player,'MOVE_EMBER'),pp=player.moves[slot].pp;
 await invoke(f,'attack',true,slot);assert.equal(volatile(f,player).status2&7,0);assert.equal(player.moves[slot].pp,pp-1);assert.equal(tape.calls,4);assert.ok(f.messages.some(text=>text.includes('snapped out')));
});
test('actual Bugsy FocusEnergy uses raw critical stage and native Technician QuickAttack power',async()=>{
 const team=await originalTrainerParty(data,21),f=fixture(team);assert.equal(monAbility(data,team[0]),'ABILITY_TECHNICIAN');assert.equal(team[0].heldItem,'ITEM_SITRUS_BERRY');
 await action(f,false,'MOVE_FOCUS_ENERGY');assert.ok(volatile(f,team[0]).status2&bit.focusEnergy);await action(f,false,'MOVE_FOCUS_ENERGY');assert.ok(f.messages.includes('But it failed!'));
 const tape=rawTape(4);Reflect.set(f.battle,'rng',tape.rng);const move=data.moves[data.constants.MOVE_QUICK_ATTACK];assert.equal(invoke(f,'critMultiplier',team[0],f.battle.player,move),2);assert.equal(tape.calls,1);
 const expected=Math.floor(Math.floor((Math.floor(team[0].level*2/5)+2)*60*team[0].stats.atk/f.battle.player.stats.def)/50)+2;assert.equal(moveBaseDamage(data,team[0],f.battle.player,move,freshStages(),freshStages()),expected);
 const armor=fieldMon(347),blocked=rawTape(4);Reflect.set(f.battle,'rng',blocked.rng);assert.equal(monAbility(data,armor),'ABILITY_BATTLE_ARMOR');assert.equal(invoke(f,'critMultiplier',team[0],armor,move),1);assert.equal(blocked.calls,1);
});
test('actual Rival Spite records misses, drains four capped PP, and can exhaust a selected move',async()=>{
 const team=await originalTrainerParty(data,1),player=fieldMon(158),f=fixture(team,[player],()=>.9999),slot=sourceMove(player,'MOVE_WATER_GUN');await invoke(f,'attack',true,slot);assert.equal(volatile(f,player).previousMove,data.constants.MOVE_WATER_GUN);
 Reflect.set(f.battle,'rng',()=>noncrit);const before=player.moves[slot].pp;await action(f,false,'MOVE_SPITE');assert.equal(player.moves[slot].pp,before-4);assert.equal(volatile(f,team[0]).previousMove,data.constants.MOVE_SPITE);
 player.moves[slot].pp=2;await action(f,false,'MOVE_SPITE');assert.equal(player.moves[slot].pp,0);const hp=team[0].hp;await invoke(f,'attack',true,slot);assert.equal(team[0].hp,hp);assert.equal(player.moves[slot].pp,0);assert.equal(volatile(f,player).previousMove,0);
 player.status='SLP';player.sleepTurns=2;await invoke(f,'attack',true,slot);assert.equal(volatile(f,player).previousMove,0);assert.ok(f.messages.some(text=>text.includes('no PP')));
});
test('MeanLook traps Ghosts, distinguishes ShedShell/SmokeBall, and releases when its caster leaves',async()=>{
 const team=await originalTrainerParty(data,1),player=fieldMon(92,14),f=fixture(team,[player,fieldMon()]);await action(f,false,'MOVE_MEAN_LOOK');assert.equal(invoke(f,'trapped','switch'),true);assert.equal(invoke(f,'trapped','escape'),true);
 player.heldItem='ITEM_SMOKE_BALL';assert.equal(invoke(f,'trapped','escape'),false);assert.equal(invoke(f,'trapped','switch'),true);player.heldItem='ITEM_SHED_SHELL';assert.equal(invoke(f,'trapped','switch'),false);assert.equal(invoke(f,'trapped','escape'),true);
 await invoke(f,'sendEnemy',1);assert.equal(volatile(f,player).status2&bit.meanLook,0);assert.equal(volatile(f,player).meanLookSource,1);
});
test('actual Ghost Curse sacrifices half, persists after caster leaves and ticks after burn',async()=>{
 const team=await originalTrainerParty(data,1),player=fieldMon(158),f=fixture(team,[player]);const caster=team[0],hp=caster.hp;await action(f,false,'MOVE_CURSE');assert.equal(caster.hp,hp-Math.max(1,Math.floor(caster.maxHP/2)));assert.ok(volatile(f,player).status2&bit.curse);
 await invoke(f,'sendEnemy',1);assert.ok(volatile(f,player).status2&bit.curse);player.status='BRN';const before=player.hp;await oneTurn(f,sourceMove(player,'MOVE_SCARY_FACE'),sourceMove(f.battle.enemy,'MOVE_SUPERSONIC'));
 assert.equal(player.hp,before-Math.max(1,Math.floor(player.maxHP/8))-Math.max(1,Math.floor(player.maxHP/4)));const burn=f.messages.findIndex(text=>text.includes('hurt by its burn')),curse=f.messages.findIndex(text=>text.includes('afflicted by the curse'));assert.ok(burn>=0&&curse>burn);
});
test('actual Bayleef Reflect screens a later physical move, counts activation turn and survives switch',async()=>{
 const team=await originalTrainerParty(data,1),bayleef=team.find(mon=>mon.species===153)!;assert.ok(bayleef);const player=fieldMon(152),f=fixture([bayleef,team[0]],[player]);Reflect.set(f.battle,'noCritical',true);const before=bayleef.hp;
 const expected=moveDamage(data,player,bayleef,data.moves[data.constants.MOVE_RAZOR_LEAF],freshStages(),freshStages(),85+Math.floor(noncrit*16),false,false,{reflect:true}).damage;
 await oneTurn(f,sourceMove(player,'MOVE_RAZOR_LEAF'),sourceMove(bayleef,'MOVE_REFLECT'));assert.equal(before-bayleef.hp,expected);assert.equal(Reflect.get(f.battle,'reflectTurns')[1],4);await invoke(f,'sendEnemy',1);assert.equal(Reflect.get(f.battle,'reflectTurns')[1],4);
});
test('actual Bugsy U-turn makes the pending player move hit its replacement, not the outgoing Scyther',async()=>{
 const team=await originalTrainerParty(data,21),player=fieldMon(152),f=fixture(team,[player]),scyther=team[0],oldHP=scyther.hp;Reflect.set(f.battle,'noCritical',true);
 await oneTurn(f,sourceMove(player,'MOVE_RAZOR_LEAF'),sourceMove(scyther,'MOVE_U_TURN'));assert.notEqual(f.battle.enemy,scyther);assert.equal(scyther.hp,oldHP);assert.ok(f.battle.enemy.hp<f.battle.enemy.maxHP);assert.equal(scyther.moves[sourceMove(scyther,'MOVE_U_TURN')].pp,data.moves[data.constants.MOVE_U_TURN].pp-1);assert.equal(volatile(f,f.battle.enemy).previousMove,data.constants.MOVE_U_TURN);assert.ok(!Reflect.get(f.battle,'volatiles').has(scyther));
});
test('player U-turn awaits native party choice, clears trapping and adds a living-opponent participant',async()=>{
 const pivot=fieldMon(123),reserve=fieldMon(155),team=await originalTrainerParty(data,486),f=fixture(team,[pivot,reserve]);assert.ok((data.personal[pivot.species].tms as number[]).includes(89));const move=data.moves[data.constants.MOVE_U_TURN];pivot.moves=[{id:move.id,pp:move.pp,maxPP:move.pp}];volatile(f,pivot).status2=bit.meanLook;volatile(f,pivot).meanLookSource=1;
 let requested=false,continued=false;Reflect.set(f.battle,'partyMenu',(forced:boolean)=>{assert.equal(forced,true);requested=true;assert.equal(f.battle.player,pivot);queueMicrotask(()=>{assert.equal(continued,false);Reflect.get(f.battle,'actions')({kind:'switch',index:1});});});
 const hp=team[0].hp;await invoke(f,'attack',true,0);continued=true;assert.ok(requested);assert.equal(f.battle.player,reserve);assert.ok(team[0].hp<hp);assert.equal(volatile(f,reserve).status2,0);assert.equal(Reflect.get(f.battle,'experienceMask'),3);assert.equal(pivot.moves[0].pp,move.pp-1);
});
test('U-turn rejects unported contact/Pursuit/item hooks before PP or HP mutation',async()=>{
 for(const mode of['poisonpoint','pursuit','lifeorb']as const){const team=await originalTrainerParty(data,21),target=fieldMon(mode==='poisonpoint'?29:mode==='pursuit'?198:155),f=fixture(team,[target]);if(mode==='poisonpoint')target.personality=(target.personality&~1)>>>0;if(mode==='lifeorb')team[0].heldItem='ITEM_LIFE_ORB';const before=structuredClone({team,target});await assert.rejects(action(f,false,'MOVE_U_TURN'),/Unsupported native/);assert.deepEqual({team,target},before,mode);}
});
test('real Bugsy roster is defeated by legal actions without injected victory or linear party assumptions',async()=>{
 const team=await originalTrainerParty(data,21),player=fieldMon(155),f=fixture(team,[player]);f.state.bag.ITEM_POTION=8;let actions=0;Reflect.set(f.battle,'nextAction',async()=>{assert.ok(++actions<80);if(f.battle.player.hp<=Math.floor(f.battle.player.maxHP/2)&&f.state.bag.ITEM_POTION)return{kind:'item',item:'ITEM_POTION'};return{kind:'move',slot:sourceMove(f.battle.player,'MOVE_EMBER')};});
 const result=await f.battle.start(team,21);assert.equal(result,'won');assert.ok(team.every(mon=>mon.hp===0));assert.ok(f.messages.some(text=>text.includes('went back')));assert.ok(f.events.includes('end'));assert.ok(player.exp>data.growth[data.personal[player.species].growthRate][18]);
});
test('native genderless Magnemite/Voltorb use real exported sprite slots without a sex symbol',async()=>{
 for(const species of[81,100]){const mon=fieldMon(species),f=fixture([mon]);assert.equal(mon.gender,'genderless');for(const facing of['front','back']){const path=invoke(f,'image',mon,facing);assert.equal(path,`/source/pokemon/${species}-male-${facing}.png`);await access(new URL('../../public'+path,import.meta.url));}assert.ok(!/[♂♀]/.test(invoke(f,'status',mon)));}
});


test('actual all-PP-empty action selects typeless Struggle, spends no PP and applies native maxHP recoil',async()=>{
 for(const trainer of[486,1]){const team=await originalTrainerParty(data,trainer),player=fieldMon(19,10),f=fixture(team,[player]);for(const slot of player.moves)slot.pp=0;
  let selected:{kind:string;slot:number}|undefined;Reflect.set(f.battle,'actions',(action:{kind:string;slot:number})=>{selected=action;});invoke(f,'moveMenu');assert.deepEqual(selected,{kind:'move',slot:-1});
  const before=team[0].hp,userHP=player.hp,base=Math.floor(Math.floor((Math.floor(player.level*2/5)+2)*50*player.stats.atk/team[0].stats.def)/50)+2,expected=Math.max(1,Math.floor(base*93/100));
  await invoke(f,'attack',true,selected!.slot);assert.equal(before-team[0].hp,Math.min(before,expected));assert.equal(player.hp,userHP-Math.max(1,Math.floor(player.maxHP/4)));assert.ok(player.moves.every(slot=>slot.pp===0));assert.ok(f.events.includes('hit:false'));
 }
});
test('normal Curse runs speed/attack/defense in source order without cursing the opponent',async()=>{
 const player=fieldMon(79,1),team=await originalTrainerParty(data,486),f=fixture(team,[player]);await action(f,true,'MOVE_CURSE');assert.deepEqual(Reflect.get(f.battle,'playerStages'),{...freshStages(),speed:-1,atk:1,def:1});assert.equal(volatile(f,team[0]).status2&bit.curse,0);assert.deepEqual(f.messages.filter(text=>/fell|rose/.test(text)).map(text=>text.match(/(Speed|Attack|Defense)/)![1]),['Speed','Attack','Defense']);
});
test('actual all three Azalea Rival parties admit their native Gastly closure without forced victories',async()=>{
 for(const trainer of[1,266,269]){const team=await originalTrainerParty(data,trainer),f=fixture(team);await action(f,false,'MOVE_MEAN_LOOK');await action(f,false,'MOVE_SPITE');await action(f,false,'MOVE_CURSE');assert.ok(volatile(f,f.battle.player).status2&bit.meanLook);assert.ok(volatile(f,f.battle.player).status2&bit.curse);assert.equal(team[0].hp,team[0].maxHP-Math.floor(team[0].maxHP/2));}
});
test('failed FocusEnergy still records native TryMove history, and Rage masks the newly ported flags before acting',async()=>{
 const team=await originalTrainerParty(data,21),f=fixture(team);await action(f,false,'MOVE_FOCUS_ENERGY');await action(f,false,'MOVE_FOCUS_ENERGY');assert.equal(volatile(f,team[0]).previousMove,data.constants.MOVE_FOCUS_ENERGY);
 const mon=f.battle.player;Reflect.get(f.battle,'raging').add(mon);volatile(f,mon).status2=bit.rage|bit.focusEnergy|bit.curse|bit.meanLook|5;invoke(f,'prepareRageTurn',mon,sourceMove(mon,'MOVE_EMBER'));assert.equal(volatile(f,mon).status2,bit.rage);
});


test('player pivot after a natural KO excludes its new entrant from that defeated target’s EXP',async()=>{
 const team=await originalTrainerParty(data,486),pivot=fieldMon(123,30),reserve=fieldMon(),f=fixture(team,[pivot,reserve]);const move=data.moves[data.constants.MOVE_U_TURN];pivot.moves=[{id:move.id,pp:move.pp,maxPP:move.pp}];Reflect.set(f.battle,'partyMenu',()=>Reflect.get(f.battle,'actions')({kind:'switch',index:1}));const exp=reserve.exp,oldExp=pivot.exp;
 await invoke(f,'attack',true,0);assert.equal(team[0].hp,0);assert.equal(f.battle.player,reserve);assert.equal(Reflect.get(f.battle,'experienceMask'),1);await invoke(f,'gainExperience');assert.equal(reserve.exp,exp);assert.ok(pivot.exp>oldExp);
});
test('MeanLook escape bypasses preserve native zero-draw/zero-attempt branches',async()=>{
 for(const mode of['runaway','smokeball']){const team=await originalTrainerParty(data,1),player=fieldMon(mode==='runaway'?161:155),f=fixture(team,[player],()=>{throw Error('bypass must not draw');});if(mode==='smokeball')player.heldItem='ITEM_SMOKE_BALL';if(mode==='runaway')assert.equal(monAbility(data,player),'ABILITY_RUN_AWAY');volatile(f,player).status2=bit.meanLook;assert.equal(invoke(f,'trapped','escape'),false);assert.equal(invoke(f,'tryRun'),true);assert.equal(Reflect.get(f.battle,'fleeAttempts'),0);}
});
test('HP berries and ShedSkin are checked before poison; Klutz suppresses held recovery',async()=>{
 const team=await originalTrainerParty(data,21),metapod=team[2],f=fixture([metapod], [fieldMon(152)],()=>0);metapod.status='PSN';const hp=metapod.hp;await oneTurn(f,sourceMove(f.battle.player,'MOVE_REFLECT'),sourceMove(metapod,'MOVE_TACKLE'));assert.equal(metapod.status,'');assert.equal(metapod.hp,hp);
 const klutz=fieldMon(427);klutz.personality=(klutz.personality|1)>>>0;assert.equal(monAbility(data,klutz),'ABILITY_KLUTZ');klutz.heldItem='ITEM_ORAN_BERRY';klutz.hp=1;const held=fixture([team[0]],[klutz]);await invoke(held,'heldRecovery',klutz);assert.equal(klutz.hp,1);assert.equal(klutz.heldItem,'ITEM_ORAN_BERRY');
});
test('native no-print-gender battle predicate includes unnicknamed Nidoran and Eggs',()=>{
 for(const species of[29,32]){const mon=fieldMon(species),f=fixture([mon]);assert.ok(!/[♂♀]/.test(invoke(f,'status',{...mon,name:'Nidoran',hasNickname:false})));assert.ok(/[♂♀]/.test(invoke(f,'status',{...mon,name:'Nickname',hasNickname:true})));}const mon=fieldMon();assert.ok(!/[♂♀]/.test(invoke(fixture([mon]),'status',{...mon,isEgg:true})));
});


test('real Bugsy Sitrus can activate between DoubleKick hits, before the next hit animation',async()=>{
 let witnessed=false;
 for(const level of[24]){
  const team=await originalTrainerParty(data,21),player=fieldMon(29,level),f=fixture(team,[player]);assert.ok(data.learnsets[29].some(move=>move.move===data.constants.MOVE_DOUBLE_KICK&&move.level<=level));const move=data.moves[data.constants.MOVE_DOUBLE_KICK];player.moves=[{id:move.id,pp:move.pp,maxPP:move.pp}];
  let animations=0,heldBeforeSecond:string|null|undefined;Reflect.set(f.battle.view!,'attack',async()=>{if(++animations===2)heldBeforeSecond=team[0].heldItem;});
  for(let actionIndex=0;actionIndex<15&&team[0].hp>0&&team[0].heldItem;actionIndex++){animations=0;heldBeforeSecond=undefined;await invoke(f,'attack',true,0);if(heldBeforeSecond===null){witnessed=true;assert.ok(f.messages.some(text=>text.includes('Sitrus Berry')));break;}}
 }
 assert.ok(witnessed,'a legal native level/loadout must reach the between-hit HP threshold');
});

test('native mid-turn Supersonic self-hit clears a preceding Rage for WaterGun, preserving confusion next selection',async()=>{
 const team=await originalTrainerParty(data,1),zubat=team.find(mon=>mon.species===41)!,player=fieldMon(158,12),f=fixture([zubat],[player]);await action(f,true,'MOVE_RAGE');assert.ok(Reflect.get(f.battle,'raging').has(player));assert.ok(zubat.stats.speed>player.stats.speed);
 const draws=rawTape(0,2,0,0);Reflect.set(f.battle,'rng',draws.rng);const slot=sourceMove(player,'MOVE_WATER_GUN'),pp=player.moves[slot].pp;await oneTurn(f,slot,sourceMove(zubat,'MOVE_SUPERSONIC'));
 assert.equal(player.moves[slot].pp,pp);assert.equal(Reflect.get(f.battle,'raging').has(player),false);assert.equal(volatile(f,player).status2&bit.rage,0);assert.equal(volatile(f,player).status2&7,3);invoke(f,'prepareRageTurn',player,slot);assert.equal(volatile(f,player).status2&7,3,'next selection must not apply the obsolete Rage mask');
});
test('native no-target command39 skips Rage-clearing command37 while spending selected PP',async()=>{
 const team=await originalTrainerParty(data,1),zubat=team[1],player=fieldMon(158,12),f=fixture([zubat],[player]);await action(f,true,'MOVE_RAGE');assert.ok(Reflect.get(f.battle,'raging').has(player));
 // A literal terminal-state phase fixture, not a battle or victory injection.
 // Confusion self-KO can create this no-target boundary during a real turn.
 zubat.hp=0;const slot=sourceMove(player,'MOVE_WATER_GUN'),pp=player.moves[slot].pp;await invoke(f,'attack',true,slot);assert.equal(player.moves[slot].pp,pp-1);assert.ok(Reflect.get(f.battle,'raging').has(player));assert.equal(volatile(f,player).previousMove,0);
});
test('actual Wooper MudShot cannot damage Levitate Koffing/Gastly or apply its Speed drop',async()=>{
 const proton=await originalTrainerParty(data,486),rival=await originalTrainerParty(data,1);
 for(const target of[proton[1],rival[0]]){const player=fieldMon(194,9),f=fixture([target],[player]),tape=rawTape(0,1,0);Reflect.set(f.battle,'rng',tape.rng);assert.equal(monAbility(data,target),'ABILITY_LEVITATE');const hp=target.hp,slot=sourceMove(player,'MOVE_MUD_SHOT'),pp=player.moves[slot].pp;await invoke(f,'attack',true,slot);assert.equal(target.hp,hp);assert.equal(Reflect.get(f.battle,'enemyStages').speed,0);assert.equal(player.moves[slot].pp,pp-1);assert.equal(tape.calls,3,'immune move does not roll a secondary effect');assert.ok(!f.events.includes('hit:false'));}
});
test('native replacement type port retains raw Roost STAB and masks only Flying defender matchups',async()=>{
 const team=await originalTrainerParty(data,20),pidgeotto=team.find(mon=>mon.species===17)!,f=fixture([pidgeotto]);Reflect.get(f.battle,'roosting').add(pidgeotto);
 assert.deepEqual(invoke(f,'replacementTypeDamage',pidgeotto,f.battle.player,data.constants.MOVE_GUST,0,10),{damage:15,immune:false});
 const ground=invoke(f,'replacementTypeDamage',f.battle.player,pidgeotto,data.constants.MOVE_MUD_SLAP,0,10);assert.deepEqual(ground,{damage:10,immune:false});
});
test('native faint cleanup neutralizes stages before actual Bugsy stage2 replacement, unlike a live pivot',async()=>{
 const team=await originalTrainerParty(data,21),growler=fieldMon(152,12),geodude=fieldMon(74,12),f=fixture(team,[growler,geodude]);for(let i=0;i<6;i++)await action(f,true,'MOVE_GROWL');assert.equal(Reflect.get(f.battle,'enemyStages').atk,-6);await invoke(f,'switch',1);for(let i=0;i<6;i++)await action(f,true,'MOVE_DEFENSE_CURL');assert.equal(Reflect.get(f.battle,'playerStages').def,6);
 const scyther=team[0],slot=sourceMove(scyther,'MOVE_FOCUS_ENERGY');for(let turn=0;scyther.hp>0;turn++){assert.ok(turn<5);await oneTurn(f,sourceMove(geodude,'MOVE_ROCK_THROW'),slot);}
 assert.equal(f.battle.enemy.species,data.constants.SPECIES_METAPOD,'neutral source CalcMoveDamage scores Tackle above PoisonSting');assert.deepEqual(Reflect.get(f.battle,'enemyStages'),freshStages());
});
test('snap-out/normal confusion action does not require unsupported self-damage ability hooks',async()=>{
 for(const count of[1,2]){const mon=fieldMon(19,10);mon.personality=(mon.personality|1)>>>0;assert.equal(monAbility(data,mon),'ABILITY_GUTS');const team=await originalTrainerParty(data,486),f=fixture(team,[mon]);volatile(f,mon).status2=count;await action(f,true,'MOVE_QUICK_ATTACK');assert.ok(f.events.includes('attack:true'));}
});

test('Route32 Guts Rattata uses status-boosted raw Attack before stages, burn and native Reflect',async()=>{
 assert.ok(JSON.stringify(data.encounters.find(row=>row.map==='R32')).includes('SPECIES_RATTATA'));
 const team=await originalTrainerParty(data,1),bayleef=team.find(mon=>mon.species===153)!,rat=fieldMon(19,10);rat.personality=(rat.personality|1)>>>0;rat.status='BRN';const f=fixture([bayleef],[rat]);assert.equal(monAbility(data,rat),'ABILITY_GUTS');Reflect.set(f.battle,'noCritical',true);await action(f,false,'MOVE_REFLECT');
 Reflect.get(f.battle,'playerStages').atk=-1;const raw=Math.floor(rat.stats.atk*150/100),attack=Math.floor(raw*2/3),intermediate=Math.floor(Math.floor((Math.floor(rat.level*2/5)+2)*40*attack/bayleef.stats.def)/50),expected=Math.max(1,Math.floor(Math.floor((Math.floor(intermediate/2)+2)*93/100)*15/10));
 const hp=bayleef.hp;await action(f,true,'MOVE_QUICK_ATTACK');assert.equal(hp-bayleef.hp,expected);assert.equal(rat.status,'BRN');
});
test('actual Guts Rattata and Hustle Togepi confusion self-hits use native boosted Attack, including burn exceptions',async()=>{
 for(const species of[19,175])for(const status of['','BRN']as const){const mon=fieldMon(species,12);mon.personality=species===19?(mon.personality|1)>>>0:(mon.personality&~1)>>>0;mon.status=status;const team=await originalTrainerParty(data,486),f=fixture(team,[mon],rawTape(0,0).rng);assert.equal(monAbility(data,mon),species===19?'ABILITY_GUTS':'ABILITY_HUSTLE');volatile(f,mon).status2=2;Reflect.get(f.battle,'playerStages').atk=1;
  const boosted=species===175||status?Math.floor(mon.stats.atk*150/100):mon.stats.atk,atk=Math.floor(boosted*3/2);let expected=Math.floor(Math.floor((Math.floor(mon.level*2/5)+2)*40*atk/mon.stats.def)/50);if(status&&species!==19)expected=Math.floor(expected/2);expected+=2;const hp=mon.hp,slot=sourceMove(mon,species===19?'MOVE_QUICK_ATTACK':'MOVE_CHARM'),pp=mon.moves[slot].pp;await invoke(f,'attack',true,slot);assert.equal(hp-mon.hp,expected);assert.equal(mon.moves[slot].pp,pp);
 }
});
test('native Hustle physical accuracy truncates before the hit roll; legal special/status moves keep ordinary accuracy',async()=>{
 // Corsola is a literal GenIV ability/arithmetic fixture. This does not
 // assert it is naturally obtainable before Bugsy in the field host.
 const mon=fieldMon(222,1);mon.personality=(mon.personality&~1)>>>0;assert.equal(monAbility(data,mon),'ABILITY_HUSTLE');const target=fieldMon(79,10),miss=fixture([target],[mon],()=>.81),slot=sourceMove(mon,'MOVE_TACKLE'),pp=mon.moves[slot].pp,hp=target.hp;await invoke(miss,'attack',true,slot);assert.equal(target.hp,hp);assert.equal(mon.moves[slot].pp,pp-1);assert.ok(miss.messages.some(text=>text.includes('missed')));
 const special=fieldMon(223,5);special.personality=(special.personality&~1)>>>0;const f=fixture([fieldMon(79,10)],[special],rawTape(58983,1,0).rng);assert.equal(monAbility(data,special),'ABILITY_HUSTLE');await action(f,true,'MOVE_WATER_GUN');assert.ok(f.events.includes('hit:false'),'special accuracy100 is not reduced to80');
 const early=fieldMon(175,6);early.personality=(early.personality&~1)>>>0;const status=fixture(await originalTrainerParty(data,486),[early],()=>.9);await action(status,true,'MOVE_CHARM');assert.equal(Reflect.get(status.battle,'enemyStages').atk,-2,'native gift-compatible early Charm remains available');
});

test('real Bugsy U-turn triggers Route32 Mareep Static before withdrawing, exactly once on the outgoing Scyther',async()=>{
 assert.ok(JSON.stringify(data.encounters.find(row=>row.map==='R32')).includes('SPECIES_MAREEP'));const team=await originalTrainerParty(data,21),mareep=fieldMon(179,18),tape=rawTape(0,1,0,0),f=fixture(team,[mareep],tape.rng),scyther=team[0];await action(f,false,'MOVE_U_TURN');assert.notEqual(f.battle.enemy,scyther);assert.equal(scyther.status,'PAR');assert.equal(f.battle.enemy.status,'');assert.equal(tape.calls,4);const paralysis=f.messages.findIndex(text=>text.includes('Static paralyzed')),recall=f.messages.findIndex(text=>text.includes('went back'));assert.ok(paralysis>=0&&recall>paralysis);
});
test('native Static can trigger from a naturally fainted provider and does not exempt Ground/Electric recipients',async()=>{
 for(const species of[74,25]){const mon=fieldMon(species,species===74?30:13),target=fieldMon(179,6),tape=rawTape(0,1,0,2),f=fixture([target],[mon],tape.rng);const move=species===74?'MOVE_TACKLE':'MOVE_QUICK_ATTACK';assert.ok(data.learnsets[species].some(row=>row.move===data.constants[move]&&row.level<=mon.level));if(species===74){const row=data.moves[data.constants[move]];mon.moves=[{id:row.id,pp:row.pp,maxPP:row.pp}];}await action(f,true,move);assert.equal(mon.status,'PAR');assert.equal(tape.calls,4);if(species===74)assert.equal(target.hp,0,'the native on-hit ability does not require providerHP>0');}
});
test('Static coin is skipped for existing status/noncontact but consumed before Limber immunity',async()=>{
 const poisoned=fieldMon(19,10);poisoned.status='PSN';const target=fieldMon(179,18),tape=rawTape(0,1,0),f=fixture([target],[poisoned],tape.rng);await action(f,true,'MOVE_QUICK_ATTACK');assert.equal(tape.calls,3);assert.equal(poisoned.status,'PSN');
 const special=fieldMon(155,18),noncontact=rawTape(0,1,0,65535),g=fixture([fieldMon(179,18)],[special],noncontact.rng);await action(g,true,'MOVE_EMBER');assert.equal(noncontact.calls,4,'accuracy, crit, range and burn chance only');assert.equal(special.status,'');
 const persian=fieldMon(53,5);persian.personality=(persian.personality&~1)>>>0;assert.equal(monAbility(data,persian),'ABILITY_LIMBER');const immunity=rawTape(0,1,0,0),h=fixture([fieldMon(179,18)],[persian],immunity.rng);await action(h,true,'MOVE_SCRATCH');assert.equal(immunity.calls,4);assert.equal(persian.status,'');assert.ok(!h.messages.some(text=>text.includes('Static paralyzed')));
});
test('a first-hit Static cure can allow another native coin on the second DoubleKick hit',async()=>{
 const mon=fieldMon(29,9);mon.heldItem='ITEM_CHERI_BERRY';const target=fieldMon(179,24),tape=rawTape(0,1,0,0,1,0,0),f=fixture([target],[mon],tape.rng);let secondStatus:string|undefined;let animations=0;Reflect.set(f.battle.view!,'attack',async()=>{if(++animations===2)secondStatus=mon.status;});await action(f,true,'MOVE_DOUBLE_KICK');assert.equal(secondStatus,'');assert.equal(mon.heldItem,null);assert.equal(mon.status,'PAR');assert.equal(tape.calls,7);assert.equal(f.messages.filter(text=>text.includes('Static paralyzed')).length,2);
});
test('native NaturalCure clears U-turn Static before awaited party choice without consuming its unused Cheri',async()=>{
 // Celebi is a source-legal GenIV phase fixture, not an early acquisition.
 const mon=fieldMon(251,12);assert.ok((data.personal[251].tms as number[]).includes(89));mon.heldItem='ITEM_CHERI_BERRY';const move=data.moves[data.constants.MOVE_U_TURN];mon.moves=[{id:move.id,pp:move.pp,maxPP:move.pp}];const f=fixture([fieldMon(179,18)],[mon,fieldMon()],rawTape(0,1,0,0).rng);let awaited=false;Reflect.set(f.battle,'partyMenu',()=>{awaited=true;assert.equal(mon.status,'');assert.equal(mon.heldItem,'ITEM_CHERI_BERRY');Reflect.get(f.battle,'actions')({kind:'switch',index:1});});await invoke(f,'attack',true,0);assert.ok(awaited);assert.equal(mon.status,'');assert.equal(mon.heldItem,'ITEM_CHERI_BERRY');assert.ok(f.messages.some(text=>text.includes('Static paralyzed')));
});
test('native Static is not suppressed by attacker MoldBreaker, while active sunlight LeafGuard prevents its status after the coin',async()=>{
 const pinsir=fieldMon(127,1);pinsir.personality=(pinsir.personality|1)>>>0;assert.equal(monAbility(data,pinsir),'ABILITY_MOLD_BREAKER');const moldTape=rawTape(0,1,0,0),mold=fixture([fieldMon(179,18)],[pinsir],moldTape.rng);await action(mold,true,'MOVE_VICE_GRIP');assert.equal(pinsir.status,'PAR');assert.equal(moldTape.calls,4);
 for(const weather of['sun','clear']){const leafeon=fieldMon(470,1);assert.equal(monAbility(data,leafeon),'ABILITY_LEAF_GUARD');const tape=rawTape(0,1,0,0),f=fixture([fieldMon(179,18)],[leafeon],tape.rng);Reflect.set(f.battle,'weather',weather);await action(f,true,'MOVE_TACKLE');assert.equal(tape.calls,4);assert.equal(leafeon.status,weather==='sun'?'':'PAR');}
});
