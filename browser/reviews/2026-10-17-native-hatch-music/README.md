# Native hatch music: review and reproduction evidence

This bundle pins the hatch audio implementation at `71598bfa9925900133352f62464353d61fb1456b`. The final actual Opus 5.5 review found no new bugs or remaining findings in its narrow diff. The preceding review closed the original three findings. These are static reviews, not browser playback or a full-game approval.

Only this evidence directory is added by the metadata commit. Runtime, assets and exporter changes were committed separately as `d86d91b`, `f69bb43` and `71598bf` (root cherry-picks `0280847`, `355e288`, `b049af3`). Full commit IDs, each revision's file hashes, actual model usage, CLI arguments and source pins are in [review-manifest.json](review-manifest.json). [SHA256SUMS](SHA256SUMS) covers every other file in this bundle.

## The three actual reviews

| Review | Source revision | Result and access limits |
| --- | --- | --- |
| [Initial raw result](artifacts/hg-hatch-music-opus-review.json) | `d86d91b` | Three findings: stale captured field phase, fanfare load gap, Python `assert` guards disappearing under `-O`. No blockers. **Could not read the external renderer**; renderer-dependent claims were explicitly unverified. |
| [Follow-up raw result](artifacts/hg-hatch-music-opus-followup-review.json) | `f69bb43` | Closed all three findings. **Successfully read the pinned renderer** after `--add-dir` was supplied. Identified one low future-field-port restoration edge case and one informational missing event-byte comparison. Could not read the original review JSON outside its directory allowance; used the prompt's finding summary. |
| [Final raw result](artifacts/hg-hatch-music-opus-last-review.json) | `71598bf` | Confirmed restoration of the actual paused voice and the original FAT event-payload comparison. No new bugs or remaining findings. Narrow three-file review; did not re-review the entire renderer or root host. |

Each raw JSON is copied without modification, including `modelUsage`, permission denials, result text and usage. All three contain actual `claude-opus-5-5` usage, alongside a small Haiku routing entry. The exact input prompts and stderr files are adjacent. [adjudication.md](adjudication.md) maps each finding to its fix, regression and remaining limitations.

## Native source and measured proofs

- Original `include/constants/sndseq.h:19,196` names cues 1011 `SEQ_GS_SHINKA` and 1188 `SEQ_ME_SHINKAOME`.
- `src/hatch_egg_app.c:626–688` starts hatch music, then cry and the first text together; fanfare begins after cry, while the printer may still run. The next question waits for the fanfare and printer. Root host integration is reviewed separately.
- `src/sound_playback.c:726–775` pauses the actual BGM player or radio for fanfare, waits for player 2 and the 15-frame timer, then resumes. `src/main.c:111–122` supplies the app cadence used for the half-second post-sequence wait.
- `src/launch_application.c:1253–1263` captures `FieldBGM_GetEffective`. `src/field_bgm.c:96–130` handles Surf, map day/night and saved/story overrides. A future field port must preserve the actual playing voice and phase; this feature does not invent a global field player.
- `lib/NitroSDK/src/snd/snd_interface.c:28–29` only queues pause. It does not establish the hardware held-note behavior raised as an initial unverified recollection.

