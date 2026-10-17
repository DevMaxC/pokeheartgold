import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadData,createMon} from './data.ts';
import {originalTrainerParty} from './trainers.ts';
import {initialNativeVolatile,nativeStatus2 as bit,nativeBeforeTurnStatus2,nativeConfusionDuration,nativeConfusionCheck,nativeFocusEnergy,nativeCriticalMultiplier,nativeSpite,nativePreviousMove,nativeMeanLookOnLeave,nativePlayerMeanLookBlocks,nativeEnemyTrapBlocksEscape,nativeCurseKind,nativeGhostCurseCost,nativeCurseResidual,nativeNormalCurseChanges,nativeReflectStart,nativeReflectTick,nativeReflectIntermediate,nativePivotGate,nativePivotPhases} from './battle-volatiles.ts';
globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData(),root=new URL('../../../',import.meta.url),contract=JSON.parse(await readFile(new URL('../../reviews/native-azalea-volatile-contract.json',import.meta.url),'utf8'));
function noDraw():never{throw Error('This native branch must not consume RNG');}

test('historical contract pins native sources/data; all7 effects now have engine integration',async()=>{
  for(const source of contract.sources.filter((source:{path:string})=>source.path!=='browser/src/source/trainers.ts'))assert.equal(createHash('sha256').update(await readFile(new URL(source.path,root))).digest('hex'),source.sha256,source.path);
  const oldAdapter=contract.sources.find((source:{path:string})=>source.path==='browser/src/source/trainers.ts');assert.equal(createHash('sha256').update(await readFile(new URL('browser/reviews/native-mon-gender/trainers-before.ts.txt',root))).digest('hex'),oldAdapter.sha256);
  const cases=[['TRAINER_EXECUTIVE_PROTON_PROTON',49],['TRAINER_LEADER_BUGSY_BUGSY',47],['TRAINER_LEADER_BUGSY_BUGSY',228],['TRAINER_RIVAL_SILVER',100],['TRAINER_RIVAL_SILVER',106],['TRAINER_RIVAL_SILVER',109],['TRAINER_RIVAL_SILVER',65]]as const;
  for(const[key,effect]of cases){const party=await originalTrainerParty(data,data.constants[key]);assert.ok(party.some(mon=>mon.moves.some(move=>data.moves[move.id].effect===effect)),`${key}/${effect}`);}
  const engine=await readFile(new URL('browser/src/source/battle.ts',root),'utf8'),admitted=engine.match(/const implementedEffects=new Set\(\[([^\]]*)\]/)![1].split(',').map(Number);
  for(const effect of[49,47,228,100,106,109,65])assert.ok(admitted.includes(effect),'effect now has an actual integration fixture, separately reviewed from the historical pure contract');
});

test('native status2 bits and Rage masking retain only Rage before a non-Rage selection',async()=>{
  const source=await readFile(new URL('include/constants/battle.h',root),'utf8');for(const[name,shift]of[['FOCUS_ENERGY',20],['RAGE',23],['MEAN_LOOK',26],['CURSE',28]]as const)assert.match(source,new RegExp(`#define STATUS2_${name}\\s+\\(1 << ${shift}\\)`));
  const flags=bit.rage|bit.focusEnergy|bit.curse|bit.meanLook|5;assert.equal(nativeBeforeTurnStatus2(flags,33,99),bit.rage);assert.equal(nativeBeforeTurnStatus2(flags,0,99),bit.rage,'accepted non-Fight actions select MOVE_NONE');assert.equal(nativeBeforeTurnStatus2(flags,99,99),flags);assert.equal(nativeBeforeTurnStatus2(bit.focusEnergy|3,0,99),bit.focusEnergy|3);
});

