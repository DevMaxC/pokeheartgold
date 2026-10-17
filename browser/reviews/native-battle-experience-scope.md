# Native single-battle experience reward helper

Base:5b7ac9fb4a8373e164f95d33024ec1135722d082. This patch owns only
`battle-experience.ts`, fixtures and review evidence. The parent integrates it
into `Battle.gainExperience`; no battle/main/world/types code is changed here.

`nativeExperienceReward(context,recipient)` returns `{amount,boosted}` without
mutating party data. Its explicit inputs preserve the native order in
`battle_command.c:BtlCmd_CalcExpGain` and `Task_GetExp`:

1. Floor base EXP yield*defeated level/7.
2. If there are living Exp. Share holders, floor the total in half, then
   separately divide each half by its participant/holder count. Otherwise
   divide the full total by participant count. Each nonempty pool has minimum1.
3. Sum participant and held-share portions for a recipient eligible for both.
4. Apply and truncate Lucky Egg150/100, Trainer150/100, then traded same-language
   150/100 or foreign-language170/100. The order matters: PidgeyLv3 base23 gives
   34,51,86 with LuckyEgg/Trainer/foreign bonuses, not a combined float87.

Living level100 participants/holders still count in the divisors, but receive
no EXP. Fainted, absent, Egg, nonparticipant/nonholder, level100 and disabled
EXP recipients return0. Eggs cannot legally be battle participants or hold
Exp. Share; the helper explicitly preserves that invariant for browser saves.
Unknown/zero participant denominators throw rather than inventing a reward.
The zero-living-participant case is outside this normal single-battle helper.

Integration for the current one-participant/no-share arithmetic case, ONLY
when no other living mon participated and switched out against this enemy:

```ts
const reward=nativeExperienceReward({
  baseYield:base.expYield,defeatedLevel:this.enemy.level,
  trainerBattle:this.trainer!==null,experienceEnabled:true,
  participantCount:1,expShareCount:0,
},{
  species:mon.species,hp:mon.hp,level:mon.level,isEgg:mon.isEgg,
  participated:true,heldEffect:'HOLD_EFFECT_NONE',ownership:'player',
});
if(!reward.amount)return; // Native also skips EVs and EXP text for this case.
mon.exp+=reward.amount;
// Retain existing level-up/move/3D presentation host behavior.
```

When real context exists, pass actual native item `holdEffect` from exported
item data (`ITEM_EXP__SHARE` has two underscores), explicit source participant
flags and living holder counts. LuckyEgg is `HOLD_EFFECT_EXP_UP`. A participating
holder gets both halves. Do not replace participant tracking with the current
active slot and call it complete sharing. This helper provides the arithmetic;
switching/participation masks, party reward iteration and recipient level-up
presentation are still integration work.

One active mon does not establish one participant: Cyndaquil can act against a
Route29 PidgeyLv3, switch out alive, and a second mon can finish it. Native
splits23 into11 for each, whereas the current browser's finisher-only path gives
23 to the second mon. This preexisting switching behavior is not fixed by the
helper or recipe. A complete loop must maintain per-enemy participation flags,
reset them for each new opponent, include each switch-in, count only living
flagged members, then award each eligible recipient. Calculate every recipient's
reward before mutating party data so a later context error cannot partially
award the party. No-award paths return0 before divisor validation because they
do not use those divisors; they are not a context validation preflight.

`BattleSystem_IsPlayerOT` compares OT ID, OT gender AND OT name. Only a failed
ownership match enables the trade bonus; foreign language changes that bonus
to170/100. Existing legacy `mon.ot` name alone cannot prove a trade. The helper
therefore requires explicit ownership classification. An own-OT mon in a
different language does not receive a trade boost.
Current browser starter/gift/capture acquisitions are intended to be owned by
the player and no native trades are implemented, so the parent may explicitly
use `ownership:'player'` for that bounded path. This does not reconstruct missing
legacy OT ID/gender/language provenance.

The caller supplies `experienceEnabled=false` for non-enemy or native no-EXP
battles (link/Safari/Frontier/PalPark). The parent must retain the native
`Pokemon_TryLevelUp` cumulative EXP cap at its species growth-table level100
limit. The returned amount is the announced award, before that cumulative cap.
EV calculation/modifiers, evolution, doubles/multi-partner participant routing,
trade provenance reconstruction and a complete Exp. Share battle loop are not
implemented by this helper and are not claimed complete.

Fixtures use actual Rattata/Pidgey yields, Abe and Falkner exported parties,
real LuckyEgg/Exp.Share effects, native split/bonus rounding, no-award guards
and purity. The MagikarpLv1 low-pool fixture is a canonical-species arithmetic
boundary, not a claimed native field encounter.
