# Native Continue entry review

Runtime/test commit: `35927aae35b450b104c31682b2266475e14d08d3`, based on `1a0054b4590317bb3d482623d90b2a4aeb46deb6`. Ordinary Continue restores saved actors and height/lift, runs OnLoad/OnResume and skips warp-only OnTransition and the existing Flash/Defog/blackout-spawn resets. New Game retains real warp entry. The title handoff uses the actual opening function's saved-object identity contract. Background interaction and ordinary rival battle functions are byte-identical to the base and independently reviewed against native.

`result.raw.json` is the actual read-only Claude Opus 5.5 result (model usage verified), with no findings. `prompt.txt`, `review-manifest.json`, `patch.diff` and the three exact reviewed owned files preserve the scope. Every manifest path matches its committed blob.

Validation: unchanged base has 2 passes/5 failures in the seven new entry tests; patched code has 7/7 passes, 90 related tests pass and TypeScript passes. Background/rival checks pass 33 tests, including compiled literal native direction logic and all 241 hidden events. Test groups overlap; their counts are not additive.

This closes the ordinary Continue entry bug. Native Flag966/Union Room special Continue, saved dynamic weather, roamers and the bug-contest timer remain broader existing gaps. No browser, production build, deployment or visual approval is claimed.
