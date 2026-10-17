# Canonical battle release reconciliation

This merge starts at native progression `c39003b1` and merges the exact deployed production commit `93bf982b0d866a1150f22eae6ad6caf91da46bc5` (PR #20). It retains the full native progression graph rather than replacing it with the production release's intentionally smaller dependency graph.

The four conflicts are limited to Battle and its tests. `battle.ts` takes the exact production file: its only difference from the first parent is importing eligibility from `battle-party.ts`. All three existing conflicting tests retain the exact first-parent bytes, including seeded four-argument `newState` calls and the real `giveTogepiEgg` recoil/EXP exclusion fixture. The production branch's four additional legacy-party eligibility fixtures are retained too; their state setup is seeded on this branch.

`battle-party.ts` is the unmodified canonical production leaf. `eggs.ts` imports `isUsableBattler` for its follower helper and re-exports both eligibility functions from that leaf. Only its two duplicate declarations are removed. Native Egg creation, PID/IV draws, receipt identity, original trainer/met provenance, follower fallback and other exports are preserved. A new test asserts the re-exported functions are the same function objects and exercises a real donated Egg's saved-party reload, receipt identity, battle exclusion and follower selection.

Compared with the first parent, the complete source delta consists of `battle.ts`, `eggs.ts`, and the new `battle-party.ts`/test. `main.ts`, World, UI, types, data loading, phone admission, hatching and field lifecycle are unchanged. The adjacent JSON receipt contains byte comparisons for the three native fixture files and exact hashes for the relevant source graph. All historical review files from both parents are preserved unchanged.

From `browser/`, validation passed:

```sh
node --experimental-transform-types --test src/source/battle*.test.ts src/source/early-battle-effects.test.ts src/source/egg*.test.ts src/source/hatch*.test.ts src/source/party*.test.ts src/source/native-rng.test.ts
npx tsc --noEmit
```

The targeted run passed **232 checks**: 210 top-level tests and 22 original-source target/charge subcases, with no failures, skips or cancellations. This covers battle EXP/phase/recoil/no-target, native gift and consumer exclusions, hatch lifecycle and host bindings, music/phone hatch triggers, party selection/recovery/UI ownership, and native RNG fixtures.

No Vite build, browser verification or additional Claude review was performed for this reconciliation. Prior actual Opus approvals remain tied to their original recorded snapshots; this merge does not transfer them to a wider scope. Historical findings and their exact later closures remain recorded. Root owns the final integration, full suite and build.

This merge does not claim full battle AI/move coverage, native global battle RNG sequence, simultaneous final-KO Draw policy, doubles/Trick Room, broader ability/item modifiers or charge/lock/hide/recharge lifecycle parity. It adds no new phone, opening, hatching, field or terrain behavior and makes no rendered-verification claim.
