Native Egg field-step integration review
=======================================

Read-only root scope: committed713de862443ee6e494523fd9946c707d93e4ad08 main.ts, actual src/field/field_control.c and src/player_avatar_movement.c. The UI changes live separately on fix/native-hatch-ui-cancellation; no main/VM edits by this reviewer.

Native order and eligibility
----------------------------

* field_control.c:174–179: a completed movement sets movement only for PLAYER_MOVE_STATE_END AND AVATAR_MOVE_STATE_MOVING. A turn is separately AVATAR_MOVE_STATE_TURNING. Bumps are excluded by player_avatar_movement.c:295–302.
* field_control.c:193–219: frame scripts, then trainer sight, then completed-step processing. A consumed frame/trainer event skips this step's daycare counter.
* ProcessStep at632–686: Blackthorn platform/spin-slide special actions, soundplate, coordinate event, transition, forced-movement guard, bottom-screen/apricorn updates, poison, Safari, daycare/hatch, repel, BikeShop and friendship/follower mood.
* field_control.c:240–242: wild check follows step processing; hatching returns TRUE at754–757 and consumes this pass before wild.
* The forced guard at655 returns FALSE from ProcessStep: it skips daycare and all later step counters but does not itself mean a consumed event at FieldInput_Process level. Do not conflate 'skip Egg counter' with 'start scene / suppress every later native check'.
* Native forced state is AVATAR_FLAG_FORCED_MOVEMENT (player_avatar.c:632–645), not the walkable bit or any nonzero metatile. Ice sets it at player_avatar_movement.c:427. asm/player_avatar_movement_data.s:22–29 lists Ice as the ordinary forced-table behavior; the special CyclingRoad predicate is bike-state-locked + bridge at movement.c:1280–1293. Browser currently does not reproduce this full avatar state machine, so an ice/forced-support exclusion must be described as such, not as full source parity. Do not classify ledges as forced movement.
* Ledge jump counts ONCE at completion: FootStepKind1 maps to AVATAR_MOVE_STATE_MOVING (movement.c:584–593), ledge collision selects movement0x38 (628–632), and UpdateMovement yields END (295–334). A ledge does not call the separate PlayerAvatar_CountStep stats/Pokewalker helper in FootStep; that absence does NOT exclude FieldSystem_ProcessStep/HandleDaycareStep. One hop covering two tiles is one event, not a distance-based count.

Root transaction placement
--------------------------

1. Keep admission/bump checks outside a candidate ordinary move: blocked input, camera move, lift ride, script ApplyMovement and push/ladder warp do not enter the Egg-step path. Freeze target/direction/date inputs once for replay. Ledge and normal accepted move share the one completed-movement path.
2. Enter the OUTER executeSourceAction before tweenPlayer mutates State.x/z. Current checkEvents opens its outer checkpoint after tween, so it cannot coherently replay a whole failed step. Do not merely add advancePartyEggStep to the existing post-tween function and count again from another caller.
3. Within that action: await movement, then perform source priorities. Owner/map sync is needed before reading current map frame/trainer/coord data. Any consumed frame/trainer/coordinate/warp returns a consumed result without advancing Eggs. Nested runScript/warp/entry calls must stay inside the same source checkpoint and propagate failure to its outer owner.
4. At the source daycare position only, call advancePartyEggStep once with an explicit local month/day/penalty snapshot. Counter is saved shared u8, default0 for old saves; do not reset at gift receipt or map change. Generic poison/Safari/repel/daycare breeding/RTC-penalty systems are NOT implemented in current main. Document them as gaps; do not introduce inert callbacks and claim their semantics are implemented.
5. If hatchReady: recordEggHatchEvent once, await runScript(data.constants.std_hatch_egg), mark this pass consumed. The standard itself prints native Oh? before EggHatchAnim. Its awaited host independently rescans party order; direct/debug EggHatchAnim must not award the step event stats. Never resume the same movement pipeline after hatch: no second Egg increment, repel or wild on this consumed pass.
6. Keep full hatch reveal/cry/text/fanfare/decision/memo/name/field-resume under the source action. SourceActionRecovery.busy protects save/pagehide/input/trainer/battle. Only after coherent resume and standard completion may the outer action commit.
7. Keep standalone wild encounter/battle outside the completed-step action after successful commit. Otherwise runFieldBattleAction sees nested=true and later unrelated field-resume failure can roll back a completed catch or victory. Preserve existing same-opponent Retry behavior.
8. Retry restores the pre-step State/field, then replays the captured movement and Egg update once. Return restores pre-step coordinates/counter/Egg/stat/RNG/memo/phone/NPC/camera, and must not silently count the abandoned attempt. Source gates retain the existing Return union and exact Retry snapshots. The encounters helper is ephemeral and restoreField currently resets it; do not assert that its prior inhibit-step sequence is preserved without adding capture/restore if required.
9. With this new pre-movement checkpoint, apply the restored-location Return union to TrainerAttemptLatch too: its location includes map AND tile. An earlier failed trainer at tileA is suppressed by the first field poll, so walking is admitted; nested post-step tryTrainerEncounter.observe(tileB) clears tileA attempts even if B has no trainer; a subsequent hatch/entry failure restores State to A. Leaving the latch at B re-admits the old broken trainer on the next A poll. Preserve pre-action/current attempts that belong to the restored `${state.map}:${Math.floor(state.x)},${Math.floor(state.z)}`; drop rolled-back destination attempts. Keep explicit Retry's exact pre-action restore. Add an actual-binding regression for this source-backed sequence.

