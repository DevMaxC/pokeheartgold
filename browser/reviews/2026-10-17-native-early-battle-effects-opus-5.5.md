# Native early-game battle effects review

Scoped implementation commit0c2abf7a8fc403d900f0de6e48c6edd1edfd2c44 restores Fury Attack, Roost, Gust, Rage and Synthesis effect handling.181tests and TypeScript pass; the parent production build passes. The five effects continue to use the existing3D battle presentation. This is not a natural fresh-save or rendered playthrough verification.

Both reviews used the read-only Claude Code CLI with actual claude-opus-5-5 and Read/Grep/Glob only. The owner held source unchanged during the final review, then committed it. This receipt captures current bytes and verifies them against the implementation commit; it does not invent a pre-review checksum. The initial review found Rage lifetime wrong; the implementation now clears Rage after another move executes and preserves it on non-move/inability-to-act paths. The final review reports no remaining new defect in its scope.

Native field weather is captured at battle creation; rendering does not determine healing rules. Fly/Bounce execution, general AI, held/contact/weather damage, obedience and broader move/ability parity remain separate unfinished work. Gust's explicit flying power context does not make Fly playable. Current-source browser rendering remains unavailable while the T3 preview host is disconnected.

## Initial review

I found one concrete new correctness bug, in Rage's lifetime. Multi-hit, Roost, Gust and Synthesis match the native references you listed. This was a read-only review: I did not run tests or edit anything. Model: Claude Opus 5.5 (`claude-opus-5-5`).

## Finding: Rage is cleared when a different move is chosen, but native clears it after a different move is used

**Where:**
- `browser/src/source/battle.ts:98`: `selectMove` removes the mon from `raging` as soon as a non-Rage move is picked. This affects the player (line 84) and the enemy (lines 84 and 100).
- `browser/src/source/battle.ts:76`: Rage is also removed when the player chooses Bag, Run or Switch.
- The comment at `battle.ts:96-97` describes the wrong native behaviour.
- `browser/src/source/early-battle-effects.test.ts:70-72` asserts the wrong behaviour (expects Attack to stay at 0 when Tackle is chosen).

