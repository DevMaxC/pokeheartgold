# Continuous native ledge corners

The native rim can turn through a blocked non-jump tile between two cardinal ledge runs. Previously that tile remained connected to the lower floor in the presentation height solver. Its original flat artwork sagged into a diagonal ramp, while the two generated cliff faces stopped one tile apart.

The corner topology now follows both original jump runs through their common blocked artwork tile. The tile joins the same upper diagonal as those runs, and its two exterior edges become presentation seams. They remain separate metadata from the original jump list: no native movement behavior or permission is added. Fresh profile export requires a literal flat upward `allpeak` rim one source pixel (1/16 tile) over the native floor at the centre and both outer edge midpoints, six original visible-floor samples per extra direction with no collision-floor fallback, and a physical drop greater than 0.8 tile on both edges. Unknown variants reject. Missing runtime profiles reject their own cell rather than fabricate a wall or stop unrelated cells loading.

On the exact production base `93bf982`, there are 48 such source corners and 96 extra edges. They add 384 cliff triangles across the main matrix. Original 1,453 native jump records, native edge profiles, cliff asset selection, native map altitudes, source X/Z/UVs/assets/prop records and foundation anchors are unchanged. The same opaque two-sided cliff material/UV/disposal path is reused. World, main, input, UI, audio and the general mesh deformer are not changed.

The field is a coupled smooth solve, so this is not a one-tile data edit: 198 of 279 encoded presentation-height cells change. The largest node delta is 1.30859375 tiles. All 307 structure footprints remain flat; only 30 structure anchor offsets change, at most 0.01953125 tile. Native water tiles stay zero-displacement and native water artwork retains its original level. This presentation relief intentionally changes while native BDHC/map altitudes remain fixed. Any later combined terrain/deformer proof must be rerun against the new data hash.

## Actual source evidence

Cell `18,12`, `land/1-2.glb` has two reproduced turns at native tiles `603,396` and `588,401`. The first joins east ledge `603,395` and south ledge `602,396`. Its original `allpeak` art is flat at Y1.0625 over the native Y1 floor. Two regression tests fail on the production field: a source-rim ray returns the sagged cap, and a horizontal ray at Y1.5 misses the absent corner cliff face. Both pass with the candidate.

`route29-before.json` and `route29-candidate.json` capture original/deformed rim coordinates, native UVs and generated cliff vertices. The geometry PNG shows those actual triangles, without textures, alpha, lighting or grass floor; it is not a browser screenshot or rendered approval. The native 1/16-tile decorative art overlay remains unchanged. Exact coordinates of the user's screenshot are unconfirmed, although both source corners reproduce its structural symptom.

`native-corner-art-proof.json` contains native source triangle evidence for all 48 corners. The profile export took 9,294 native samples across 83 assets, with zero collision fallbacks. Three-level source stair turns keep their different lower sectors; tests inspect literal emitted Float32 vertical interval closure, including the existing third wall. They do not force unrelated floors equal or waive an uncovered seam. A separate actual Route29 check compares emitted grass-floor and cliff buffers directly: the top and bottom vertices at all three points of both repaired edges have exactly equal world coordinates.

## Repeatable validation

From `browser/scripts`:

```sh
python3 -m unittest test_ledge_corner_topology.py
```

From `browser`:

```sh
node --experimental-transform-types --test src/source/ledges.test.ts src/source/terrace-model.test.ts src/source/ledge-corners.test.ts src/source/ledge-route-transitions.test.ts src/source/terrace-publication.test.ts src/source/terrain-work.test.ts src/source/terrain.test.ts src/source/foundations.test.ts src/source/building-footing.test.ts
npx tsc --noEmit
```

Seven Python topology cases and 33 Node terrain checks pass, as does TypeScript. Cases include all four convex orientations, cell-border endpoints, concave/already joined corners, free/single-tile ends, water/unblocked/missing-neighbor rejection, the actual Route29 geometry, all 48 emitted joints, exact grass-floor/cliff vertices and unchanged native source buffers. Existing tests cover native water, all intact shared edges, every jump midpoint, rigid scenery roots and full foundation footprints. The publication fixture runs the actual profile producer against isolated copied data: failed validation leaves the old complete file byte-identical, and successful validation promotes the staged field with all fresh profiles.

Four actual-source World tests also cover all 6,712 ordinary Route30/31 edges and the native 1.25-tile blocked-height boundary, the MrPokémon house warp approach, the separate native Cut object, Route31 cave height, south-ledge landing references and terrain-only reachability. There are no permission disagreements or excessive ordinary steps. These tests do not claim source NPC/script completion or add a new runtime height restriction. The independent traversal agent's separately committed qualification `e361b01e` adds native NARC/Git pins, 214,784 within-step samples, 70 cell and 10 header transitions, and dual-BDHC-floor preservation; root should integrate that package separately.

Regeneration from the repository root requires the same existing NumPy/SciPy exporter dependencies:

```sh
python3 browser/scripts/export_terraces.py 0
node --experimental-transform-types browser/scripts/export_ledge_profiles.ts
```

A complete repeat produced byte-identical data SHA256 `277bac25178f99dfe3caa9ace134cf9097fbe5149e7e3733fb58f16ebfd87323`. Python writes only `.generated/terraces/0.json`, leaving the serving field unchanged. The native profile exporter validates that stage completely and publishes it with a same-filesystem atomic rename; failed/interrupted validation retains the previous complete public field. Corner profiles are deliberately not carried forward by Python. The source-profile command can revalidate the published file when no staged file exists. Logs and exact capture metadata are adjacent.

No Vite build or browser check was run in this isolated task. Native vertical stair-face chord/subdivision defects remain a separate repair. This work does not claim complete terrain rendering, source game parity or approval for combined future geometry changes. The actual copied-snapshot Opus v1 review, model usage and hazard disposition are preserved in `opus-v1-*`; its publication finding required the v2 changes and is not relabelled as an approval of them. The separate follow-up receipt records the final source snapshot.
