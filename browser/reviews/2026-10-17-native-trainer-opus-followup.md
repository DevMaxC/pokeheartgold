# Trainer integration review follow-up

Actual Opus5.5 completed the immutable snapshot review. Its result is preserved in `native-trainer-encounters-opus-result.json`, with verified `modelUsage.claude-opus-5-5`; a small Haiku routing request is recorded separately. The earlier pending manifest is historical evidence and is superseded by this result and `native-trainer-encounters-opus-adjudication.json`.

The review found no core single-trainer logic regression, but identified integration issues. The follow-up fixes prevent menu dispatch during a map load, synchronize connected-map ownership before field events, use native collision attributes rather than player Surf eligibility for sight, and report/latch a missing double partner without trapping the player in a repeated error. It also tracks moving NPCs' previous tile/floor and the following Pokémon's previous position, and aligns trainer constant lookup with the VM.

The map-border fix corrects a demonstrated browser context hazard. The provider explicitly identified its native seamless-overlay ordering claim as inference; no stronger native overlay parity claim is made here. Clear water and blocked water, previous-floor occupancy, missing-partner reporting/latch and map-local constant precedence now have focused regression fixtures.

TypeScript and the full203-test suite passed after these changes. All16 encounter fixtures passed. The recovery owner independently checked the changed main-loop boundaries and collision adapter without another concrete finding. No browser run or Vite build was performed.

When combining branches, preserve `sourceActions.busy`/recovery-prompt input guards, runScript's optional approach and admission-error arguments, the inner approach-task drain before rollback, and reset `followerPrevious` during recovery hydration. Double combat, hidden emergence, trainer phone scheduling, full incoming trainer callers, and natural merged-game traversal remain explicit gaps.
