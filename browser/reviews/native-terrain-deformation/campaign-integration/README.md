# Native terrain integration on campaign5298

Base: `5298dc0c1824bc2e45298dc88bf4002caae69020`. Accepted native checkpoint: `23b052e9c78fceb725b3ac0e51afe7479b86859d`. This branch copies that isolated native helper/deformer and evidence into the campaign context without replacing World wholesale.

The helper stays byte-identical at `249440d6…`, and the deformer at `37f7cf76…`. The campaign base already had the legacy backing `terrainSceneryCoverageOnly` marker; the accepted deformer retains it. The production native corner-wall code also stays byte-identical. World has exactly two substitutions: recognize owned `source-terrace-joint` geometry and return before disposing its shared native material.

Default `terrainSceneryEnabled=false`, the opt-in-only T2 branch and released forest foundations remain unchanged. Violet Gym, scripted cameras, field task/effect cancellation and paper-actor ownership stay byte-identical to the base. Native Main is unchanged at SHA256 `6f48648768efb0e6f7684912d019f015fec16309ca9940f0724bed8fb71ea9ee`. Public assets, permissions, UI and audio are untouched.

All 60 targeted checks pass: 50 native tests, four actual World regressions against pinned pre-integration campaign World/deformer fixtures, and six terrain World/default-off policy tests. TypeScript passes. The three actual native cells retain all 46,822 UP position/UV/color/material tuples. Floor 2,771, entry 144 and camera 1,728 ray receipts exactly match the accepted native checkpoint, including its one strict same-plane numerical camera witness. These are bounded cell regressions, not whole-map equivalence.

The earlier parent folder preserves the production333 source and visual review history. The current campaign context is documented here; those older World hashes do not claim to describe this new World. No browser or audio operation, Vite build or full suite was run during this integration. The previously qualified helper/deformer geometry is identical; its eight production333 browser frames do not become a new whole-campaign visual approval.

Actual narrow immutable Opus review of the new World context is running. Source is held. Root owns the full suite, build, CI, final campaign merge and deployment. The parked opt-in T2 planner remains outside this patch's approval.
