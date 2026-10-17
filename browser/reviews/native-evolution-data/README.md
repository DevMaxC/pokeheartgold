# Native evolution data and eligibility leaf

Base: native campaign `873de2c1e119736344b0a3754cfcd9b88ca504a4`.
Scope: new `evolution-native.ts`, its tests and the original-C oracle. No existing
Main, Battle, VM, World, Mon/State types, original data, assets or audio change.
This leaf does not add a live evolution scene or fix the post-battle caller alone.

`loadNativeEvolutionData(gameData)` loads the existing `evolutions.json` and
validates/resolves it against original items, personal entries and constants.
`parseNativeEvolutionData(raw, gameData)` is the deterministic equivalent.
Both copy/freeze the admitted records; forged/unparsed data is not accepted by
the predicate. A source/configuration/I/O error is explicit, without fallback.

The native source has **230 declarations and 247 declared rules**, including an
identical repeated Weepinbell declaration. `evo.json.txt` emits designated C
initializers: the last declaration replaces the entire record. This yields
**229 species with rules, 246 effective rules, 494 national-index slots and
seven records per slot**. The loader retains every declaration in `sourceRows`,
preserves original order, and reproduces the same zero fill/replacement. The
original files are unchanged.

## Controller contract

```ts
const evolutions = await loadNativeEvolutionData(gameData);
const decision = selectNativeLevelEvolution(
  evolutions, state.party, mon,
  {
    night: nativeEvolutionNight(actualNativeRTCHour),
    evolutionLocation: nativeMapEvolutionMethod(actualMapID),
  },
);
```

The result is `eligible` (target, numeric `method`, `methodKey`, `param`, original
row index and `methodRet`), `ineligible` (reason and `methodRet`), or `unsupported`
(reason and required missing input). Do not convert `unsupported` to false.
`methodRet: null` means the C function did not write that output; it is distinct
from a written zero. Item-check/use write zero after a matched stone rule.
`NATIVE_EVOLUTION_METHOD.EVO_LEVEL` is the original enum value 4; the general
browser constants export does not contain those enums. The source enum order is
independently checked against the original header.

`selectNativeEvolution` additionally accepts native `trade`, `item-check`, and
`item-use` contexts. Eligibility is separate from admission of those gameplay
features. It does not consume items, mutate a Mon, create Shedinja, update the
Pokédex, play a scene, learn moves, persist, or implement cancellation.

Native `BattleSystem_CheckEvolution` owns outcome gating and actual level-up
party bits. In particular, this predicate adds **no HP guard**. The controller
must invoke it for the real queued slot using post-battle persistent stats and
known moves, not temporary battle modifiers or the current active battler.
The subject Egg flag is deliberately not an added eligibility guard: native
GetMonEvolution does not test it. Actual battle level-up admission must exclude
Egg subjects, rather than infer safety from this predicate.

## Literal native rules and unavailable inputs

| Source methods | Required predicate evidence |
| --- | --- |
| Friendship/day/night (1–3) | Actual friendship; day/night is needed only if the threshold can match. Native late/night is hours 00–03 and 20–23, not 18:00. Caller supplies its RTC observation. |
| Level/Ninjask (4/13) | Actual current level; no additional HP/ability filter. |
| Trade/item trade (5/6) | Explicit trade context and the raw held item. This does not implement a trade system. |
| Stones and gender stones (7/16/17) | Actual used item; source gender is recalculated from personal gender ratio and PID, ignoring cached `Mon.gender`. |
| Atk/Def (8–10) | Persistent native Attack/Defense, with exact greater/equal/less branches. |
| PID split (11/12) | `(PID >>> 16) % 10 < 5` or `>= 5`, not the low PID word. |
| Shedinja (14) | Literal method-output-only write: this row never selects Shedinja as a target. Below Nincada's level20 threshold it can return no target while writing method14. Creating Shedinja after a successful Ninjask evolution belongs to `EvolutionScene_ApplyEvolutionEffects`, with actual Poké Ball/party constraints and copied-state effects. |
| Beauty (15) | Explicit saved beauty. Current `Mon` has no beauty field: Feebas returns unsupported when it is absent, not an invented zero or false. |
| Held item day/night (18/19) | Raw held item ID and actual RTC; held-item consumption is a later scene effect. |
| Knows move (20) | Actual current four move slots, not any move in a learnset. |
| Other party species (21) | Explicit real party or explicit native NULL. `Party_HasMon` uses species-or-Egg: Egg/corrupt Remoraid does not qualify; fainted Remoraid does. Missing party is not silently treated as NULL. |
| Gender level (22/23) | PID/personal-derived gender and actual current level. |
| Coronet/Eterna/Route217 (24–26) | Literal evolution-location argument matching the method. HGSS `MapHeader_GetMapEvolutionMethod` **always returns EVO_NONE (0)**. The helper preserves that behavior, without inventing HGSS proximity triggers. Generic explicit arguments remain testable as original GetMonEvolution behavior. |

Everstone uses raw `HOLD_EFFECT_NO_EVOLVE` (64), even with Klutz or other battle
suppression. Kadabra bypasses it. Native `item-use` bypasses it, whereas
`item-check` does not. Spiky-ear Pichu form1 cannot evolve in any context; a Pichu
with absent/invalid form is unsupported. An ordinary level-rule species does not
require a guessed form. Corrupt/invalid subject species and invalid required
state are explicit unsupported results. This is not an encrypted-save emulator.

## Verification and limits

Commands, from this isolated worktree:

```sh
cd browser
node --experimental-transform-types --test src/source/evolution-native.test.ts
./node_modules/.bin/tsc --noEmit
cd ..
python3 browser/scripts/test_evolution_native.py
```

13 Node tests include **9,359 differential cases**, with that corpus count pinned.
All26 nonzero native methods
are selected, or (method14) observed as the literal no-target output write. The
oracle extracts seven unchanged original C function bodies: `GetMonEvolution`,
`MonHasMove`, `Party_HasMon`, the PID/personal gender kernel, `IsNighttime`, its
hour table, and `MapHeader_GetMapEvolutionMethod`. It compiles against original
headers and original JSON/CSV initializer tokens. Python additionally verifies
the exported evolution, personal and item records equal their native inputs.

Device/storage getters, allocation and current RTC reading are explicit bounded
stubs. This proves the eligibility kernels for those supplied values, not the
encrypted Pokémon ABI, DS hardware, battle queue, scene FSM, item consumption,
Shedinja creation or full campaign. No browser, audio or Vite build is used.
No all-method presentation or global gameplay parity claim follows from this
predicate coverage. The separate controller initially admitting ordinary level
evolution is a narrower integration boundary.

`validation.json` and its logs preserve the initial11-test `ffb402db` snapshot.
`opus-ffb402db` contains the actual initial ACCEPT plus its two small boundary
findings. The separate `boundary-hardening` evidence uses the unchanged old
source: both new controls fail there (11 pass/2 fail) and pass after the two-line
correction (13 pass). `validation-hardening.json` pins the current predicate,
tests and compiler receipt. Initial review approval does not transfer to those
new bytes; the follow-up review is preserved separately.
