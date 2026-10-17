# Native action-end final review

## Actual provider result

**Verdict:** I found no confirmed issue within scope. In this browser's modeled single battles, v3's pre-effect no-target predicate matches the native code everywhere it matters. The N2 fix is complete, and N1, F1, F2 and the 514 fixes still hold. I only read files: no tests, TypeScript, build, browser or native ROM. The 108/108 and TypeScript results are as you reported, and nothing here has been checked in a rendered browser or on the ROM.

## What I checked against native

**1. Native order before the effect runs** (`battle_controller_player.c:2647–2715`)
- The native order is: attacker status (`:2654`) → disobedience (`:2663`, a declared trades gap) → PP (`:2685`) → `TryNoTargetScript` (`:2691`) → Magic Coat/Snatch, which return early when there is no target (`:2601`) → redirect → effect script (`:2711`).
- The browser matches the modeled part: flinch/sleep/freeze/paralysis (`battle.ts:152-155`) → unsupported-effect check (`:162`) → PP (`:163`) → "used X!" (`:164`) → no-target message (`:168`).
- `subscript_0281_NoTarget.s` prints the attack message, then `msg_0197_01234`, whose text "But there was no target..." matches `battle.ts:168` exactly. It then unlocks the move choice and clears Rage unless the move is Rage. The `finally` at `battle.ts:208` does the same (effect 81 is Rage).
- The rollback throw at `:162` comes before PP, outside `try`, so a rejected battle never leaves a no-target action half-done.
- `DeductPP` (`:2043-2063`) doesn't depend on there being a target. A zero-PP selected slot can't be reached in the browser: the player can't pick one, `chooseEnemyMove` filters them out, and a newly learned move has full PP.

**2. First no-target check** (`:2073-2079`)
- Literally: no target and either not a charge-class move, or the user is locked in, or the charge-move-hit flag is set.
- The browser models neither of the last two states, so leaving out the whole charge class is the only faithful choice. That is what `battle.ts:20,161` does.
- Sun/Cloud Nine/Air Lock and Power Herb (`:2081-2087`) only change the redirect-to-user step, which only runs when the first check returned FALSE. The second check at `:2723` only happens after the charge script has run, so keeping these moves unsupported is correct.

**3. Charge class** (`battle_util.c:2544-2558`)
- The ten `case` labels map through `move_effects.h` to 26/39/75/145/151/155/255/256/263/272, exactly the runtime set.
- In the move data, Bide is self-target (16). The other nine are target 0 or 4, so all nine would have wrongly taken the bypass before v3.

**4. Target resolver** (`battle_util.c:1357-1479`, singles)

| Range | Native result | Browser |
|---|---|---|
| 0 SINGLE_TARGET | Final else branch, HP-checked; Follow Me doesn't apply in singles | No target when the foe has fainted |
| 2 RANDOM_OPPONENT | HP-checked (`:1459`) | No target when the foe has fainted |
| 4 ADJACENT_OPPONENTS | HP-checked loop | No target when the foe has fainted |
| 8 ALL_ADJACENT | HP-checked loop | No target when the foe has fainted |
| 1, 16, 32, 64 | User (`:1419`) | Target remains |
| 256 ALLY, 512 SINGLE_TARGET_USER_SIDE | User in singles | Target remains |
| 128 OPPONENT_SIDE | `battlerId ^ 1` with no HP check (`:1417`, `:3571`) | Target remains |
| 1024 FRONT, reselected (`a4 == 1`) | Opposing battler ID (`:1415`) | Target remains |
| 1024 FRONT, unchanged | Final else branch, HP-checked | No target when the foe has fainted |

- A reselected range 0 goes through the `a4 == 1` branch at `:1440`, which is also HP-checked, so the result is the same.
- Every `target` value in `moves.json` is one of the 12 native ranges, so no unknown range can be reached.
- The only implemented effect with a target that stays valid without a living foe is Haze (range 64), and it runs correctly. No implemented effect uses range 1, 128 or 1024. So the browser never runs an implemented effect where native would print the no-target message, or the reverse.

