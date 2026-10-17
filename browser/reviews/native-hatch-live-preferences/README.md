The hatch audio host now reads the current global sound preference. Main supplies `enabled: () => preferences.music`; a captured boolean is rejected. The host checks new music/cry admission after asynchronous preparation and reads the same live preference during retained field restoration. An explicit unmute can prepare the future original1188 fanfare if the hatch began muted, without replaying the earlier1011 background phase or retrying a previously failed admission.

Immediate silence belongs to the shared master gain from the root mute patch. Muting does not stop already admitted hatch voices or cancel their native completion/timer waits. Original audio resources, cancellation and player-lifetime behavior are retained. A locked Context is never constructed or unlocked by the hatch host. Technical admission failures remain diagnosed no-voice outcomes; invalid configuration/source and owner cancellation stay explicit.

Recovery reapplies current sound and text-speed preferences after `SourceActionRecovery` restores the checkpoint, before field hydration. Other gameplay options still roll back. Main's native entry, phone, Bag, input, recovery and Violet bindings remain present; the function-level comparison is in `source-pins.json`.

This isolated branch starts at campaign9e99dbac and explicitly reconciles root mute66a1858f as85b78ce9, preserving the newer native Main. The source leaf also includes the authorized71b8c5f7,82b800a3 and84864cb7 corrections: focused movement keys, live open Settings, post-enable trusted gesture, battle heading spacing, and native capture unlock exclusion for the global button. These are dependency reconciliation, not Azalea bindings. The accepted42bdda93 sound-phase chain and World were not edited.

Validation is silent and offline:210 focused Node tests and TypeScript passed (`tests.log`, `tsc.log`). The tests execute real shared music/player/hatch implementations with fake AudioContexts and original pinned WAV data, plus production Main AST bindings and actual recovery transactions. They cover mute/unmute before start, during preparation/decode, active cry/fanfare completion, hidden output, locked Contexts, future fanfare admission, muted recovery followed by battle, live global control reachability and saved preference rollback/Retry.

Four meaningful controls fail with the exact former host and an ABI-only adapter evaluating the getter once at construction (`old-control/`). They expose delayed BGM/cry admission, missing future fanfare and a muted retained restore incorrectly demanding an unlocked output. `recovery-before.log` fails against the prior reconciled Main before the recovery correction. No numeric tolerance or audio fallback is used. The prior captured-mute reachability qualification is superseded: the global button can change preference during a hatch, while ordinary Settings admission remains blocked.

Repeat from `browser/`:

```sh
node --experimental-transform-types --test src/source/hatch-host-audio.test.ts src/source/main-native-interface.test.ts src/source/main-music.test.ts src/source/field-music.test.ts src/source/audio-controls.test.ts src/source/hatch-music.test.ts src/source/egg-hatch-presentation.test.ts src/source/interface-panels.test.ts src/source/main-interface.test.ts src/source/main-battle-keyboard.test.ts src/source/ui-framework.test.ts
npx tsc --noEmit
```

The saved before-control sources are evidence rather than runtime imports. Reproduce by copying the current source tree into a private directory, replacing the hatch test import with `hatch-host-audio-old-adapter.ts`, and supplying the archived exact old host/adapter. For recovery, set `HG_NATIVE_INTERFACE_REVIEW_MAIN` to the archived `recovery-before-main.ts.txt` and select the `current global preferences survive` test.

No browser audition, browser visual review, Vite build, merge or deployment occurred. This is a bounded compatibility leaf, not approval of future Main/Azalea/sound-clock reconciliation. Actual Opus review evidence is added separately after the immutable source freeze.