test('Supersonic duration uses raw modulo and attacker confusion decrements before a50percent low-bit check',()=>{
  assert.deepEqual([0,1,2,3,4,65535].map(raw=>nativeConfusionDuration(()=>raw)),[2,3,4,5,2,5]);
  assert.deepEqual(nativeConfusionCheck(bit.focusEnergy,noDraw),{status2:bit.focusEnergy,outcome:'none'});assert.deepEqual(nativeConfusionCheck(bit.focusEnergy|1,noDraw),{status2:bit.focusEnergy,outcome:'snapped-out'});
  assert.deepEqual(nativeConfusionCheck(bit.focusEnergy|3,()=>2),{status2:bit.focusEnergy|2,outcome:'self-hit'});assert.deepEqual(nativeConfusionCheck(5,()=>65535),{status2:4,outcome:'act'});
  let turns=5,checks=0;for(let attempt=0;attempt<5;attempt++){const next=nativeConfusionCheck(turns,()=>{checks++;return 1;});turns=next.status2;if(attempt===4)assert.equal(next.outcome,'snapped-out');}assert.equal(checks,4);assert.equal(turns,0);
  assert.throws(()=>nativeConfusionDuration(()=>.5),RangeError);assert.throws(()=>nativeConfusionCheck(2,()=>65536),RangeError);
});

test('FocusEnergy boosts native critical stage by2 without stacking and armor still consumes the critical draw',()=>{
  const focus=nativeFocusEnergy(3);assert.deepEqual(focus,{status2:bit.focusEnergy|3,applied:true});assert.equal(nativeFocusEnergy(focus.status2).applied,false);
  const context={blocked:false,sniper:false};assert.equal(nativeCriticalMultiplier(0,0,()=>4,context),1);assert.equal(nativeCriticalMultiplier(focus.status2,0,()=>4,context),2);assert.equal(nativeCriticalMultiplier(focus.status2,1,()=>3,context),2);assert.equal(nativeCriticalMultiplier(focus.status2,99,()=>2,{...context,sniper:true}),3);
  let calls=0;assert.equal(nativeCriticalMultiplier(focus.status2,0,()=>{calls++;return 0;},{blocked:true,sniper:true}),1);assert.equal(calls,1);
});

test('Spite targets the first native matching TryMove-recorded move, caps at remaining PP and preserves other slot data',async()=>{
  const gastly=(await originalTrainerParty(data,data.constants.TRAINER_RIVAL_SILVER))[0];assert.equal(gastly.species,data.constants.SPECIES_GASTLY);assert.ok(gastly.moves.some(move=>move.id===data.constants.MOVE_SPITE));
  const player=createMon(data,152,18,'Ethan',()=>.5),move=player.moves.at(-1)!,before=structuredClone(player.moves);move.pp=2;before[before.length-1].pp=2;
  const result=nativeSpite(player.moves,move.id)!;assert.equal(result.slot,player.moves.length-1);assert.equal(result.lost,2);assert.equal(result.moves[result.slot].pp,0);assert.equal(result.moves[result.slot].maxPP,move.maxPP);assert.deepEqual(player.moves,before);
  assert.equal(nativeSpite(player.moves,0),null);assert.equal(nativeSpite(player.moves,0xffff),null);assert.equal(nativeSpite([{id:33,pp:0,maxPP:35}],33),null);assert.equal(nativeSpite([{id:33,pp:9,maxPP:35},{id:33,pp:7,maxPP:35}],33)!.slot,0);
  assert.equal(nativePreviousMove(move.id,33,{noMoveSet:false,moveSucceededFlag:false}),0);assert.equal(nativePreviousMove(move.id,33,{noMoveSet:false,moveSucceededFlag:true}),33);assert.equal(nativePreviousMove(move.id,33,{noMoveSet:true,moveSucceededFlag:false}),move.id);
  for(const outcome of['miss','effect-script-failure']){const recorded=nativePreviousMove(0,move.id,{noMoveSet:false,moveSucceededFlag:true});assert.equal(recorded,move.id,outcome);assert.equal(nativeSpite(player.moves,recorded)!.lost,2,outcome);}
  for(const outcome of['full-paralysis','confusion-self-hit','flinch'])assert.equal(nativeSpite(player.moves,nativePreviousMove(move.id,33,{noMoveSet:false,moveSucceededFlag:false})),null,outcome);
});