**5. The selected-move flag** (`:1684-1706`)
- `selectedMoveId` comes from the move chosen at selection (`battle.ts:109,113`). The move itself is read again from the current slot (`:156`). Turn order is not recalculated.
- Struggle (slot -1, move 165, range 0) behaves the same with the flag set.
- `enemyTurn` passes `undefined`, but its guard means the defender is alive, so this can't produce a no-target.

**6. Earlier fixes, unchanged since v2**
- F1: speed is not clamped at zero (`:135`).
- Each residual phase draws a fresh tie bit (`:120`).
- After each action, `settleFaints` runs faint → EXP → battle end, with an `active`/HP guard before the next actor (`:92-99`).
- The final opponent gets no residual damage and no second PP spend (`:115-116`).
- Residuals skip fainted battlers, replacements happen after residuals (`:131-132`), and `enemyFainted` prevents double EXP.

## Tests
- **Target matrix:** each row checks the move's `target` against the value parsed from `moves.h`, and the row count is checked against the number of parsed range macros.
- **Charge test:** it exercises every parsed charge case. For the nine charge moves with target 0 or 4, the recoil message proves the foe acted with no living target, so dropping any of them from the runtime set would fail the test. This is consistent with the 11/12 pre-fix failures you described.
- **Diglett (Lv17→18):** it shows the level-up and then rejects with effect 256.
- **Other fixtures:** Porygon/Recover, Cyndaquil/Flame Wheel, Natu's two Me First cases, and the recoil, status, Share and Egg tests all line up with the native behaviour above.

## Uncertainties (not findings)
- The charge test only asserts `nativeChargeCases.length > 0`, not that there are exactly 10 cases matching the runtime set. It still runs every parsed case, so this is a weak spot in the test rather than a gap in coverage.
- The Bide subcase only shows that an unsupported effect with a real target still throws. Because Bide is self-target, it can never lack a target, so whether it is in the set makes no difference to behaviour.
- The proof and fixtures are traces of the source, not ROM runs. Your note that the fixtures don't stand in for native playthroughs still applies.

## Declared gaps (unchanged, not counted)
- Encore and locked-move reselection causes.
- Charge, hide and recharge lifecycle.
- Disobedience and trades.
- Doubles, Follow Me, Trick Room, Draw.
- Wider ability/item/EV speed modifiers, RNG sequence, and the broader target/effect systems.
- From the earlier history: the extra residual tie draw when a battler has fainted, and flinch being checked before sleep/freeze.

## Disposition and validation

Actual restricted Claude Opus5.5 review found no confirmed scoped issue in finalV3. Earlier b303 F1/F2, candidate1N1 andcandidate2N2 remain historical failed reviews attached to their exact source manifests. They are not relabelled as passes. V3 preserves zero effective speed, per-action faint/EXP/outcome, surviving actor status/PP/self effects, selected-slot reread and complete bounded native pre-effect no-target predicate. Complete source-owned target/charge tables and source predicate proof accompany this receipt. Charge/locked/recharge/hide lifecycle, broader targets/effects, trades/disobedience/doubles/Draw/TrickRoom, wider ability/item/EV speeds and full native RNG sequence remain gaps.

Provider prose clarification: implemented USER-target effects such as Harden, Recover and Defense Curl also retain valid targets without a live foe. Haze is the implemented FIELD-target example. The report's isolated 'only implemented effect ... Haze' sentence is overbroad; its target table, public fixture assessment and bounded pass remain correct. The raw report is preserved unmodified. No runtime/test edits were made after the reviewed freeze. The observation about charge-table count is not a confirmed defect: all actual parsed source cases are exercised, current source has10, source hashes are recorded, and Bide's self-target behavior is independently still unsupported. No implementation-mirroring exported-set equality test was added.

Child validation:108/108 battle/early-effects/Egg-consumer checks (86top-level plus22 source-owned subcases), TypeScript exit0, gitdiffcheck clean. Final pre-F2 replay8tests:5expectedfailures/3passes on exact2e85 Battle. Pre-N1 replay12tests:3expectedfailures/9passes on first candidate. Pre-N2 selected charge/Dig proof12tests:11expectedfailures/1pass on candidate2 (9chargedopponent cases, their parent andDig fail;Bide was already unsupported). No build/browser/native-ROM test by child. Complete game/battle parity is not claimed.
