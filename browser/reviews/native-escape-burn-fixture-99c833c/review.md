I found no new defect, and the original test flaw is closed. This review covers only the test bytes changed in `99c833c` (parent `dc1e777`). I used only Read, Grep and Glob, and I did not run any test, compiler or build. The pass/fail results below come from the logs in the commit, not from running anything myself.

## Original flaw (Rattata with even PID has Run Away): closed

- **The equal/faster fixtures no longer use Rattata.** `battle-escape-burn.test.ts:86` now uses Pidgey (`mon(16,5)`, and `mon(16,6)` against `mon(16,5)`). Test 3's equal case at `:103` also uses Pidgey. In `pokemon.json`, Pidgey's abilities are `["ABILITY_KEEN_EYE","ABILITY_TANGLED_FEET"]`.
- **The fix doesn't rely on how the ability slot is picked.** `createMon` with an rng of 0.5 gives personality 2³¹, which is even, so the ability is slot 0, Keen Eye. Neither of Pidgey's abilities is Run Away, so the fixture is safe whichever slot rule is right. The snapshot doesn't include native `pokemon.c`, so I couldn't check the native slot rule directly. It doesn't affect this conclusion.
- **The species really are equal and faster.** Pidgey Lv5 has speed 11 and Lv6 has 12, so one case is strictly faster. Nature 23 is neutral for speed. Chikorita Lv5 has speed 10, below Pidgey's 11, and `:93` asserts that.

## The ordinary fixtures genuinely meet the neutral native branch

Native `BattleTryRun` (`src/battle/battle_util.c:2794-2827`) reaches the speed/odds branch only if all of these hold:

| Native check | What the fixtures have |
|---|---|
| Held item is not `HOLD_EFFECT_FLEE` | `createMon` sets `heldItem: null` (`data.ts:34`), and `:76` asserts it |
| Battle type does not include `BATTLE_TYPE_NO_EXP` | Ordinary wild battle, and the C stub returns 0 |
| Ability is not `ABILITY_RUN_AWAY` | Pidgey and Chikorita (`["ABILITY_OVERGROW","ABILITY_NONE"]`) can't have it, and `:76` asserts it |

- **Every ordinary call goes through the guard.** All ordinary `runCase` calls are at `:87`, `:96`, `:104` and `:106`, with `trainer===null`. Every one passes through the guard at `:76`. The slower fixture across all 1,536 cases is Chikorita against Pidgey.
- **The C oracle's stubs now match the real fixtures.** The stubbed ability, held-item effect and battle type (`:44-46`) all return 0, so the oracle's neutral assumptions hold.
- **The trainer case is properly exempt.** `:112` still uses Rattata with Run Away and skips the guard. Natively, the trainer refusal happens during menu selection (`battle_controller_player.c:540`), before `BattleTryRun` is ever reached (`:1796`). Run Away therefore can't affect it, and the exemption hides nothing.

## Source extraction and provenance

- **Missing markers now fail loudly.** `blockAt` (`:17`) asserts that the marker was found and that its block has an opening brace. Before, a missing marker returned -1, which silently scanned from the start of the file.
- **The current markers exist in the source:**
  - `BOOL BattleTryRun(` appears once, at `battle_util.c:2794`.
  - `int ApplyDamageRange(` is at `:5949`.
  - The physical-branch marker matches `:5834-5835`, including the 8-space indent.
  - The stat-table regex requires `=`, so it skips the forward declaration at `:31` and matches the definition at `:5503`.
- **Hashes are consistent.** The new receipt and the input manifest pin `battle.ts` at `463cdc…` and `battle-math.ts` at `7ca568…`. These match the original dc1 receipt (`native-escape-burn/receipt.json:84-85`). The test file hash changed from `57362e…` to `5d2b18…`, matching the manifest. I can't compute SHA-256 with read-only tools, so this is an agreement between documents, not something I re-hashed.
- **The logs line up with the current test file.**
  - `before.json` shows 1 pass and 5 fails. The trainer test passes, and the failure lines (`:88, :97, :104, :122, :131`) match lines in the current test.
  - `battle-suite.log` shows 112 of 112 passing, including tests 24–29 from this file.
  - The original `native-escape-burn/` logs and receipt are still present.

## No masking found

The new guard calls the runtime's own `monAbility`, so it is partly self-referential. For these species, though, both ability slots are free of Run Away, so a bug in `monAbility` can't produce a false pass. The test changes don't touch the runtime, and they add no ability or held-item support.

## Pre-existing unsupported mechanics (not new defects, not exercised)

The runtime's `tryRun` (`battle.ts:135-141`) and the turn loop don't model:
- the Run Away ability or flee items like Smoke Ball;
- `BATTLE_TYPE_NO_EXP`;
- the `runFlag` side effects;
- trapping abilities or moves;
- the run-failure game stat.

None of the ordinary fixtures can reach these. They remain open parity gaps.

## Scope limits

- The dc1 version of the test file isn't in the snapshot, so I reviewed the current test bytes on their own rather than as a line-by-line diff.
- This doesn't approve Mom, the UI, later changes or general battle parity.
- The earlier runtime review is background only. It isn't a basis for approving these test bytes.
