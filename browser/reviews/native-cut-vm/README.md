# Native Cut VM review evidence

Runtime/test commit: `2787f390d1d614c466024564ac67c1fe067871de`, based on `5c39d05d32b56aa5aeb848d61f4c6e089299b1ce`. This archive preserves three actual read-only Claude Opus 5.5 CLI results, exact prompts, source manifests and owned-file snapshots. Initial review found three low issues. The followup closes them and verifies native dispatcher timing; the final task-boundary review approves the narrow TaskManager correction with no findings. Raw CLI model usage identifies `claude-opus-5-5`; the small Haiku usage is CLI metadata, not the review model.

The manifests pin every reviewed source/data file. Unchanged native files can be reconstructed from the base commit; each stage includes the exact two owned files and its patch/delta. Final manifest files match committed blobs. These are code reviews, not browser visual approval or proof of future host rendering/audio/clock behavior.

Validation: 14 Cut tests, 248 broader VM tests and TypeScript pass. The four followup regressions fail the initial reviewed snapshot. Separately recorded unrelated fixture failures also fail the unmodified base. `integration-contract.txt` and `native-scheduler-proof.json` describe required original-asset ports, abort/drain behavior and exact source phases.