The committed asset manifest pins the original SDAT SHA256, exact INFO/FAT sequence resources, native bank 700 `BANK_BASIC`, SWAR 700 `WAVE_ARC_BASIC`, original volume/priority/player and every relevant renderer source file. The renderer is [DualRip](https://github.com/TetraSsky/DualRip), MIT, commit `80f878b0ebf100f391028bcef69f7c5743473770`, with NumPy 2.2.6 and ndspy 4.2.0.

[native-event-payload-proof.json](native-event-payload-proof.json) records an independently decoded native INFO→FAT→SSEQ event slice and compares it with the renderer's actual event blob: both 5,324-byte and 1,352-byte payloads match exactly. The final exporter also enforces this comparison before rendering, including under Python `-O`.

[native-loop-proof.json](native-loop-proof.json) is the previously executed in-memory `Player.mark_loop` trace, preserved unchanged. All ten tracks 0–9 share the first interval `[530553,1030038]` and second interval `[1030038,1529353]`. The emitted WebAudio loop uses the second interval, as independently confirmed by the follow-up's renderer inspection. The raw PCM hash is `ddc9be5da9778aa58dd394a3e5e2f1135a3dc01d815aaebe24a65d403a9ab0b8`. This proves the shared measured period and selected interval; it is not a listening test. The exact historical instrumentation script, including its local paths, is retained in `artifacts/hg-native-loop-proof.py`; a portable equivalent is below.

Four completed local exports (initial, duplicate normal, optimized `f69`, final optimized `715`) produced byte-identical WAVs and manifest. All surviving outputs were compared again when assembling this bundle. Their original stdout logs, exporter revision/hash, commands, output byte counts and checksums are recorded. No render was rerun for this metadata commit.

| Output | Bytes | SHA256 |
| --- | ---: | --- |
| `1011-SEQ_GS_SHINKA.wav` | 6,181,024 | `a2ca7fc26226a26c46b234b508c1782fc5d6b5f2149d7bd96be72584a5af493e` |
| `1188-SEQ_ME_SHINKAOME.wav` | 544,252 | `b369b375025613d99821685203ee43a1d6b12fa7d3d3c554200d42746b7c83ea` |
| `manifest.json` | 6,032 | `b97e219ab6260048eb0ffa50855295ad85211f6479be529bcec77a4f1f5d4d4e` |

The original affected-test run passed **59/59**, and `npx tsc --noEmit` exited 0. Their existing logs are preserved. Those tests include source/asset verification and mocked WebAudio ownership/phase/abort cases. The Opus reviewers did not execute them. This metadata-only change does not rerun the suite or imply a full-suite result.

## Reproduce without application builds or a browser

From the repository root, verify bundle checksums, pinned reviewed source/asset files and original FAT event bytes:

```sh
python3 browser/reviews/2026-10-17-native-hatch-music/reproduce-evidence.py --repo .
```

For parser-byte comparison or a new native sequence render, obtain the pinned external source and packages. These setup paths are examples; they need not match the historical `/tmp/hg-*` paths in receipts.

```sh
git clone https://github.com/TetraSsky/DualRip /tmp/native-hatch-review-renderer
git -C /tmp/native-hatch-review-renderer checkout --detach 80f878b0ebf100f391028bcef69f7c5743473770
python3 -m venv /tmp/native-hatch-review-venv
/tmp/native-hatch-review-venv/bin/pip install numpy==2.2.6 ndspy==4.2.0
/tmp/native-hatch-review-venv/bin/python browser/reviews/2026-10-17-native-hatch-music/reproduce-evidence.py --repo . --renderer /tmp/native-hatch-review-renderer
```

Add `--render-loop` to explicitly rerun the measured ten-track trace and compare both records and raw PCM. This instruments the loaded class in memory and restores it afterward; it does not edit the external source. The default verification does not render audio.

To reproduce normal and optimized exports independently:

```sh
/tmp/native-hatch-review-venv/bin/python browser/scripts/export_hatch_music.py --renderer /tmp/native-hatch-review-renderer --output /tmp/native-hatch-review-normal
/tmp/native-hatch-review-venv/bin/python -O browser/scripts/export_hatch_music.py --renderer /tmp/native-hatch-review-renderer --output /tmp/native-hatch-review-optimized
python3 browser/reviews/2026-10-17-native-hatch-music/reproduce-evidence.py --repo . --compare-export /tmp/native-hatch-review-normal --compare-export /tmp/native-hatch-review-optimized
```

Both exports must match the committed outputs byte-for-byte. The exporter also refuses an unpinned/modified renderer and mismatched package versions; the prior scoped test log includes the actual optimized-Python wrong-HEAD refusal test. No cross-platform determinism result is claimed.

## Limits

These are emulated original SSEQ/sample-bank renders, **not bit-exact DS hardware/DAC/shared-channel DSP captures**. There is no MIDI conversion, substitute instrument bank, normalization, fade or composed replacement. Only these two cues are exported. General field/radio/Surf music is not implemented; the current actual field snapshot is explicitly no track, and injected override tests exercise a future port contract.

No browser was opened, no audio was heard, and no application build or deployment was performed for this task. Safari/autoplay/user-gesture behavior, physical hardware held-note pause behavior, cross-CPU output and a complete game playthrough remain unverified. Enabled audio failures reject explicitly; muted success requires the user's explicit sound option. Root integration, release checks and live verification are separate work.
