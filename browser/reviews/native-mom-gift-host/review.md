## Bottom line: no confirmed defects

I found no defect I could confirm with a source citation and a path that actually triggers it. I did not run anything and did not check the snapshot hash. The pass results below come from the logs you provided.

## Files read
- **Proof files:** `proof/scoped.patch`, `proof/integration-contract.md`, `proof/target11.log`
- **Changed files (current snapshot):** `mom-gift-host.test.ts` (whole file), `phone-field-host.ts` (whole file), `phone.ts` (whole file), and the changed and nearby lines of `script.ts` (lines 78, 97–98, 116, 270–281, 331–357)
- **Supporting browser files:** `mom-savings.ts:1-45`, `bag.ts`, `main.ts:100-129` and `main.ts:236-265`, plus the definitions for scripts 23 and 27 in `phone.json` and messages 27–29 in `209.json`
- **Native source:**
  - `phone_scripts_mother.c`
  - `phone_call.c:80-229`
  - `overlay_2_gear_phone.c:1-304`
  - `gear_phone_ring_manager.c:37-61` (via grep)
  - `save_pokegear.c:280-359`
  - `scrcmd_pokemon_misc.c:1230-1254`
  - `scrcmd_12.c`
  - `pmtel_book.json` (Mother entry)
  - `scr_seq_0144.s`
  - `scr_seq_0003.s` (entry table and entry 33)

## What checks out against the native source
- **Local priority (script 23):** Native compares `phoneBookEntry->mapId` with `ctx->playerMapSec`. Despite its name, `playerMapSec` holds the map header ID: `gear_phone_ring_manager.c:39` sets it from `PosPtr->mapId`, and `phone_call.c:125,216` uses it as a header. Mother's `mapId` is `MAP_NEW_BARK_PLAYER_HOUSE_1F`, so `phone.ts:13` comparing against header 63 is correct.
  - Script 23 uses messages 664:1 and 664:2 (by gender). Script 27 uses 664:29 for both genders. Both are type NONE, so the call cannot write flags or touch savings.
  - Incoming calls go through the generic script path (`scriptType` 0), not `GearPhoneCall_Mother`, so there is correctly no savings prompt.
- **Trigger 12:** It is the 13th entry in `sPhoneCallTriggers`, giving Mother / script 27 / `forcePickUp` false. The picker skips it on map 63 and falls back to the random-call path. Test line 105 matches that order: the MT chance draw happens first, then the reject, with no LC draw.
- **Answering only the exact Mother call:** `answerSupported` (`phone-field-host.ts:128-139`) pins the call before entering the executor. It rechecks the call and the pending bit inside the action, clears only through `launchIncomingCall`, and holds the answer lock in `finally`, around the executor's whole recovery. Unsupported or tampered calls throw before the executor runs, so nothing is consumed. Elm behaviour is unchanged; no remaining test matches on the changed error strings.
- **Delivery script order:** Native order is Check → Peek → HasSpace → CallStd 2033 → Pop → Unset trigger 12 → message 20; when the bag is full it branches to `_0222` without Pop or Unset.
  - The receipt (`script.ts:332-346`) is set only by a Peek inside std 10202. It is marked given only by a matching, successful `GiveItem` inside std 2033. Pop requires that mark and an unchanged queue head.
  - The receipt object is shared by reference through `runChild`, copied back afterwards, and reset on every root `run` (line 116).
  - Pop shifts the queue once and keeps the bank balance and gift mask.
  - `main.ts` `runScript` wraps reset, run and checks in a single `executeSourceAction`, so both refreshes and every message belong to the outer transaction.
- **No shortcuts in the tests I traced:**
  - **Capacity fixture:** `hasBagSpace` reads the bag value at line 7 twice, then `Object.entries` at line 8 reads it a third time (the getter returns 999, so that slot counts as used). HasSpace still passes. `addBagItem` then reads 999 and returns false, which triggers the real "grant failed" throw.
  - **Failure-phase loop:** it covers every message plus both refreshes; the refresh index only goes positive after the message phases.
  - **C oracle:** it compiles the literal native function bodies extracted from the source files.

## Test gaps (not defects)
1. Only Super Potion and 5× Occa Berry go through real delivery. The other normal gifts and berries rely on `itemKey`/`data.items` lookup. A gift missing from `data.items` would fail safely: HasSpace returns false and the "too many" branch runs, with no Pop. That would be wrong text, not lost state.
2. `GetCurrentTimeOfDay` reads the wall clock (`script.ts:290`), so each run exercises only one of messages 209:27/28/29. The assertion holds for all three.
3. The capacity fixture depends on the number of getter reads in `hasBagSpace`. If `bag.ts` changes, it could pass or fail for the wrong reason.
4. There is no test showing that a receipt left over from a full-bag Peek can't affect a later std 2033 grant in the same root action. Today that is unreachable: every 10202 path ends the action.
5. The C oracle only uses compact queues. That is sufficient, because native `Put` always fills the first empty slot.

## Explicit limits (accepted as stated, not findings)
- Every Mart's `OnTransition` std 10200/10203 still hits the unsupported `MysteryGift`. The tests set `FLAG_HIDE_MOM_GIFT_DELIVERYMAN=false` explicitly as a precondition and do not claim the deliveryman appears in live play.
- `main` still binds only Elm (`main.ts:113-121`). Mother's indicator, admission, economy, RNG and result copy belong to the root's later work.
- Also out of scope: bank UI, ordinary Mother custom calls, random or forced dialogue, item fanfare audio, and any wider release approval.

## Uncertainty
I did not read `phone-scheduler.ts` (`launchIncomingCall`/`boostPhoneTimer`), the internals of `script-recovery.ts`, `objects.ts`, the full `items` data, or the 16 map JSON placements. My conclusions about those rely on the tests and the passing log.
