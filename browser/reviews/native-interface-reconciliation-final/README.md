# Native Main reconciliation: exact review evidence

The actual Claude Opus 5.5 whole-Main review passed its seven requested contracts at `2e98afb82f89529758cd78481a7eed91c5a3a9e6`, with one concrete Low keyboard finding. The correction in `dd64b5c2771f25f4ee33968a0b7ec45edc32d740` passed a separate actual 25-turn Opus follow-up. Both raw results, prompts, command/model usage receipts, source manifests and post-review integrity results are preserved here. The original result and adjudication have not been rewritten to imply they reviewed the fix.

| Packet | Exact scope | Evidence |
| --- | --- | --- |
| [Whole Main](whole-main-2e98afb8/raw-result.json) | 88 turns; combined native opening, recovery/Retry, party, Mom economy/phone, Bag, shared hatch audio and modern input/music host. Main SHA-256 `fafdfaad1d0f34fadde25f709084e321b7a20c0500537bdebb60d332e48c0b14`. | 9,086 immutable copied source/reference files; unchanged before/after. |
| [Battle keyboard follow-up](battle-key-dd64b5c2/raw-result.json) | 25 turns; move the field admission gate before Enter/Space default prevention, preserving field HUD and owned modal behavior. Main SHA-256 `09fb84f4888ebb8cdd43020a02670b5deec8e6f8a9833de317d504b93274c0ae`. | 9,085 immutable source/reference files; unchanged before/after. Actual old-Main failure and fixed 75/75 test logs included. |
| [Natural opening smoke](natural-opening-5201/receipt.json) | Separate QA origin `localhost:5201`, tab_p. Real native New/Oak/gender/name → first room → Mom → Elm → Cyndaquil → assistant's five Potions. | 14 actual screenshots, exact committed QA save/storage backup and pruned idle status. |

The whole review's concrete Low was that the global field key handler prevented Enter/Space before checking field ownership, blocking native browser activation of real Battle Fight/move/Back buttons. The follow-up used the exact release Main/test plus the original whole-review dependency snapshot. It also received the complete newer release Battle as context. Its `menu`, `moveMenu`, `bagMenu` and `partyMenu` AST bytes match the original review context; unrelated newer Battle-core behavior is not approved by that comparison.

The follow-up's regression binds actual Main handlers, actual UI capture and actual Battle/createMon data. The old Main fails at the first Fight Enter assertion. The corrected source passes Fight/move/Back with Enter and Space, keeps stale field HUD Enter suppressed, and preserves owned UI handling. TypeScript and diff checks exited successfully as operator checks; the empty typecheck log was explicitly not independently verified by Opus.

Original qualifications remain explicit: Mom raw16 replay storage covers one `startBattle` invocation, not a newly rerun whole-scene battle; a hypothetical changed-map failed-fight cue issue was labelled currently unreachable; platform AudioContext interruptions are not audible/device approval. The whole reviewer reported not locating the controlled Bag test logs. Those files and their hashes are preserved as operator evidence; this packet does not retroactively claim the reviewer validated them.

Each `complete-source.tar.gz` contains **every** file listed by that packet's original `source-manifest.json`, at the original packet-relative path, including native C, headers, assembly, data, scripts/messages, browser source and referenced baselines. Archives use deterministic metadata and were read back in full to check every file hash. [archive-receipts.json](archive-receipts.json) records archive hashes. To independently verify without extracting:

Copied raw logs and source patches preserve their original whitespace and hashes. The directory's `.gitattributes` disables whitespace diagnostics only for those evidence formats; runtime source rules are unaffected.

```sh
python3 browser/reviews/native-interface-reconciliation-final/verify.py
```

To inspect copied files, extract an archive into an empty directory, then open its `candidate/` tree and references. The recorded `/tmp` command paths describe the original execution, not a requirement to recreate that directory. `tooling/` preserves the actual review runners for provenance; it is not needed for verification. The failed initial keyboard preflight is retained separately; it never launched a Claude review.

The natural browser checkpoint is Gold/Boy in Elm's lab at `(4.5, 11.5)`, level-5 Cyndaquil, five Potions, lab scene 2. All field/VM/UI/transition locks were idle, with no gameplay error or unsupported command. The earlier optional cue 1018 timed out after 4,000 ms without blocking gameplay; lab cue 1066 later reported playing with no error. The first intro attempt was interrupted by a parent-confirmed Vite watcher reload, then restarted naturally. Strict-selector automation failures are recorded separately from game behavior. The browser still ran the old `fafdfaad` Main, so it does not approve the later keyboard fix.

These are scoped source reviews and one positive opening milestone. They do not approve newer World, engine, weighting, building/art, full campaign parity, mobile/device/audio behavior, deployment or remote merge. Those require their own evidence. No runtime files were changed by this evidence commit.
