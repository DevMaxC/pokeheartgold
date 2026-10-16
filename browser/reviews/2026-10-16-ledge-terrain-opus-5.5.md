# Physical ledge terrain review — 2026-10-16

Claude Code was explicitly selected as `claude-opus-5-5`, non-interactive with Read/Grep/Glob only. No edits, commands, tests or agents were delegated. Initial immutable snapshot: `5bb64eb`. The reviewer did not run the application or tests; visual/performance findings were static inferences.

## Resolution and evidence

- **M1, collision/visual floor mismatch:** confirmed by original geometry profiles, including a lower visible floor at 3.125 above a collision floor at 3. Original visible surfaces now supply both sides of all 1,453 ledges (8,718 samples, no collision fallbacks). A regression verifies the actual 3.125 profile joins the wall.
- **M2, scenery tearing:** original flower/rock repairs now export explicit authored roots; touching rocks stay separate. Trees, trunks, fences and grass move rigidly at their authored roots. The production tree renderer is now solid in the merged base. Native water/shore strips retain their coordinates even when they overhang displaced land. Tests exercise touching boulders, flowers and offset crowns across a ledge. This is not visual approval of every original vertical wall.
- **M3, rebuild cost:** measured and addressed with direct Int16 sampling, a uniform-region fast path, cooperative MessageChannel task yielding and stale-generation cancellation. Node/browsers measurements and limits are recorded in VERIFICATION.md. The increased camera geometry is real: the selector excludes foliage but retains generated ground and walls. In a Route 29 view with 472 obstacle meshes / 148,015 triangles, ten rays measured 0.6–0.8 ms; 32 low-angle directions measured 0.9 ms median / 2.8 ms maximum. No hitch was reproduced in this limited sample; denser views and other devices remain to be profiled.
- **L1, optional cliff failure:** art loads only in cells with their own ledges. A failed optional lookup keeps an opaque solid fallback wall. Required terrain/data failures still surface as errors rather than publishing an inconsistent cell.
- **L2, native jump priority:** source collision & 4 precedes ordinary blocking. Matching native ledges now take precedence over NPC/landing vetoes.
- **L3, follower jump inference:** replaced the distance guess with the preceding step's explicit jump flag, cleared on non-connection entries.
- **L4, battle placement:** a separate layout helper searches continuous walkable ground, carries native floor references and samples paths to fighter/trainer positions. Tests cover ledges, bridge floors, narrow rooms and relocation across a lower strip.
- **L5, water overhang:** water-family material geometry stays at its native level, in addition to zero displacement on source water permissions.
- **L6, touching rocks:** production repair output carries independent roots per rock. The connected-component fallback exists for legacy synthetic geometry lacking those roots; it is not used for repaired production rocks.
- **L7, alpha/wrap inference:** actual selected cliff01/wall01_d textures were inspected: alpha is fully opaque and both axes repeat. No alpha-fringe failure was reproduced for these source textures.
- **L8, DSU recursion:** iterative weighted path compression and union by rank replace the recursive unbalanced implementation.
- **Additional foundation audit:** 17 structures initially had >0.25 tile of synthetic slope below a rigid body. The exporter now records 307 physical footprints/anchors and the solver levels their half-tile support nodes. Whole-footprint samples, intact edges, every ledge and all affected water pass. Native building mesh closure remains a separate concern.

## Initial static review

I found no blocking regressions in the jump semantics, floor selection or resource ownership. There are a few medium-risk visual and performance issues, all in code paths the tests don't cover. I only read code: I didn't run the 117 tests, the build or the browser, so nothing below is confirmed at runtime, and visuals and performance are inferences. I didn't open `terraces/0.json` and only reviewed its generator and consumers.

## Findings

**M1 — Cliff walls take their heights from the collision floors, but the ground they meet comes from the visual model** (`terrace-model.ts:50`)
- **Trigger:** any real cell where the land model's ground isn't exactly at the native collision-plate height along a ledge edge. Small mismatches like this are normal.
- **Effect:** the wall's top and bottom are computed from the collision floors plus the terrace offset. The ground beside it is the model's own vertex height plus the same offset. Any difference leaves a see-through gap or a lip along the "opaque" cliff.
- **Test gap:** the wall test (`terrace-model.test.ts:17`) uses a synthetic flat plate that matches the geometry exactly, so it can't catch this. Only the triangle layout is watertight; whether the ground actually meets the wall is unverified on real land.

