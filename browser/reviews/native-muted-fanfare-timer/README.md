Muted hatch fanfares now execute their native phase even when no sequence is admitted: pause the owned hatch BGM, wait the15-count no-voice timer, then resume BGM. Mute gates preparation and sequence admission, and is not reported as a technical failure. Already admitted fanfares still await their real voice and the existing verified completion tail. An explicit late unmute during the no-voice wait neither replays the missed sequence nor releases the timer.

The source basis is literal `PlayFanfare` → `StartFanfareWaitTimer(15)` → BGM/radio pause → ignored `Sound_StartSeq` result in `src/sound_playback.c`. `IsFanfarePlayingOrWaiting` retains15 TRUE polls after player2 is idle; `IsFanfarePlaying` stops the fanfare/resumes BGM only on the following FALSE result. Hatch app cases8/9 ignore admission and immediately enter that poll. `test_hatch_fanfare_timer.py` compiles the original five C bodies unchanged, stubbing only device admission/output plumbing. Failed field/radio admission and an admitted sequence all retain15 timer polls; active sequence polls do not decrement the timer. This proves the source FSM, not hardware audio or complete scheduler timing.

This leaf starts at accepted13cfb634 and changes only the fanfare runtime branch in `hatch-host-audio.ts`. Main, World, Azalea, the accepted sound-phase chain, audio resources, source preparation and cry admission are unchanged. In particular, it does not invent a fixed cry delay: a muted/unadmitted cry can complete immediately. This supersedes only the earlier review's specific before-admission fanfare timer/BGM-pause limitation. Bounded lazy browser resource preparation still precedes this phase, and the existing wait port's default is cancellable wall-clock presentation at the15/30-second mapping. No complete hardware timing parity is claimed.

Validation:251 focused silent Node tests, TypeScript, and2 original-C oracle tests passed. The new controls cover initial mute, just-muted BGM, mute during future manifest/preparation, late unmute before a timer finishes, an admitted fanfare ending before its tail, real shared BGM phase preservation, map cancellation/Return and real presentation rollback/fresh Retry. Real player/transport methods run with fake AudioContexts and original pinned WAV data; no sound is played. Four meaningful controls fail against the exact prior13cfb634 host with the unchanged new test source (`before/`): the missing timer is observed before the fixture barrier, including the real shared-player case. No ABI adapter is used.

Repeat from the repository root:

```sh
python3 browser/scripts/test_hatch_fanfare_timer.py
```

From `browser/`:

```sh
node --experimental-transform-types --test src/source/hatch-host-audio.test.ts src/source/main-native-interface.test.ts src/source/main-music.test.ts src/source/field-music.test.ts src/source/audio-controls.test.ts src/source/hatch-music.test.ts src/source/egg-hatch-integration.test.ts src/source/egg-hatching.test.ts src/source/interface-panels.test.ts src/source/main-interface.test.ts src/source/main-battle-keyboard.test.ts src/source/ui-framework.test.ts
npx tsc --noEmit
```

For the before control, copy the source tree privately, replace only `hatch-host-audio.ts` with the archived prior host, retain the current test file, and run the `muted fanfare phase: initially|muted fanfare phase: just-muted|muted fanfare phase: actual shared|muted fanfare phase: mute during future` test-name pattern. Asset/native source directories must point to the same pinned repository inputs.

Source hashes and raw test/oracle outputs are retained. No browser audition, Vite build, merge, deployment or future Main reconciliation is approved by these checks. Actual narrow Opus5.5 review follows the immutable source freeze.
