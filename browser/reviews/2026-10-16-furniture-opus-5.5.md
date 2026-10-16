# Native furniture review — 2026-10-16

Reviewer: Claude Code, explicitly selected `claude-opus-5-5`, non-interactive read-only `Read`, `Grep`, `Glob` tools. No edits, agents, shell commands or browser operations were delegated. Immutable reviewed snapshot: `286cf44`, based on merged `da70e44`. The CLI also reports auxiliary Haiku usage; the requested review model was Opus 5.5.

## Findings and resolution

- **Medium, confirmed:** round stool supports extended beyond the seat rim. Corrected using radial placement with enough clearance for each complete square leg. Rectangular supports also moved inside the bevel. Every native variant now casts a downward ray from every support footprint vertex and requires the first hit to be the seat top. All 40 variants pass.
- **Texture assumptions, unverified by reviewer:** independently audited every matching prop GLB. Exactly 40 use these material families; all have 16×16 textures, nearest filtering and plain REPEAT in both axes (10497). Browser sampling of all generated triangle UVs at 154,080 barycentric points found no transparent source texels after the bevel/crop corrections. This is sampled coverage, not a proof for every texel or visual approval of every room.
- **Multi-card merging, inferred:** restrict the >17-unit depth allowance to the native long bench family. The full imported source contains no additional assets using these material names. A future multi-card source would require separate component handling.
- **Bench texture repetition, inferred:** actual native bench coordinates use one image with a stretched centre strip, rather than repeating beyond one texture. The replacement reuses its original colour/artwork with a cropped seat surface. Exact native perspective projection is deliberately replaced by solid geometry.
- **First-triangle orientation / first-vertex tint:** known imported cards pass the native audit; transformed-root regressions confirm placement and flipped basis behaviour. There is no generic conversion of unknown floor art or volumetric furniture.

## Validation

- 110 tests pass, including the 946-prop/648-landscape geometry audit and all 540 map data references.
- All 40 native seat, bench, cushion and matching box variants pass opaque side/top rays, original footprint, floor contact, closed edge topology and support-under-seat checks.
- Transformed-root, original material/shadow preservation and repeat-call regressions pass. Native 3D sofas are untouched.
- TypeScript/Vite production build passes.
- Shared browser: New Bark Southwest House renders all four source stools with raised seats and supports from front and side. QA used separate local storage, without changing ordinary player progress.

## Original review

I found one confirmed geometry bug: on the round stool (`chair02_mat`) the legs stick out past the seat. Apart from that, I found no significant correctness, ownership or regression problems at 286cf44. I only read the files (Read/Grep/Glob). I didn't run tests or render anything, and I couldn't look inside the GLB and texture files.

## Confirmed

**1. Medium — round-stool legs sit mostly outside the round seat** (`furniture.ts:48`, `furniture.ts:51`)
- The `round` kind uses a 16-sided seat of radius `w/2, d/2`. Its legs reuse the rectangular corner positions `(±(w/2−1.5), ±(d/2−1.5))` at size 2×2.
- Worked example: a 16-unit card gives `w = d = 14`, so the seat radius is 7. Each leg covers 4.5–6.5 on both axes. The seat edge at 45° is at about 4.95 on each axis, and the leg centre (5.5, 5.5) is 7.78 from the middle, beyond the radius of 7.
- So for `chair02_mat`, almost all of each leg is outside the seat, overlapping only a small sliver. The leg tops at `y = h−2` show from above beside the rim.
- The tests miss this because they check closure, the overall footprint, and rays through the centre and sides, but not whether the legs sit under the seat.
- Fix: place the legs on the ellipse for `round`, e.g. at `(cos45°·(w/2−2), sin45°·(d/2−2))`, or move them inward.

## Hypothetical / untested by the suite

**2. Low–Medium — the tests never check texture sampling**
`geometryGLB` (`source-assets.test.ts:15`) deletes `images`, `textures` and `samplers`, so these assumptions are never exercised:
- **Texture size.** `pixel()` and the `spec.top` mapping (`furniture.ts:39`, `furniture.ts:50`) assume a 16×16 texture. A wider or taller texture would sample the wrong pixels.
- **`vOffset` and wrap mode** (`furniture.ts:39`):
  - With REPEAT wrapping, `vOffset` changes nothing.
  - With MIRRORED_REPEAT, which DS textures can use, the `[-1,0]` variants would read row `15−y` instead of `y`.
  - So the pixel rows in the spec table are only right for those variants if the sampler is plain REPEAT.
- **Transparent pixels.** Material setup (`furniture.ts:53`) sets `alphaTest = 0` and `transparent = false`. Any transparent pixel inside a `top` rectangle, or at a `rim`/`support` pixel, would show its hidden colour, often black.

I couldn't check any of this. The sampler and texture metadata for the eight families would settle it.

**3. Low — one mesh holding several cards becomes one seat** (`furniture.ts:24–35`)
- All vertices of a mesh with a matching material go into one bounding box.
- The 12–65 depth window was meant for the `ch_l01` bench, but it applies to every kind.
- A prop that puts two same-material stools in a row in one mesh would become a single long stool covering the gap between them, possibly with one central pedestal.
- The test only covers props named `0-{32,53,54,55,56,57,58,75,185}-*`. I couldn't search the binary GLBs for other props using these material names. Limiting `depth > 17` to `bench` would make this safe.

**4. Low — the bench top texture is stretched** (`furniture.ts:50`)
The whole `top` rectangle is spread over the full bench length (up to about 65 units). If the original card repeated the texture along the bench (v range over 1), the replacement stretches one copy instead. It depends on the bench's UVs, which I couldn't check.

**5. Nit — per-seat values come from a single sample** (`furniture.ts:30–37`)
Orientation comes from the first triangle with valid UVs, and the tint from vertex 0's colour. That's fine for single-quad cards but unchecked otherwise.

## Checked and fine
- **UV maths and orientation** (`furniture.ts:31–32`): the calculation is correct. The top's u/v follow `across`/`along`, so flipped or mirrored cards keep their authored orientation.
- **Mesh closure** (`furniture.ts:41`, `furniture.ts:44`): the winding fix and convex prism outlines give closed meshes. The leg and pedestal tops sit flush against the seat's downward-facing bottom and are culled, so there's no visible flicker.
- **Interaction with `render-repair.ts`:**
  - Collecting with `traverseVisible` (`render-repair.ts:364`) leaves the hidden originals out of the later repair passes.
  - The new seat goes through `closeProps`, but it is symmetric on X and Z, so `closeComponent`'s `opposite > front*.04` check skips it and no rear façade is added.
  - `closeBuildingBack` (`render-repair.ts:116`) still visits hidden meshes, but seat-sized props fail its size check (`render-repair.ts:117`).
- **Resource ownership:** the seat is built once on the cached template in `World.asset` (`world.ts:61`), and each placement shares its geometry and material through `clone`. `releaseCell` (`world.ts:64`) disposes only listed per-cell names, so shared seat resources aren't disposed when a cell is released. This matches how the other template repairs work. `original.clone()` shares the source texture.
- **Placement:** the replacement is built in the root's own coordinates, so prop scale, position and rotation still apply. The transformed-root test (`furniture.test.ts:7–12`) covers this. Shadows stay untouched.

The suite's idempotency check (`source-assets.test.ts:76`) only looks at `solidSeats`. Running repair twice would still duplicate the other repair meshes, but that predates this commit and isn't reachable at runtime because assets are cached.