**M2 — Non-ground land geometry that crosses a ledge edge gets torn or stretched** (`terrace-model.ts:31-35`)
- **Trigger 1:** vertical faces lined up with the grid (zero footprint area) skip subdivision and only get offsets at their own corners.
  - A fence or wall face several tiles long keeps straight edges while the ground under it is curved, so it floats or sinks in between.
  - If its corners fall on different sides of a ledge edge, the face shears. Which side a corner counts as depends on rounding down its coordinate.
- **Trigger 2:** slanted or diagonal faces (the native ledge lip art, crossed flowers, signs) are split on the half-tile grid.
  - Each piece then takes its own side's offset, so anything spanning the edge splits into two parts about 1.05 apart.
  - The cliff walls only close the ground edge, not these tears.
- This is beyond the building-footprint approval you already listed as pending, because it also affects native ledge art and flowers on Route 29.
- The rock test covers rigid rocks; flowers become a regular mesh in `render-repair.ts:239`, so nothing keeps them rigid.

**M3 — Main-thread cost of rebuilding terrain while streaming, and camera raycasts every frame** (`world.ts:118`, `world.ts:165`)
- `terraceModel` runs synchronously for every streamed cell next to any terraced cell. It allocates a vertex object per clip and cuts every ground triangle into two-plus pieces per half-tile.
- **Trigger:** walking into new cells around Route 29 / New Bark.
- **Effect:** likely frame hitches during play (I haven't measured them).
- The rebuilt surfaces are also camera obstacles, so the per-frame camera ray in `draw` now tests far more triangles per nearby cell.

## Lower-severity items

**L1 — One cliff failure blocks the whole matrix** (`world.ts:118`)
- **Trigger:** a missing or failed cliff asset, or any exception inside `terraceModel`.
- **Effect:** the cell job throws, so `stream` rejects and `enter()` rejects. Matrix 0 can't be entered at all, instead of one cell losing its cliffs.
- **Wasted fetches:** the cliff-material lookup and any fallback land-asset fetch run before `terraceWalls`. That happens even for cells with no ledges of their own, and the fetched land asset stays in the global asset cache.

**L2 — Native jump-precedence differences** (`main.ts:154`, against `player_avatar_movement.c:631,900-905`)
- **Native:** the ledge bit (`collision & 4`) is checked before any blocking bit. It also never looks at the landing tile.
- **Patch:** it falls through and blocks when an NPC stands on the ledge tile. It also silently refuses when the landing tile is unwalkable or occupied.
- The direction mapping matches native: 56/57/58/59 = east/west/north/south, consistent with `metatile_behavior.h:64-67` and the `deltas` table. The surf exclusion at line 630 doesn't apply because the browser has no surfing.

**L3 — Follower arc is a distance guess** (`main.ts:62`)
- `followerJump` fires whenever the follower is more than 1.5 tiles behind, whatever the cause (for example a scripted `JumpFar` or other gaps). It then covers two tiles in one walk duration (0.25 s, or 0.14 s when running).
- The ledge case itself behaves correctly: a one-tile walk during the jump, then a two-tile arc to the landing height on the next step.

**L4 — In-field battle placement ignores the terraces** (`battle-stage.ts:53,65`)
- Fighters and trainers are 3.4 tiles apart and placed with `world.height(x,z)` and no reference position.
- Near a ledge, one can land on the other terrace and sit behind or inside a cliff wall.

**L5 — Water is only flattened by tile behaviour** (`export_terraces.py:85`, `:145`)
- Water or shore meshes that extend past behaviours 16/17/19/21/23 onto beach tiles with non-zero centres will tilt.
- The water test only checks the tiles that have those behaviours.

**L6 — Rigid rocks merge too eagerly** (`terrace-model.ts:22`)
- Separate rocks that share an exact vertex position merge into one group and take a single centre height.
- A rock wall that spans a ledge edge then floats on one side or is buried on the other.

**L7 — Opaque cliff faces reveal transparent texels** (`terrace-model.ts:55`)
- Forcing `transparent=false, alphaTest=0` shows any cliff01 texels with zero alpha using their stored RGB, possibly as dark fringes.
- The V coordinate exceeds 1 (up to about 1.05), so it depends on the texture's wrap mode.

**L8 — Generator recursion risk** (`export_terraces.py:55-60`)
- `find` is recursive and unions aren't balanced, so very deep chains on other matrices could hit Python's recursion limit.
- It evidently worked for matrix 0.

## Checked and correct
- **Floor selection under bridges** (`world.ts:129`):
  - Subtracting the reference offset before `terrainHeight` compares the native levels correctly.
  - Every per-frame caller passes the actor's previous position: player, follower, NPC, camera and jump endpoints.
  - On arrival, `main.ts:93` re-seeds the player with the destination's own reference, so a warp doesn't use the old position.
- **Generator heights:**
  - The offset bookkeeping is correct: each tile's offset is tracked relative to its group, and fixed (zero) tiles are subtracted out of the equations.
  - The corner, edge-midpoint and centre layout matches the NW..SE schema.
  - Corners and midpoints are symmetric across intact edges.
  - The cut sits on the ledge tile's downhill edge, with the ledge tile tied to the upper level.
- **Mesh rebuild math:**
  - The diagonal clip matches the split `Terraces.sample` uses, and sampling uses the clip cell rather than rounding the vertex, so edge vertices pick the right side.
  - Wall slot mappings are correct in all four directions.
  - Skinned meshes go through `getVertexPosition`, which applies the bone transform consistently with the GPU path.
  - Each cloned InstancedMesh gets its own copy of the instance matrices, so the shared template isn't modified.
- **Disposal:** rebuilt-surface geometry is disposed while its shared material isn't, and the cloned wall material is disposed. Each hidden original foundation or underlay still frees its own geometry and material once.
- **Stale cells:** jobs that outlive a matrix change are discarded by the generation check.

## Suggested follow-ups
1. Raycast the real Route 29 cells, comparing each wall's top and bottom with the rebuilt ground on both sides.
2. Find non-ground triangles that cross a ledge edge, especially flowers and lip art.
3. Profile `terraceModel` while streaming, and the per-frame camera raycast.
4. Make cliff-asset failure degrade to a missing wall instead of rejecting the stream.

## Follow-up review of 4656eb5

The same explicitly selected Opus 5.5 CLI reviewed the async compiler, foundations, connected battle layout and source transforms in read-only mode. Its metadata also records auxiliary Haiku usage. It found no blockers. The original response follows below. Adjudication of optional findings:

1. The incorrect camera-obstacle sentence was corrected to the measured scope above.
2. Same-matrix long warps can still wait for old streamed work. This is a known latency follow-up, not a connected-border camera reset; connections use the separate nonblocking path.
3. Regeneration now carries forward nativeEdges when the native ledge list is unchanged, with an explicit warning when complete profiles are absent. Regeneration retained all 1,453 profiles and semantically identical data.
4. Actual base-edge sampling confirmed a small gap outside four rectangular flat plots (up to 0.223 tile absolute difference). Wall footings now close downward-exposed edges on all applicable structures while preserving native ledges and gate passages. All 307 structures pass the geometry audit; 83 need strips. A buried overhang requires no downward strip.
5. Terrain material lookup now precomputes triangle slots instead of scanning every group for each triangle.
6. All 10,675 imported landscape colour attributes are VEC3, so the inferred vertex-alpha issue is absent from current source assets.
7. A trainer may still share the occupied tile in the final cramped-space fallback. Further cramped-room presentation work remains pending.

A separate visual battle check found roof occlusion not raised by the static review. The opening shoulder and ongoing collision checks now test both fighters. This changes presentation only.

I found no blockers in snapshot `4656eb5`. As you asked, I only used Read, Grep and Glob: I didn't run the tests, the build or the browser, and I didn't open `terraces/0.json`.

## What I checked and found correct

- **Async compile cancellation and ownership:**
  - Several cells can share one pause in `terrain-work.ts`, and none of them starves the others.
  - At every pause, `terraceModel` checks `isCurrent` (`terrace-model.ts:16`), and it checks again before replacing each mesh. An outdated job returns `false`, and the `finally` at `world.ts:130` releases its partly built group.
  - A world built for one matrix can't add terrain built for another: changing matrix or room bumps `generation` before any await (`world.ts:74`). A stale job that picks up the next matrix's `this.terraces` stops at its first pause.
  - The shared template isn't modified. Clones get their own copies of instance matrices and `userData`, and only clone-side `visible` flags change.
- **Source transforms:** vertices, `sceneryRoot` points and instance positions are all converted through each mesh's `matrixWorld`, then back with the group's inverse. This covers the 1/16 scale, glTF node hierarchies and skinned meshes. Tree roots (`tree-volume.ts:33`) and the repaired-mesh roots (`render-repair.ts:167`) are in the same space they're decoded in.
- **Flat-region shortcut:** a triangle that keeps its original edges meets clipped neighbours at the same heights, because tiles on an intact edge share their edge values.
- **Foundation anchors:**
  - The exporter's `cx,cz:n` keys, owner lookup, rotation order, scale and position all match `world.ts:128`.
  - At runtime, sampling the anchor returns exactly the flattened value: the anchor is clamped inside the bounds, and every half-tile node covering it is set to the same quantised value.
  - If any node touches water or the edge of the solved area, the building stays at zero.
  - A footprint spanning a ledge, or two overlapping footprints that disagree, makes the exporter fail.
  - The midpoint-drop check runs after flattening.
  - `closeBuildingBack` and `furnitureObstacles` run after the offset is applied, so rear walls and seat collision are both at the displayed height.
- **Water and ledge walls:**
  - Water tiles, and every corner or edge midpoint touching water, are zero, so land slopes continuously into water.
  - The wall profile slots (`[0..2]` upper, `[3..5]` lower) match `terraceWalls`. They are absolute heights, with this cell's altitude subtracted correctly even when the lower side is in a neighbouring cell.
- **Battle placement:**
  - Each path sample passes the previous sample as its reference floor. The 0.4-tile steps with a 0.35 height limit rule out crossing ledges, cliffs and bridge floors.
  - Furniture is checked on every step through `world.walkable`.
  - Unloaded cells count as not walkable.
  - The fallback stays on the player's own tile.

## Optional improvements (none block)

1. **The adjudication text is wrong about camera obstacles.** Review line 9 says `fieldCameraObstacles` "excludes the generated terrace ground". It doesn't: `camera.ts:7` only filters by name and foliage material, so `source-terrace-surface` meshes are obstacles. `VERIFICATION.md:130` correctly says the terrain "remains in the obstruction query" and records costs under 3 ms. Only the review sentence needs fixing.

2. **Long warps within matrix 0 wait for discarded work.**
   - **Trigger:** warping to a far point in the same matrix while the old area is still compiling.
   - **Cause:** neither a matrix nor a room change happens, so `generation` isn't bumped (`world.ts:73-74`), and `stream` waits on `this.pending` (`world.ts:96`).
   - **Effect:** arrival waits for the whole old 5×5 window to finish compiling, then those cells are thrown away (`world.ts:133`). The cost is extra latency, of the same order as the ~2.6 s initial Route 29 stream.
   - **Fix:** bump `generation` (or a separate streaming token) when the new centre is outside the old window.

3. **The export order can silently undo the M1 fix.** `export_terraces.py:255` rewrites `0.json` without `nativeEdges`. Until `export_ledge_profiles.ts` is run again, `terraceWalls` falls back to collision heights (`terrace-model.ts:62`), which brings back the floor mismatch M1 fixed. The test at `terrace-model.test.ts:46` would catch it. A cheap fix is to carry the existing `nativeEdges` over, or warn.

4. **Inferred: the edge of a building's base may sit on sloped ground.**
   - Because of half-tile snapping, only the bounds inset by 0.4 from the bounding box are guaranteed flat (`export_foundations.ts:27`, `export_terraces.py:215`). The flat area starts anywhere from 0.1 tile outside to 0.4 inside the solid bounding box edge.
   - **Effect:** a structure with walls right at its bounding box edge (no roof overhang) could have up to 0.4 tile of base over the sloped apron, floating or sunk slightly.
   - This depends on the data, which I didn't check. The existing footprint audit may already cover it.

5. **Repaired meshes make material lookup quadratic.** `render-repair.ts:166` creates one group per triangle, and `terrace-model.ts:32` searches the groups with `.find` for every triangle, so flower and rock meshes cost O(N²). The work is still split across pauses. Caching the slot by index, or merging runs of the same material when repairing, would remove it.

6. **Inferred: vertex alpha would be lost.** `terrace-model.ts:23,48` copies only RGB vertex colours. If any land mesh stores alpha in a 4-component colour attribute, the rebuilt surface would lose that transparency. I didn't verify the assets' colour format.

7. **Cosmetic: a trainer can overlap their Pokémon.** When none of the six candidate spots in `battleTrainerSpot` connects, it returns the Pokémon's own position (`battle-layout.ts:40`), so the trainer sprite overlaps it in cramped spaces.

## Follow-up review of 1385702

The explicitly selected Opus 5.5 CLI found no blockers in the wall-footing, camera and material-slot changes. It again used only Read/Grep/Glob and did not execute validation. Auxiliary Haiku usage appears in metadata. Optional findings were handled as follows:

- The audit now runs closeBuildingBack first, matching runtime. Corrected result: 58/307 structures need strips, 170 ms total / 12.99 ms maximum in the source audit. The earlier83/307 numbers omit that step and are superseded.
- Footing group lookup remains a measured small per-structure cost; the terrain compiler's larger lookup was optimized. Further profiling remains possible.
- Battle camera plans now cache by orbit, distance, aspect and loaded cell identity, with a short expiry. Canopy checks use analytic cached lobes rather than instance triangle raycasts.
- Two points at +0.6 and +1.4 per fighter replace the single midpoint. A live render additionally exposed tree occlusion, so those checks now include actual solid crowns, and placement rejects crown interiors.
- Native profile carry-over still assumes unchanged source meshes when the ledge list is unchanged. Re-run export_ledge_profiles.ts after re-exporting original geometry; the documented generation sequence does so.
- Footing UVs intentionally extend the original bottom row across small exposed strips. Native wall materials/colours are retained; the whole building redesign is a separate follow-up, now in progress.

The continuous-ledge atlas correction and analytic canopy additions occurred after this review snapshot; their regression tests, render checks and exact scope are recorded in VERIFICATION.md.

I found **no blockers** in 1385702's new code. A few optional items are listed below. I only read the code: I didn't run the tests, build, audit or browser, and I didn't open `terraces/0.json`.

## What I checked and found correct

- **Footing transforms.** Vertices are read in world space (`building-footing.ts:15`) and written back through the inverse of the prop's world matrix (`:27`). The strip is a child of the prop, so it ends up in the right place. In `world.ts:129`, rotation, scale and position are all set before the call, and `updateWorldMatrix(true,true)` takes the parent cell group into account. Height lookups use world X/Z, the same frame as `anchor` (`world.ts:129`).
- **Displacement math.** Each strip extends down by `offset − height(q)`. That is the prop's lift minus the ground's lift at the same point, which is right for a wall foot that originally sat on native ground. Taking the minimum of the 3×3 samples at ±1e‑6 picks the lower side at tile-edge cliffs. The cut lines (x, z and x−z at half-unit spacing, `:21`) match how `Terraces.sample` splits each half-tile (`ledges.ts:26–27`, split where a=b, i.e. 2x−2z is a whole number). So the strip's linear bottom edge follows the ground exactly.
- **Which triangles get strips.** Only a horizontal bottom edge within 0.5 of the prop's lowest point, with the third vertex at least 0.125 above it. Shadows and see-through materials don't count toward the lowest point. Lintels and high eaves are excluded, so gate passages stay open (test `:16–18`).
- **UV/colour.** These are interpolated along the bottom edge and copied unchanged. Clones keep `vertexColors`, `name` and `map`.
- **Resource ownership.** Each strip has its own geometry and cloned materials, which `releaseCell` frees (`world.ts:71`). Shared textures are left alone, which is correct.
- **Precomputed material slots** (`terrace-model.ts:31–34`). The index range is right, and the first group still wins as before.
- **Camera.** Each fighter is ray-tested separately (`battle-camera.ts:12`). Obstacles are a flat list of meshes, so the non-recursive raycast is correct. Source materials are converted to `DoubleSide` (`render-repair.ts:10`), so a ray from a fighter up through a roof's underside still counts as a hit. The opening shoulder is picked once (`battle-stage.ts:51`). After that, `update` uses `world.yaw`, and `end()` restores the field camera. The distance-fit maths checks out: 8.4 at aspect 1.6, about 14.9 at aspect 0.5.
- **Preserved profiles** (`export_terraces.py:258–264`). Profiles store absolute native floor heights, and `terraceWalls` adds the current displacement on top (`terrace-model.ts:64`). So carrying them over is valid whenever the ledge list matches.

## Optional findings

1. **The audit leaves out a step that runs in the app (confirmed difference, effect inferred).** In the app, `closeBuildingBack` runs before the footing (`world.ts:129`). The rear walls it adds are picked up by the footing pass. `audit_building_footings.ts:20` skips that step. So the 83/307, all-coordinates-finite and 5.35 ms numbers don't cover strips under rear walls. The fix is one call that passes the matrix-0 entrances, then re-run the audit.
2. **The footing still searches every material group for every triangle (confirmed; impact measured small).** `building-footing.ts:13` scans the groups for each triangle. Repaired meshes have one group per triangle (`render-repair.ts:166`), so this is the same slow pattern just removed from `terrace-model.ts:31–32`. The audit does include repaired meshes and measured at most 5.35 ms, so this is only for consistency. The same precomputed slot table would fix it.
3. **Battle camera cost per frame (inferred, not measured).** While blocked, `update` (`battle-stage.ts:92–93`) can cast up to 12 rays per frame (6 lift heights × 2 fighters), each checking every triangle near the fighters, including terrace ground. Normal field mode casts 1 (the earlier review's M3, measured under 3 ms). Fighters and obstacles don't move during a battle, so the result depends only on yaw, pitch, distance and aspect. Caching on those values would remove the repeat work.
4. **Only one point per fighter is tested (inferred, cosmetic).** The test point is `home + 0.8` on a 1.85-tall sprite. A low eave could hide a fighter's upper half while the test says clear. Testing a second point near the top (about +1.6) would cover it.
5. **Profile carry-over only checks the ledge list (inferred).** `export_terraces.py:261` reuses `nativeEdges` whenever `ledges` is unchanged, even if the land GLBs were re-exported. The warning at `:263` only compares counts. That's fine for now, but a stale profile after a land re-export would go unnoticed.
6. **Strip texture (design note, not a defect).** The bottom corners reuse the top edge's UV (`building-footing.ts:26`), so each strip stretches one row of the texture downward. At the measured gap sizes (up to about 0.22 tile) this should be hard to notice, but it's not true wall texture continuing down.


## Follow-up review of 0eb0e27

The explicitly selected Claude Opus 5.5 CLI reviewed the final continuous cliff material, analytic canopy occlusion and battle-camera cache. It found no blockers. It used Read/Grep/Glob only; the response does not substitute for the separate 158-test run, build and browser render checks. Metadata again records auxiliary Haiku usage.

The open-ended box prefilter can do extra work on trees beyond the camera, although the final segment test remains correct. This remains a profiling follow-up, together with one-time canopy cache construction. Any finite-box optimization must also preserve rays starting inside a box. The measured battle-camera sample averaged 0.54 ms over 60 updates; this is a limited sample, not a worst-case claim.

The review's sprite-edge, trainer, cramped fallback, discrete camera lift and trapezoid texture limitations remain documented follow-ups. No further camera behavior was changed for these optional observations. Full game parity remains pending.

I found **no blockers** in `0eb0e27`. I used only Read, Grep and Glob. I didn't run the tests, build or browser, and I didn't open `terraces/0.json`. Performance points below are inferred from the code, not measured.

## Checked and correct

- **Segment test** (`canopy-occlusion.ts:20`)
  - The parameter along the segment survives the affine transform into each lobe's own space. So clamping it with the world length leaves out 0.2 at each end, the same margins as the raycaster's near/far.
  - The squared distance is convex along the segment, so clamping the closest point gives the true minimum over the finite segment.
  - The `length<.5` guard keeps the clamp interval valid.
  - A singular lobe matrix inverts to all zeros, which yields NaN and so "not blocked". It doesn't throw.
  - The box checks on the open-ended ray are only prefilters; the exact test is the segment one.
- **Lobe transform** (`canopy-occlusion.ts:13`)
  - Each lobe is world matrix × instance × translate(0,y) × scale(rx,ry,rz). That matches how `crown()` builds them (scale, then translate), including the per-instance Y rotation with unequal X and Z radii and parent rotation and scale (tested at `canopy-occlusion.test.ts:13`).
  - The 12×6 sphere mesh sits inside its analytic ellipsoid, so both blocking and the interior check err on the safe side.
  - The leaves material is opaque, so the solid ellipsoid matches what's drawn.
- **Cache and ownership**
  - The cache is keyed per InstancedMesh object, using the instance-matrix version plus all 16 world-matrix values.
  - Clones made by streaming are separate objects. They get their own instance-matrix copies and a JSON copy of `canopyLobes`.
  - `terraceModel` displaces trees before the cell is published and sets `needsUpdate` (`terrace-model.ts:24`), so the cache never sees a matrix change without a version bump.
  - Only cells whose work has finished are added to `world.cells` (`world.ts:130`), so per-cell results never mix. Hidden parents and the hidden billboard mesh are skipped.
- **Field vs battle:** the field camera still filters trees by name (`camera.ts:7`) and never uses canopies, so field behaviour is unchanged.
- **Camera plan** (`battle-stage.ts:94-95`)
  - The plan key covers yaw, pitch, the fitted distance, aspect, and each cell's UUID and child count.
  - Wheel zoom and orbit input change the key, so they replan immediately. `time` and `cameraPlan` reset in `begin`.
  - The opening yaw uses the same distance, pitch and subjects as `update`.
  - `clearBattleCameraEye` only raises Y, so manual yaw is kept (tested). `end()` restores yaw, pitch, distance and FOV.
- **Cliff material**
  - `terraceCliffMaterial` only accepts `cliff01`. The exporter only lists cliff assets that contain `cliff01` (`export_terraces.py:253`).
  - The `textured-terrain-back` clone keeps the same name and map, and its differences (side, polygon offset) are overridden by `terraceWalls`.
  - The wall UV corners are right: U is 0/0.5/1 along the two half-tile parts, V is 0 at the top and 1 at the bottom.
  - The cloned wall material is still freed in `releaseCell`.

## Optional findings (none block)

1. **The canopy prefilter doesn't stop at the eye (inferred cost).**
   - `ray.intersectsBox` tests an open-ended ray. Once a cell's combined bounds are hit, every lobe whose box lies anywhere along that ray goes through two matrix transforms, including lobes beyond the eye.
   - Cost per segment grows with the number of lobes in every cell the ray passes over.
   - **Trigger:** holding orbit or zoom input changes the key every frame. Each replan can test up to 6 lifts × 4 subjects = 24 segments, plus the same number of triangle raycasts.
   - The 0.54 ms sample may not cover dense forest cells while orbiting continuously.
   - **Cheap fix:** use `ray.intersectBox(box, tmp)` and skip a box when the hit distance is beyond `length`, at both the cell and lobe levels.
2. **The first `fieldCanopies` call in `begin` runs all at once.** It allocates about 6 matrices and boxes per lobe (3 lobes per tree) across all 25 loaded cells, once per battle start. It's probably small, but it isn't split across pauses.

## Limitations (not defects)

- **Sprite coverage:** the interior and sightline checks only test the sprite's centre column at +0.6 and +1.4. The plane is 1.85 × aspect wide and 1.85 tall plus bob, so a crown edge can still clip a wide Pokémon's side or top.
- **Trainers:** trainer spots (`battleTrainerSpot`) aren't checked against canopies and aren't camera subjects.
- **Fallback:** the cramped fallback (`safe:false`, `battle-layout.ts:32`) skips the canopy check. If the player's own tile is under a crown, every lift may be blocked, and the eye falls back to +12.
- **Wall texture:** each wall half stretches the whole texture over its height. Where top or bottom heights differ between the half's two ends (a trapezoid), the per-triangle UV mapping leaves a slight diagonal kink in the texture. Equal-height edges are unaffected.
- **Camera lift:** lifts happen in discrete steps and the camera eases toward them, so it can pass briefly through an occluded position (cosmetic).
- **Test gap:** no test covers the battle-stage cache key or the 0.25 s expiry, such as a replan after a yaw change or reuse within the window. The canopy cache itself is tested.
