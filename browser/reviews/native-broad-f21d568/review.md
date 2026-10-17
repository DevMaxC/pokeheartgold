I reviewed the exact f21d568 snapshot statically with Read/Grep/Glob only. Nothing was run, built or tested, and I did not use a browser. I found **no confirmed P0/P1 defects**. I found three confirmed P2 and four confirmed P3 differences from native behaviour on reachable paths, plus a few confirmed but latent ones.

## A. Confirmed findings

### P2-1 — Running from wild battles uses the wrong odds
- **Where:** `browser/src/source/battle.ts:104-105`
- **Native:** `src/battle/battle_util.c:2812-2825`. If the player's speed is **≥** the enemy's, escape is guaranteed. Otherwise `run = speed*128/enemySpeed + runAttempts*30` is computed into a `u8` (it wraps above 255), and `runAttempts++` only happens *after* the roll.
- **Browser:**
  - Escape is guaranteed only when speed is strictly `>`. Equal speeds fall into the formula, so the first try succeeds only about 158/256 of the time.
  - `fleeAttempts++` happens before the roll, so every attempt gets an extra +30.
  - There is no `u8` wrap, so after five or more failed attempts the browser's odds stay high, while native odds drop.
- **Scope:** every wild battle (Route 29 onward).
- **Repro:** a wild mon whose raw speed equals the player lead's, select Run. Native always escapes; the browser can fail.
- **Fix direction:** mirror the native branch order and the `u8` truncation.

### P2-2 — Burned physical attackers deal too little damage
- **Where:** `browser/src/source/battle-math.ts:38-39`
- **Native:** `src/battle/battle_util.c:5858-5863` halves for burn after `/50`; the `+2` is added at the very end (`:5946`). So native damage is `floor(base/2)+2`.
- **Browser:** adds `+2` first, then halves, giving `floor((base+2)/2)`. That is one point lower before crit, random roll, STAB and type multipliers.
- **Scope:** any burned physical attacker, e.g. after an Ember burn (effect 4 is implemented) in an early-route fight.
- **Fix direction:** apply the halving before `+2`.

### P2-3 — Choosing Mom's savings has no effect on battle winnings
- **Where:** the choice sets `FLAG_SYS_MOMS_SAVINGS` at `phone.ts:13`, but `main.ts:348` always credits 100% of the prize to the wallet.
- **Native:** `src/battle/battle_setup.c:394-416` moves a quarter of the money gained into Mom's savings when the flag is set (and can queue Mom's call trigger 12). `battle_command.c:2253` plus `subscript_0004_BattleWin.s:65-66` choose the "sent some to Mom" message.
- **Scope:** every trainer win after answering Yes to Mom (Route 30/31 trainers, Violet Gym, Falkner). The wallet ends up too high and there is no savings balance at all.
- **Note:** the ledger lists the savings system (P10-019) as Pending, but the choice itself is implemented and then silently produces the wrong money. This is a silent wrong result, not an explicit gap.

### P3-1 — Critical hits are disabled in the first rival battle
- **Where:** `main.ts:342` disables crits for any `TRAINERCLASS_PASSERBY` battle.
- **Native:** `battle_command.c:1213` disables crits only for `BATTLE_TYPE_TUTORIAL` or `BATTLE_SPECIAL_FIRST_RIVAL`. That special flag is set only by the wild `SetupAndStartFirstBattle` (`encounter.c:633-645`, reached via `scrcmd_c.c:2597-2601`). The Cherrygrove rival uses the ordinary `TrainerBattle TRAINER_PASSERBY_BOY*, 0, 1, 0` (`scr_seq_0850_T21.s:551-561`), so native crits are possible there.
- **Scope:** the Cherrygrove rival fight. Outcome odds differ; progression is unaffected because the player is allowed to lose.