test('MeanLook retains native single-battler provenance and its switch versus escape bypasses differ',()=>{
  const trapped={status2:bit.meanLook|bit.curse|3,meanLookSource:1,previousMove:33},source={status2:bit.focusEnergy,meanLookSource:0,previousMove:212},before=structuredClone([trapped,source]);
  assert.deepEqual(nativeMeanLookOnLeave([trapped,source],1),[{...trapped,status2:bit.curse|3},initialNativeVolatile()]);assert.deepEqual(nativeMeanLookOnLeave([trapped,source],0),[initialNativeVolatile(),source]);assert.deepEqual([trapped,source],before);
  for(const unsupported of[bit.bind,1<<16])assert.throws(()=>nativeMeanLookOnLeave([{...trapped,status2:trapped.status2|unsupported},source],1),/Unsupported native Attract\/Bind/);
  assert.equal(nativeEnemyTrapBlocksEscape(bit.meanLook),true);assert.equal(nativeEnemyTrapBlocksEscape(bit.bind),true);assert.equal(nativeEnemyTrapBlocksEscape(0),false);
  const flags={shedShell:false,smokeBall:false,runAway:false,noExperienceBattle:false};assert.equal(nativePlayerMeanLookBlocks(trapped.status2,'switch',flags),true);assert.equal(nativePlayerMeanLookBlocks(trapped.status2,'switch',{...flags,runAway:true}),true);assert.equal(nativePlayerMeanLookBlocks(trapped.status2,'switch',{...flags,shedShell:true}),false);assert.equal(nativePlayerMeanLookBlocks(trapped.status2,'escape',{...flags,shedShell:true}),true);for(const key of['runAway','smokeBall','noExperienceBattle'])assert.equal(nativePlayerMeanLookBlocks(trapped.status2,'escape',{...flags,[key]:true}),false);
});

test('actual rival Ghost Curse uses current types, integer half sacrifice and quarter residual with MagicGuard immunity',async()=>{
  const gastly=(await originalTrainerParty(data,data.constants.TRAINER_RIVAL_SILVER))[0],ghost=data.constants.TYPE_GHOST;assert.equal(nativeCurseKind(data.personal[gastly.species].types.map(key=>data.constants[key]),ghost),'ghost');assert.equal(nativeCurseKind([data.constants.TYPE_GRASS],ghost),'normal');assert.equal(nativeCurseKind([data.constants.TYPE_NORMAL,ghost],ghost),'ghost');
  assert.equal(nativeGhostCurseCost(41),20);assert.equal(nativeGhostCurseCost(1),1);assert.equal(Math.max(0,7-nativeGhostCurseCost(41)),0,'sacrifice can faint the user');assert.equal(nativeCurseResidual(41,false),10);assert.equal(nativeCurseResidual(1,false),1);assert.equal(nativeCurseResidual(41,true),0);assert.deepEqual(nativeNormalCurseChanges,[['speed',-1],['atk',1],['def',1]]);
});

test('Reflect activation counts its own turn, never refreshes and modifies the physical pre+2 intermediate',()=>{
  assert.deepEqual(nativeReflectStart(0,0),{applied:true,turns:5});assert.deepEqual(nativeReflectStart(0,3),{applied:true,turns:8});assert.deepEqual(nativeReflectStart(2,3),{applied:false,turns:2});let turns=5;for(let end=1;end<=5;end++){const result=nativeReflectTick(turns);turns=result.turns;assert.equal(result.expired,end===5);}assert.deepEqual(nativeReflectTick(0),{turns:0,expired:false});assert.throws(()=>nativeReflectStart(0,4),/Unsupported native screen/);assert.throws(()=>nativeReflectTick(9),RangeError);
  const context={active:true,physical:true,criticalMultiplier:1,removesScreens:false,doubleBattleTwoTargets:false};assert.equal(nativeReflectIntermediate(15,context)+2,9);assert.notEqual(nativeReflectIntermediate(15,context)+2,Math.floor((15+2)/2));for(const changed of[{physical:false},{criticalMultiplier:2},{removesScreens:true},{active:false}])assert.equal(nativeReflectIntermediate(15,{...context,...changed}),15);assert.equal(nativeReflectIntermediate(15,{...context,doubleBattleTwoTargets:true}),10);
});