**Native source:**
- `src/battle/battle_controller_player.c:755-756` (BT_STATE_RAGE) reads `status2 &= STATUS2_RAGE`, not `&= ~STATUS2_RAGE`. Choosing another move therefore keeps the Rage flag (and wipes the mon's *other* status2 bits). Rage is not cleared at selection.
- The real clear is at `battle_controller_player.c:3884-3885`: `TryAfterMoveItems` state 0 runs after the raging mon uses a move, and clears Rage if that move isn't Rage.
- That step runs after a miss or failed move (`CheckMoveFailure` goes to command 34, then 35 → 36 → 37, which is `AfterMoveItems`; see lines 2782-2790 and the table at 132-137).
- It does not run when the mon can't act. Flinch, full paralysis and the other can't-act paths jump to `CONTROLLER_COMMAND_39` (for example lines 2195-2197 and 2286-2288), which comes after command 37. In those cases Rage survives.
- `TryBuildRage` (`:3809-3814`) only checks the target's Rage flag, its HP and the damage it took this turn.

**What goes wrong in the port:**
1. The player's mon used Rage last turn. This turn it picks Tackle but is slower. The enemy's Tackle hits first. Native: "rage is building!" and Attack +1, then Rage ends after Tackle. Port: no Attack boost.
2. A raging mon uses a Potion, or fails to run. The foe hits it. Native raises Attack (Rage is never cleared, because no move executes). Port clears Rage at line 76.
3. A raging mon picks another move but is fully paralyzed or flinches. Native keeps Rage into later turns. Port has already dropped it.

The same applies to the enemy through `selectMove` at lines 84 and 100.

**Focused fix:**
- Make `selectMove` (`:98`) a pure lookup.
- Remove the clear at `:76`; keep the cleanup in `switch()` (`:101`).
- In `attack()`, after the "used X!" message (`:111`) and before the accuracy check, add `if(move.effect!==81)this.raging.delete(attacker);`. That matches native: it applies on hit, miss or failure, but not on the earlier sleep/freeze/paralysis/flinch returns. Clearing at the start of the move instead of after it gives the same result here, because the attacker can't be hit by the target during its own move.
- Update the test at lines 70-72 to expect Attack +1 when the slower raging mon picks Tackle, and add a check that Rage is gone after Tackle executes.
- The native line 756 also wipes other status2 bits (e.g. confusion) for a raging mon that picks another move. Nothing currently in `battle.ts` stores status2-style volatiles, so there's nothing to port yet, but it will matter once those exist.

## Checked, no new bugs

- **Fury Attack / multi-hit:**
  - The hit count matches `BtlCmd_SetMultiHit` (`battle_command.c:1484-1496`), including Skill Link using no random draw.
  - Accuracy and PP are spent once, matching `moveCheckSkipFlags = checkMultiHit` (`:3173`).
  - Critical hit and damage are recalculated every hit.
  - The loop stops when the target faints, and the "Hit N times" count matches `msgTemp` at `:3184-3187`.
  - An immune target gets no hit message.
- **Rage building:** once per damaging hit, only if the target survives, capped at +6, and set only when Rage actually hits (`:3809-3814`; effect_script_0081).
- **Roost:**
  - Heals half of max HP via `DamageDivide`.
  - At full HP it says "HP is full!" and skips the roost flag (`subscript_0154`, `0111`).
  - It ignores every Flying matchup on the target (`battle_util.c:2209`).
  - The flag is cleared each turn (`:74`), on switch (`:101`), when the enemy faints (`:91`), and at battle end.
- **Synthesis:**
  - Clear: max HP / 2, no minimum.
  - Sun: `max(1, ⌊max HP × 20/30⌋)`.
  - Rain, sandstorm, hail and fog: `max(1, ⌊max HP/4⌋)`, since fog counts as weather (`include/constants/battle.h:265`).
  - Cloud Nine / Air Lock only suppress the weather boost while their holder has HP left.
  - The field-weather mapping matches `TryAbilityOnEntry` (`battle_util.c:3147-3176`), and weather is read once at `battle.ts:25` before any async presentation.
- **Gust:** the doubled power only applies through the explicit `flying` context (`battle-math.ts:26`), which is your stated scope.
- **BattleView** is still presentation-only.

## Older issues, not caused by these changes

- `typeEffectiveness`/`moveDamage` multiply the type factors together and round once. Native rounds after each type matchup (`ApplyTypeMultiplier`, `battle_util.c:2287-2298`), so some dual-type damage can be off by 1.

## Final timing-fix review

I found no new bug in the follow-up scope. I only used Read/Grep; I didn't run any tests or commands. Model: Opus 5.5 (`claude-opus-5-5`).

## The Rage fix
- **Selection doesn't touch Rage.** `selectMove` at `browser/src/source/battle.ts:95` only looks up the move. `enemyTurn` (`:97`) calls it and ignores the result.
- **Non-move actions keep Rage.** Run, switch and item turns (`:76-81`) never clear it except when switching out, and `switch()` (`:98`) is the right place for that.
- **Clearing happens only after a move runs.** The `try`/`finally` at `:109-150` covers the accuracy miss (`:110`), the full-HP failure (`:111`), the status-move early returns (`:113-126`) and the damage loop. The `finally` at `:149` clears Rage for any move except effect 81. This matches native `BattleControllerPlayer_TryAfterMoveItems` case 0 (`src/battle/battle_controller_player.c:3884-3885`, which compares `moveNoCur != MOVE_RAGE`). Struggle (`slot<0`) also clears Rage, which is correct because it isn't Rage.
- **Being unable to act keeps Rage.** The flinch, sleep, freeze and paralysis returns at `:101-104` all come before the `try`, so no PP is spent and Rage stays.
- **BT_STATE_RAGE.** The literal `&= STATUS2_RAGE` at `battle_controller_player.c:756` is as you described. Not porting it to the selection step is correct.
- **Rage building** at `:137` matches `TryBuildRage` (`:3809-3814`): the target must be raging and alive, take positive damage, and have Attack below +6. The attacker can't build its own Rage because the defender is never the attacker here.
- **One thing that looks suspicious but isn't:** `:1944-1945` clears Rage when `moveNoCur == MOVE_RAGE`, but that is on the disobedience path. This port has no obedience, so it doesn't apply.
- The unported-effect `throw` at `:106` sits outside the `try`, but it aborts the battle and `finishError` (`:39`) clears `raging`, so nothing leaks.

## Full-HP recovery (effects 32/132/214)
`:111` comes after the accuracy check and PP spend but before `view.attack`, so the move fails with no animation and doesn't add Roost. All three moves skip the accuracy check, so checking accuracy first can't change the result.

## `early-battle-effects.test.ts`
I traced each new test against the code and every expected value holds:
- **`:69` miss case:** at stage −1 the hit threshold is 75, and the rng gives 99, so it misses. The Gastly case (species 92) gets 0× effectiveness, so Rage never starts.
- **`:72`:** the faster foe's Tackle gives Attack +1. Afterwards `raging` matches `repeat` for both sides.
- **`:75`:**
  - Escape: odds of 30 against a roll of 128, so it fails and the enemy attacks, giving +1.
  - Trainer-run and the no-effect item both `continue` with no enemy turn, so Attack stays 0.
  - Potion: `takeBagItem` (`bag.ts:12`) deletes the key at zero, so `undefined` is the correct expectation.
- **`:78`:**
  - Sleep (2 turns drops to 1), paralysis (roll 0 < .25) and flinch keep PP and Rage.
  - The miss case (stage −1, roll .999) and full-HP Roost spend PP and clear Rage.
- **`:81`:** switching and `finish` clear both sets, and no state is stored on the `Mon` objects.

## Gaps that were already there (not new)
- Fly/Bounce
- General AI
- Held-item, contact and weather damage
- Rounding when type multipliers are applied in sequence
- The `MULTI_HIT_DISRUPTED` check in `TryBuildRage`
