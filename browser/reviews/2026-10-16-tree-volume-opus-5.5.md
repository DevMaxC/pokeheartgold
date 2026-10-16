# Tree volume review — 2026-10-16

Claude Code was explicitly selected as `claude-opus-5-5`, in non-interactive read-only mode with Read/Grep/Glob only. No edits, agents, commands or tests were delegated. Immutable reviewed snapshot: `ea113b8`; auxiliary Haiku usage also appears in the CLI metadata.

## Resolution and evidence

- **Atlas crop / possible root contamination:** fixed. The leaf patch is selected inside each canonical tree's own visible bounds (topV, footV, crownWidth, crownCenterU), at the upper 20–50% of its visible height. The pure RGBA crop/fill function is shared by the browser and tests. Synthetic context-8/context-92 fixtures put green foliage above brown roots and require every output pixel to remain foliage. All 80 referenced canonical images have nonempty sampled leaf patches; there are 92 exported PNG files, including unused legacy variants.
- **Off-centre crown placement:** fixed. Export alpha-bounds centre as well as the trunk's original footU. Apply the centre-to-trunk offset along the native source card direction, accounting for flipped UVs. Crowns keep a fixed world offset, not a camera-dependent one. Trunks remain rooted and connect to the offset crown with a branch. Regression checks the independent crown position, ground foot and connected trunk tip.
- **Battle camera foliage raycasts:** fixed. Field and battle cameras now share the same visible-solid obstacle selector. A battle-camera regression fails if it attempts to raycast any tree instance and separately verifies that a real wall still raises the camera.
- **Texture-path coverage:** fixed. Pixel selection, alpha handling and colour extension now run under Node tests with synthetic RGBA data, without a DOM. The canvas wrapper only reads the original image and uploads the result as an opaque nearest-filtered texture. Visible alpha-bound metadata covers all 124 layouts and five exact-image aliases.

## Validation

- Full suite: 123 tests pass, plus TypeScript/Vite production build.
- All 202 matching native landscape contexts have equal converted-tree, crown and trunk counts. All 946 props / 648 landscapes remain finite and all 540 map references resolve.
- Closed crown lobes, top/rear/side ray hits, individual roots, transformed groups, visible sprite bounds and off-centre connected trunks are covered.
- Shared-browser New Bark forest checks cover directly overhead, high orbit and low views. No thin upright strips or exposed root marks remain beneath the viewed crowns. This is not visual approval of every map or tree family.
- One diagnostic low-view render-and-GPU-finish sample measured 1.0–1.6ms (215 draw calls / 334,648 rendered triangles) before the bounds-aware crop correction; the correction does not add geometry. It is one device/view sample, not a universal frame-rate guarantee.

## Original static review

I found 2 confirmed bugs and 2 inferred risks in `ea113b8`. The worst is that the leaf texture is cut from a fixed rectangle of the image, so for some tree families it lands on the trunk and roots instead of the leaves. That could bring back the "root decals" the user reported, now drawn on the 3D crowns. I worked out the overlaps from the numbers in `foliage.json`; I couldn't see the textures, so what the pixels actually look like is inferred.

### 1. High (overlap confirmed, pixel content inferred): the leaf texture crop ignores where each tree sits in its image
`tree-volume.ts:12` always cuts the region x 0.375–0.625, y 0.40–0.65 of the source image. That only works if every tree fills the whole image, but the export records each tree's own top (`topV`), foot (`footV`) and width:
- **`tree_w01` / `tree_w02`, context 8** (`footV 0.5`, `topV 0.171875`, crown width 0.34375): the tree is only visible between y 0.17 and 0.50. The crop's y 0.40–0.50 is the bottom 30% of the tree, which is the trunk and roots. Its y 0.50–0.65 is below the foot and fully transparent, so the alpha trim removes it. The crown texture therefore comes entirely from trunk and root pixels.
- **`bf_tree01_*`, `bf_tree03_*`, `lambert47`, `lambert48`, context 92** (`footV 0.625`, `topV 0.09375`): the crop covers about the lowest 42% of the tree, down to the foot.
- The comment at line 10 ("excluding the baked trunk and root art") is only true for trees that fill their image.
- The flood fill at lines 19–21 spreads the bright crop pixels over the whole crown, so any root colour gets spread across it.
- **Fix:** pass `topV`, `footV`, `crownWidth` and the trunk position (`footU`) into `leafTexture`. Crop inside the tree's own bounds, for example from `topV` to `topV + 0.6·(footV − topV)`, centred on the crown.

