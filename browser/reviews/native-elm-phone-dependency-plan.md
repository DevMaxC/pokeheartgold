# Native Elm call after Togepi hatch

Core checkpoints: `7f869d992c21fd81fe3eb319cb22e9355a5dbc4e` and hardening `ca82bbd50bc57ada05e6457430f2bd6ec50e9468`, isolated from clean integration base `391e26b91d55b63a6969383ab98ac67e79d276f8`. These checkpoints implement pending-trigger scheduling and call selection, not incoming field UI delivery.

## Actual source flow

1. `FieldSystem_TryTriggerElmEggHatchedCall` (`gear_phone_ring_manager.c:313–319`) recognizes the original gift, sets pending trigger0 and `FLAG_SYS_HATCHED_TOGEPI_EGG`. Setting that trigger accelerates the ephemeral manager to at least9 of its10 minutes; it does not immediately run a call.
2. `field_time_events.c:51–99` supplies RTC-minute events. The first >=10-minute batch is ignored once by `GearPhoneRingManager_AddMinutes`. This prevents an initial large RTC catch-up from immediately enabling calls. Host calls should represent positive whole-minute events, not every render frame or player step.
3. `FieldInput_Process` (`field_control.c:319`) tries the phone near the end of idle/end-of-movement input processing, after higher-priority source events. `overlay_2_gear_phone.c:107–145` checks incoming-call map permission, no active call, and the10-minute threshold.
4. Its actual trigger table maps0 to Elm/contact1, incoming type3, `PHONE_SCRIPT_013`, `forcePickUp=FALSE`. Selection excludes the caller's exact map header61 (Elm's Lab), not New Bark Town60. Elm has no additional registered-number predicate here. The source DaycareMan exception does require registration and permits its own map.
5. This is an optional ring, not a forced dialogue or invented NPC. The default ring expires only after >30 seconds; expiry resets the ephemeral manager without clearing pending0. A later eligible interval can offer it again. Other source scenes can reset an active ring; ordinary successful walking is not itself a consumed scene.
6. `FieldSystem_InitPokegearArgs` (`gear_phone_ring_manager.c:70–85`) clears the selected type3 pending bit when the incoming app opens. `PhoneCall_GetScriptId_ProfElm` returns its predefined incoming script directly; it must bypass outgoing-local and outgoing-story selection.
7. Script13 is original gendered messages716[13/14], asking the player to bring the newly hatched Pokémon to Elm. It has no additional generic call side-effect flag. The original hatched-gift flag remains set after answering.
8. The existing native Elm doctor interaction in source map61 already handles the follow-up. `_055F` clears pending0 even if the player visits without answering. It checks the first alive party Pokémon for Togepi/Togetic/Togekiss, then follows native dialogue/item branches. A starter in front produces the native request to show the Pokémon; Togepi in front grants the Everstone and native once-only flags. It does not automatically reorder the party or grant an item on hatch/call success.

## Implemented core API

`phone-scheduler.ts` contains deterministic reducers with explicit time/RNG inputs:

* `newPhoneRingState()` initializes ephemeral elapsed-minute/first-minute/active-ring fields. It is not serialized into native-style saved State.
* `setPendingPhoneTrigger(state,id)` always sets the persistent bit; `unsetPendingPhoneTrigger` is the distinct clear operation.
* `boostPhoneTimer(ring,accelerate,rules)` applies the source second-argument acceleration. `advancePhoneMinutes(ring,delta)` consumes an explicit RTC-minute event.
* `planTriggeredIncomingCall(ring,pending,rules,{map,incomingAllowed,registeredContacts,drawUint16})` returns admission-blocked `none`, eligible-but-empty `no-trigger`, optional `ring`, or `forced` with a typed caller token. The `no-trigger` case explicitly marks where native random-caller fallback belongs, without pretending that fallback is implemented. It consumes exactly one supplied u16 draw when trigger candidates exist, in native bit order.
* `advancePhoneRingSeconds` handles explicit ring-clock ticks/expiry, while `resetPhoneRing` handles a source-owned event reset. Neither clears saved pending flags.
* `launchIncomingCall(state,ring)` consumes only the selected bit and resets the ring manager. The caller receives the exact `{contact,scripted:3,script,trigger,forcePickUp}` token.

`phone-triggers.json` exports all13 actual trigger rows, exact phonebook map IDs, native timing defaults and source hashes. The small exporter changes no other exported source data.

The VM's `SetPhoneCallTrigger` now always sets the flag, and optionally calls `ScriptHooks.phoneTrigger(id,accelerate)` to report interval acceleration. Old callers need not supply a hook. This hook and any hatch-created boost must run inside the root source transaction, whose field checkpoint must also capture/restore the ephemeral manager.

`phone.ts` now honors Elm incoming type3's exact script, uses exact lab61 for outgoing-local selection, and evicts a rejected definitions load so explicit Retry can refetch it. Scripted type2 map-call selection is preserved. No main, field, UI or State-schema changes are included.

## Root wiring still required

* Own one ring runtime for the current adventure. Continue starts a new manager with existing pending flags; do not treat a saved pending0 as a fresh acceleration event. The hatch core's existing array bit alone has no enqueue-time metadata: explicitly report its fresh source enqueue/acceleration through the runtime port inside the same checkpoint.
* Provide the existing map's `incomingCalls` flag and exact header ID, registered contact keys, positive whole RTC-minute events, absolute RTC-second ticks and an explicit RNG provider. No source-global DS RNG equivalence is claimed by this core.
* Preserve frame/trainer/coord/warp/battle/menu priority. Poll only at the native idle-input position and show an optional owned ring indicator/answer action for Elm. No immediate `phoneCall()` at the end of hatching.
* Answer within `executeSourceAction`: capture State+ring runtime before launch consumes0, pin the caller token for Retry, await native text/owned UI, then commit. Failure must restore pending bits/runtime and keep the successful earlier hatch intact. Protect the save/pagehide gate and cancel any ring audio/UI resources when their owner ends.
* Add a real party-order action to the existing party menu. The current browser party menu only opens summaries, so the player lacks the normal way to put a healthy Togepi ahead of a healthy starter for Elm's first-alive check. Reuse the native lab script instead of adding a special reward NPC.
* Other trigger selectors may use script0 as a caller-specific selector, and some force pickup through native std2047. Their presentation/caller-specific implementations remain explicit dependencies; do not blindly treat every token as Elm's simple script13.

## Scope limits

Native random-caller fallback, recent-caller rotation, Safari trigger generation, global RTC penalty detection, full Pokegear layout/ring audio and generic forced-call UI are not implemented. In particular, native `TryStartCall` attempts random fallback/reset policy when no pending trigger is eligible; `planTriggeredIncomingCall` deliberately does not claim that separate behavior.

The core has source/unit checks, not a browser playthrough. Natural hatch→ring→answer→party reorder→lab reward still requires the listed root host/UI integration and verification.
