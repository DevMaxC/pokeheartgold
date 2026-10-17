# Native building roof art correction

Status: scoped actual Opus PASS with no blockers; parent independent visual/release review pending. This receipt covers the three actual placements below. Prior finite355/2130 capture and ray results do not approve these new bytes or every possible camera.

Base: `bd7ebeeb3c328546d21615381a5bb06404f9a2de`. Runtime helper SHA256: `54e2d8601e138c7064ce9613b25d1317e2a7aab7c39bb25460fdd261f8cd3d72`. Only `decorative-building-shells.ts` changes runtime behavior. Tests add exact native fixtures through the existing central exterior dispatcher/lifecycle.

| Native asset | Actual placement | Measured correction |
| --- | --- | --- |
| `props/1-4-5.glb` EN_GATE02 | `0:12,5:2` | Remove false generic backing over complete maroon roof. Add24 missing narrow rear beam/ridge/post/plinth triangles, copying literal native art. Preserve the wide passage belowY44.21875. |
| `props/1-217-10.glb` KBC_LOVE | `0:40,9:14` | Remove plain generic hull protruding above literal hip roof and its copied rear dormer. Add29 rear masonry/cornice/post triangles, all at/belowY44. Native roof, front dormer, entry and projecting native green board remain. |
| `props/1-118-6.glb` AS_RESTAURANT | `0:8,7:6` | Add6 triangles for three missing inward well walls, using existing native red rear-wall pixels. The recessed deck remainsY52.05078125, rim~Y64.6, native chimney/art remain. Missing geometry, rather than material alpha/culling, caused the cyan through-slot. |

Before-fix proof: the copied immutable base helper fails the native-roof first-hit identity check for4, the literal left-hip external ray for217, and the literal recessed wall ray for118. The fourth bounded entrance test also fails on unsupported new families; it is supplementary, not the geometry diagnosis. See `before-regressions.log.gz`.

Validation:21/21 decorative+central integration tests and9/9 source-asset integrity tests pass; TypeScript passes. Tests exercise native embedded PNG alpha, front/shared-buffer/material/map preservation, exact native roof ray/UV identity, dense interior directions, gate passages, bounded transformed rear entrances, idempotence and unload disposal. Source GLB/PNG inputs are unchanged.

Actual WebGL: T3 allocated only `tab_q`, Vite5202. Six views each of the three literal placements in raw source and central candidate modes; six PNGs. Source+input hashes stayed identical around captures. Observed: brown gate overlay gone; Love House protruding tan strip and copied dormer gone; restaurant cyan well slot gone. Canonical native white hip trim and native projecting board are retained. Current screenshots are working-source diagnostics with explicit hashes, not immutable production certification. Browser Electron preload warnings are host-level; no model download/runtime error was observed. Tab parked on5202/source/spawns.json afterward. No protected/user tabs were touched.

Review: actual read-only Claude Opus5.5 completed54turns against209 unchanged sealed files, manifest `f596aa855ba03d4003315a96b2ab5f2b3d652424b9bb4734db8b40ff76ac89bf`; decision PASS with no blockers. Raw result and scoped adjudication are preserved alongside the historical snapshot manifest.

No production build, push, PR, merge or deployment has been performed by this repair owner. Parent owns release verification.

Large raw capture-state JSONs and the before-fix test log are stored as lossless gzip, with original and compressed SHA256/byte counts in `lossless-raw-evidence.json`. The immutable Opus packet retains its original uncompressed bytes.
