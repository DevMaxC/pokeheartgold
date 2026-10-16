# Physical ledge terrain review — 2026-10-16

Claude Code was explicitly selected as `claude-opus-5-5`, non-interactive with Read/Grep/Glob only. No edits, commands, tests or agents were delegated. Initial immutable snapshot: `5bb64eb`. The reviewer did not run the application or tests; visual/performance findings were static inferences.

## Resolution and evidence

- **M1, collision/visual floor mismatch:** confirmed by original geometry profiles, including a lower visible floor at 3.125 above a collision floor at 3. Original visible surfaces now supply both sides of all 1,453 ledges (8,718 samples, no collision fallbacks). A regression verifies the actual 3.125 profile joins the wall.
- **M2, scenery tearing:** original flower/rock repairs now export explicit authored roots; touching rocks stay separate. Trees, trunks, fences and grass move rigidly at their authored roots. The production tree renderer is now solid in the merged base. Native water/shore strips retain their coordinates even when they overhang displaced land. Tests exercise touching boulders, flowers and offset crowns across a ledge. This is not visual approval of every original vertical wall.
- **M3, rebuild cost:** measured and addressed with direct Int16 sampling, a uniform-region fast path, cooperative MessageChannel task yielding and stale-generation cancellation. Node/browsers measurements and limits are recorded in VERIFICATION.md. The camera-raycast part was not reproduced: fieldCameraObstacles excludes the generated terrace ground and foliage; real walls remain obstacles.
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
