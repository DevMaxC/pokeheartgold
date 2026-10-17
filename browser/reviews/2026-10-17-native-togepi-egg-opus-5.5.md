**Verdict:** I found no confirmed hard correctness bugs in the scoped feature code: `eggs.ts`, `native-rng.ts`, the `data.ts` changes to `newState`/`giveMon`, the new optional `types.ts` fields, and the Egg commands in `script.ts`. I only read files; nothing was executed, written or copied. The "23 tests pass and tsc passes" claim is from your evidence; I didn't run them.

## Checked against the C source and found consistent

- **LCG** (`native-rng.ts:2-5` vs `math_util.c:70-74`): `Math.imul` followed by `+24691` and `>>>0` gives the correct 32-bit wrap, and it returns the high halfword. Every 32-bit seed is accepted.
- **Draw order** (`eggs.ts:17-18` vs `pokemon.c:195,226-239`): there are exactly 4 halfword draws: PID low, PID high, then HP/Atk/Def, then Spe/SpA/SpD, each masked 0x1F, 0x3E0>>5, 0x7C00>>10. `(low|(high<<16))>>>0` stays unsigned. `OT_ID_PLAYER_ID` is 0 (`pokemon.h:352`), so there is no extra OT draw at `pokemon.c:198-204`. Nothing else in `SetEggStats` or the memo code calls `LCRandom`.
- **Gender** (`eggs.ts:10-12` vs `pokemon.h:364` and `pokemon.c:2094-2111`): the raw byte is `floor(f*254.75)`, with 0→male, 254→female, 255→genderless (the JSON uses 2.0 for genderless), and otherwise compares raw against the PID low byte.
- **Moves** (`eggs.ts:19-21` vs `pokemon.c:3049-3056` and `scrcmd_pokemon_misc.c:1055-1069`): known moves are skipped and a full moveset drops its first move. Extrasensory goes into the first empty slot, or slot 3 if all four are full, with full PP.
- **Egg stats and memo** (`eggs.ts:22-24` vs `get_egg.c:566-593` and `trainer_memo.c:749-753`):
  - friendship = egg cycles; Poké Ball; met level 0; `isEgg`; nickname from `SPECIES_EGG`.
  - Memo strategy 3 overwrites the temporary egg location 1 with 2013 plus the egg date, clears met location/date, and sets OT ID, gender and name.
  - Language 2 (`config.h:17,41`).
- **Gift identity** (`eggs.ts:36-39` vs `field_misc_events.c:278-315`): same fields in the same order, and it accepts Togetic/Togekiss without its own Egg check.
- **Atomic failure:**
  - The capacity check comes before any entropy or date call (`eggs.ts:30`, matching `scrcmd_pokemon_misc.c:1046`).
  - The draft builds into local variables only, and the commit at `eggs.ts:32` can't throw partway.
  - `restoreStateInPlace` (`script-recovery.ts:8`) also deletes `trainerId`/`nativeEggSeed`/`togepiGiftIdentity` that were first added during a failed action.
  - Rolling back the saved seed means a retry recreates the same Egg.
- **Script argument layout:**
  - `GiveTogepiEgg` takes no arguments (`157.json`: `["GiveTogepiEgg",[]]`).
  - `MonIsFromTogepiEgg` resolves `a[0]` as a value and writes to `a[1]`, matching `ScriptGetVar` then `ScriptGetVarPointer` (`scrcmd_pokemon_misc.c:1082-1083`). The native command is marked `// unused`.
  - `GetPartyMonSpecies` masks Eggs to 0 (`scrcmd_party.c:50-54`).
  - `PartyCountEgg`/`PartyCountNotEgg` and `GetPartyLeadAlive`, which falls back to 0, match `field_misc_util.c:193-204`.
- **Aide script** (`scr_seq_0858`): the full-party check and the native retry flag `FLAG_UNK_06F` are preserved, and the opcode has no added guard.
- **Icon:** native index 501 for a non-Manaphy Egg (`pokemon_icon_idx.c:32-37`), using the top 32×32 frame with index 0 transparent. The exported image looks like an Egg.

## Low-severity notes (not hard bugs)

1. **`eggs.ts:23` `id: personality`.** Elsewhere `Mon.id` looks like a random ID (`data.ts:35`), and nothing reads it. The real OT ID lives in `provenance.otId`. Remedy: document what `id` means, or make it `trainerId` so a later reader doesn't take it for an OT ID.
2. **`eggs.ts:8` `nativeDate`** throws for local years outside 2000–2099. This rolls back cleanly, but the gift then fails where the DS clock could never be out of range. It's a declared adaptation; mention it in the review note.
3. **`data.ts:38` `giveMon`** still sends a 7th mon, Eggs included, to the PC. No Egg path calls it today. If generic `GiveEgg` is added later, it needs a party-only path like `scrcmd_party.c:89`.

