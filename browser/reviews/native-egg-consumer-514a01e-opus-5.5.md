# Native Egg consumer integration review

Exact reviewed commit: `514a01e4dc3ee14810c2c790fddcee42720e54be`. Actual provider: Claude Code CLI `claude-opus-5-5`; limited to Read/Grep/Glob and copied input.

## Reviewer result

I found one low-severity bug that the patch introduces in its new EXP guard. The Egg-specific requirements otherwise check out: the Egg stays out of battle and following, its hidden data stays out of the party views, and its Egg Watch text stays literal. I edited nothing, and none of this was confirmed with a rendered browser.

## Confirmed bug

**Low — EXP and EVs are lost when the active Pokémon faints from poison or burn in the same turn it knocks out the foe**

- **Where:** `browser/src/source/battle.ts:190` (new guard `if(!isUsableBattler(this.player)||this.player.level>=100)return;`), together with the existing turn order at `battle.ts:94-95`.
- **Trigger:** The player's Pokémon is poisoned or burned with low HP. Wild Pokémon in this area can cause this: Poison Sting is effect 2 and PoisonPowder is effect 66, and both are implemented. That Pokémon knocks out the wild foe or a trainer's Pokémon.
- **What happens:** At line 94, the poison/burn damage step still runs on the player after the foe is at 0 HP, and takes the player to 0. Line 95 then calls `gainExperience()`. The new `hp>0` check inside `isUsableBattler` rejects the player, so there is no "gained Exp." message, no EXP and no EVs, and the battle still counts as won. Before this patch the same Pokémon did get its EXP and EVs.
- **Why it's wrong:** The original game awards EXP when the foe faints. That check (`src/battle/battle_command.c:6050`, `HP && level != 100`) runs before any poison/burn damage, and a wild battle ends on the knockout. The browser's "damage before knockout handling" order is an existing limitation; the new guard turns it into lost EXP.
  - **Caveat:** the native battle-controller file that defines this turn order is not in the snapshot. That part rests on standard Gen IV behaviour, not a copied source line.
- **Smallest fix:** Decide whether EXP is allowed right after the action phase, before poison/burn damage. For example, set `const expEligible=isUsableBattler(this.player)` just before line 94 and pass it to `gainExperience`; keep the level check. A Pokémon that faints from its own recoil (Take Down/Struggle) still gets no EXP, which matches the original game because its HP is already 0.
- **Regression test:** A poisoned player Pokémon with HP ≤ maxHP/8 knocks out a 1-HP foe. Assert its EXP and EVs went up and the Egg is unchanged. Keep a recoil double-knockout case that asserts no EXP.

The level-100 part of the guard is correct. In the original game the EV call (`battle_command.c:6087`) sits inside the `level != 100` block, so a level-100 Pokémon gets no EXP, no EVs and no message. The old browser code wrongly gave level-100 Pokémon EVs, and this patch fixes that.

## Checks that passed
- **Battle start:** `firstUsableBattlerIndex` matches the native lead choice at `battle_main.c:564-573` (has a species, not an Egg, HP > 0). A party with only an Egg plus fainted Pokémon throws before any state or screen change; the battle setup at `battle.ts:24` rolls back on failure, and the retry/return path in `script-recovery.ts` handles the error.
- **Switching:** Manual and forced switches are blocked in three places: the button is disabled, the click handler rechecks, and both `loop` (`:78`, which uses no turn) and `switch` (`:112`) reject an Egg. This matches `battle_util.c:2700-2712` and `battle_command.c:3223-3243`.
- **All-fainted check:** `:96` loses the battle even when an Egg still has positive HP.
- **Wild battles:** `main.ts:261` skips encounters when no Pokémon can battle.
- **Catching tutorial:** `tutorial.ts:4` uses a separate cloned state with only Marill, so the Egg is never involved.
- **Follower:** `firstFollowerMon` matches `follow_mon.c:1519-1523`. It is used in both the render loop (`main.ts:353`) and recovery after a failed action (`main.ts:149`).
- **Saves and retries:** `isEgg` and `provenance` are plain JSON fields. Continue (`readSave`), action retry (`structuredClone` in `restoreStateInPlace`) and battle rollback all keep them.
- **Party views:** The HUD, party rows and summary for an Egg show only the 32×32 Egg icon and the name "Egg". The CSS displays the icon pixelated and scaled to fit. Inside battle, only the usable active Pokémon is drawn, and the Egg button shows its name only.
- **Egg Watch:** Thresholds ≤5/≤10/≤40/else map to IDs 105–108, exactly as in `trainer_memo.c:613-621`. The text comes from the real `messages/302.json`, and only the `\n` markers become line breaks. Togepi's 10 cycles select message 106.
- **Loading the messages:** `messages/302.json` loads with the rest of the game data, so a missing file fails startup with the normal "Original data could not load" error rather than silently.

