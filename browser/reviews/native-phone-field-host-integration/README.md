# Phone field host review and corrections

The completed whole-host Opus 5.5 review found two state defects at `c39003b1dff9ad589b5f13912357e9f906facb6a`: an active ring was cancelled by a map connection/load script, and returning from a repeat admission failure could reopen its prompt every idle poll. The historical review is preserved unchanged. The initial independent read's zero findings was preliminary and is superseded by those confirmed findings and actual-main regression proofs.

Runtime commit **`b3463c8bd1a5b2e288db1e7deed067e1bd40e7aa`** corrects both. The completed same-session Opus follow-up confirms both findings are resolved and identifies no new nearby state or rollback defect. It does not approve later root/UI changes or claim complete native phone parity.

## Source and evidence

[adjudication.json](adjudication.json) maps every raw historical path to a portable artifact and SHA256. All raw files are byte-for-byte copies; their temporary paths are retained as history.

The full [c390 snapshot manifest](c390-snapshot-manifest.raw.json) inventories 6,841 copied and hashed browser/native/data inputs. That is an integrity count, not a claim that every file was individually reviewed. The [commit attestation](c390-commit-attestation.raw.json) reports zero missing or mismatched committed inputs. This metadata archive does not duplicate the source/data files; reconstruct their content from the recorded Git commit and per-file hashes. Native GLBs and large art/audio were not copied.

The immutable [536758a→c390 diff](536758a-to-c39003b1.raw.diff) was supplied to the original review upfront. The [fix snapshot manifest](b346-fix-snapshot-manifest.raw.json) pins the four changed files at the fixed commit, the [7adbccc→b346 diff](7adbccc-to-b3463c8b.raw.diff), and seven relevant native C inputs unchanged from the original snapshot. The adjudication additionally verifies ten unchanged phone/component/UI/recovery/data files, so the narrow follow-up's original context remains exact. Raw diffs and the expected-failure TAP log retain their original context whitespace and are checked by SHA256, not normalized.

## Corrections

- Connections preserve the active ring, pending token and clock. `enterMap` resets only non-connections. Load-entry scripts explicitly suppress the scene-event reset; NPC/frame/trainer scenes keep the default reset, and warp/battle callers keep their own resets. Native `FieldMap_ChangeZone` and `StartMapLoadScript` bypass the `FieldInput_Process` reset path.
- A ring retained onto a map without reception is consumed/reset on launch before dialogue is declined, matching native state ordering. Native's no-signal hang-up presentation is still absent; this patch intentionally changes no UI/input/audio code.
- A dedicated admission gate pauses the exact failed map/pending/history/contact input after Return. Explicit Retry keeps the same RNG tapes and pinned clock inside the original action. Changed map or saved phone inputs allow another admission. The gate participates in field checkpoint recovery; it does not reset the timer or delete pending bits to conceal an error.

## Validation and limits

The implementation agent ran 82 affected actual-main/phone/party/lift tests successfully and TypeScript with exit0. The same two new regressions against the literal old c390-identical main both fail as expected: connection state becomes inactive/elapsed0, and four identical idle polls produce four failures instead of one. These are real extracted main bindings, not replacement implementations.

The older owner-run 77-test and 55-test logs are distinct overlapping runs and must not be summed. Their main diagnostics match the original snapshot. Neither Opus review ran tests, builds or browsers. No full test suite, real DOM, GPU, audio, rendered or deployment verification is claimed here.

Remaining coverage opportunities include the real `warp()` binding with an active ring; a connection followed by a destination frame script; and answering/timing out a ring after the connection. Native no-signal presentation remains a known Low presentation gap. Generic random-call dialogue, forced delivery, Safari calls, global DS RNG equivalence, persisted native SysInfo RTC, DST-clock behavior and RTC penalties are outside this implemented scope.
