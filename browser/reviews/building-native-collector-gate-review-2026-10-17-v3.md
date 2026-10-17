# A3 native collector and gate-transform adjudication

The fresh v3 probe passed for all 220 native texture contexts using the A3 working house helper `4a5734efd044b9d6be5628dd75ab07f127c10263f26a7b124b66d03d2a953367`. Filtering hidden or instanced objects from the actual collectors changed none of their visible geometry/material/texture signatures. All native GLB hashes matched the regenerated inspection inventory, with no errors or source-byte changes during the run.

Comparing the complete visible output signatures with the preserved A2 receipt finds exactly two changed contexts: `props/1-102-6.glb` at `0:5,10:1` and `props/1-237-14.glb` at `0:37,7:11`. The other 218 asset-context signatures are identical. This independently checks the scope of the roof repair; it does not certify the repaired silhouettes or visual quality.

The only observed hidden object remains model 317's `hana` mesh. Collectors read its vertices, but excluding it leaves the same visible output. No actual InstancedMesh occurs in these 220 contexts, so the proof does not claim empirical coverage of future instanced assets.

All 34 actual gate placements were reconstructed with the exact World cell-group translation and child prop scale, rotation and position. Flattened and parented world matrices have maximum difference 0, their visible signatures match, and both compositions select the same 15 north-entrance placements. Accepted local coordinates span X −8…8 and Z −104…−80. The four Route 29/Mahogany events at Z −104 remain exactly −104. No rounding failure was reproduced and no tolerance was added.

The regenerated plan covers all 355 placements in 60 pages and 2,130 views; every visual status remains pending. The current full provisional audit is separately hashed in the receipt. The working source proof is not an immutable A3 attestation: the parent must commit A3 before a committed-byte attestation can be issued. Actual WebGL captures and independent visual review remain pending confirmed T3 host reconnection. No browser retry, substitute driver or synthetic screenshot was used.

Run from the repository root:

```sh
node --experimental-transform-types browser/reviews/building-native-collector-gate-probe-2026-10-17-v3.mts
```

The full output is `building-native-collector-gate-adjudication-2026-10-17-v3.json`; exact hashes and gate keys are in `building-native-collector-gate-receipt-2026-10-17-v3.json`. Every A2 artifact remains unchanged as historical evidence.
