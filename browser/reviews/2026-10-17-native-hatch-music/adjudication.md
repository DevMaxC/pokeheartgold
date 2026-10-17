# Finding adjudication

The raw review results are authoritative about what each reviewer could read. The first snapshot did not have external-renderer access. The follow-up did, but could not open the initial raw result; its prompt supplied the original finding summary. Static reviewer conclusions and separately executed measurements are distinguished below.

| Finding | Resolution | Evidence |
| --- | --- | --- |
| Initial medium: creation-time field position becomes stale during asset loads | Closed in `f69bb43`: keep captured voice identity, prepare assets, then use the authoritative phase returned by `field.suspend`. Validate identity/cue/source/position. | Real phase-advance regression (13.25→14.75) and follow-up review's “Field phase: closed.” No global field player is claimed. |
| Initial low: pause then fetch/decode fanfare creates a silent gap | Closed in `f69bb43`: prepare/checksum/decode both cues before interrupting field music. Fanfare uses cached decoded data and resumes hatch BGM only after successful completion. | WebAudio cache/request regression, abort regression, follow-up's “Fanfare preparation: closed.” |
| Initial low: Python `assert` guards disappear under `-O` | Closed in `f69bb43`: explicit `check`/`SystemExit` guards precede native rendering. | Actual optimized-Python wrong-HEAD refusal regression; normal/optimized matching export receipts; follow-up's “Exporter: closed.” |
| Follow-up low: changed actual paused voice would restore stale creation-time voice | Closed in `71598bf`: retain a valid actually paused descriptor before comparing against expected identity and throwing. Cleanup restores the actual voice. | Surf→radio replacement regression rejects start, plays zero hatch audio and restores the new descriptor. Final actual Opus review confirms closure. |
| Follow-up informational: ndspy-resaved event blob not compared with original hashed FAT payload | Resolved in `71598bf`: direct original SSEQ DATA-event bytes compared to renderer `arc.blob` before render. | Independent byte/offset/hash proof for both cues; final static review verifies original FAT slicing and equality guard. |

## Initial unverified renderer questions

The follow-up read the exact pinned renderer and confirmed that `loop_marks` selects the second owning-track interval, bank/SWAR loading uses native resources without heuristic remapping, `estimate_end_sample` uses the same clock/recording logic, C7 NoteWait is implemented, and the executed whitelist includes no RNG commands. The separately executed ten-track trace establishes that all musical tracks share the owning track's two measured intervals. The release tail remains outside the selected WebAudio loop.

No physical hardware behavior is inferred from recollection. The native SDK source only queues `SND_CMD_PAUSE_SEQ`. The committed waveform/player therefore carries an explicit emulator/hardware-fidelity limitation, rather than claiming a DS hardware capture. Same-environment repeated exports support reproducibility there; they do not establish identical output on every CPU/platform.

## Final status and boundaries

The final review's actual `modelUsage` includes `claude-opus-5-5`; it found no new bugs or remaining findings in the reviewed three-file changes. All 59 previously executed affected tests passed, with TSC exit 0. Reviewers did not execute tests, renders, builds or browsers themselves.

The first result's external-renderer denial remains recorded as a limitation of that snapshot. It is not retroactively described as renderer approval. The later successful renderer read is a separate review result. The final narrow review does not substitute for root host integration review.

Actual audible browser behavior, Safari gesture unlocking, root host deployment, general BGM/radio/Surf playback, full music coverage and full-game parity remain outside this completed audio-module review. No fake cue, inferred map-default voice or silently successful enabled-audio fallback is accepted.
