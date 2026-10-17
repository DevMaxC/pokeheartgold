# Native surf translation repair

The blue U-shaped stripe inside Cherrygrove's western island comes from an omitted native texture matrix. The affected placement is matrix0, map67, cell16,12, `land/4-2.glb`. Its `swave_p` material has flags `0x1fc7`: texture matrix enabled, scale one, rotation zero, nonzero translation. The exact native FX32 words are `(0,2458)`, so translation is `(0,0.60009765625)`.

`lib/NitroSystem/src/g3d_cgtool_maya_tex.c:texmtxCalc_flagRS_` applies normalized texture translation `(-transS,+transT)`. The model's texture matrix mode is Maya (`0`). The current apicula material reader warns that this matrix combination is unimplemented and substitutes identity. The exporter consequently places the wave's opaque blue rows at the sandward upper edge instead of the seaward lower edge.

The correction records that literal source translation as standard `KHR_texture_transform` on the base-color texture. Installed Three GLTFLoader supports this extension, clones the transformed texture, and retains the original image/source. `originalMaterial` keeps the resulting map. No renderer or World changes are needed. The importer applies the same correction to new and cached land assets, refuses conflicting existing transforms, and is byte-idempotent on corrected assets.

The native inventory finds exactly27 translated surf land models and27 current GLB variants. The remaining source materials are unchanged. `asset-correction.json` pins original native model/archive and before/after GLB hashes. `byte-invariance.json` independently compares each corrected asset to production commit `93bf982b0d866a1150f22eae6ad6caf91da46bc5`: every pre-existing JSON value, embedded PNG, complete binary chunk, mesh, position, index, UV, vertex color, sampler, and animation value is unchanged. Only the standard texture offset and extension declarations are added.

The island witness at `(524.95,406.6)` samples opaque blue `(49,140,255,255)` from the old surf overlay. The native offset makes that texel transparent and exposes original sand `(231,231,198,255)`. At `(524.15,406.6)`, `(530.85,407.4)`, and `(528.6,408.85)` the corrected seaward wave remains opaque blue at the original height approximately0.584375. Ocean outside the island keeps identical source pixels and heights. Native geometry and UV accessor values are not moved.

An initial scalar estimate wrongly suggested the sand underlay intersected the island shore. The actual placed-mesh replay disproves that estimate: overlapping collision plates make its border vertices lower. The actual originalMaterial → repairOriginalAsset → shorelineUnderlay → terraceModel pipeline finds no backing occlusion at560 finite island grid samples. Ten explicit land/surf/corner/ocean witnesses retain native color and height when the backing is toggled. The backing-clipping prototype and single World-call experiment were dropped. They are not part of this patch.

Validation (offline, no browser or Vite build):

- `node --experimental-transform-types --test browser/src/source/shoreline-native.test.ts browser/src/source/shoreline.test.ts`:5tests pass, including4 new native loader/material/pixel/pipeline tests.
- `python3 -m unittest discover -s browser/scripts -p test_native_shoreline_srt.py -v`:4tests pass, including literal native MAT bytes, exact inventory, idempotence and conflicting-transform negatives.
- `browser/node_modules/.bin/tsc --noEmit -p browser/tsconfig.json`:pass.
- `python3 browser/scripts/native_shoreline_srt.py`:27translated assets,0changes after correction.

Coverage is finite and source-specific. This restores a static native material matrix; it does not implement native animated tide/texture tracks or claim all-map visual approval. Existing terrain audit67 deliberately rejects KHR texture transforms and must gain explicit offline texture-transform support before a future audit run. Historical source-hashed audit reports remain immutable and do not cover the changed material sampling. No held terrain audit/runtime/World files were edited.

Opus5.5 reviewed frozen source commit06aff52b read-only and found no concrete bug. The full unedited response and scope adjudication are adjacent. The review used the frozen worktree, so two supplemental documents in a separate copied directory were unavailable; it did not independently rehash GLBs or inspect apicula's converter source. Source hashes and all27 corrected asset hashes stayed identical through review. No browser approval is inferred.

The adjacent software diagnostic is repeatable with `python3 browser/reviews/shoreline-native-translation/software-diagnostic.py`. It draws original opaque/masked triangles with nearest embedded PNG sampling; blended sea-line layers and NPCs are omitted. It is explanatory evidence, not a browser capture. The36 existing render-repair/terrace-model regression tests also pass (`related-tests.tap`).
