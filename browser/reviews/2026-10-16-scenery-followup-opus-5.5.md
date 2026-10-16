Reviewer: `claude-opus-5-5`, confirmed by CLI model usage. Snapshot-only review; no tests/browser execution. The snapshot precedes the linear-time texture fill and the corrections described below.

# Review: scoped scenery patch (snapshot only)

I reviewed only the supplied diff and new files. I did not open the repository, run tests, or inspect a browser. Line numbers inside hunks are approximate, derived from the hunk offsets. Each finding is marked **Confirmed** (follows directly from the code or data shown) or **Hypothesis** (depends on code or assets I couldn't see).

## Findings

### 1. Foliage export discards measured trunk positions and merges genuine multi-tree art — Confirmed (data); impact likely
`browser/scripts/export_foliage.py:~46`, `else:centers=[.5]`

The fix for forked roots also changed every entry without `_re`, not only forked ones. The `foliage.json` diff shows two problems.

- **Single trunks lost their measured offsets.** These entries had one root run that was not centred:
  - `8/tree_ki` 0.344 → 0.5
  - `8/tree_ki3` 0.156 → 0.5
  - `13/bush_a` 0.25 → 0.5
  - `93/tree3_01_lm1` and `tree3_02_lm1` 0.766 → 0.5
  - `3/tree_kk01` 0.484 → 0.5

  None of these were forked-root cases. If `treePanels` derives `pivotOffset` from the centre, these sprites now pivot and anchor about 0.1–0.34 of the sprite width away from their trunk. The 0-2 test asserting `pivotOffset` is all zero for centred trees suggests it does.
- **Genuine two-tree art without `_re` is collapsed to one billboard.** The root spacing shows these are two trees:
  - `92/bf_tree03_*` had roots at [.164, .336, .664, .836]. That is exactly two copies of `bf_tree01`'s forked pair (.289/.461, gap .172).
  - `8/tree_w02_2` and `tree_w2_2` had roots at [.1875, .3125, .6875, .8125]. That is two copies of `tree_w01_2`'s pair (.4375/.5625, gap .125).
  - `8/tree_w02` had roots at [.25, .75], while `tree_w01` has [.5].

  These now become one flat card pivoting in empty space between the two trees.
- **The new test enshrines the error.** `source-assets.test.ts` (forked-roots test) asserts that every entry without `_re` has exactly one centre.
- **Fix:**
  - Group runs by `roots_per_tree` for any entry with more than one run where a single-tree reference exists, such as `bf_tree01` for `bf_tree03` or `tree_w01_2` for `tree_w02_2`.
  - Otherwise keep the measured run centre.
  - Restrict the "one centre" assertion to entries whose runs actually form one tree.

### 2. Rock card pairing never recovers after one mismatch — Confirmed (logic)
`render-repair.ts:~243`, `for(let index=0;index+1<eligible.length;index+=2)`

- **Defect:** any pair that fails a check hits `continue` but still advances by 2.
- **Trigger:** one odd triangle in a merged rock mesh is enough. This could be a stray triangle, a 3-triangle strip, or a reversed double-sided duplicate (which gives 3 unique points).
- **Effect:** every later pair straddles two cards and is rejected. Those rocks stay as cut-outs and then fall through to `closeTerrain`, because the material name matches `rock`, and get the rectangular skirts the new test says must not appear.
- **Why tests miss it:** the fixture uses one mesh per card, so it never exercises this.
- **Fix:** advance by 1 on failure, or pair triangles by shared edge rather than by array position.

### 3. Rock boulder top-cap UVs are corrupted at the poles — Confirmed (math)
`render-repair.ts:~256`, `face()`

- **Cause:** the cap vertices `top` and `base` sit on the ring axis. `atan2(0, +x)` gives them `u=0`, and that pole `u` is included in the seam test.
- **Example:** a top-cap triangle with ring `u` of .45 and .57 has a spread of .57 including the pole. So `seam` becomes true and the result is `u` = 1.45, .57, 1.0. That one triangle spans almost the whole texture width.
- **Result:** neighbouring cap triangles map inconsistently, and the cap is the most visible face from the elevated field camera.
- **Fix:**
  - Compute `seam` from the ring vertices only.
  - Give a pole vertex the mean of the unwrapped ring `u` values in that triangle.

### 4. Rock texture orientation and rooting — Confirmed mapping; visual impact is a hypothesis
`render-repair.ts:~249–256`

- **Orientation (Confirmed):** `u = atan2(dz, dx)/2π` puts the sprite centre (`u=.5`) on the −x side, facing west. The camera-facing +z side gets `u ≈ .25`, so the default view shows the left half of the original artwork.
  - Fix: add .25 to `u` so the front maps to the sprite centre.
- **Rooting (Confirmed):** the boulder is centred on the card's bounding-box centre, not its base edge. For the 45° fixture that is 11.3 GLB units (~0.7 tile) behind the root.
  - Ground is also sampled there (`groundHeight(ground, center…)`).
- **Overlap (Hypothesis):** the radii (0.46w / 0.4w) plus that shift can push the visual volume onto walkable neighbouring tiles. That would let the player clip into rocks, even though collision data is unchanged.
  - Worth checking against the 32 Cherrygrove rocks.

### 5. A missing manifest or cliff material permanently breaks streaming — Confirmed caching; impact is a hypothesis
`world.ts:~79` (`this.entrances??=`) and `world.ts:~95` (`this.backgroundCliff??=…throw Error`)

- **Cause:** both promises are cached on first use, including a rejection.
- **Triggers:**
  - A 404 or parse failure on `entrances.json` (for example, a stale deploy).
  - A `land/210-0.glb` without `cliff01`.
- **Effect:**
  - Every later prop `await doors`, or every raised land-208 cell, rejects.
  - Those cells never reach `scene.add`.
  - Meshes already built for the cell (shoreline underlay, cloned material) are never released, because the generation-mismatch `releaseCell` path is skipped.
  - Previously, rear-wall data came from map JSONs that were already loaded.
- **Fix:** degrade instead of failing:
  - `.catch(() => ({}))` for the manifest.
  - Return `null` and skip the foundation when the cliff material is missing.

### 6. The manifest drops warps the old code counted — Hypothesis about which buildings are affected
`export_entrances.py:14` (`if cell is None: continue`) and `export_entrances.py:18` (`if behavior not in FACES: continue`)

The old code passed every warp in the window. The new manifest silently skips two kinds:
- Warps whose behaviour isn't one of the 9 door/gate values (stairs, escalators, ladders, cave mouths, and so on).
- Warps on a cell not listed in that header's own `cells`.

That has two consequences:
- **Lost rear walls:** a building whose only entrance uses another behaviour loses its rear wall.
- **Sealed real exits (more serious):** take a building with a door at the front and a real rear or side warp with an unlisted behaviour. The old opposing-entrance veto kept it open. Now it gets an `entrance-rear-wall` across that real exit.

Nothing reports the skips, so "complete matrix" (P15-016) can't be checked.

- **Fix:** have the exporter print skipped warps grouped by behaviour and by missing-cell reason, then review that list once.

### 7. The rock texture path is slow and untested — Confirmed
`render-repair.ts:~26–34`

- **Cost:** the nearest-opaque fill is a brute-force O(transparent × opaque) loop on the main thread during asset load. A 64² sprite is about 4M distance computations; a 128² sprite is about 70M, which is a noticeable stall.
  - Fix: a multi-source BFS or jump-flood fill is O(N).
- **Coverage gap:** `typeof document==='undefined'` returns `null` in Node, so no automated test exercises the textured branch. The 946/648 audit only proves the flat-colour fallback for rocks.
  - If `geometryGLB` also strips images, which the name suggests (hypothesis), the audit never creates any `textured-terrain-back` meshes either. In that case the black-rectangle fix (P15-013) is guarded only by the new forest-platform unit test, not by "the complete imported-geometry audit" as VERIFICATION.md states.
- **UV region (Hypothesis):** the boulder wraps the entire texture and ignores the card's own UV rectangle. That is wrong if any rock card samples a sub-region, atlas cell, or flipped rectangle.

### 8. Storing the texture in `userData` makes `Material.clone()` serialise it — Confirmed mechanism; narrow trigger
`render-repair.ts:~27`, `material.userData.rockTexture = texture`

- **Mechanism:** `Material.copy` deep-copies `userData` through `JSON.parse(JSON.stringify(...))`. For a texture, that serialises the whole `DataTexture` pixel buffer as a JSON array, and the clone ends up with a plain object instead of a texture.
- **Trigger:** `closeTerrain` calls `original.clone()` on any rock material that still has unconverted triangles, which finding 2 makes more likely.
- **Fix:** use a module-level `WeakMap<Material, Texture>` instead.

### 9. Forest platform skirts use the land-wide minimum floor — Confirmed logic; visibility is a hypothesis
`render-repair.ts:~269–273`

- **Floor height:** `floorY` is the lowest opaque horizontal triangle in the whole landscape, not the ground next to the platform.
  - On lands with a pit, basin or lower beach, raised forest edges get walls far deeper than needed.
  - That means extra overdraw, and the walls show through transparent water or any opening.
- **Missing cliff texture:** `cliff` is `source.find(...)`. When a land has no `cliff\d` or `wall*_d` material, skirts fall back to the forest texture. That produces the vertical stump pattern the new test is meant to prevent.
- **Tint:** skirt colours come from the forest triangle's vertex colour (`triangle.color[0]`) but are applied over cliff art. Darker forest lightmap colours will tint the cliff.

### 10. Minor performance and robustness issues
- **`shoreline.ts:15` (Confirmed):** four side walls are emitted for every sand/shallow tile, including edges shared with sand neighbours. Most of the 30 vertices per tile are hidden internal walls, and the mesh is rebuilt on every cell load rather than cached per land and altitude.
  - Fix: emit sides only on boundary edges.
- **`shoreline.ts:12` (Hypothesis):** corner samples at `x+1=32` / `z+1=32` query this land outside its own tile range. If `terrainHeight` falls back there, edge tiles get a seam or step.
  - Also, offsetting by plate height −0.16 assumes the visual sand never sits below the collision plate.
- **`world.ts:~95` (Confirmed):** on first use, the whole `land/210-0.glb` is downloaded and fully repaired just to get one material, on the streaming critical path. The IDs `0/208/210-0` are hard-coded.
- **`world.ts:~91` (Confirmed):** each cell load traverses the cached template to find `beach01`. This could be looked up once per template.

## Checked with no issue found
- **Attribute and material consistency:**
  - Rocks provide position, colour, uv and normal, and their material has `vertexColors` with a fully opaque map.
  - `closeTerrain` skirts now carry colour.
  - The foundation and shoreline geometries force `vertexColors=false` and `alphaTest=0` and provide uv.
- **Coordinate transforms:**
  - Rock vertices are converted from world space to root-local space with the inverse matrix, and repair runs before the 1/16 scale.
  - Underlay and foundation are offset by group altitude (`-altitude*.5`); the test value 0.84 confirms the arithmetic.
  - Entrance x/z use the same global tile space the old `w.x+.5` used.
- **Disposal:**
  - `releaseCell` names match the new meshes.
  - Per-cell material clones are disposed, while their shared source maps and template rock meshes are correctly left alone.
- **Facing mapping:** the FACES table is internally consistent: gate pairs such as 108/109 and 110/111 resolve to opposing faces, and the veto keeps them open.
- **Collision and encounters:** no edits to `terrain.ts`, permissions or encounter logic. The only gameplay-adjacent risks are the visual/collision mismatch in finding 4 and, as an unverified hypothesis, any camera or pick raycasting against scene meshes, which would now hit the new volumes.

## Adjudication and corrections

- Foliage: confirmed. Original offsets are retained, known numbered composite textures resolve to their actual single-tree art, and canonical foot-U offsets align off-centre artwork with each ground pivot. Tests no longer assume every non-`_re` texture is one tree.
- Rock pairing and cap UVs: confirmed and corrected. Mismatches advance by one triangle, candidate pairs must share a geometric/UV edge, cap poles interpolate unwrapped ring UVs, and the front texture orientation is aligned. Unconverted masked rock triangles no longer receive rectangular terrain skirts.
- Texture caches: moved out of material `userData` into WeakMaps. The prior quadratic alpha-margin fill was already replaced by a linear multi-source wavefront; actual browser checks find all 32 Cherrygrove rocks textured and all generated map alpha values opaque.
- Geometry audit coverage: confirmed gap. Placeholder maps now preserve the presence of each original texture without decoding images, exercising 3,622 generated textured backs and checking their vertex-colour contract. Actual source-pixel decoding/wrapping remains covered by browser inspection rather than Node.
- Non-directional passages: export audit finds zero missing-cell warps. In addition to 666 directional entrances, 430 source passages are retained as veto-only safeguards. They cannot choose a façade but prevent sealing a real rear exit; outdoor examples include Battle Frontier's secondary warps. The full inventory is `source/entrance-report.json`.
- Rock anchoring: the centred footprint is deliberate when unbaking the DS camera lean. The inspected coast boulder centred at local (-3,5) lies over the original 2×2 blocked tiles; moving it to the tilted card's displaced bottom would shift it away from that footprint. Broader footprint review remains pending.
- Still open: material/UV atlas variants, transient loading-failure recovery, finer forest-base selection and fallback material coverage, shoreline boundary optimisation and broad visual certification. None is claimed fixed by this follow-up.
