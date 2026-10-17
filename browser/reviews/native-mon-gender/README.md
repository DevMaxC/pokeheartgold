# Native Pokémon gender rules

Ordinary creation compared the PID's low byte with `fraction * 256`. That made one extra PID byte female for each mixed ratio and made genderless Pokémon female. Trainer creation repeated the formula after replacing the PID, and its forced-gender selector also used the wrong raw ratio. These are the P3-3 source findings from the immutable broad `f21d568` review, plus the confirmed trainer consumer.

`gender.ts` is an import-free leaf shared by ordinary creation, Eggs and trainers. `nativeGenderRatio` implements `GENDER_RATIO` from `include/constants/pokemon.h:364`. `nativeMonGender` implements `src/pokemon.c:2094–2113`: raw 0 is male, 254 female, 255 genderless, and mixed ratios compare strictly against `(u8)pid`. The existing `nativeEggGender` export is preserved as an alias. There is no data/Egg import cycle.

Trainer creation uses that raw ratio in the existing ±2 selector branch and derives the final sex from its completed PID. The local LCG, class-dependent draw count, ability bits, cross-party selector carry, IV scaling, move/item overrides and factory random draw count are retained. Correcting forced-gender selectors intentionally corrects affected PIDs and therefore their natures/stats; it does not preserve the old erroneous values.

## Evidence and checks

`generate-native-oracle.py` extracts the literal `GetGenderBySpeciesAndPersonality_PreloadedPersonal` and `TrMon_OverridePidGender` definitions and compiles them with the actual gender constants/header. The small harness only supplies native-width integer typedefs and base-attribute access stubs. It exercises all 256 PID low bytes for all seven source ratios, and 441 native trainer selector cases. The committed oracle pins the original C/header/personal/template hashes; Node tests verify them and need no compiler.

`gender.test.ts` checks all imported personal ratios against the native source. It tests 5,376 ordinary factory PIDs and 5,376 existing Egg API calls, including unsigned high words and every low byte. The ordinary factory retains eight browser RNG draws and its PID, IVs, nature and instance-ID contract. It includes explicit Chikorita31, Pidgey127 and Magnemite cases.

`trainer-gender.test.ts` checks actual Irwin7 and Jasmine33 parties, all 126 combinations of trainer sex, native ratio, forced sex and ability selector, and a five-Pokémon selector-carry sequence. Expected selectors come from the compiled native function; an independent BigInt recurrence checks complete trainer PIDs. Actual source IV/move/item overrides are asserted.

The exact baseline `75393253` factories were restored temporarily in this isolated worktree for the before runs. Ordinary checks produced four expected failures and two passes; all four trainer checks failed on wrong sex/PID. The tests and source factories used are retained beside those logs. Final code passes all ten focused checks and 240 relevant battle/trainer/Egg/hatching checks, plus project TypeScript. `validation.json` records hashes, counts and scope.

Regenerate the C oracle from the repository root:

```sh
python3 browser/reviews/native-mon-gender/generate-native-oracle.py
```

Run the scoped regression set from `browser`:

```sh
node --experimental-transform-types --test src/source/gender.test.ts src/source/trainer*.test.ts src/source/battle*.test.ts src/source/early-battle-effects.test.ts src/source/eggs.test.ts src/source/egg-consumers.test.ts src/source/egg-hatching.test.ts src/source/egg-hatch-integration.test.ts src/source/egg-field-main.test.ts src/source/egg-hatch-phone-trigger.test.ts
npx tsc --noEmit
```

The core is a gender-rule correction. It does not claim full ordinary/trainer RNG, OT, ability, form, capsule or battle parity. Existing saved gender values remain as stored; there is no save migration. The original core checkpoint did not change main, World, UI, battle or script code. No Vite build or browser check was performed. Independent copied-source review receipts are recorded separately; the broad source review is not approval of this patch.

## Presentation follow-up

The actual read-only Opus5.5 core review at `e8966bdf` found no confirmed arithmetic defect, but raised an asset concern. Inspection confirmed that existing art has only male/female filenames. Native `pokemon.c:2269/2358` selects female art only for `MON_FEMALE`; genderless Pokémon use the male slot. The unchanged core review and its manifest/raw output are preserved as `core-opus-*`, including the confirmed consumer gap and correction of its claim that selectors121/137 were unused (actual Irwin/Jasmine fixtures require them).

`spriteGender` and `genderSymbol` are import-free presentation helpers. They keep gameplay genderless identity intact, use the male art slot for nonfemale Pokémon, and print no genderless symbol. Party portraits, the actual in-field 3D battle art cache, and standard hatch portraits use the sprite helper. Hatch scene identity comparison remains exact; accepting genderless art does not bypass the unexported Manaphy scene or Togepi-only cry guards. `battle.ts` image/status and the separate root InterfacePanels UI are owned by other concurrent work and must be integrated before releasing the whole feature. They are not silently treated as fixed by this leaf.

`verify-sprite-resources.py` performs a read-only RGBA pixel comparison of all108 existing front/back exports for54 native genderless base species against original indexed sprites with the exporter’s normal palette. It pins every source/palette/export and native C/XML symbol source, including Magnemite81 and Voltorb100. The Node regression checks these pins, all54 party views and actual `WorldBattleView.sync` front/back requests. Decoding alone is replaced in that stage test; actual sync/cache/visibility behavior runs. Hatch tests exercise reveal/finish/cancellation behavior and retain explicit unavailable cry rejection. This is base-form normal art evidence, not alternate-form/shiny/whole sprite-engine parity.

Restoring the exact three pre-fix consumer files after the core gender correction reproduces three failures among15 checks: nonexistent party/stage paths and rejected genderless hatch artwork. The candidate passes18 focused checks and258 targeted battle/trainer/Egg/hatch checks, plus TypeScript. Before/after logs and source copies are retained. Reproduce the new resource proof and focused checks with:

```sh
python3 browser/reviews/native-mon-gender/verify-sprite-resources.py
cd browser
node --experimental-transform-types --test src/source/gender-presentation.test.ts src/source/party-display.test.ts src/source/egg-hatch-view.test.ts
```

No main/World/battle/script runtime or existing resource bytes changed in this follow-up. Actual browser rendering and the integrated Battle/root UI consumer follow-up remain separate requirements. The original arithmetic review is not approval of changed presentation bytes.
