# Native battle EXP and phase review

Exact reviewed commit `b30324e8b66fabf0747449be81568c814cfb69cd`.

## Actual provider result

I found two Low-severity bugs in this commit's scope. The earlier poison/EXP finding is genuinely fixed in the real control flow, not just covered by tests.

**Basis:** I only read the copied snapshot. I ran nothing and checked no rendered browser. I traced `battle.ts` against the copied native C.

## Historical Low finding (514a01e): fixed

- **EXP before poison:** after the actions, `settleFaints()` grants EXP and level-up stats/HP, and checks for battle end, before the residual pass (`battle.ts:98-102`). The residual pass then uses the updated `maxHP` and speed. This matches ActionEnd (`battle_controller_player.c:3329-3334`) and the fresh sort before residuals (`:795`).
- **Each residual faint handled at once:** every poison or burn tick calls `settleFaints()` before the next one (`battle.ts:108-115`). This matches UpdateMonCondition faint → EXP → battle-over (`:1181-1189`).
- **Replacements wait:** new sendouts happen only after the residual pass (`battle.ts:117-118`, TurnEnd `:1667`).

## New findings

### F1 — Low: speed clamp `Math.max(1, …)` turns native strict orders into ties
- **Where:** `battle.ts:121`, used at `:90-91` (action order) and `:105-106` (residual order). This clamp is new in this commit.
- **Native:** speed is reduced by the integer stage table, then divided by 4 for paralysis, with no floor at 1 (`battle_util.c:1029-1030`, `1058-1059`, `1117-1118`). Then `speed1 < speed2` sorts, and only exactly equal speeds draw `Random & 1` (`:1224-1228`). An effective speed of 0 is legal.
- **Trigger:** a paralyzed, very slow Pokémon with a speed drop, against a foe whose native effective speed is 1. Example: raw speed 5 at −1 stage gives 3, then 0 when paralyzed. A paralyzed raw-5 foe gives 1.
  - Native: the foe always goes first, both in actions and in residuals.
  - Browser: both become 1, so it's a tie. The player can go first (Fight tie `rng() < .5`, or residual low bit 0), and an extra RNG draw is used.
  - This is reachable with early wild Pokémon plus implemented Scary Face / String Shot and paralysis.
- **Fix:** `return mon.status==='PAR' ? Math.floor(speed/4) : speed;` with no clamp. I checked by hand that the floating-point stage multipliers floor to the same values as native for every stage, so dropping the clamp is enough.
- **Regression test:** speeds 5 at −1 stage with paralysis vs. 5 with paralysis, and `rng = () => 0`. Assert the enemy acts first. Then, with both at 1 HP and poisoned, assert the enemy takes poison first and no residual tie draw is used.

### F2 — Low: if the first mover faints from its own recoil, the survivor's turn is skipped entirely
- **Where:** `battle.ts:92`. The new `&&this.player.hp>0` / `&&this.enemy.hp>0` checks skip the second action. Before this commit it wrongly attacked the fainted target; now it wrongly does nothing.
- **Native:** the battle only ends at ActionEnd when one side has nobody left (`:3332`). Otherwise the survivor's action still runs:
  - The target is recomputed when the move runs (`battle_controller_player.c:1706`). A fainted single target becomes `BATTLER_NONE` (`battle_util.c:1459-1476`). Self-targeting moves keep the user as target (`:1419-1420`).
  - `TryMove` then runs status checks (sleep countdown, freeze, paralysis), deducts PP, and shows the no-target message (`battle_controller_player.c:2654`, `2685`, `2691`, `2075`). Self-targeting moves actually take effect.
  - If the enemy faints itself first, ActionEnd grants the player's EXP before the player's action (`:3329`).
- **Trigger:** the player uses Struggle or Take Down (effect 48), faints from recoil, and still has a usable bench Pokémon. Or a trainer's non-last Pokémon does the same.
- **Wrong results:**
  - A survivor's Harden, Swords Dance, Defense Curl, Recover or Haze has no effect, and its stage boosts would have carried into later matchups.
  - No PP is spent, the sleep counter doesn't tick, and Rage isn't cleared.
  - In the enemy-faints-itself case, EXP order relative to the player's action differs from native.
