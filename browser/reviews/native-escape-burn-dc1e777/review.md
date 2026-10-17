I found no confirmed runtime defect in dc1e777. Both original findings are closed for the ordinary wild-escape path and the neutral physical-burn case. I found one low-severity flaw in the test fixture. I ran no tests, builds or compilers: everything below comes from reading the files.

## Confirmed findings

**Test-only, low: the equal-speed escape tests use a Pokémon whose real native run takes a different branch.**
- **Where:** `browser/src/source/battle-escape-burn.test.ts:85` (test 1) and `:102` (equal-speed half of test 3) use `mon(19,…)`, which is Rattata. `createMon` builds it with `rng=.5`, so its personality is 2³¹. That is even, so its ability is slot 0, Run Away (`pokemon.json`: `["ABILITY_RUN_AWAY","ABILITY_GUTS"]`). The C oracle stubs `GetBattlerAbility` to return 0 (`:46`).
- **Native evidence:** `battle_util.c:2809-2811`. A Run Away holder escapes with `runFlag=2`, makes no random draw, and never reaches `runAttempts++` (`:2824`).
- **Consequence:** the oracle's "attempts 0→1" result is not what native does for this Pokémon (native leaves it at 0). The outcome is the same either way (it escapes with no draw), and the counter is thrown away once the battle ends, so these assertions don't hide a speed-rule bug. But calling it a "legal ordinary-path" witness is wrong, and it hides the port's missing Run Away handling. The slower-runner tests (Chikorita vs Pidgey, `:92`, `:104`) don't have this problem.
- **Fix:** use equal/faster species without Run Away, or Rattata with an odd personality (giving Guts). Add `assert.notEqual(monAbility(data,player),'ABILITY_RUN_AWAY')` inside `runCase`.

## Review questions

**1. Escape (`BattleTryRun`, `battle_util.c:2794-2827`; `battle.h:424` declares `u8 runAttempts`)**
- **Speed:** native compares `battleMons[].speed`, the raw stat; stat stages and paralysis are not applied. The port's `tryRun` (`battle.ts:135-141`) uses `stats.speed`, not `effectiveSpeed`. Equal or faster always escapes with no draw, which matches native's `else ret = TRUE`. Production base got this wrong: it required strictly faster and drew a roll on ties.
- **Odds byte wrap:** native computes `speed*128/opp + runAttempts*30`, using the old counter, and truncates it into `u8 run`. The port's `(floor(...)+30*fleeAttempts)&255` is the same.
- **Comparison:** native `run > Random%256` is the same as the port's `floor(rng*256) < odds`.
- **Counter:** native increments after the roll, on success or failure, inside the ordinary branch, and the `u8` wraps. The port's `(n+1)&255` matches.
- **Trainer refusal:** handled at `battle.ts:102`, before `tryRun`, with no draw and no increment. Native also refuses trainer runs before `BattleTryRun`.
- **Other paths:** the before and after `battle.ts` differ by exactly +6 lines (256→262), consistent with the stated edit. My spot checks of the shared code found it unchanged.

**2. Burn**
- Native (`:5858-5863`, `:5946`) divides by the defence stat, then by 50, then halves for burn, then adds 2 at the very end. Between those points, only doubles/Reflect, weather, Solar Beam and Flash Fire apply, and none apply to single-battle wild Tackle. Then `*= criticalMultiplier` (`battle_command.c:760`) and `ApplyDamageRange` (`:786`).
- `battle-math.ts:38-42` now halves, then adds 2, then applies the critical multiplier and the random range. The special-move path, unburned path, and the critical/random/STAB/type steps are unchanged.
- Guts, Reflect, weather and the like are still unported; this patch doesn't make that worse.

**3. Call chains**
- **Run turn:** order is unchanged — Rage bookkeeping (`prepareRageTurn`), then the escape roll, then the failure message, then `enemyTurn`, residual damage, and the next turn's menu.
- **Existing Rage tests:** in `early-battle-effects.test.ts:90,108`, both the old and new formulas give odds far below the injected roll (e.g. 0 vs 128 at speed 1 vs 1000), so these tests still fail to escape as intended.
- **`attack()`:** its draw order (accuracy, critical, then 85+⌊r·16⌋) is consistent with test 6's draws `[0,.5,.999]` → roll 100.
- **Untouched:** XP, `settleFaints`, and the view callbacks.

**4. Native-C oracle**
- **Extraction:** the oracle compiles the real C source for `BattleTryRun`, `ApplyDamageRange`, `sStatChangeTable` and the physical branch.
- **Types:** the stub types are wide enough (`int` stands in for `u16`; `u8 run` and `u8 runAttempts` are kept).
- **RNG:** the roll mapping `(roll+.001)/256` is exact, and the damage stub `randomValue=100-roll` yields exactly `roll` for 85–100.
- **Fixtures:** Chikorita/Tackle/Pidgey is neutral (no STAB, no Guts, Overgrow is inactive for Normal moves).
- **Hand-written `+2`:** `return dmg + 2;` (`:58`) is written in the fixture rather than extracted. I checked it against `:5946` and the neutral code in between.
- **Silent extraction failure:** if an extraction string isn't found, `blockAt(-1)` silently returns an empty string instead of throwing. Today that would most likely still fail loudly downstream, but an `indexOf >= 0` assertion would make it explicit.
- **Rollback-on-observation:** the second `nextAction` call throws, which runs the `start()` rollback. This is used only to read the counter on failure. It's sound.
- **Logs:** `before.json` (1 pass, 5 fail, with failure points matching both original defects) and `after.log` (6/6 pass) are internally consistent. I did not recompute the SHA256s.

## Plausible concerns needing execution
- **Enemy move-choice RNG order:** native picks the wild Pokémon's move during input, before the escape roll; the port picks it afterwards. This predates the patch and can't be observed with `Math.random`.
- **Stage arithmetic:** the port uses floating-point `stageMultiplier` and `max(1,…)` where native uses the integer stage table. Native can reach attack or defence 0 for tiny stats at negative stages. This predates the patch.

## Existing out-of-scope gaps (not regressions)
- **Escape modifiers:** Run Away and Smoke Ball are not implemented. Reachable example: a player's Sentret (Run Away) running from a faster wild Pidgey always escapes in native but can fail in the port.
- **Trapping:** Mean Look, Bind, Ingrain, Arena Trap, Shadow Tag and Magnet Pull should block escape at the menu.
- **Damage modifiers:** Guts with burn, Reflect.
- **Other:** `GAME_STAT_RUN_FAILURES`, and Teleport's `BtlCmd_TryEscape`.

## Original findings
- **P2-1 (escape):** closed for the ordinary wild path (non-Run Away, no Smoke Ball, not `NO_EXP`), per the `:2813-2824` comparison above.
- **P2-2 (burn before +2):** closed for physical damage with neutral modifiers, per `:5861` and `:5946`.

## Coverage and limits
I read:
- `battle_util.c:2780-2827` and `:5500-5958`
- `battle_controller_player.c:1780-1808`
- `battle_command.c:747-789` and `:5195-5207`
- `battle.h:424`
- the full `battle-math.ts` and `battle.ts` at dc1e777
- the before-runtime copies under `/tmp/hg-native-escape-burn-production-before`
- the new test, the relevant `early-battle-effects` tests, the receipt and the logs

I did not diff byte-for-byte with git or verify any hash; the before-runtime copies under `/tmp` are outside the hashed manifest. Nothing here is checked against a ROM or a browser. This says nothing about general battle accuracy, live or visual behaviour, or release readiness.
