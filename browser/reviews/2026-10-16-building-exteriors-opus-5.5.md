# Building exterior review — Claude Opus 5.5

Status: preliminary read-only review of a copied working-source snapshot. This is not final release approval, and the reviewer did not execute tests, builds or renders.

- Requested model: `claude-opus-5-5`; CLI model usage confirms this model (with auxiliary Haiku usage).
- Snapshot: `/tmp/hg-building-review-snapshot-20261016-1800`, based on `b8513899bd196e184fe80a997803e0240b16c84b`.
- Snapshot manifest SHA256: `15bfcee1c53f21c535c6250c98ebe7fb71dc2aa8c59955f10266437c625d3908`.
- Review result: CLI success, no permission denials; only Read/Grep/Glob allowed, no subprocesses, edits, agents or browser access.
- The snapshot predates the later house, gym, misc, Pokeathlon, gate, shrine, decorative and small-building corrections. A final immutable review remains required.

## Adjudication in progress

| Finding | Evidence / current disposition |
| --- | --- |
| Generic caps hidden on separate components | Confirmed blanket visibility behavior; actual defects are being adjudicated individually. Lighthouse light sheets, Pokeathlon lights, pagoda eaves and house chimney/roof overlaps have source-specific handling. No blanket visual approval. |
| House depth precision | Inferred risk; requires far-distance runtime inspection after final house fixes. |
| Synchronous reconstruction cost | Audit now records per-placement exterior construction time and exposed roof-sample counts. Final immutable measurements pending. Generic-first order retained until measured replacement behavior is verified. |
| Skinned footing update | Fixed by both matrix update forms. Regression failed before the fix and passes after it. |
| Shared cached fill colour mutation | Fixed by returning a clone on first computation too. Shared-material tint regression failed before fix and passes after it. |
| House texture stretching / gables | Source comparisons and native PNG-aware tests expanded across the full family; final review pending. |
| Roof lining protrusion | House owner clamps to measured neighboring roof envelope; final runtime captures pending. |
| House door world height | Fixed to placed root world height. Actual inventory currently has yaw-only placements; generalized transform test retained. |
| Rear passage detection | Source-aware placement audit separates physical doorway geometry from event approach corridors. Measured north Pokeathlon vestibules preserved; gate work still in progress. |
| Gallery rejected-load cleanup | Gallery owner investigating and fixing instance-owned disposal. |
| Audit helper / house inventory drift | Audit derives helper discovery from dispatcher import/call graph and house membership from its exported set. Final output pending. |
| Resource prefix coverage | Dispatcher now includes each integrated family prefix. Unload regression expanded from house-only to all integrated fixture families, including shared-source and texture survival. |
| Burned Tower lower rear | Actual six-view comparison found native lower base coherent. Intentional upper destruction remains open and separately classified. |

Regression evidence: `/tmp/hg-opus-regressions-before.log`, `/tmp/hg-opus-regressions-after.log` (31 passing targeted tests), `/tmp/hg-all-family-lifecycle-tests.log`. These development logs are not substitutes for final committed validation.

## Original reviewer response

I found no blockers in the integrated building runtime. Nothing below would break doors, walking or story, or corrupt the shared source assets. I did find several confirmed code issues and some visual risks that the six-view pass should check.

I only read files with Read/Grep/Glob. I didn't run any tests, builds or renders, so every visual statement below is my inference from the code. I've left out the defects you listed as pending: house 297/298/252 roofs, Dojo255, the misc and Pokeathlon helpers, Burned Tower's intentional upper damage, and market canopy174.

## Findings, most severe first

### 1. Medium (confirmed in code; visual effect inferred): family shells hide every generic rear cap in the whole model, not just the building's
- **Where:** `house-building-shells.ts:158`, `special-building-shells.ts:137`, `landmark-building-shells.ts:53`, `civic-building-shells.ts:42`, `station-building-shells.ts:65`, `burned-tower-shells.ts:68`, `urban-building-shells.ts:29`, `facility-building-shells.ts:28`.
- **Trigger:** any building model that also contains separate small parts, such as a chimney, sign board, mailbox or eave piece.
- **Why it fails:** the template repair (`render-repair.ts:68-107`, called per part at `:109`) gives each disconnected part its own `3d-rear-facade` and `3d-solid-backing`. Each family then hides every mesh with those names under the whole model. Only the house shell keeps any of them, and only upward-facing roof triangles (`house-building-shells.ts:15`). So a chimney or sign that was closed before becomes open or one-sided again, and the double-sided originals show their front art reversed from behind.
- **Fix:** have `closeComponent` record each part's bounds in the mesh's `userData`. Then hide only generated meshes that overlap the body the family is replacing. Add a test that a separate part keeps its backing.

