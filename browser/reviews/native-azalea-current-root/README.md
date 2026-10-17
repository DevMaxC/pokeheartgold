# Azalea integration on current Root

This packet records a scoped replay from Root `1f83a40156857652ebc0b8ce2329fb2af7e28da7`, rather than replacing Main or World with the older prepared branch. The candidate is `1edd3b92957c598f9d5b6faa94248475e8ddc424`. Historical a172 review packets remain separately under `native-azalea-main`; their acceptance is not transferred to this integration.

The scoped chain adds the source Azalea controller, native resources/audio, persistent task clock with its post-task sound phase, stable paper-actor records, and Main/VM/World bindings. Actual script0869 coordinate entries drive the host. Continue and recovery hydrate the saved puzzle without native Init; real room entry and native Init reset it. Ride vectors are separate from the logical boarding tile, native eight-tick movement maps to four-frame paper animation, and docking commits the completed tile. Owned rides exclude independent field actions and release input, actors, sounds, and camera offsets on failure before rollback hydration.

`root-preservation.json` and the base inputs document unchanged Root source. Fifty-three existing Main functions are byte-identical, including opening/title, hatch, source-action recovery, scripts, battle/music, Mom economy, and Bag orchestration. Protected opening-audio, UI, panels, Bag actions, Battle, and hatch adapter files are unchanged. Main changes are additive Azalea imports/installation, snapshots, Continue entry, full XYZ render, and moving guards. World retains the canonical terrain/forest/cornerwall/resource paths and disabled terrain-scenery flag; its changes are additive Azalea ownership, camera, streaming, and managed-prop hooks. Root's shared output opening, live global mute, Bag handback checks, and current Binding battle logic are preserved.

Validation at the candidate:

- 315/315 actual Node integration tests pass, including Main/VM/source coordinates, routes, switches, Continue, cancellation/Retry/Return, global sound update, Violet, opening, Egg, party, Bag, phone, music, and Binding regressions.
- TypeScript exits0. The final frozen run is preserved separately from the earlier run.
- Four original SDAT/WAV/pinned-renderer/SDK priority tests pass; a separate compiled literal SDK C oracle confirms stop/fade/count behavior at the sound update boundary.
- Initial failures are preserved. They were omitted sparse-checkout inputs, resolved by checking out exact committed native/data files, without weakening test assertions.
- Scope diff passes, with immutable raw logs/patches retaining original whitespace through local review-directory attributes.

Actual independent Opus5.5 accepted the exact candidate after 70 turns / 838375ms, with no confirmed introduced defect. All 10252 source inputs and the prompt/manifest remained unchanged. The full result and manual adjudication are recorded alongside the complete input archive, full raw output, exact prompt/CLI/model usage, SHA/Git-blob manifest, and post-run integrity check. No runtime source or test bytes changed during or after the review; this handoff adds evidence only. The raw modelUsage is preserved, including the reported small Haiku entry without inferring its purpose.

This is source and deterministic host validation only. It does not approve browser/GPU appearance, audible output, device scheduling, full DS hardware equivalence, production build/deployment, or the complete campaign. Existing partial boundaries remain explicit. Main at this base does not yet bind future Repel/PLAYER4/poison/Evolution or generic PlaySE/Cut adapters. Root owns those integrations and release validation. All preview audio remained silent; this task ran no Vite build, browser, audio unlock/audition, push, or merge.