- **Minimal fix:** if the actor is alive and the defender has fainted, still run the status checks, PP deduction and "used X!" message. Opponent-targeting effects should then print "But there was no target…" and stop; self/field effects should run. In the enemy-first case, settle the enemy's faint and EXP before the player acts.
- **Regression tests:**
  1. A faster player at 1 HP Struggles, with a bench Pokémon; the enemy has Harden. Assert enemy defense is +1 and Harden PP is decremented.
  2. Same setup with enemy Tackle. Assert a PP decrement and the no-target message.
  3. Trainer battle: the enemy Take-Downs itself to a faint. Assert the EXP message comes before the player's move.

## Checked and correct

- **Per-enemy participation masks:** lead set at start, switches OR'd in, mask reset to the active slot on each new enemy (`battle.ts:30,117,134`). Fainted bits in the mask are harmless because recipients need HP > 0.
- **Pools and multipliers:** Exp. Share and participant pools use native integer division with a minimum of 1. Lucky Egg → trainer → trade multipliers apply in native order (`battle_command.c:1237-1266`, `6050-6075`).
  - Level-100 Pokémon count toward the split but get no EXP or EVs.
  - Eggs and fainted Pokémon are excluded.
  - With no living participant, only the Share pool is paid. Native would divide by zero there, but that value only goes to fainted participants.
- **Rewards and caps:** all rewards are computed before any change to the party. Cumulative EXP is capped at level 100, as in `Pokemon_TryLevelUp`. Level-up HP gain matches `CalcMonStats` (`pokemon.c:391-405`).
- **Recoil-faint gets no EXP:** a Pokémon that faints from its own recoil gets no EXP.
- **Final KO ends the battle:** a last-enemy KO, or the player losing their last usable Pokémon, ends the battle before residuals.
- **Residual tie:** the low bit is mapped correctly (bit 1 swaps, so the enemy goes first). The residual order is kept for the whole pass, as native does.
- **Item data:** the Lucky Egg and Exp. Share held effects are present in `items.json`.

## Declared or pre-existing gaps (not counted as findings)

- **Toxic damage:** badly-poisoned damage is a flat 1/8, not native escalating n/16 (`battle_controller_player.c:1272-1279`). This was in the code before this commit.
- **Extra tie draw:** the residual tie still draws RNG when one battler has fainted (native returns early at `battle_util.c:988-993`). It doesn't change outcomes and falls under the declared RNG limitation.
- **Simultaneous last KO:** a double knockout still counts as a win. This is the declared Draw-policy gap.
- **Already declared in the adjudication file:** trades, held EV/speed items, abilities, Trick Room, doubles, battle RNG parity and hatching.

## Uncertain questions

- **Old saves:** a save whose Pokémon lack a `heldItem` key would make `heldEffect` throw. The battle would then roll back with an error instead of awarding EXP. I found no save-migration code, so this could only happen with legacy data.
- **3D view:** sendouts only resync the scene through `draw()`; I saw no new problems, but there is no rendered evidence.

## Verification limits

I couldn't run tests or build, so the 561/61 results, TypeScript and Vite build are as you reported them. All native behaviour above comes from reading the C, not from running a ROM.

## Disposition and validation

Actual restricted Opus5.5 returned two LOW scoped findings on frozen b30324e. F1 effective-speed minimum clamp is independently reproduced using actual Battle.start and source integer speed math; root subsequently fixed it in2e85fc2 with a formerly failing publicBattle regression. F2 skipping a surviving second action after opponent recoil-self-faint is source-validated: native FightInput1706 retargets, ranges USER/USER_SIDE/FIELD target actor at battle_util1419–1420, deadopponent becomesBATTLER_NONE at1469–1475, attacker status2654 andPP2685 occurbeforeTryNoTarget2691, no-targetscript2075. NativeActionEnd3332 ends only whenpartyoutcomeisfinal; otherwise remaininglivingactorstillacts. F2 remains unfixed atb30324e and2e85fc2; a new isolated child fix is in progress. No approval transfers to later code. The historical514 poison/EXP finding is corrected by b303 phase order, as this actual review confirms.

Child reran46 frozen-code tests in a separate validation clone:46/46pass. Initial direct snapshot run43/46 because the copied dynamic trainer-rules.json was absent; that is an input/harness omission, not a runtime failure. Validation clone adds the exactb303 trainer-rules asset with supplemental hash, leaving all150 original review snapshot records unchanged. Provider ran no tests/commands. No browser/build by child. NativeglobalRNG, widerability/item speeds, TrickRoom/doubles/trades/Draw andhatching stayexplicit gaps. OpusF1 suggestedtestmixing poison/paralysis should not be copiedliterally; child/root actualzero-speed actionfixture is the valid regression.