### 2. Medium (inferred visual risk): house closures sit almost exactly on top of other surfaces
- **Where:** front interior closure 0.02 native units behind the front facade (`house-building-shells.ts:144`); lining 0.025 behind the rear cladding (`:118-121`); side closures 0.01 inside the native side walls (`:137-138`).
- **Why it fails:** at 1/16 scale those gaps are about 0.0006–0.0016 world units. With the camera's near plane at 0.05 (`world.ts:23`) and a 24-bit depth buffer, depth precision is about that size from roughly 23–37 units away. That is inside the five-by-five streaming window. The front closure uses side-wall texture, so flicker would show through the front door and window art on distant houses. The lining uses a single clamped band that differs from the banded cladding, so it would shimmer through on distant rears.
- **Fix:** use larger insets (at least about 0.25 native units), or set `polygonOffset` on the closure and lining materials. Include a far-orbit view (30–60 units) in the exploratory pass.

### 3. Medium (performance): every placement recomputes everything on the main thread, and the generic result is usually thrown away
- **Where:** `world.ts:130` runs `closeBuildingExterior` for each prop in a cell during streaming. `building-exterior.ts:20` always runs the generic pass first, scanning every triangle and building a hull. All eight families except gym then hide that result, and the hidden geometry stays in memory until unload.
- **Why it's a risk:** the family shells work in each model's own coordinates. Apart from door cutouts, their output is identical for every placement of the same asset, yet each placement walks every triangle again. The house roof-height sampling has no limit: the dormer loop at `:126-131` samples every roof z against every probe x, and each new sample loops over all roof faces. `roofSamples` is recorded but no test checks it.
- **Fix:** skip the generic pass when a family that hides it succeeds, and run it only as a fallback (gym keeps it). Cache local-space shell geometry per asset and door-cut signature. Add a timing or `roofSamples` budget test over all 45 house variants.

### 4. Low–Medium (confirmed; currently masked): the footing breaks the "both matrix updates" rule for skinned meshes
- **Where:** `building-footing.ts:8` calls only `root.updateWorldMatrix(true,true)`.
- **Trigger:** a skinned prop that has a terrace foundation and wasn't refreshed by the exterior pass first. The exterior pass skips the refresh when the door list is empty (`render-repair.ts:116` returns before updating) and when no family matches.
- **Why it fails:** a skinned mesh's bind-inverse matrix is only refreshed by `updateMatrixWorld`. Without it, `getVertexPosition` uses a stale matrix and the footing comes out displaced. Today matrix 0 always has entrances, so this is latent, but it depends on call order.
- **Fix:** add `root.updateMatrixWorld(true)` at the footing's entry. Add a skinned-mesh footing test.

### 5. Low (confirmed): the generic fill colour is cached, then changed in place
- **Where:** `render-repair.ts:26` returns the cached colour object itself the first time. `:160` (untextured generic rear wall) and `:261` (rocks) then call `.multiply()` on it.
- **Why it fails:** the first untextured placement of a material changes the shared cache. Every later placement gets the vertex colour applied twice and comes out darker. Gyms keep the generic panel visible, and so does any building without a family shell.
- **Fix:** return `result.clone()` at `:26`, or clone before multiplying.

### 6. Low (inferred visual risk): house cladding stretches and smears its texture
- **Where:** `house-building-shells.ts:97-104`.
- **Why:** the chosen side face's texture is stretched across the full rear width rather than repeated at its own scale. Above the source face's top, the texture coordinate is clamped (`:104`), so a single texel row is smeared upward. Rear gables on houses whose roof ridge runs front-to-back could show vertical streaks. The existing test only checks the texture region for `1-37-0`.
- **Fix:** repeat at source scale, as `ShellBuilder.band` does in the other families. Fill gables from a gable source face.

