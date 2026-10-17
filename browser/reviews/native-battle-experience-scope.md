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
An inconsistent flagged recipient with zero living participants throws. The
party planner can have zero living participants and living share-only holders;
their unused participant pool is skipped and their actual shared-half award is
calculated without inventing a denominator.

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
arithmetic helper or recipe. A complete loop must maintain per-enemy participation flags,
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

## Party planning extension

`planNativeExperience(context,party,participationMask,data.items)` now provides
the complete arithmetic party plan for ONE fainted enemy in a single battle.
Each supplied slot carries explicit ownership and its original `heldItem` key;
the planner resolves `holdEffect` through the actual exported item records.
Unknown items/effects, missing ownership, invalid masks/slots and invalid common
context fail before any party mutation. The returned plan contains the native
living participant/holder counts and `{index,amount,boosted}` for every slot.
It does not change the supplied party, flags, EXP, HP, EVs, levels or items.

The planner consumes the real per-enemy party-slot bitset. It counts living
non-Egg members, including level100. It awards both portions to a flagged share
holder, only the shared portion to an unflagged holder, and nothing to fainted,
Egg, absent, unflagged/nonholder or level100 recipients. In particular a living
level100 member still divides its pool even though its payout is0. Excluding
Eggs is an explicit legal-game invariant: native Eggs cannot be sent into battle
or hold an item, rather than a claim about forged native Egg participation bits.

Zero living participants can occur after a recoil KO while an inactive share
holder lives. The source share payout remains floor(floor(total/2)/holderCount),
minimum1. Native MSL signed/unsigned division helpers in
`lib/MSL_C/src/msl_fp_runtime.c:2599` and`:2732` return the numerator for division
by0; the unused participant pool therefore does not trap. No living flagged
recipient consumes that pool. This planner skips only that unconsumed pool;
it neither fabricates an active participant nor redistributes the full total.

Root host wiring, matching `BattleSystem_Set/ClearExperienceEarnFlags` and
the player/enemy switch-in branches in `battle_command.c`:

1. At battle start create a fresh participant set for this enemy containing the
   first actual player send-out. Store mon identity or stable party-slot bits.
2. On every successful player switch-in, add that mon to the same enemy's set.
   Keep earlier bits when members faint; the planner filters current HP.
3. At enemy fainting, convert actual identities to the current party-slot mask.
   Map all party entries to explicit ownership (currently intended own
   acquisitions use `'player'`), then compute ONE complete plan with actual
   `data.items`. Do this before changing EXP or starting asynchronous messages.
4. For each positive award in slot order, use that slot's mon, display the
   amount/boosted wording, and apply the existing EV/level/stat/learn-move flow.
   Cap cumulative EXP at its own growth table's level100 limit as native
   `Pokemon_TryLevelUp` does. Do not use `this.player` for inactive recipients.
5. When the next enemy is sent out, clear the old set and seed it with the
   currently sent-out player mon. Reset all participation state on battle end,
   abort and new battle. A forced switch after a faint adds its entrant normally.

Native `SetExperienceEarnFlags` checks that the ENEMY is alive, but does not
check HP of the currently selected player slot. Preserve that selected slot's
bit even if fainted when a new enemy arrives, then add its forced replacement.
The planner filters HP at award time. A later Revive can therefore restore the
old selected member's eligibility without another send-out. The current host
loop introduces the next enemy before handling the fainted player's switch;
seeding only living members at that point would lose this native bit.

The pure planner deliberately does not own tracking or UI callbacks. The root
must wire those hooks before calling the runtime switch/Exp.Share behavior
complete. Doubles/multi-partner routing, EV modifiers, evolution and missing
legacy trade provenance remain separate work.