UI/task ownership requirements
-----------------------------

* Hatch helper uses Promise.allSettled on cry and announce before rollback. A cry failure while ui.message is awaiting a key can deadlock without a shared AbortController. Every owned cry/reveal/announce/name/resume port must abort siblings immediately on failure, rethrow, then drain pending tasks before root State hydration.
* Actual hatch_egg_app.c:647–685 starts cry and the first text printer together, waits cry, then fanfare, THEN waits printer before the nickname question. There is no confirm click for the first hatch text. Start ui.printMessage(scene.messages.hatched,delay,signal) immediately and observe its rejection immediately; await cry→fanfare→printer completion; dispose retained first text before the signal-owned nickname question. Never await a click-only ui.message or gate fanfare on printer completion. The returned printer disposer and shared AbortSignal both retain ownership of visible text after printing. UI cancellation must reject before completion, clear timers/listeners/next/button/form handlers, and release only its own still-current surface. A late old abort/disposer must not hide recovery UI.
* Core provisionally sets isEgg=false BEFORE reveal. The render loop currently checks firstFollowerMon every frame even during sourceActions.busy; this can create/show a provisional hatch follower. A hatch presentation ownership/suppression flag must freeze or hide that transient actor until the complete source action commits and refreshes follower eligibility. The input/battle lock alone does not freeze render-side follower construction.
* Native text decoding in UI.ts is already correct in source bytes. Keep it unchanged; add real messages187[1] and302[105] fixture assertions.

Meaningful integration regression matrix
----------------------------------------

Use real main step/checkEvents binding with injected world/tween/UI ports, real SourceActionRecovery/ScriptVM/Egg helpers and native maps/std2021. Avoid testing a standalone copied priority list only.

* Blocked/turn/script actor/camera/lift/push-warp:0 Egg increments. Successful normal move and ledge:1; ledge advances two coordinates but one shared counter.
* Competing frame, trainer, coord and warp events each consume before advance; assert event order and no hatch/wild even with a ready Egg at counter254.
* Counter254 + ready Togepi: one stat12 increment, score event15 once, real std2021 intro, awaited hook; repel/wild not called.
* No hatch: one persistent step commit, then wild attempt after source recovery is idle; successful catch followed by failing resume remains caught.
* Fail individually in reveal, cry while text waits, nickname choice, input, memo/resume or native standard command: all pending host tasks finish/reject before hydration; pre-step state/actors/position/Egg/counter/RNG/stats/phone are restored; no save while pending.
* Explicit Retry after each failure: replayed movement and one eventual hatch award/counter update, same scripted target/clock; Return: no increment/award and next ordinary step can try naturally.
* Suspend the text/cry/name promises and invoke actual save callback/pagehide; assert old slot unchanged. Abort and reopen recovery UI; stale key/button/submit callbacks cannot resolve or close it.
* Native Elm flag/pending trigger0 appear only after successful memo; failed replay never duplicates trigger/stat/Dex score. JSON Continue retains u8 counter and isEgg state.
* Camera yaw/pitch/distance and lifted actor height survive both successful return and failure rollback; new follower is visible only after the complete standard action commit.

Explicit outstanding parity: deposited-parent daycare/breeding and daycare Egg counter reset; RTC anti-clock penalty detection; generic forced/poison/Safari/repel step handlers; full call delivery; alternate-form hatch/Jirachi unlock; exported music playback policy. No browser playthrough or full-game parity claim follows from these source/unit checks.
