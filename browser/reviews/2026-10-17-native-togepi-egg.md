# Native Togepi Egg acquisition

Base: `d254f4f`. This implements acquisition and persistent Egg identity; it does not implement hatching or establish a rendered playthrough. Main/World/battle integration remains root-owned and must exclude Eggs before the gift is enabled in the combined build. The earlier first-badge review's explicit `GiveTogepiEgg` blocker is superseded by this acquisition implementation.

## Source and saved behavior

- `src/get_egg.c:561–593`, `src/pokemon.c:168–254`: native level1 creation with fixedIV32. Four consecutive `LCRandom` halfwords supply PID low/high, then packed HP/Attack/Defense and Speed/Sp.Attack/Sp.Defense IVs. PID and saved LCG state remain unsigned32-bit values.
- `src/math_util.c:70`: native LCG multiplier1103515245/addend24691, wrapping at32 bits. Egg creation uses a separate saved browser Egg stream. Initial browser entropy is an adaptation; it is not represented as equivalent to the DS's global RNG/system seeding or MT initialization.
- `include/constants/pokemon.h:363`, `src/pokemon.c:2094`: `GENDER_RATIO` truncates `fraction*254.75`, then compares raw ratio greater than PID low byte. Togepi's raw31 boundary makes30 female and31 male; multiplying the imported fraction by256 would be wrong.
- `SetEggStats`: Egg friendship stores10 hatch cycles, nickname is original species494 `Egg`, Poké Ball4, met level0, isEgg=true. Normal HP/stats exist internally; they never make the Egg usable in battle.
- `src/trainer_memo.c:753–757,796–846`: memo strategy3 writes current player OT ID/name/gender and Egg date/location2013(Mr. Pokémon gift), while clearing ordinary met date/location. The temporary Egg location1 from SetEggStats is overwritten by the final memo.
- `src/field/scrcmd_pokemon_misc.c:1034–1078`: insert Extrasensory326 into first empty move slot(or slot3 if all four occupied), with full PP; add only to the party if it has space; save the actual donated PID/gender. The apparent native use-after-free when reading the just-added mon is not reproduced; the browser records the still-owned Egg object.
- `src/field_misc_events.c:278–314`: gift identity checks Togepi/Togetic/Togekiss species, player OT ID/gender, language2, game7 and saved PID/gender. It does not itself reject an unhatched Egg. Native `GetPartyMonSpecies` separately masks Eggs to SPECIES_NONE.

New optional saved fields are `State.trainerId`, `State.nativeEggSeed`, `State.togepiGiftIdentity` and `Mon.provenance`. New games initialize a full32-bit trainer ID using injectable browser entropy. Old v2 saves without it initialize once upon a successful acquisition; subsequent saves/Continue retain it. Egg draft construction commits no profile/seed/party changes until it succeeds. Full parties consume no entropy or date calls and never send this gift to a PC. Root's source transaction restores all these fields if later receipt dialogue/movement fails. An existing saved seed replays deterministically after rollback; an uninitialized legacy profile/seed can draw fresh bootstrap entropy on another attempt. RTC dates outside the native2000–2099 range reject without committing a gift. Existing `Mon.id` remains a browser instance token, not OT authority; this Egg reuses PID for that token without an extra RNG draw.

The VM supports `GiveTogepiEgg`, `MonIsFromTogepiEgg` and `PartyCountEgg`. Existing non-Egg counts/double eligibility remain correct; `GetPartyMonSpecies` now returns0 for an Egg. Generic `giveMon` no longer registers Eggs in the Pokédex. Generic `GiveEgg`/breeding gifts remain unsupported instead of borrowing this specific quest's provenance or Extrasensory rule.

## Original aide script

Map157/script0858 executes unchanged. Acceptance with space creates the Egg, sets receipt flag, prints the imported gender-specific/native receipt text, hides the aide, reveals the Kimono Girl and moves Violet scene to3/Elm Lab to7. Refusal/full-party branches preserve native retry flag06F. Actual NPC disappearance prevents another user interaction; the opcode itself is not given an invented receipt-flag guard. An acquired Egg stays `isEgg=true` across JSON persistence.

## Required root integration

Helpers exported from `eggs.ts`:

- `isUsableBattler(mon)` rejects Eggs even with positive HP.
- `firstUsableBattlerIndex(party)` returns−1 if none exists.
- `firstFollowerMon(party)` selects the first live non-Egg, or first fainted non-Egg only when no usable mon exists (`src/follow_mon.c:1518–1523`). An Egg-only party yields no follower.
- `partyMonSpecies(mon)` implements the native Egg species mask.
- `NATIVE_EGG_ICON` points to the original party icon501, first32×32 frame with palette-index0 transparency.

Root must use the battle helpers at battle start, switch validation/disabled buttons, all-fainted detection and EXP eligibility; use the follower helper during hydration and render; use eligibility before field encounters/battles; display the Egg icon/name in party/summary without exposing Togepi's normal portrait, level, HP, gender or combat stats. No `main.ts`, `world.ts` or `battle.ts` edits are made in this branch. Source acquisition alone cannot be marked ready for integrated gameplay without these guards.

## Tests, review and remaining gap

Targeted Egg/badge fixtures pass23 tests: exact seed1 words/PID/IVs, raw31 boundary, all32-bit seed/profile bounds, capacity atomicity, old-save initialization and continued LCG sequence, provenance mismatches/evolutions, native species mask/counts, positive-HP Egg battle/follower exclusion, actual aide receipt flags/text, no Pokédex registration, and source transaction rollback of Egg/profile/seed/identity. Combined Egg/badge/battle/recovery regression passes48/48; TypeScript passes. Full suite before the deterministic presentation-fixture correction:487/489; one trainer-ID comparison is fixed and retested, while the remaining unchanged baseline opening-save fixture needs root's merged recovery-global context. No battle/main/world runtime edit was made here.

Icon output and eleven original source/palette hashes are recorded in `public/source/eggs/provenance.json`; palette bank1 is asserted against all16 embedded colours and the original JASC palette. Actual read-only Opus5.5 review found no confirmed hard scoped defect. Its model-use/input-hash receipt and disposition are in `2026-10-17-native-togepi-egg-opus-5.5.{md,json}`. Species-name buffers correctly use actual MON_DATA_SPECIES (`message_format.c:129–138`); their names are not changed to an invented Egg mask. These source checks do not substitute for the required root guard integration or rendered verification.

Hatching is deliberately unimplemented here. Native `get_egg.c:735–811,896–989` requires a saved shared step-cycle counter, date/penalty-dependent cycle length, ability modifiers, correct Egg friendship decrement order, a scheduled hatch event and hatch recreation/memo updates. No arbitrary step count or regular Togepi substitution is introduced. Friendship stays10 and the Egg remains an Egg until that system is implemented. Generic Eggs, hatch presentation, legacy mon OT migration and complete global RNG equivalence remain gaps. No build/browser was run, and no whole-game parity requirement is promoted to Verified.