### P3-2 — Signs and background events ignore facing rules
- **Where:** `main.ts:367`
- **Native:** `field_interaction.c:92-142` checks only the tile the player is facing, requires the event's `dir` to be compatible with the player's facing, and skips hidden items already collected.
- **Browser:** ignores `dir`, also matches the tile the player is standing on, and has no collected-hidden-item check.
- **Witness:** Violet Gym statues are `dir:0` (`131_T22GYM0101.json`, tiles (12,26) and (18,26)). Natively they can only be read while facing north; the browser reads them from the side. Several Elm's Lab background events are also `dir:0`.

### P3-3 — Wild/starter Pokémon gender is off at the boundary, and genderless becomes female
- **Where:** `data.ts:33` uses `personality%256 < ratio*256`.
- **Native:** `pokemon.c:2094-2112` uses `rawRatio > (u8)pid`, where `GENDER_RATIO(f) = f*254.75` (31/63/127/191) and 255 means genderless (`pokemon.h:356-364`).
- **Browser:**
  - One extra low-byte value becomes female (e.g. 1 in 256 Chikorita/Pidgey get the wrong gender).
  - Genderless species (`genderRatio: 2.0`) always come out `'female'`.
- **Note:** `eggs.ts:12-14` already has the correct formula, but `createMon` does not use it.

### P3-4 — Continue runs OnTransition scripts and resets map-entry state
- **Where:** `main.ts:442` calls `enterMap(..., runEntry=true, restoreObjects=true)`. That runs `fieldEntryScripts('warp')`, i.e. OnTransition + OnLoad + OnResume (`field-transitions.ts:21-23`). It also resets the blackout spawn and clears Flash/Defog (`main.ts:265`).
- **Native:** normal Continue (`field_warp_tasks.c:434-439`) skips `FieldSystem_InitMapOnEnter`. Only OnLoad/OnResume run (`fieldmap.c:189,213`).
- **Witness:** weekday-dependent OnTransition scripts are re-evaluated on Continue, e.g. Route 29's `FLAG_UNK_207` after the Zephyr Badge (`scr_seq_0225_R29.s:19-37`) and New Bark's `VAR_TEMP_x4007` reset (`scr_seq_0842_T20.s:35`).
- **Impact:** low.

### Confirmed but latent (no completed supported-route witness found)
- **`HidePerson` doesn't set the event flag:** `objects.ts:18` / `script.ts:151` only set a transient `shown=false`. Native `MapObject_Delete` sets the flag (`map_object.c:289-294`). Every supported script I checked sets the flag explicitly; the item-ball standard script (`scr_seq_0141.s:1817`) relies on it but stops earlier at an unported command.
- **Temporary vars/flags are never cleared on map entry:** native clears them on every warp/connection (`script_manager.c:399-408`, called from `field_warp_tasks.c:230-232`); the browser never does. Every temporary-variable read I found on supported maps is preceded by an explicit set.
- **`MovePerson` is mis-parsed:** `script.ts:149` reads `a[3]` but the macro has 3 args (`script.inc:1940-1945`). That would be a TypeError instead of an explicit unsupported-command stop. Native semantics are also different: it edits the event's default position (`scrcmd_c.c:2978-2984`), not the live object. It is only used on unsupported maps.
- **Extra entry scripts after a lost trainer battle:** after a non-`canLose` trainer loss, the nested battle resume (`script-recovery.ts:116`, `main.ts:353`) runs the battle map's OnLoad/OnResume before the script's `WhiteOut`. Native skips the overworld restore entirely (`encounter.c:145-151`). Supported trainer maps (R30/R31, Violet Gym) have no OnLoad/OnResume, so there is no visible effect today.
- **Struggle gets STAB and type matchups:** `battle.ts:136,191`. Native returns before STAB/type for Struggle (`battle_util.c:2240-2242`), so it hits Ghost types normally. Only reachable once all PP is gone.
- **Flash/Defog cleared on connections:** `main.ts:265` clears them on connections too; native clears them only on warps (`field_warp_state.c:57-59`).