## Unconfirmed risks (the source needed to check them isn't in the snapshot)

- **Icon palette:** the native Egg uses palette slot `sPokemonPalNoBySpeciesAndForm[494]`. Counting entries from `pokemon_icon_idx.c:104` gives 1 (my count). `export_egg_assets.py:8-12` relies on the PNG's embedded palette instead of picking that slot from the icon palette file. The colours look right but haven't been checked against slot 1.
- **Species-name buffers on an Egg slot** (`script.ts:204`): `BufferMonSpeciesName`/`…Indef` use the real species. I couldn't confirm whether native returns Togepi or "Egg" here (its source, `scrcmd.c`, isn't in the snapshot). The aide flow doesn't hit this.
- **`GAME_VERSION` = 7** (HeartGold) comes from exported constants. A SoulSilver build would need 8.
- **No evolution system exists in the browser**, so the Togetic/Togekiss branch matches the source but nothing can reach it.

## Incomplete by design (not defects)

Hatching isn't implemented: the Egg stays `isEgg` with friendship (hatch cycles) at 10. Also out of scope: generic `GiveEgg`/breeding, OT migration for existing mons, and global LCG/MT equivalence. Script `Random` (`script.ts:217`) and other draws don't advance the saved Egg stream.

## Root-owned integration still to do (nothing was changed here)

With a positive-HP Egg in the party, these current sites would treat it as usable:

| Site | Current code | Needed |
|---|---|---|
| `battle.ts:27` initial lead | `findIndex(m=>m.hp>0)` | `firstUsableBattlerIndex` |
| `battle.ts:64` switch buttons | `hp<=0` disables | `!isUsableBattler` |
| `battle.ts:94` all-fainted / forced switch | `some(m=>m.hp>0)` | `some(isUsableBattler)` (otherwise the player can never lose and is offered the Egg) |
| `battle.ts:188` EXP | goes to `this.player` | safe once an Egg can't become active |
| `main.ts:245` field battle gate | `some(m=>m.hp>0)` | `isUsableBattler` |
| `main.ts:144`, `main.ts:337` follower | `find(m=>m.hp>0)` | `firstFollowerMon` (otherwise a Togepi follower appears) |
| `main.ts:310` summary | shows types, OT, HP, stats and the species front sprite | Egg name/icon only, via `NATIVE_EGG_ICON` |

Until these land, the gift shouldn't be enabled in the combined build, and source tests shouldn't be described as gameplay or visual parity.

## Implementation response

No confirmed hard core-code defect was reported. This was an actual claude-opus-5-5 source review; model-use/input hashes are in the companion JSON. The small Haiku CLI routing request (17 output tokens) is recorded separately. It is not a gameplay or rendered approval.

- `Mon.id` is clarified as a browser instance token; OT authority is `provenance.otId`. Reusing PID avoids an invented fifth LCG draw. No code currently treats this instance token as OT provenance.
- Browser RTC years outside2000–2099 reject atomically; this is documented as the DS's supported date range rather than fabricated date truncation.
- Generic `giveMon` retains its preexisting PC fallback, while the specific Togepi command never calls it. Future generic Egg acquisition must use its own party-only implementation; none is claimed here.
- Icon uncertainty is resolved: the original C palette table's Egg index494 selects slot1. Every embedded PNG colour matches JASC palette entries16..31. The exporter now asserts this exact match and records the palette-file hash as well. The RGBA frame/colours themselves did not change.
- Species-name buffers are resolved by `src/message_format.c:129–138`: both normal/indefinite buffers explicitly use MON_DATA_SPECIES, so Togepi is correct for those commands. The separate party-species query masks Eggs to0 as implemented. No broader buffer mask is added.
- A saved LCG seed/profile reproduces deterministic creation after rollback. For a legacy save with no initialized seed/profile, rollback removes newly allocated values; a first initialization on a subsequent attempt can use fresh browser entropy. This is part of the explicit browser bootstrap adaptation, not a claim of global native RNG rewind.

The combined root must land/test the listed lead/switch/EXP/follower/icon guards before release. Core gift flags advance normally after successful creation; no artificial feature flag or silent no-op was added. Hatching remains unimplemented and isEgg stays true. A separate deterministic profile RNG argument was added to the preexisting presentation-equivalence fixture, so it compares identical states rather than removing trainerId from assertions.
