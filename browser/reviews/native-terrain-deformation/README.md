# Native terrain deformation on production333

This folder retains the original production333 qualification. For the later campaign5298 integration, see `campaign-integration/README.md` and its separately pinned World/context receipts.

This isolated candidate repairs native shared ground/wall deformation. It excludes the parked T2 scenery planner, geological closures and unresolved Route44 area claims. The starting production commit is `333423a4d3110ad7e8c01c10496fc78488b7b5d1`.

The runtime changes are `native-terrain-joints.ts`, the native deformation portion of `terrace-model.ts`, and owned-joint geometry disposal in `world.ts`. The production `terraceWalls` implementation, including native corner profiles, stays byte-identical. Joint materials and maps remain native and shared.

## Native proof

The 50 native tests pass. The 42 literal native UP/vertical pairs share exact stored LOCAL Float32 partitions while preserving every original upward position/UV/color/material tuple. The old baseline has 36 partition mismatches, including 27 exact geometric chord gaps. Tests cover source identity, masked/water/foreign authority, transforms, cancellation, artwork interpolation and disposal.

The four historical taper triangles retain valid ideal UP/UP domains, but the two production native corner-wall profiles at `[630,173,57]` and `[630,173,59]` already cover them. The current source emits zero duplicate tapers there. Removing only the corner coverage reproduces all four historical polygons byte-for-byte. Each remains checked against current native UP profiles and exact rational full-area coverage by the real production walls. Partial, foreign, missing and incorrectly keyed profiles cannot suppress a strip. `production-four-corner-coverage.json` preserves an independent corner-only proof.

The historical four-world-negative claim is superseded: its test added walls after the last matrix refresh and extracted them in the wrong coordinate frame. The raw historical proof remains unchanged. The initial invalid production four-expectation failure is preserved rather than relabeled as a pass.

## Production World comparison

Four additional tests pass using actual native GLB/PNG/foliage delivery and production333 versus candidate World streaming, props, walls, movement, entries, camera rays and resource release for three bounded cells. They preserve 46,822 upward triangle tuples exactly, compare 2,771 floor rays, 144 entry rays and 1,728 camera rays. The matrix is restricted to the selected source cell in this Node fixture; browser frames use the normal full stream.

The raw camera comparison retains one strict point difference of about one ULP on the same literal X622.0625 vertical plane, with matching normals. Its exact origin, direction, distances and points remain in `native-world-proof.json`; it is not reported as strict zero changes. This finite sample does not prove global camera equivalence.

## Visual and review limits

Eight historical e0 browser captures show actual production and candidate Worlds with matching camera coordinates and normal streaming. The inspected Route44 entry stays open and the side view retains native artwork. The Cherrygrove pose is inside a building and is excluded from useful terrain visual evidence. NewBark is an unchanged control with its existing hollow background still visible; this patch does not claim to close it.

The initial capture attempt was blocked by a preview-host DoNotRetry error, preserved in the historical receipt. Root later confirmed the allocated tab was reachable and explicitly authorized a new status check. Eight fresh current2494/production333 frames now cover the Route44 corner, entry, side and a useful outdoor Cherrygrove control. Cameras match exactly, all poses are walkable, and 88 source/input pins stayed stable. The inspected entry remains open and no new duplicate corner strip or geometry tear is observed in these bounded views. The native cyan platform-rim line is also present in production and is not claimed repaired. `current-2494-browser/qualification.json` records captures, raw pixel differences and limits. The diagnostic loaded no audio resources or media elements and tab_s is parked on JSON.

No alternative driver or protected tab was used. No GPU/mobile performance claim or all-map visual approval is made. Actual immutable Opus5.5 review passed with no concrete source blockers; `opus-adjudication.json` records its limits. Later manual visual evidence does not change the source-only review. Root independent inspection, full tests, build, CI, merge and deployment remain pending.