test('actual Bugsy Uturn has usable reserves but its pure gate does not claim an executed pivot or victory',async()=>{
  const team=await originalTrainerParty(data,data.constants.TRAINER_LEADER_BUGSY_BUGSY);assert.equal(team[0].species,data.constants.SPECIES_SCYTHER);assert.ok(team[0].moves.some(move=>move.id===data.constants.MOVE_U_TURN));const reserve=team.slice(1).some(mon=>!mon.isEgg&&mon.hp>0);assert.equal(reserve,true);assert.equal(nativePivotGate(1,reserve),'continue');assert.equal(nativePivotGate(0,reserve),'battle-over');assert.equal(nativePivotGate(1,false),'no-reserve');
  assert.ok(nativePivotPhases.indexOf('ability-on-hit')<nativePivotPhases.indexOf('pursuit'));assert.ok(nativePivotPhases.indexOf('pursuit')<nativePivotPhases.indexOf('party-selection'));assert.equal(nativePivotPhases.at(-1),'hazards');assert.throws(()=>nativeMeanLookOnLeave([initialNativeVolatile(),initialNativeVolatile(),initialNativeVolatile()],0),/single-battle/);
});


test('Spite history records native MOVE_SUCCEEDED before later miss/effect failure, with FAIL mask provenance kept exact',async()=>{
  const controller=await readFile(new URL('src/battle/battle_controller_player.c',root),'utf8'),constants=await readFile(new URL('include/constants/battle.h',root),'utf8'),start=controller.indexOf('static void BattleControllerPlayer_TryMove(BattleSystem *battleSystem, BattleContext *ctx) {'),end=controller.indexOf('static void BattleControllerPlayer_CheckMoveHit(',start),tryMove=controller.slice(start,end);
  assert.ok(tryMove.indexOf('BATTLE_STATUS2_MOVE_SUCCEEDED;')<tryMove.indexOf('ReadBattleScriptFromNarc(ctx, NARC_a_0_0_0, ctx->moveNoCur)'));assert.ok(end>start);
  assert.match(constants,/#define MOVE_STATUS_DID_NOT_HIT[^\n]*MOVE_STATUS_MISSED/);assert.match(constants,/#define MOVE_STATUS_FAIL\s+\(MOVE_STATUS_DID_NOT_HIT/);
  // FAIL does include MISSED. History persists because TryMove flags the move
  // before that later result, not because the native failure mask excludes it.
  const history=controller.slice(controller.indexOf('static void BattleControllerPlayer_UpdateMoveHistory(BattleSystem *battleSystem, BattleContext *ctx) {'),controller.indexOf('static void BattleControllerPlayer_ActionEnd(BattleSystem *battleSystem, BattleContext *ctx) {'));assert.match(history,/if \(ctx->battleStatus2 & BATTLE_STATUS2_MOVE_SUCCEEDED\)/);
  assert.match(tryMove,/ctx->commandNext = CONTROLLER_COMMAND_24;/);assert.match(controller,/\[CONTROLLER_COMMAND_24\] = BattleControllerPlayer_CheckMoveHit/);
  const hit=controller.slice(end,controller.indexOf('static void BattleControllerPlayer_DirectSideEffect(BattleSystem *battleSystem, BattleContext *ctx) {',end));assert.match(hit,/BattleSystem_CheckMoveHit\(battleSystem, ctx,/);
  const util=await readFile(new URL('src/battle/battle_util.c',root),'utf8'),reset=Number.parseInt(util.match(/ctx->battleStatus2 &= (0x[0-9A-F]+);/)![1]);assert.equal(reset,0xFFFFFEA1);assert.match(constants,/#define BATTLE_STATUS2_MOVE_SUCCEEDED\s+\(1 << 6\)/);assert.equal(reset&(1<<6),0,'per-action reset removes the previous TryMove flag before an early status return');
});

test('both additional actual Azalea rival variants contain the source volatile move set',async()=>{
  for(const key of['TRAINER_RIVAL_SILVER_7','TRAINER_RIVAL_SILVER_10']){const party=await originalTrainerParty(data,data.constants[key]),effects=new Set(party.flatMap(mon=>mon.moves.map(move=>data.moves[move.id].effect)));for(const effect of[49,100,106,109])assert.ok(effects.has(effect),`${key}/${effect}`);}
});

test('actual3bit Reflect packing and sole LightClay modifier match logical5/8turn expiry and reject refresh',async()=>{
  const header=await readFile(new URL('include/battle/battle.h',root),'utf8'),bits=Number(header.match(/reflectTurns\s*:\s*(\d+)/)![1]);assert.equal(bits,3);const donors=data.items.filter(item=>item.holdEffect==='HOLD_EFFECT_EXTEND_SCREENS');assert.deepEqual(donors.map(item=>[item.item,Number(item.holdEffectParam)]),[['ITEM_LIGHT_CLAY',3]]);
  for(const extension of[0,3]){let packed=(5+extension)&7,logical=nativeReflectStart(0,extension).turns,active=true;assert.equal(nativeReflectStart(logical,extension).applied,false,'active screen never refreshes even when native packed counter is0');for(let turn=1;turn<=5+extension;turn++){packed=(packed-1)&7;active=packed!==0;const next=nativeReflectTick(logical);logical=next.turns;assert.equal(next.expired,!active);assert.equal(logical,active?packed:0);}}
});

test('all15 pivot protocol phases follow the pinned native0175 and ShowParty010 source sequence',async()=>{
  const pivot=await readFile(new URL('files/battledata/script/subscript/subscript_0175_PivotMove.s',root),'utf8'),party=await readFile(new URL('files/battledata/script/subscript/subscript_0010_ShowParty.s',root),'utf8'),source=pivot+'\n'+party;
  const mapping=[['opponent-blackout','CheckBlackOut'],['user-reserve','TryReplaceFaintedMon'],['ability-on-hit','TriggerAbilityOnHit'],['held-item-on-pivot','TriggerHeldItemOnPivotMove'],['destiny-bond','STATUS2_DESTINY_BOND'],['grudge','TryGrudge'],['attacker-alive','CompareMonDataToValue OPCODE_EQU, BATTLER_CATEGORY_ATTACKER, BMON_DATA_HP, 0'],['recall-message','PrintMessage msg_0197_01067'],['pursuit','Call BATTLE_SUBSCRIPT_PURSUIT'],['attacker-alive-after-pursuit','CompareMonDataToValue OPCODE_EQU, BATTLER_CATEGORY_ATTACKER, BMON_DATA_HP, 0'],['status-on-switch','TryRestoreStatusOnSwitch'],['withdraw-animation','DeletePokemon'],['party-selection','GoToSubscript BATTLE_SUBSCRIPT_SHOW_PARTY_LIST'],['switch-and-update','SwitchAndUpdateMon'],['hazards','Call BATTLE_SUBSCRIPT_HAZARDS_CHECK']];let cursor=0;
  for(const[phase,opcode]of mapping){const at=source.indexOf(opcode,cursor);assert.ok(at>=cursor,phase);cursor=at+opcode.length;}assert.deepEqual([...nativePivotPhases],mapping.map(([phase])=>phase));
  const controller=await readFile(new URL('src/battle/battle_controller_player.c',root),'utf8');assert.match(controller,/CalcMoveDamage\(battleSystem, ctx, MOVE_STRUGGLE, 0, 0, 40, 0, ctx->battlerIdAttacker, ctx->battlerIdAttacker, 1\)/,'confusion passes no screen/weather field condition');
});
