# Native action-end candidate2 review

## Actual provider result

**Result:** v2 fixes N1 as scoped, and F1/F2 still hold. But I found one new Low defect: the no-target bypass also catches charge-turn moves, which native does not treat as no-target. So v2 can quietly give a no-target result for an unsupported effect, which the brief rules out. I only read the snapshot. I ran no tests, commands or browser, so nothing here has been checked in a rendered browser.

## N1: fixed
- **Arguments passed:** `battle.ts:108` passes the selected move IDs (`playerMove.id` / `enemyMove.id`) through `moveAction` (`:90-94`) to `attack` (`:144`). `attack` reads the current slot again at `:151`.
- **Ranges that need a living opponent:** `{0,2,4,8}` at `:15` matches native, where those ranges only resolve to an opponent with HP left (`battle_util.c:1367-1403`, `:1440-1461`, `:1462-1476`).
  - A reselected SINGLE goes through the `a4==1` branch at `:1440` and still checks HP at `:1459`.
- **FRONT (1024):** `:156` only counts it as no-target when the move is unchanged.
  - Native with `a4==0` falls to the generic branch at `:1462-1476`, which checks HP.
  - With `a4==1` it uses `:1415-1416`, which in singles always returns `battlerId ^ 1` (`:3571`). FightInput sets `flag=1` at `controller:1698-1700`.
  - Me First (effect 241) is the only FRONT move, and it isn't implemented, so the reselected case still throws.
- **OPPONENT_SIDE (128) and self/side/field ranges:** these never count as no-target, so their unsupported effects still throw (`:157`). That matches `:1417-1439`. All three OPPONENT_SIDE moves (Spikes, Toxic Spikes, Stealth Rock) are unimplemented.
- **Order:** status (`:147-150`) → PP (`:158`) → "used X!" (`:159`) → `msg_0197_01234` (`:163`) → return. No accuracy check, view attack or effect runs. The `finally` block still clears Rage, matching `subscript_0281_NoTarget.s:13-16`.
- **Non-Fight turns:** `enemyTurn` passes `undefined`, but its guard at `:142` means the defender is alive, so this path can't produce a no-target.
- **F1/F2 and the earlier checks:** the diff only touches `:13-15`, `:90-94`, `:108`, `:144` and `:152-163`. Speed, residual ties, `settleFaints`, EXP masks and Egg handling are as candidate1 left them.

## New finding: N2, Low — charge-turn moves wrongly take the no-target path
- **Where:** `battle.ts:156-157,163`.
- **Native behaviour:** `TryNoTargetScript` (`controller:2073-2087`) only shows the no-target message when there's no target and `BattleCtx_IsIdenticalToCurrentMove` is false, or the user is already locked into the move or mid-charge.
  - For the first turn of a charge move, `:2085-2086` instead sets the target to the user and returns FALSE, so the move's own charge script runs.
  - The charge effects are listed at `battle_util.c:2544-2556`: Bide, Razor Wind, Sky Attack, Skull Bash, Solar Beam, Fly, Dive, Dig, Bounce, Shadow Force.
- **Affected moves:** Razor Wind 39 (target 4), Fly 155, Solar Beam 151, Dig 256, Skull Bash 145, Sky Attack 75, Dive 255, Bounce 263 and Shadow Force 272 (all target 0). None of these effects are implemented (`:12`).
  - Bide has target 16, so it isn't affected.
- **Trigger:** the same mid-turn learn-into-the-selected-slot path as N1. One real-data case is the learnset ending `{"level":15,"move":189},{"level":18,"move":91}` (Mud-Slap, then Dig at 18). I believe this is Diglett (species 50), but I identified it by its contents, not its array index.
  1. A Lv17 Diglett, one level-up away, has the move it replaces with Dig selected.
  2. A faster foe dies from its own Struggle recoil, and Diglett levels up and learns Dig.
  3. v2 then prints "used Dig!" and "But there was no target...", where native would run Dig's charge turn.

  The same thing happens to a surviving foe holding Dig or Fly after the player faints from recoil. Candidate1 threw in both cases.
- **Minimal fix:** at `:156`, add `&&!chargeTurnEffects.has(move.effect)`, where `chargeTurnEffects` is `new Set([26,39,75,145,151,155,255,256,263,272])` and cites `battle_util.c:2544-2556`. These moves then go back to throwing and rolling back.
- **Regression test:** the Cyndaquil fixture with species 50 at Lv17, `exp=growth[18]-1`, the selected slot holding the move to be replaced, and `replace` set to that slot. The foe should be fast enough to act first (for example a Lv30 Rattata at 1 HP with no PP). Assert that `start()` rejects with `/Unported original move effect 256/`. Also add a foe variant with Dig after player recoil.
  - With v2 as it stands, this test fails because the battle continues to the next turn instead of rejecting.
  - I haven't calculated the speed and HP numbers for this fixture. Check them when you write it.

## Uncertainties
- **Power Herb or sunny Solar Beam:** without a target these leave it empty and skip the redirect to the user (`:2081-2085`), so the outcome probably depends on a later no-target check at `:2723`. The fix above makes them throw, which is fine because both are unsupported.
- **Test results:** the 83/83 pass and TypeScript result are as you reported. I didn't re-run them, and the fixtures set up the mechanics directly rather than replaying a ROM.

## Declared gaps (not counted as findings)
These are unchanged: the wider target/effect systems, the global RNG sequence, ability/item/EV speed modifiers, Trick Room, doubles, trades, and a simultaneous last KO counting as a Draw. Two older issues also remain: the extra residual tie draw when a battler has fainted, and flinch being checked before sleep/freeze.

## Disposition

Actual v2 review confirmed F1/F2/N1 fixed but found LOWN2: native initial charge scripts must still run without a living opponent. This exact candidate (Battlea35ade62/test1a97507c) remains failed. Next candidate excludes the complete literal native charge class, keeps unmodeled turn states unsupported, and adds source-owned charge/range matrices plus a legalEV nativeDiglett learn fixture. No historical approval transfers.
