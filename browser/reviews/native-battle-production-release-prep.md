# Battle-only production release preparation

This branch starts at the actual production commit `5b7ac9fb4a8373e164f95d33024ec1135722d082`. It brings the reviewed single-battle EXP planner, participation masks, per-action faint/EXP/outcome boundary, residual/replacement order, zero-speed fix, and source-owned no-target predicate onto that base. No claim of full battle or game parity is made.

## Included commits and dependency adaptation

| Original scoped commit | Release cherry-pick | Behavior |
| --- | --- | --- |
| `f6791bc` | `18fab57` | Integer native EXP recipient reward helper and original review receipts |
| `713de86` | `66436be` | Pure party reward planning, item effects and explicit participation masks |
| `b30324e` | `15cc2b5` | Battle participation tracking and EXP before residuals; production dependency adaptation below |
| `2e85fc2` | `de0cdec` | Preserve a native effective speed of zero |
| `feaa790` | `65158d1` | Settle each Fight action, allow surviving actors, and bound no-target completion using original target/charge tables |

Production already has the required battle math, move/item/messages data, trainer factory, and optional `Mon.isEgg`. Its battle math is unchanged. The newer Egg gift/provenance/profile/RNG/field/UI system is not a dependency of this release.

`battle-party.ts` extracts only the exact reviewed `isUsableBattler` and `firstUsableBattlerIndex` predicate bodies. `battle.ts` is byte-identical to the final `feaa790` file after normalizing that import from `battle-party.ts` to `eggs.ts`. The EXP helper is byte-identical to `713de86`. The reviewed battle-menu and switch eligibility checks remain, so an optional saved Egg cannot become an active combatant or dilute the participation mask. No standalone party UI is introduced.

Three new fixture calls use production's existing three-argument `newState`. The final action-end exclusion fixture uses an explicitly marked optional legacy Egg record instead of invoking the unshipped native Egg gift. This tests exclusion only; it supplies no gift or hatching evidence. Four additional public `Battle.start` tests cover a JSON-reloaded positive-HP Egg before the real lead, no usable party, an injected invalid switch consuming no turn, and losing when only an Egg remains.

No changes are made to `main.ts`, World, terrain, battle view, standalone UI, types, data loading, assets, trainer creation, Egg acquisition or hatching.

## Validation and review qualification

From `browser/`, these commands passed:

```sh
node --experimental-transform-types --test src/source/battle*.test.ts src/source/early-battle-effects.test.ts
npx tsc --noEmit
```

The targeted run has **106 passing checks**, comprising 84 top-level tests and 22 original-source target/charge subcases; no failures, skips or cancellations. It includes the battle accuracy/math tests, original encounter/trainer EXP fixtures, pool splitting and held items, switching/reset masks, level-100 growth caps, level-up before poison, fresh residual ties, native speed zero, recoil/second-action ordering, selected-slot rereading, status/PP ordering, and explicit unsupported charge effects. `git diff --check` also passed. Exact source/log hashes are in the adjacent JSON receipt.

The original actual Opus 5.5 outputs and copied-source manifests are preserved unchanged. Their approval applies to their recorded source snapshots. This dependency adaptation has local tests and source-equivalence evidence; **no new provider approval or rendered verification is claimed for the release branch**. The parent still owns release review, full suite, Vite build and any publication.

Historical findings remain explicit: the `514a01e` consumer EXP/residual issue is fixed by `b30324e`; `b30324e` F1 zero-speed and F2 surviving-action findings are fixed by `2e85fc2` and `feaa790`; first and second action-end candidate N1/N2 findings are fixed in the final `feaa790` predicate. The old raw findings have not been relabeled as passes.

## Remaining limits

Full AI/move coverage, native global RNG draw order, simultaneous final-KO Draw behavior, doubles/Trick Room, broader ability/item modifiers, trades/disobedience, and charge/lock/hide/recharge lifecycle remain outside this patch. Unported effects requiring their actual targets still reject explicitly. No Egg acquisition/hatching/field feature is delivered. Browser verification remains unavailable; no browser retry or Vite build was made during this release preparation.
