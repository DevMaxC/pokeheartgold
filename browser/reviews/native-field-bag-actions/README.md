# Native field Bag actions

Scoped implementation: `field-bag-actions.ts`, its actual-UI test, and only the Bag method plus optional `useItem` port in `interface-panels.ts`. Settings, focus policy, audio, main, World, VM, battle, types and source data are unchanged.

Dependencies are separate reviewed original commits: teaching/Cut core `85990b42` (this branch cherry `71e03791`), medicine core `b0dd6301` (cherry `ff311741`). This feature adds presentation around their plan/commit/apply APIs; it does not implement another set of item rules.

## Host integration contract

1. Preload `NativeFieldMoveData` before opening the Bag. A `useItem` callback must open its owned target prompt immediately, without an asynchronous asset-loading gap.
2. Implement the optional `Ports.useItem(item, context)` callback. `context.state` is the captured shared State identity; `context.signal` lasts for the Bag flow. Without this callback the Bag remains read-only.
3. Wrap the **entire** `useFieldBagItem(ui, data, native, {state: currentStateGetter, expectedState: context.state, signal}, item)` promise in the host's OUTER `SourceActionRecovery` action. Combine the Bag signal with genuine field/source lifecycle cancellation. Use the current shared State getter, not a cloned snapshot or a permanently captured getter.
4. Await the final acknowledgement before the outer action commits. Save only through the host's post-commit path. The leaf never saves, changes flags, removes a Cut tree, or independently commits a source action.
5. On replacement, cancellation by lifecycle, stale State/party/bag/map, or final acknowledgement failure, let the rejection reach recovery. Do not catch it as a successful use. Recovery must restore both the provisional party and inventory, and any host actors.

Results are distinct: `cancelled`, supported `no-effect`, implementation `unsupported` with diagnostic-only requirements, or acknowledged `used` (medicine/teaching). The unsupported UI does not claim native ineligibility or expose internal implementation fields. Escape/Back during the final success acknowledgement acknowledges the already provisional effect; an external replacement or lifecycle abort rejects and rolls back.

The UI hides Egg and Bad Egg species, nickname, level, HP and moves. Target and move cancellation do not mutate. HMs remain reusable and protected from replacement; successful TMs consume one and initialize new PP from original base PP. Medicine publishes both whole party and bag records synchronously after validation. All awaited prompts recheck State/record identities and all State content except the advancing adventure clock.

## Validation scope

Ten new tests execute the actual UI and InterfacePanels with original data and reviewed teaching/medicine functions. They cover ordinary Potion use and post-acknowledgement host save, read-only fallback, cancellation and stale callbacks, late medicine/teaching rollback through the exact reviewed SourceActionRecovery implementation, distinct unsupported/no-effect outcomes, Egg privacy, HM replacement protection, native teaching affinity/base PP, fainted HM use, PP selection and boosted capacity, and stale-state/abort guards. Original Bag fails the same Use-flow regression at its missing Use button; the patched Bag passes. Existing UI/teaching checks also pass (34 tests total).

The isolated UI base lacks Native Mon fields `checksumFailed`, `form` and `provenance`; the two original dependency modules therefore produce 13 baseline type diagnostics before this patch. Production types were not changed in this scope. Full TypeScript checking passes in a separate immutable qualification copy with the **exact Native `1a0054b4` types.ts** overlaid, then restored. Native/UI reconciliation must retain those source-backed Mon fields. The medicine dependency's older test additionally imports Native-only Egg/recovery modules absent from this UI base; its prior reviewed validation remains separate.

The new test uses the exact hash-pinned reviewed recovery git blob `4ca4545b` in a temporary TS module rather than duplicating recovery logic or adding a UI runtime dependency. Native integration may use its actual local recovery module when reconciling branches.

No browser, rendering, production build, live host admission, save integration or deployment verification is claimed here. Root owns the host reconciliation and release.

## Review corrections

Actual Opus5.5 v1 found one native outcome mismatch: the PP picker disabled full-PP moves, although native source permits selecting them and reports no effect. The final picker enables every nonempty move, labels full PP, and uses the original plan function for the no-effect result. `pp-full-before.log` fails the corrected regression against v1; `after-final.log` passes it.

Independent review also reproduced a resolved-prompt ownership race: a replacement inserted synchronously after selection could be stolen before the old action continuation resumed. Final Bag and leaf await boundaries retain the actual DOM action surface and reject if it was replaced. The regression covers Bag dispatch, target selection and the final provisional acknowledgement; `owner-gap-before.log` fails before the fix. No UI class/focus/scheduler change was needed.

V2's surface check still allowed a replacement after its internal Promise check but before the caller opened confirmation. A private probe reproduced this at target delay2. Final v3 retains the owner receipt in the persistent guard and validates before calling the next UI factory, before both synchronous commits, and immediately before outcomes. The same tenth test now covers target replacement delays0–5; `owner-gap-v2-before.log` fails v2 at delay2 and `after-final.log` passes the final source. No guarantee is made over unrelated host work after the leaf has handed back its acknowledged outcome: the host must retain its own lifecycle/source ownership through the outer commit and Bag redraw.

V3's full runtime review approved with zero findings. Its factory closures exposed three TypeScript narrowing diagnostics because mutable union variables were referenced in closures. V4 captures the already validated confirmation string and PP move array into immutable locals before each synchronous factory call; no await or mutation was added. The exact delta is `type-narrowing-delta.patch.txt`. Final Native-types-overlay TypeScript checking and all34 tests pass. The v3 compiler log is retained as historical failed evidence rather than attributed to the UI baseline type mismatch.

Final actual review results: v1 identified the PP no-effect mismatch and is retained unchanged; v2 approved its fix while recording the later-confirmed ownership limit; v3 approved the corrected persistent-owner runtime with zero findings; v4 approved the final immutable-local type-narrowing delta with zero findings. All four actual raw Opus5.5 results, exact prompts and immutable input manifests are retained. Final source matches v4 input hashes. Runtime commit: `35e61a5c601292199cd107f6c9a1e17b846a8c68`. Host integration and production release remain root-owned and pending.
