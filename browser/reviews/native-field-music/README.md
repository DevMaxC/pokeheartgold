# Native map and battle music scope

Production-base source leaf: `93bf982b0d866a1150f22eae6ad6caf91da46bc5`. Player commits `2f8f84d2`, `ed90fd63`, `0f0eb21c`; actual player reviews/adjudication are committed alongside this note. The host owns main/UI preferences, gesture routing, map/battle hooks and production/browser verification.

The source catalog covers all 540 original map day/night headers, 13 ordered story overrides, original Surf priority/suppression, and the exact 32 trainer-class / 11 legendary-species / 45 battle parameter tables including native region/flypoint rules. That selects 103 distinct native IDs: 102 musical renders and the original note-free silence cue. Native INFO→FAT sequence, bank and SWAR identities are independently checked in the asset fixtures. This is a bounded background-music implementation, not full sound or campaign parity. Radio, additional script/bicycle overrides, victory/encounter fanfares and sound effects require their actual exported cues; absent cues reject explicitly.

Delivery is 168 unique files (AAC/M4A128k primary, MP3 fallback), 304,475,068 bytes total, fetched on demand. Thirty-six duplicate cue-file assignments reuse byte-identical payloads while retaining separate original native IDs/dependency receipts. The runtime catalog is 207,234 bytes; full native/codec evidence lives in `corpus-proof.json`, bound by `sourceProofSHA256`. Public output contains only `catalog.json` and its referenced compressed files. Original PCM, FLAC, gzip-WAV and encoder caches remain offline, not bundled.

The actual pinned renderer is DualRip `80f878b0ebf100f391028bcef69f7c5743473770` with numpy2.2.6 and ndspy4.2.0, native32768Hz stereoPCM. The literal-offset proof follows both call continuations and empty-stack Return fallthrough; shared native byte interpretations and redundant zero-varint groups are preserved. No reachable RNG, conditional or variable-read commands occur in this corpus. Four battle cues write supported fixed B0 progression counters. Every note/rest-bearing track loops, every nonlooping conductor is immediate/unvoiced, and all looping tracks have entered their second pass before the selected native second-pass window. The intro/first pass remains before it. These are sequence-window checks, not a claim of sample-periodic hardware oscillator/envelope/DSP output.

All FLACs decode to their exact original render PCM; gzip-WAV round-trips match exact RIFF bytes. A separate fresh New Bark render reproduces PCM, loop records, FLAC and gzip-WAV exactly. Its two separately encoded delivery files also reproduce byte for byte. AAC priming/edit-list and retained tail padding, MP3 skip/discard padding, full decoded frame counts and first-five-second alignment correlations are recorded per cue. Every measured alignment lag is zero. Lossy AAC/MP3 output is not lossless or DS hardware bit exact. Actual Safari/mobile decoding and loop listening are pending; no browser or Vite build was run by this leaf.

Initial compatible batch caches were created before per-track wrapper hashes were recorded. Their producer wrapper hashes remain null; they are explicitly adopted only under the identical recorded render/codec recipes and revalidated inputs/loop proofs, with codec validation-tool version kept separate from unknown producer version. This limitation is not hidden by the current validator/assembler hashes. Fresh exports record producer hashes; future recipe/tool/input/loop/trim changes cannot silently reuse incompatible caches.

Reproduction (run from repository root with the pinned Python dependencies/renderer and the recorded FFmpeg toolchain available):

```sh
python browser/scripts/export_field_music.py --renderer /path/to/pinned/DualRip --output /tmp/native-music-render --resume
python browser/scripts/encode_field_music.py --source /tmp/native-music-render --output /tmp/native-music-delivery --receipts /tmp/native-music-render/encoding-receipts
```

The offline staging catalog is deliberately named `catalog-final.json`. Promote it to public `catalog.json`, copy only its referenced format files, and copy `catalog-proof.json` to this review directory. The asset test enforces this separation and the proof hash, source hashes, original mappings, every deployed file checksum, current proof gates and frame/loop receipts. `--adopt-initial-cache` is an explicit migration switch for this known initial recipe only; normal fresh reproduction does not need it.

Checks: 41 focused Node fixtures (29 player/session, 6 battle-source, 6 source/asset/projection), production TypeScript, and 16 Python source-proof/cache negative fixtures. Test doubles do not establish browser audibility. Root integration and deployed listening/gesture checks remain separate.
