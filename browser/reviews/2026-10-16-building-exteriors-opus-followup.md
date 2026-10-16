# Building exterior follow-up review

Read-only Claude Code review using claude-opus-5-5 with Read/Grep/Glob, no MCP servers, commands, network or edits. Main review model usage confirms Opus5.5; a tiny Haiku routing invocation is separately recorded by the CLI. Duration287.7seconds. The copied217-file manifest is building-opus-followup-snapshot-manifest.json. All runtime and tool bytes in that snapshot exactly match committed candidate540e251f; subsequent World correction and its test are separately identified below.

## Adjudication and remaining checks

- Confirmed budget race: fixed after this review. The new runSceneryWork checks/rechecks the shared budget and invokes its synchronous builder in the same continuation. A controlled21-job regression fails against the prior permission-return pattern (one turn/84ms virtual work) and passes with the correction (11turns/max8ms virtual work). Cancellation is still checked after shared waits. This is scheduling evidence, not measured browser frame time.330tests and the production build pass after the correction; a narrow read-only Opus verification is pending.
- Actual native gate-parent composition and filtered collectors were rerun against the current helpers:220/220 visible signatures match; all34 gates match flattened vs World cell-parent composition exactly, with the correct15north-entry keyset. Both measured−104 entrances stay exactly−104. No tolerance was added. The new v2 proof is separate from the historical hashes.
- Full immutable540e251f audit completed2,796,873rays. All585unique input bytes match committed blobs, and all355 geometry/stage bundles match the provisional run. A final release-commit rerun remains scheduled after the World correction.
- Additional per-cast BVH equivalence on all131 latest house placements and both aquatic-gate contexts is running. It does not reduce or relax sampling.
- Generalized rear/post roof-envelope protrusion review is pending. These hypotheses are not claimed cleared by an enclosure ray.
- Aquatic-gate unexpected-variant assertions and missing pokeathlon-source-face behavior remain conditional robustness concerns, with no current native asset failure demonstrated. Explicit load failure/Retry is retained.
- Actual final renders, changed-variant perspective views, full355placement manual review, browser latency and terrain-footing interaction checks remain pending the disconnected preview host. Complete game parity is unfinished.

## Reviewer output

I found one confirmed code defect, in World's streaming budget. Everything else is a conditional robustness concern or a gap in validation. This was a read-only review of the copied snapshot. Native GLB/PNG files, `entrances.json`, maps and the visual inventory aren't included, so I couldn't re-check any asset-dependent numbers. I compared against the previous snapshot (`/tmp/hg-building-final-review-snapshot-20261016-2145`) to isolate what changed.

## Confirmed code defect

**1. Medium: the budget check before each exterior doesn't actually limit the work.**
- **Where:** `world.ts:145` together with `terrain-work.ts:4-8`.
- **How the budget works:** `terrainPause()` returns `null` as long as `performance.now() < deadline`. Time only counts against that deadline after work has run.
- **Problem 1:** all of a cell's props run concurrently in `Promise.allSettled`, and cells run concurrently too. With cached assets and entrances, every prop's `await doors()` resolves in the same microtask flush. Each `sceneryWorkCurrent` then calls `terrainPause()` before any builder has used any time. They all get `null`, and every `closeBuildingExterior` then runs back to back in one task.
- **Problem 2:** after a yield, every waiter resumes on the single shared `pending` promise and sees the same fresh 6 ms deadline, so they all go through together again.
- **Trigger:** streaming a cell with several building props, or several cells at once, with assets and entrances already cached.
- **Consequence:** all the synchronous builders run in one main-thread task with no yield, which is the hitch the fix was meant to stop.
- **Overstated claim:** the adjudication says World "consults/rechecks the shared terrain budget before each exterior". That's literally true but doesn't bound the work.
- **Fix:** run exterior construction one at a time (a per-World promise chain or mutex), checking `terrainPause()` after each previous build finishes.
- **Why tests miss it:** under Node, `typeof window==='undefined'` makes `terrainPause()` always return `null`, and the cancellation test replaces `sceneryWorkCurrent`. No test exercises the budget.

## Conditional robustness concerns

