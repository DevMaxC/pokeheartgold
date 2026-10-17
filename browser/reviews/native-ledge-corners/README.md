# Continuous native ledge corners

The native rim can turn through a blocked non-jump tile between two cardinal ledge runs. Previously that tile remained connected to the lower floor in the presentation height solver. Its original flat artwork sagged into a diagonal ramp, while the two generated cliff faces stopped one tile apart.

The corner topology now follows both original jump runs through their common blocked artwork tile. The tile joins the same upper diagonal as those runs, and its two exterior edges become presentation seams. They remain separate metadata from the original jump list: no native movement behavior or permission is added. Fresh profile export requires a literal flat upward `allpeak` rim one source pixel (1/16 tile) over the native floor at the centre and both outer edge midpoints. All six visible-floor samples must equal the flat native collision floor, with no fallback; all three edge points must have finite physical drops greater than 0.8 tile. Unknown variants reject. Missing runtime profiles reject their own cell rather than fabricate a wall or stop unrelated cells loading.

On the exact production base `93bf982`, there are 48 such source corners and 96 extra edges. They add 384 cliff triangles across the main matrix. Original 1,453 native jump records, native edge profiles, cliff asset selection, native map altitudes, source X/Z/UVs/assets/prop records and foundation anchors are unchanged. The same opaque two-sided cliff material/UV/disposal path is reused. World, main, input, UI, audio and the general mesh deformer are not changed.

The field is a coupled smooth solve, so this is not a one-tile data edit: 198 of 279 encoded presentation-height cells change. The largest node delta is 1.30859375 tiles. All 307 structure footprints remain flat; only 30 structure anchor offsets change, at most 0.01953125 tile. Native water tiles stay zero-displacement and native water artwork retains its original level. This presentation relief intentionally changes while native BDHC/map altitudes remain fixed. Any later combined terrain/deformer proof must be rerun against the new data hash.

## Actual source evidence

Cell `18,12`, `land/1-2.glb` has two reproduced turns at native tiles `603,396` and `588,401`. The first joins east ledge `603,395` and south ledge `602,396`. Its original `allpeak` art is flat at Y1.0625 over the native Y1 floor. Two regression tests fail on the production field: a source-rim ray returns the sagged cap, and a horizontal ray at Y1.5 misses the absent corner cliff face. Both pass with the candidate.

`route29-before.json` and `route29-candidate.json` capture original/deformed rim coordinates, native UVs and generated cliff vertices. The geometry PNG shows those actual triangles, without textures, alpha, lighting or grass floor; it is not a browser screenshot or rendered approval. The native 1/16-tile decorative art overlay remains unchanged. Exact coordinates of the user's screenshot are unconfirmed, although both source corners reproduce its structural symptom.

`native-corner-art-proof.json` contains fresh native triangles for all three tested points of every one of the 48 corners, plus the collision floor and all six visible-floor samples. The old centre-only evidence is retained as `native-corner-art-proof-v1.json`. The profile export took 9,294 native samples across 83 assets, with zero collision fallbacks. Three-level source stair turns keep their different lower presentation sectors; tests inspect literal emitted Float32 vertical interval closure, including the existing third wall. They do not force unrelated levels equal or waive an uncovered seam. A separate actual Route29 check compares emitted grass-floor and cliff buffers directly: the top and bottom vertices at all three points of both repaired edges have exactly equal world coordinates.

## Repeatable validation

From `browser/scripts`:

```sh
python3 -m unittest test_ledge_corner_topology.py
```

From `browser`:

```sh
node --experimental-transform-types --test src/source/ledges.test.ts src/source/terrace-model.test.ts src/source/ledge-corners.test.ts src/source/ledge-corner-art.test.ts src/source/ledge-route-transitions.test.ts src/source/terrace-publication.test.ts src/source/terrain-work.test.ts src/source/terrain.test.ts src/source/foundations.test.ts src/source/building-footing.test.ts
npx tsc --noEmit
```

Eight Python checks and 36 Node terrain checks pass, as does TypeScript. Cases include all four convex orientations, cell-border endpoints, concave/already joined corners, free/single-tile ends, water/unblocked/missing-neighbor rejection, the actual Route29 geometry, all 48 emitted joints, exact grass-floor/cliff vertices and unchanged native source buffers. Existing tests cover native water, all intact shared edges, every jump midpoint, rigid scenery roots and full foundation footprints. Native art counterexamples reject wrong material, underside, wrong layer, non-flatness, absent coverage and degenerate triangles; floor checks reject missing/non-finite or collision-mismatched samples. These are source-predicate fixtures, not rendered appearance checks.

The publication fixture runs the actual profile producer against isolated copied data. It proves stale foundation inputs reject, plain revalidation ignores an old stage, missing native geometry cannot fall back to collision floors, invalid directions/sectors/non-finite displacement reject, and failed validation preserves the complete serving bytes. Both original and corner profiles are deliberately corrupted in the successful staged input; every profile is freshly recomputed. The Python fixture proves a failed later export removes the old stage. Process cancellation/power-loss simulation is not automated; atomic replacement is provided by the filesystem rename.

Four actual-source World tests also cover all 6,712 ordinary Route30/31 edges and the native 1.25-tile blocked-height boundary, the MrPokémon house warp approach, the separate native Cut object, Route31 cave height, south-ledge landing references and terrain-only reachability. There are no excessive ordinary steps. The permission equality assertion is the current World integration invariant: both worlds share the same native permissions and no actors, and walkability currently ignores relief. It does not independently establish native permission parity. The door/Cut/cave/jump heights are candidate regression snapshots. These tests do not claim source NPC/script completion or add a new runtime height restriction. The independent traversal agent's separately committed qualification `e361b01e` adds native NARC/Git pins, 214,784 within-step samples, 70 cell and 10 header transitions, and dual-BDHC-floor preservation; root should integrate that package separately.

Regeneration from the repository root requires the same existing NumPy/SciPy exporter dependencies:

```sh
python3 browser/scripts/export_terraces.py 0
node --experimental-transform-types browser/scripts/export_ledge_profiles.ts 0 --staged
```

A complete repeat produced byte-identical data SHA256 `277bac25178f99dfe3caa9ace134cf9097fbe5149e7e3733fb58f16ebfd87323`. Python invalidates its previous stage at entry and writes only `.generated/terraces/0.json`, leaving the serving field unchanged. A staged candidate includes SHA256 provenance for the exact generator/topology code, matrix, referenced native floor/permission files, foundation inputs and complete native land-asset inventory. Explicit `--staged` promotion validates those inputs both before and after fresh native profile checks, then publishes by same-filesystem atomic rename. Input changes reject rather than silently publishing stale heights or anchors. Generation metadata is removed from the public runtime field. Failed/interrupted validation retains the previous complete public field. Corner profiles are deliberately not carried forward by Python. Without `--staged`, the command revalidates only the published file, even when a stage exists; the output identifies its selected input. This is a sequential exporter workflow, not concurrent producer locking. Logs and exact capture metadata are adjacent.

No Vite build or browser check was run in this isolated task. Native vertical stair-face chord/subdivision defects remain a separate repair. This work does not claim complete terrain rendering, source game parity or approval for combined future geometry changes. Actual copied-snapshot Opus v1/v2 reviews, model usage and dispositions are preserved in `opus-v1-*` and `opus-v2-*`. Their publication findings required the subsequent fixes; neither receipt is relabelled as approval of new source. The final follow-up receipt records the final source snapshot.
