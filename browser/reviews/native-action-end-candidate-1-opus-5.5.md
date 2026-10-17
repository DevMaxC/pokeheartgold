# Native action-end candidate1 review

## Actual provider result

I found one new Low defect, introduced by the F2 change. Both original findings are otherwise corrected, and the other regression areas you listed check out. I only read the copied snapshot; I ran no tests, commands or browser.

## F1: fixed
- `effectiveSpeed` (`battle.ts:130`) now does an integer stage reduction, then divides by 4 for paralysis, with no minimum. This matches native `battle_util.c:1029-1030` and `1058-1059` / `1117-1118`.
- `stageMultiplier` floors to the same values as native's integer table. The test case works out: speed 5 at −6 gives 1, paralysis gives 0; speed 6 at −6 gives 1.
- Turn order (`battle.ts:107`) and residual order (`battle.ts:115`) now draw a tie only when speeds are exactly equal, matching native `:1224-1228`. The residual order is still recomputed fresh after any mid-turn EXP.

## F2: corrected, apart from N1 below
- **Order of each Fight action:** each one runs the actor's status checks, spends PP, shows "used X!", then checks for no target (`battle.ts:146-158`). Native order is status `:2654` → PP `:2685` → no-target `:2691` / `:2075`.
- **No-target text:** `msg_0197_01234` matches "But there was no target..." exactly.
- **Rage:** the no-target path still clears Rage unless the move is Rage, through the `finally` block. This matches `subscript_0281_NoTarget.s:13-16`.
- **Self-target ranges:** the set `{1,16,32,64,256,512}` matches `battle_util.c:1404-1439`.
- **Opponent-target moves:** every implemented move aimed at the opponent (targets 0, 4, 8) gets no target when the opponent has fainted. That includes Discharge and Lava Plume.
- **Opponent-side moves (target 128):** native would still target the fainted opponent here (`battle_util.c:3571`). These are Spikes, Toxic Spikes and Stealth Rock, all unimplemented, so this can't happen in the browser.
- **Self, side and field moves:** every implemented self-target move has accuracy 0, so the accuracy, "HP is full" and stage logic is safe.
- **Faints, EXP and battle end:** these are now settled after each action (`battle.ts:86-95`), matching ActionEnd `:3329-3332`.
  - The `enemyFainted` / `playerFainted` flags prevent duplicate EXP.
  - If the last foe or your last usable Pokémon faints mid-turn, the battle ends before the other side acts.
  - Replacements still come after residuals (`battle.ts:126-127`).
- **Re-reading the move slot:** `attack` reads `attacker.moves[slot]` at the time it runs (`:151`), while turn order was fixed at the start of the turn. This matches FightInput `:1698-1706`. PP comes off whatever move is in the slot now (DeductPP `:2043-2049`).

Other regression checks:
- **Rollback on error:** still restores the pre-battle party, boxes and bag (`battle.ts:35,43`).
- **Eggs:** `isUsableBattler` excludes Eggs.
- **Recoil-fainted participants:** they get no EXP, and the participation mask resets only when a replacement arrives.
- **The 514 poison/EXP fix:** still holds. EXP is granted before residuals, and each residual tick settles faints straight away (`:111,122`).

## New finding

### N1 — Low: an unsupported move effect throws before the no-target check, so the new path can crash the whole battle
- **Where:** `battle.ts:152` throws "Unported original move effect" before the no-target check at `:158`.
- **Trigger:** a trainer battle, where these steps happen in one turn:
  1. A non-last enemy Pokémon acts first and faints from its own recoil (Take Down, or Struggle).
  2. Your Pokémon gains EXP and levels up.
  3. You choose to replace the move you had selected with a move whose effect isn't implemented.
- **Real-data example:** Cyndaquil at Lv18 knowing Tackle / Leer / SmokeScreen / Ember, with Ember selected. It reaches Lv19 and learns Flame Wheel (effect 125, opponent-target), replacing Ember.
  - Native shows "Cyndaquil used Flame Wheel!", spends 1 PP, shows "But there was no target...", and the turn continues.
  - The browser throws instead. The whole battle is rolled back, including the win and the EXP, and the battle promise rejects.
  - The same thing happens to a living foe holding an unsupported move after your Pokémon faints from recoil with a bench left.
- **Why this is new:** before this patch, that second action was skipped, so nothing threw. Native never runs the effect for a no-target move: the no-target script at `:2691` / `:2075` ends the action before the move's own script.
- **Minimal fix:** in `attack`, only throw for an unsupported effect when the move will actually run:
  `if(slot>=0&&!implementedEffects.has(move.effect)&&(defender.hp>0||singleBattleSelfTargets.has(move.target)))throw …`
  The existing status → PP → "used" → no-target order stays as it is.
- **Regression test:** a variant of `learningFixture`:
  - **Setup:** a Lv18 Cyndaquil (species 155) with `exp=growth[19]-1` and moves Tackle / Leer / SmokeScreen / Ember, with `slot:3` and `replace:3`. The enemies are a faster Lv23 Rattata at 1 HP with no PP, plus a second Pokémon.
  - **Assert:** the next turn is reached, `moves[3]` is Flame Wheel with `pp===maxPP-1`, and the messages are in this order: "used Flame Wheel!" → `messages197['1234']` → "sent out".
  - **Before the fix:** `battle.start` rejects with "Unported original move effect 125".

Some unsupported effects remain outside N1. A learned self, side or field move with an unsupported effect (Reflect, Mist) still throws, and native would run it. So does a living target hit by an unsupported effect. Both fall under your declared broad-effect gap.

## Declared gaps (not counted as findings)
- **Unchanged gaps:** native global RNG draw sequence, wider ability/item/EV speed modifiers, Trick Room, doubles, trades, simultaneous last KO counting as a win, broad target/effect systems, hatching.
- **Extra residual tie draw:** a tie still draws RNG when one battler has fainted (native returns early at `battle_util.c:988-993`). This is pre-existing and covered by the RNG gap.
- **Status-check order:** flinch is checked before sleep and freeze. This is pre-existing and wasn't touched here.

## Uncertainties and verification limits
- **Test results:** the 79/79 pass, the expected pre-patch failures and the TypeScript result are as you reported; I didn't re-run them.
- **Test fixtures:** they set up mechanics directly rather than playing through a ROM.
- **Native behaviour:** everything above comes from reading the copied C and script, not from running the game.
- **Browser:** the browser host is unavailable, so there's no rendered check of the new message order, or of the move animation being skipped on no-target.

## Disposition

Actual review of the first F2 candidate confirmed historical F1 andF2 fixed but found LOWN1 unsupported-effect preflight before native no-target. It remains a failure of this exact candidate (Battle9a15de7a/test5954a6fa). Subsequent candidate narrows no-target to literal live-opponent ranges and unchanged FRONT, retaining unsupported actual self/field/opponent-side/reselected FRONT effects; no approval transfers until separate review. Source nativeGetMoveTarget1415–1418 distinguishes FRONT changedslot andOPPONENT_SIDE. Actualprovider ran no tests/browser. Child had79tests/TypeScriptpass and source baseline8tests5fail3pass; those did not yet coverN1.