## Open questions and limits
- **Debug global:** The `window.__HG3D__.party` debug object (`main.ts:359`) still exposes the Egg's species, level, HP and moves. It isn't a party menu; it only matters if that object is treated as player-facing.
- **Missing message:** The original battle party menu tells the player an Egg can't battle when they try to send it out (from the `isEgg` field at `battle_party_menu.c:1210`). The browser silently disables the button. This is a presentation difference, not a correctness bug.
- **Trainer-battle start:** If a trainer battle could ever start with only an Egg plus fainted Pokémon, the new error would show as a "Scene not completed" prompt. I found no normal way to reach that state, since losses lead to a heal or white-out.
- **No visual check:** The browser host is disconnected, so the HUD, party and summary markup and the 3D follower and send-out were verified only by reading code and the string tests, not by rendering.

## Read-only source adjudication and runtime reproduction

The original 514a01e snapshot remains byte-identical (120 records). Actual Opus5.5 returned one LOW EXP-eligibility ordering regression; it remains unfixed at the reviewed commit. Its native controller ordering caveat was resolved after review by read-only original-source validation, not by silently adding files to the reviewed snapshot. ActionEnd grants EXP at battle_controller_player.c3329, then checks battle outcome at3332; BattleContext_Main161–166 routes an outcome directly to BattleEnd. Only after all actions does ExecuteNextAction795 select field conditions, followed by UpdateMonCondition poison1261. Nonfinal replacement is TurnEnd1667, after residual effects. Task_GetExp6135–6165 completes level-up/CalcMonStats and active HP reload before returning. pokemon.c391–405 increases positive HP by the max-HP gain. Native recoil subscripts update HP before the EXP HP gate at battle_command.c6050, so a recoil-fainted participant stays ineligible. Root should correct phase order, not only snapshot eligibility: a final KO skips residuals; a nonfinal level-up changes HP before residual damage.

Exact frozen-runtime reproduction /tmp/hg-egg-consumer-exp-proof.mjs uses the copied 514a01e code and fetches every data asset with git show from that exact commit (asset hashes recorded in companion JSON). Poison-final case: ChikoritaLv5 HP1/max20 KO -> won, HP0, exp135 unchanged, EV0; native should grant EXP before battle-end and skip poison. Poison-nonfinal with exp178 (one belowLv6) -> current lost, HP0/no reward/no level-up; native levels and recalculates HP before residual/replacement. Recoil-final with a healthy backup -> HP0/no EXP/EV, as intended. The real gifted Egg remained unchanged in all three examples.

All Egg-specific review checks passed (initial lead/sendout, switches, all-fainted, tutorial separation, follower hydration/render, persistence/recovery, stat/species/gender/level/move concealment, literal 302 Egg Watch messages and load failure behavior). Hatching and full summary-page parity remain separate. Debug globals retain internal data for diagnostics; a disabled Egg switch button differs from native explanatory feedback but is not a combat eligibility bug. No rendered browser verification was possible. Root reports 537/537 full tests/TypeScript pass at this reviewed commit; child independently reran20 core/consumer/UI tests. Those tests did not originally cover the new residual-order regression.