### 2. Medium (geometry confirmed, visual impact inferred): crowns are centred on the trunk, so off-centre trees are shifted
- `addTreeVolumes` (`tree-volume.ts:41`) centres each crown on the trunk position. `footU` and the panel `offset` never reach it: the `Tree` type at line 3 has no offset field, even though `render-repair.ts:326` computes one.
- The old billboard kept the art offset from the trunk; the new crown does not.
- From the manifest numbers, the original crown centre was roughly this far from the trunk:

| Tree | Trunk position | Crown width | Crown centre offset |
|---|---|---|---|
| `tree_ki3` | 0.156 | 1.0 | about 0.34 of the width |
| `tree3_01_lm1`, `tree3_02_lm1` | 0.766 | 0.84–0.97 | about 0.25–0.3 |
| `bush_a` | 0.25 | 0.94 | about 0.25 |
| `tree_ki` | 0.344 | 1.0 | about 0.16 |

- So these crowns stick out up to about a third of the tree's width past where the original art ended, on the side away from the trunk. They may then cut into nearby walls, cliffs or props.
- The claim that alpha bounds preserve the visible width holds for the size but not the position.
- **Fix:** move the crown sideways by (crown centre − `footU`) × width, keeping the trunk where it is. The trunk and crown currently share one matrix (line 41), including a random spin, so the crown would need its own matrix with the offset applied before the spin.

### 3. Medium (confirmed): the battle camera now collides with the new trees
- `battle-stage.ts:102` skips only `'camera-facing-original-trees'` when checking for obstacles behind the camera.
- The old billboards are now hidden, but the new `solid-original-tree-canopies` and `solid-original-tree-trunks` meshes are visible and not skipped.
- Effects:
  - The battle camera now lifts by up to 5 units whenever a tree is behind it.
  - Every frame it raycasts against every tree instance in the loaded area, which is the per-frame cost `camera.ts:3-4` warns about.
- The field camera exclusion (`camera.ts:7`) was updated; this one wasn't.
- **Fix:** add the two new names here, or share one exclusion list with `camera.ts`.

### 4. Low (inferred): the leaf texture path has no test coverage
- `leafTexture` returns `null` whenever `document` is missing (`tree-volume.ts:8`), which is always the case under `node:test`.
- `source-assets.test.ts:22` also uses a texture with no image.
- So every test only exercises the plain-green fallback. The crop, alpha trim, flood fill and `flipY` handling are never run, which is how finding 1 got past 119 passing tests.
- If a texture's image isn't ready, the crown silently stays flat green. That's fine today, because `world.ts:59` waits for the texture before repairing.
- **Fix:** add a test that runs the crop logic on a small synthetic image, using the manifest values for `tree_w01` and `bf_tree01`.

### Checked and fine
- **Pivots:** the trunk base sits at the ground point (`center.y + height·(1−footV)`), and the crown top lands on the art's top edge (`height·(footV−topV)`). This matches `render-repair.ts:326`.
- **Shared resources:** the crown and trunk geometries are created once and shared. `releaseCell` (`world.ts:65`) doesn't dispose them, and the leaf texture cache only holds textures weakly.
- **Shading and colour:** sky tinting patches the new materials automatically (`sky.ts:119`). Vertex colours on the crowns and per-tree colours both have their data.
- **Alias inference (`export_foliage.py:61-72`):** generic names are only accepted on an exact image match, and names with more than one image in a context are skipped. Cross-context aliases inherit a `family` from the other context, so in principle a ground-mark lookup could miss. Both aliases I spot-checked (`lambert47`, `lambert48`) map to the same context, so I found no actual mismatch.
