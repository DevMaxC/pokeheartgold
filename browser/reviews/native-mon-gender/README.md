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

This is a gender-rule correction. It does not claim full ordinary/trainer RNG, OT, ability, form, capsule or battle parity. Existing saved gender values remain as stored; there is no save migration. No main, World, UI, battle or script code changed. No Vite build or browser check was performed. Independent copied-source review receipts are recorded separately; the broad source review is not approval of this patch.