### 7. Low (inferred visual risk): the roof lining extends past ridges
- **Where:** `house-building-shells.ts:91`.
- **Why:** each lining triangle grows 0.24 native units outward from its centre (1.0 for models 252 and 253), and is clamped only to the outer bounds. At a ridge or hip, slope A's lining keeps rising past the ridge and pokes above slope B by about 2·d·tanθ − 0.08. For 253, which is not on your pending list, that's roughly 1.3 native units.
- **Fix:** only grow the lining along edges that have no neighbouring roof triangle.

### 8. Low (confirmed inconsistency): house doors are converted using world y = 0
- **Where:** `house-building-shells.ts:48`. Every other family uses the model's world y.
- **Why:** if a house is placed with any x or z rotation, the door's local x/z will be off.
- **Fix:** use `root.getWorldPosition().y`, as the other families do.

### 9. Low (inference; needs data check): rear-door detection windows differ by family
- Special uses ±10 native units (`special-building-shells.ts:130`). Civic, urban, facility, gym, station and burned tower use about ±12. Landmark uses −16 to +8 (`landmark-building-shells.ts:160`). The house uses ±9.6 around its bounds (`house-building-shells.ts:48`).
- A real north exit whose event tile is more than one tile from the wall would get closed over.
- **Fix:** add a data-driven test over `entrances.json`. For every placement, any door whose outward direction is the model's −Z within its x-span must leave the shell bailed out or cut.

### 10. Low (tooling)
- `building-gallery.ts:33`: attachments removed after `closeBuildingExterior` already ran are never disposed, so their owned buffers and materials leak on every refresh.
- `audit_building_enclosures.ts:48-59`: the audit can't run the five newer families on their own, only through the dispatcher. Its `houseIDs` (`:44`) has drifted from `HOUSE_BUILDING_MODELS`.
- `building-exterior.ts:31`: `genericPanels` counts panels even after a family has hidden them, which is misleading in audit output.

### 11. Integration hazard (not a current bug)
- `ownsBuildingExteriorResources` (`building-exterior.ts:36-38`) decides what to free by mesh-name prefix. It doesn't include `pokeathlon-building-` (that helper uses this name at `pokeathlon-building-shells.ts:30-31`), so those meshes would leak once that helper is integrated.
- A source model node that happened to match a prefix would be freed out of the shared template. The dispatcher test only checks the nine assets it loads.
- **Fix:** tag owned meshes with a `userData` flag instead of relying on names.

### Possible gap to check visually
`burned-tower-shells.ts:45` only uses east-wall faces with y ≥ 7.99. Once the generic panels are hidden, the rear below about 8 native units depends on native geometry existing there. If it doesn't, a low open strip remains. Check the rear-quarter view.

## Contracts that check out
- **Placed clones only:** all nine families clone materials (sharing the texture maps), build new buffers, and only change visibility on per-clone objects. No source or template geometry, material or texture is changed.
- **Matrix updates:** both update forms are called in every family entry point, and in `closeBuildingBack` when doors are present.
- **Transforms:** shells are built in model-local coordinates and added under the model. Door positions and directions are converted with the inverse world matrix, so rotation, translation and scale are respected.
- **Order in `world.ts:130`:** terrace offset, then exterior, then footing. The footing skips hidden meshes (`traverseVisible`), so hidden generic panels get no footing while family cladding does. Door x/z and synthetic relief are unaffected.
- **Unload:** `releaseCell` covers all nine prefixes plus `entrance-rear-wall` and footings, frees each resource once, and leaves templates and maps alone.
- **Dispatcher:** the families' model-ID sets don't overlap, the first match wins, and repeat calls return the cached result.
- **Burned Tower:** moving the east-wall faces to the rear keeps the texture the right way round (not mirrored), and nothing above the lower story is rebuilt.
- **Passages:** the generic pass bails on opposite-facing doors, and each family either bails or cuts an opening.
- **Gallery candidate mode** uses the same dispatcher and order as the game.

## Test gaps
- The dispatcher test (`building-exterior.test.ts:22-31`) only passes an empty door list. It doesn't cover rear or through doors, or check skinned vertex positions.
- The unload ownership test covers the house family only.
- Front-door ray preservation is tested only on `1-37-0`; it should cover all 45 house variants.
- No test covers separate parts keeping their backings (finding 1), a footing on family cladding, a skinned footing, far-distance depth separation, or a performance budget.
