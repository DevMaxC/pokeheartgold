# Building visual inventory

Generated after `node --experimental-transform-types scripts/audit_building_enclosures.ts` by `node --experimental-transform-types scripts/export_building_gallery.ts`.

220 native GLB texture variants, 157 model IDs, and 355 unique source placements are listed. The seed contained 307 placements and 185 variants. This expands beyond matrix zero. All visual statuses are **pending** until a reviewer inspects the actual rendered views; structural ray checks do not mark an asset visually passed.

Open `/building-gallery.html` on the development server; its default mode uses the current shared game dispatcher. Explicit `mode=repaired` retains the older generic repairs as a comparison baseline. It renders original GLBs with the same material conversion, repairs, native transforms and entrance closure as the game. Each selected source placement has front, rear, left, right, overhead and high rear views. `?sheet=rear` displays twelve rear views per page; `?family=center&sheet=rear` filters a family. Click an asset to inspect it in six views. `?sheet=all` renders six assets per page with all six views in each row; use a 1280×1480 viewport for 320-pixel view cells. The `window.__BUILDING_GALLERY_SELECT__` QA API accepts `items:[{asset,placement}]` to render six exact placements, including duplicate assets with different native transforms and entrances. `mode=source` shows the unmodified GLB using the same material conversion for comparison. `mode=candidate` calls the same `closeBuildingExterior` dispatcher used by the game, including the existing generic entrance closure and the matched measured family helper in the same order. This HTML is a development inspection entry; production game entry points remain unchanged. Manual notes are local to the inspection tool and export as JSON; they never modify a game save.

| Family | Variants |
|---|---:|
| backdrop | 1 |
| battle-facility | 5 |
| center | 20 |
| decorative | 19 |
| gate | 36 |
| gym | 15 |
| house | 46 |
| mart | 14 |
| shrine | 12 |
| special | 37 |
| tower-or-landmark | 8 |
| transport | 7 |

## Exceptional coverage

Gates need genuine opposing entrance preservation. Towers and landmarks, station/port/ship designs, multipart shrines, palaces, caves and field props embedded in nonzero matrices need individual review. Native source names and material lists are recorded for every variant. Decorative foundation candidates (fountains, benches, flags, waterfall pieces and message displays) are explicitly labeled rather than treated as enclosed houses.

The inventory records `nativeDataSourceCommit` separately from `rendererBaseCommit` and exact working renderer hashes. It asserts that every major enclosure-audit placement appears. Initial inventory verdicts remain pending; the independent verdict ledger is `building-manual-review.json`.

The generated `building-gallery-plan.json` contains 60 pages covering all 355 exact placements. Pass each page's `items` to the QA API, call `window.__BUILDING_GALLERY_CAPTURE__()` after the render promise completes, and POST the resulting PNG directly to the localhost-only `building_gallery_capture_server.ts` receiver through T3 preview evaluate. This is an actual renderer frame with code-drawn labels, not a DOM screenshot. The source frame survives hot reload, but frozen captures must still verify renderer hashes before and after each batch. The receiver saves the exact capture plan and records actual included attachment/assembly parts separately from nearby source candidates. Run `scripts/validate_building_gallery_capture.ts <capture-folder>` after the complete batch to verify all placement/view counts, native hashes, PNGs and committed renderer provenance; this does not assign visual verdicts. Separate perspective diagnostics use QA options `projection:'perspective',distance:30,yawOffset:0.3`, with the runtime 52° vertical field of view, 0.05 near plane and 140 far plane. The standard final batch remains orthographic, and the receiver rejects perspective diagnostics in that batch. Record the immutable candidate commit, native asset hashes, capture times, exact placement IDs, PNG hashes and actual viewed cameras in the final capture manifest.

No screenshot is synthesized by this exporter. The gallery renders actual source GLBs through WebGL. T3 controls the gallery and exports those real renderer frames; the receiver records their exact hashes, placement metadata and renderer provenance. DOM screenshots are separate evidence when the preview screenshot service is available.