- **Gate north bound has no tolerance (`gate-building-shells.ts:102`).** The check is `p.z>=-104`, and the Route29/Mahogany warps sit at exactly local −104.
  - The tests (`gate-building-shells.test.ts:66,74`) build the placement transform directly on the root.
  - World puts each prop under a cell `group` (`world.ts:127,145`), so the inverted matrix is composed differently. A rotated placement could round to −104.0000000001.
  - Consequence: that gate silently takes the closed branch and shows a solid rear wall (brick base plus cream wall, `:56-57`) where the real north doorway should be. Collision is tile-based, so this is a visual regression, not a blocked path.
  - Fix: use a small epsilon, and add one test with World-style parent composition.
- **New `!` assertion in the aquatic gate (`aquatic-gate-building-shells.ts:40`).** Only `glass.length===4` is checked before `glass.find(...x>=0)!`. An unexpected variant would throw inside the dispatcher. This is the same conditional class as previous finding #2; no current asset is shown to throw.
- **Pokeathlon 181 now needs both canopy faces (`pokeathlon-building-shells.ts:40-41`).** If either is missing, the whole family returns `null` and only the generic repair remains, with no diagnostic. The current fixtures pass.
- **Front closure rule changed for all 42 house models (`house-building-shells.ts:180`).** Native faces entirely in front of `house-front-interior-closure` no longer cut holes in it. Front art itself stays first-visible: the dense test at `house…test.ts:109-118` covers straight-on rays on `placements[0]` only. But anything seen through alpha-cut pixels in front of that plane now shows the opaque closure.
- **Some closures now rise to the highest roof (`house-building-shells.ts:155,170`).** For `upperRear` (20/102/237/238), `upperFront` (20) and `upperPost` (153/335), closures follow the highest overlapping roof instead of the lowest. A no-protrusion check exists only for model 20's front (`test:96-98`). Rear and post closures for 102/237/238/153/335 aren't checked for poking above the native roof.
- **Audit BVH assumptions are safe today but implicit (`audit_building_enclosures.ts:157,168-172`).** The cache is keyed on array identity plus length, and the slab test's `far` matches the narrowphase's Euclidean `far` only because every direction is unit length (true now: `:40` and `transformDirection`). Neither assumption is asserted.

## Missing validation

- **BVH equivalence on changed families.** I found no flaw in the BVH. Padding only adds candidates, original order is restored, and the edge-witness fallback still scans every triangle (`:196`). But per-cast `--verify-broadphase` evidence covers only 34 gates, 236 and four station/181 placements (1,355,607 casts). Nothing verifies the changed house/pokeathlon helpers or the new model 167 under the BVH.
- **Stale adjudication hashes.** `building-opus-native-adjudication.json` (the hidden/instanced 220/220 result) records house `d37df9b6…`, gate `428be963…` and world `7d2ea633…`. The current files are `0923217f…`, `df6cdbaa…` and `6b73b69b…`, so that evidence is for older source. The house face collector itself is unchanged, so I'm not calling this a regression, but the proof needs a rerun.
- **Dispatcher actual-entrance test (`building-exterior.test.ts:35-48`).** It uses only the first placement of each asset, so it doesn't stand in for all 34 gate placements. The gate suite covers those separately.

## Previous findings

- **#1 (gate north / passageOnly):** addressed for direction-tagged warps. 15 of 34 northern entries are preserved via the mirrored native entry module, and unrelated doors are rejected (`test:70`). Direction-less hints are still deliberately ignored, as adjudicated.
- **#2 (builder exceptions):** unchanged and still conditional. The aquatic gate adds one more `!` assertion.
- **#3 (synchronous work):**
  - Stale downloads and stale budget waits no longer build or publish (`world.ts:126,145-146`), and four regression tests cover this.
  - Clones are attached before any early return, so cleanup releases them, and shared buffers aren't disposed.
  - Budgeting is not effective (defect 1 above).
- **#4 (hidden/instanced):** no new evidence of impact. Only the proof hashes are stale.
- **Aquatic gate resources:** registered correctly — the `aquatic-gate-building-` prefix is in the ownership list, the audit discovers the helper and its hash from the dispatcher (`:59-69`), and the tests assert clone-only materials and shared maps. Its additions sit above y=45, away from the lower entrance, and the generic rear repairs stay visible.
- **Pokeathlon canopy joins:** the y=40 horizontal joins keep both north exits clear below the lintel (`test:57`).

## Unverified

- Per-family synchronous latency in the browser, and frame time after the World changes.
- Final full-placement rendering, fresh renders of the changed house, gate, pokeathlon and 167 variants, and perspective or low-pitch views.
- Anything that depends on native assets or entrance data in this snapshot.

None of this establishes game parity, visual approval or coverage of every camera angle.
