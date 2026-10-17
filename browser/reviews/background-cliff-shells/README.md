# Two measured New Bark background backs

This patch addresses the actual production1f83 screenshot from camera `[695.5,6.96243845,410.47379292]`, target `[695.5,1.9,398.5]`,52° FOV,1280×800. The open east end of Route31 land112 faces background210 at21,10. Another land210 cap at22,11 floats behind the forest.

The enabled production call admits only those two original fingerprints, at matrix0/header0/altitudes14 and4. Original land210 has32 flat native cliff01 triangles. Current277bac canonical deformation gives21,10 a2,200-triangle cap with a small edge profile;22,11 remains32. New sides share the exact stored cap boundary profiles; original cap position/UV/color/skin/material buffers stay unchanged. The214/64 added triangles include reversed native-layout undersides.

## Explicit3D adaptation

Both1024-tile collision footprints are entirely blocked and contain no source entrances. Native source supplies only top sheets, so no native lower volume is claimed. The user-requested free camera needs closed scenery. World0 is an explicitly designed rock-volume datum, following the released forestFoundation void convention. No geometry extends below0. `measured-placement-proof.json` records all8 adjacent perimeters, including forest208 at1, Route31's authored side/floor profile, Route27's north grass/cliff profile, higher adjacent210 sheets, and65535 void. The void case is not presented as native support.

Native tops, ordinary height queries, permissions, X/Z, floor first hits and portals stay unchanged. New backs intentionally occlude the previously exposed opposite/interior112 surfaces visible through the cut end. This is not an assertion that every old interior first hit remains visible. The generated mesh is explicitly marked non-source authority.

## Repeatable checks

From browser's parent directory:

```sh
node --experimental-transform-types --test browser/src/source/background-cliff-shells.test.ts
node --experimental-transform-types --test browser/src/source/native-terrain-world.test.ts
node --experimental-transform-types browser/scripts/audit_background_cliffs.ts
cd browser
npx tsc --noEmit
```

The focused8 tests pass: exact cap/source/UV preservation, exact edge closure, opaque sides, floor hits, foreign/portal/transform declines, enabled production stream, unload/re-entry ownership, unrelated210 no-support-I/O, and source Route27 camera approaches. Original1f83 production stream fails the missing-body assertion; candidate passes. The original Opus medium is reproduced as a candidate-only fixture failure before208 cache/neighbor metadata were corrected; the repaired fixture explicitly asserts the shell exists. Global inferred T2 remains off.

## Honest camera scope and resource failure

The first complete112 test attempted the existing whole-template repair/clone pipeline. It grew to101.9GB physical footprint and was TERM-stopped. Its original partial log/sample are retained under logs; it is inconclusive, never a pass. It must not be reinstated in the suite.

The replacement parses the pinned raw112 once, retains only the original opaque geology, and avoids repairOriginalAsset, foliage-volume generation and clone. It checks the261,796-byte input,1,188 input triangles, literal authored coordinate domain including four units of south overhang, an initial103,704 half-grid estimate plus652 triangles for44 literal planned native-wall faces: a104,356 joint-aware output bound under a150,000 cap, and64MiB external/256MiB resident-growth budgets. The measured result is20,488 canonical triangles, per-run memory growth recorded in the raw JSON (varies with caching/GC; always checked against the64/256MiB budgets). Original opaque-geology rays at four left and three right pixels go from no hit to the appropriate new back; native top pixel1000,140 retains its first point and UV. The reference deliberately omits decorative/MASK/BLEND occluders. It is not a complete-scene or hardware-rendering test.

Root subsequently rendered the complete scene from the exact supplied camera. `actual-candidate-281.png` confirms the holes are closed, but the left cladding is visually a large flat stone-mosaic rectangle. The bare native top remains, and the separate23,11/alt6 cap is still a thin source sheet. This is **not a visual pass**. A separately authorized isolated follow-on will use measured112 brown vertical-wall art and close that third fingerprint. Source-art brightness/texture appearance and neighbouring unmodified sheets21,9/23,11 also remain visually unqualified. No full-terrain safety, game parity, deployment or production completion is claimed.

## Reviews

The immutable5a741c3c review used actual Claude Opus5.5 with Read/Grep/Glob only. Raw result/modelUsage, prompt and320-file manifest are preserved. It found no production helper blocker, a confirmed stale test fixture (corrected), eager support I/O (corrected), and explicit camera/visual qualifications. The330-file e5c4a4cc follow-up used actual Opus5.5 and found no blocker/medium; it explicitly closes the stale fixture and eager-I/O findings. Its remaining LOW test camera-range/joint-prebudget findings are preserved. After that immutable review, the test-only delta accounts for literal nativeWallPlans cuts, asserts the five material counts, and tests full camera endpoints. All8 tests/TSC pass. Native112 source-only approach receipts record314 changed Surf orbit hits out of1,200 rays, with0 changes on the two sampled foot approaches; these are newly solid-wall collisions, not a no-change assertion or complete-scene proof. Route27 source approaches have137,880 clear rays. The new test-only bytes await the authorized follow-on review; no approval is silently transferred. The old result remains historical and is not transferred as approval of later bytes.