## B. Concerns that need runtime evidence
- **Per-frame camera cost:** every frame walks all visible cell meshes and raycasts against them (`world.ts:242`, also `egg-hatch-view.ts:137`). `VERIFICATION.md:130` has limited timing samples; a worst-case frame cost is not established.
- **Dual-type damage rounding:** the browser rounds type effectiveness once (`battle-math.ts:43`); native rounds after each type in table order (`battle_util.c:2284-2302, 6450-6453`). Results could differ on odd damage when a ×0.5 entry precedes a ×2 entry. I did not confirm a reachable species/move pair.
- **Ball thrown in a trainer battle:** the browser consumes neither the ball nor the turn (`battle.ts:216`). I did not confirm what native does.

## C. Completeness limits (explicit guards and documented gaps, not defects)
- **Item balls and hidden items** stop at the unported `ItemIsTMOrHM` (`scr_seq_0141.s:1819`, `scr_seq_0145.s:540`), e.g. the hidden Potion in New Bark at (682,391). The scene is rolled back and reported.
- **Unsupported script/battle features:** multi-choice menus, double/tag trainer battles (`main.ts:246,359`), and unported move effects (`battle.ts:162`). Wild/trainer move choice is random, so any battle can hit an unported effect and roll back.
- **Not implemented:**
  - Battle: evolution, abilities, held items, weather damage modifiers, trainer AI.
  - Field steps: step friendship, poison and Repel.
  - Phone: only Elm's hatch call (#13) can be answered; random calls ring with no indicator until they time out.
  - Hatching: only the Togepi cry and art exist.
  - Breeding/daycare.
  - Saves: no schema migration beyond the `version===2` check.
  - Interactions: no tile-based interactions (PC, TV, bookshelves).
  - Sound: there is no toggle in Options, and new games start with it off.

## D. Coverage
- **Read fully:**
  - Field host, VM and recovery: `main.ts`, `script.ts`, `script-recovery.ts`
  - Battle: `battle.ts`, `battle-math.ts`, `battle-experience.ts`, `trainers.ts`, `trainer-encounters.ts`, `trainer-script-state.ts`, `encounter.ts`
  - Eggs: `eggs.ts`, `egg-hatching.ts`, `egg-hatch-presentation.ts`, `egg-hatch-view.ts`
  - Phone: `phone-field-host.ts`, `phone-random.ts`, `phone-scheduler.ts`, `phone.ts`
  - World and field: `world.ts`, `camera.ts`, `gym-violet.ts`, `field-transitions.ts`, `objects.ts`
  - UI, data and opening: `ui.ts`, `data.ts`, `bag.ts`, `party-order.ts`, `opening.ts`
  - Importer script parsing
- **Native evidence read:** the relevant parts of `scrcmd_c.c`, `script.inc` macros, `field_control.c`, `field_warp_tasks.c`, `get_egg.c`, `gear_phone_ring_manager.c`, `overlay_2_gear_phone.c`, `encounter.c`, `encounter_check.c`, the battle util/command/setup files, `trainer_data.c`, `pokemon.c`, `map_object*.c` and `field_interaction.c`, plus the scripts and event tables for New Bark, Elm's Lab, Route 29, Cherrygrove, Route 30, Violet, Violet Gym and the shared standard/trainer banks 0003, 0141, 0145 and 0953.
- **Shallow or not reviewed:** rendering and asset code (`battle-stage`, `render-repair`, terrain/terrace/scenery, all `*-building-shells`, furniture, sky/atmosphere, grass, ledges), `hatch-music`, `script-camera`, `opening-view`/`stage`, `party-display`, the legacy `browser/src/{main,scene,world}.ts`, and the tests. Visual and audio behaviour was not assessed. This request is broader than what one static pass can cover exhaustively.

## E. Overall
For f21d568 only: the transaction and rollback layer, VM dispatch and the egg/phone lifecycles hold together well, and unsupported paths mostly stop explicitly and roll back. The confirmed problems are fidelity errors in implemented battle math (escape odds, burn damage, first-rival crits), the Mom's savings economy, and field interaction and gender rules; none blocks progression on its own. This is not a release approval and it does not carry over to any later commit.
