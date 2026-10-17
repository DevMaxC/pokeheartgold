## Verdict: no confirmed implementation defects; three test gaps, one of them a false coverage claim

I found no blocking bugs in `browser/src/source/battle-replacement.ts`. I did find three confirmed test gaps. The worst is a test whose comment claims it covers carrying the score over into Stage 2; that path never runs. I did not run anything or check any hashes. The proof logs (9/9 pass, empty `tsc.log`, `agent-checks.json`) are what the agent reported, not something I confirmed.

### Implementation: checked against the native source, all match
- **Stage 1** (`battle_controller_opponent.c:1131-1201` ↔ TS `:97-114`):
  - The score wraps to u8 after each of the two type-score adds (160+160 → 64).
  - Both of the reserve's own type slots are read as stored, so a mono-type counts twice.
  - The opponent's type 2 is only applied when it differs from type 1.
  - Strict `<` keeps the earlier party slot on ties.
  - Excluded slots are marked disregarded. A pick with no super-effective move is rejected and the next round runs. The loop stops when nothing is picked.
- **Stage 2** (`:1203-1260` ↔ TS `:115-125`):
  - The move-type lookup runs before the `move` check.
  - Only power 1 is skipped; power-0 moves are still evaluated.
  - The score wraps to u8 both before and after the type call, and an immune result zeroes it.
  - `score` carries over from Stage 1 and across skipped moves. TS initialising it to 0 can't be observed, because round 1 of Stage 1 always assigns it if any slot is eligible.
  - No PP check, in either version.
- **Selected and AI-switched slots:** in singles the partner is the battler itself (`battle_system.c:305-306`), so TS defaulting the partner fields to 6 excludes the same slots.
- **Task fallback** (`:5562-5575` ↔ TS `:133-138`): honours the pre-chosen slot, otherwise picks the first slot with HP that isn't the active or partner slot, and returns the party count if none.
- **`CalculateTypeEffectiveness`** (`battle_util.c:2576`): no Foresight-row skip is needed because a mon type can never equal 0xFE. `type-chart.json` is in source order, including the Foresight and end-of-table rows.
- **`CalcTypeEffectivenessFlags`, `ApplyEffectivenessFlags`, `CheckFlyingImmunity`, `CheckChargeMoveHitTurn`** (`:2331-2414`, `:6484`): same order of checks — Normalize, then the move-type override, then Levitate, then the Scrappy break, then the Gravity/Iron Ball skip, then per-slot flag updates, then Wonder Guard.
  - All the constants referenced exist in `constants.json`.
  - The flag bits match `battle.h:216-218`.
- **`TrainerAI_GetMoveType`** (`:1268-1374`):
  - Default and plateless Judgment both return 0, which means "use the move's data type".
  - The Hidden Power IV bit order matches.
  - Weather Ball: when several weathers are set, the last one checked wins.

### Test gaps (confirmed)
1. **`battle-replacement.test.ts:163` is a false coverage claim.** The comment says "power1 reuses Stage1 score80", but Seismic Toss is Fighting type (`moves.json` id 69, type 1) and the opponent defaults to Normal/Normal. Fighting is super-effective against Normal, so Stage 1 returns slot 1 and Stage 2 never runs (zero damage calls). No other case starts Stage 2 with a power-1 move, so an implementation that reset `score` to 0 at Stage 2 would pass every test.
   - **Fix:** use opponent `[TYPE_PSYCHIC,TYPE_PSYCHIC]`. Both reserves score 80 and neither has a super-effective move. Stage 2 then skips Seismic Toss with the carried-over score of 80 and picks slot 1 over Tackle's port value of 20. An implementation that resets the score would pick slot 2.
2. **`test.ts:69` (the C stand-in for `BattleSystem_ApplyTypeEffectiveness`) ignores and doesn't log `move`/`type`.** `compare` (`:120`) only checks the call count and the first wrapped byte. So the TS's `moveTypeOverride` argument and the order of calls are never compared with native. Passing 0 instead of `override` at TS `:120` would go unnoticed.
   - **Fix:** log the `(move,type,score)` tuples in C and deep-compare them with `calls`.
3. **`test.ts:143` sets `chargeMoveHit:gravity`**, so the charge-turn-hit flag and Gravity always vary together. Swapping the two in the TS would not be caught.
   - **Fix:** loop over the two independently.

Minor: test 1's title (`:123`) says "ordered flag rows", but it only checks type scores. Flag rows are covered by test 4.

### Explicit scoped limitations (not defects)
- **Weather Ball:** `FIELD_CONDITION_WEATHER` includes `FOG` (`battle.h:265`), so fog alone also leaves native `type` uninitialized. The TS comment at `:54` only mentions absent/suppressed weather. It still throws as long as the engine maps fog to "no supported weather".
- **Throwing is all-or-nothing:** any eligible Weather Ball user without weather, or a mon missing IVs or Natural Gift data, makes the whole selection throw.
- **The C stub's partner differs from native singles:** `test.ts:55` returns partner battler 1 while the battle type is singles. Native singles uses the battler itself. That is fine for exercising the explicit TS partner fields, but it isn't a native singles setup.
- **Natural Gift and move data aren't independently checked:** the Natural Gift rows just pass the item's type straight through on both sides, so they don't validate `items.json`. Move power, type and effect come from the same `moves.json` on both sides, so import errors in that data wouldn't show up.
- **The damage calls are neutral stand-ins:** `CalcMoveDamage` and `ApplyTypeEffectiveness` are replaced in the C test. Nothing here proves actual damage parity, or that the engine binds the outgoing actor correctly. The agent's notes say so accurately.
- **Bugsy 21:** the test checks the actual species, Technician (worked out from the personality bit, `trainer_data.c:437-455`), Sitrus's hold effect and the real move IDs. Its outcomes depend on the neutral damage stand-ins.

### Files read
- `src/battle/battle_controller_opponent.c`: 1097–1374, 5546–5580, and the `MOVE_STATUS_IMMUNE` define at :54
- `src/battle/battle_util.c`: 2083–2414, 2576–2593, 6484–6500
- `src/battle/battle_system.c`: 82–100, 300–316
- `src/trainer_data.c`: 271–467
- `include/constants/battle.h` and `pokemon.h`, via grep
- `browser/src/source/battle-replacement.ts`, `battle-replacement.test.ts`, `trainers.ts`
- `type-chart.json`, plus targeted greps of `constants.json` and `moves.json`
- `proof/*`

I only grepped the patch file headers. I did not read `pokemon.c` or `battle_controller_player.c`, and I did not verify any manifest or hashes.
