# Rage before-turn and fixed two-hit corrections

The independent review of implementation `0c2abf7a8fc403d900f0de6e48c6edd1edfd2c44` found a concrete omitted interaction in the new Rage implementation. This is a corrective implementation receipt, not a claim of independent final approval or rendered playthrough validation. The earlier Opus reviews remain unchanged, including their incorrect assumption that no other status2-style volatiles were represented in the port.

## Native evidence

`BattleControllerPlayer_BeforeTurn` (`src/battle/battle_controller_player.c:753`) applies literal `status2 &= STATUS2_RAGE` when a raging battler selects another move. This preserves Rage and removes the other status2 bits. Foresight and Defense Curl are already represented by the port's `identified` and `curled` sets: native `subscript_0100_Foresight.s`, `effect_script_0156.s`, and `include/constants/battle.h:347` identify those exact flags. Removing the Curl flag preserves the previously gained Defense stage.

`GetBattlerSelectedMove` (`src/battle/battle_util.c:2451`) returns NONE for Bag, Run and Pokémon actions. Normal Fight selection supplies its actual move slot. The no-PP path (`battle_controller_player.c:374`) marks Struggle without assigning a new slot, while `FightInput:1683` chooses the executing Struggle later. Neither `BattleContext_Init` nor `BattleBuffer_Clear` resets the previous move slot. An immediate last-PP Rage→Struggle therefore retains Rage as the before-turn selected move, then clears Rage after Struggle executes.

Trainer-run rejection remains in the selection screen and does not reach before-turn processing. The port's rejected/no-effect item choices similarly consume no turn. Accepted non-move actions mask the other flags but preserve Rage; actual switching clears all outgoing volatiles.

## Concrete legal fixture

A level 20 Dunsparce can know Rage, Defense Curl and Glare naturally, plus TM32 Double Team; Sentret learns Foresight at level 1. After Double Team, Defense Curl, Rage and the foe's Foresight, the slower raging Dunsparce selects Glare. Its Foresight/Curl flags must clear before the faster Sentret's Tackle, while Rage remains active until Glare executes. With roll 90, the old port hit and built Rage, incorrectly ignoring the existing +1 evasion. Native Tackle 95×75/100 truncates to 71%, so that roll misses. The new regression exercises this outcome for both player and enemy roles, including repeat-Rage retention and sleeping/inability to act.

The pre-existing port compares a fractional 71.25 threshold rather than native integer 71 for that exact accuracy case. Its integer 0–99 roll accepts 72 values rather than native 71 of 100. The regression uses 90, which unambiguously misses under both computations. This patch deliberately does not change unrelated general accuracy rounding.

## Resulting implementation and limits

Normal Fight selections now prepare both battlers before either attack. This masks only already-ported Foresight/Defense Curl flags when Rage is active and a different move is selected. It never removes Rage at selection; existing after-move cleanup still clears Rage after a different move runs, including misses/failures, while inability to act preserves Rage. Accepted player non-Fight actions prepare those flags before their presentation/consumption; rejected choices keep them. The existing lazy opponent selection timing on item/run/switch paths is retained, with opponent preparation before its attack, avoiding an unrelated RNG reordering. Those flags do not affect the currently implemented preceding item/run/switch effects.

Move-slot history is battle-local, removed on outgoing switches, and cleared on battle completion/error/start. It supports the bounded native last-PP Rage→Struggle case. Native Bag actions repurpose the selection field as a packed BattleItem; the port invalidates move-slot history there instead of emulating subsequent out-of-range C reads as a move. No memory-garbage semantics, obedience, Encore/locked moves, transformations, Fly execution or double battles are newly claimed.

The earlier effect29 multi-hit, Roost, Gust's explicit Fly damage context and field-weather Synthesis logic showed no additional new defect in this read-only native comparison. Pure-Flying replacement rules from later generations are not imposed on the native GenIV Roost routine, which skips Flying matchup entries. Fly execution and broader weather/held/contact systems remain outside this feature.

## Fixed two-hit interaction

The review also found that inherited effect 44 (Double Kick and other fixed two-hit moves) used one damage calculation multiplied by two. That representation gave the newly implemented Rage only one boost and one damage/critical roll. Native `files/battledata/script/effect_script/effect_script_0044.s` explicitly uses `SetMultiHit 2, MULTIHIT_MULTI_HIT_MOVE`, followed by critical and damage calculations for each hit. The parent explicitly authorized this narrow correction alongside Rage masking.

Effect 44 now uses the existing multi-hit loop with a fixed count of two. It spends PP and checks accuracy once, makes independent critical/damage rolls, stops if the first hit faints its target, builds Rage after each surviving damaging hit, reports the actual hit count and invokes the 3D attack/hit callbacks for each hit. It does not draw a random hit count or use Skill Link's five-hit selection.

Native Nidoran♀ Double Kick fixtures check two different critical/damage rolls, PP and random draw counts, one-hit faint stopping and callbacks. A Totodile Rage fixture checks two Attack boosts and the existing +6 cap. No transformed species, unsupported Fly state, double battle or illegal Skill Link combination is needed for these regressions.

## Validation

Focused battle tests: 26/26 passed (`node --experimental-transform-types --test src/source/early-battle-effects.test.ts src/source/battle.test.ts`). Full `npm test`: 187/187 passed, no skipped tests. `npx tsc --noEmit` and `git diff --check`: passed. Logs are `/tmp/hg-early-effects-rage-fixedtwo-targeted.log`, `/tmp/hg-early-effects-rage-fixedtwo-full-tests.log` and `/tmp/hg-early-effects-rage-fixedtwo-tsc.log`.

Verified source SHA-256 values:

- `browser/src/source/battle.ts`: `dff4235915179ad68f4a058dfcf06a5b22bb481db06798e7db729f0d71940659`
- `browser/src/source/early-battle-effects.test.ts`: `33460f294c73498ffb6da414c40eb13dd23b96211e79785b7ae294247e8f8c4e`

No production build, browser operation or rendered validation was performed by this agent. The parent retains final review and build responsibility.
