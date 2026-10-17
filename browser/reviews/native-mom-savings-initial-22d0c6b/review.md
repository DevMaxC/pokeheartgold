I found no confirmed bugs in `mom-savings.ts`. I did find two confirmed test-coverage gaps: native branches that the tests never actually reach, so a broken implementation would still pass. Everything below comes from reading files only. I compiled, ran and executed nothing, so the 9/9 and TSC results are taken from the provided logs.

## What I read
- **New files:** `mom-savings.ts` and `mom-savings.test.ts`, both in full.
- **Native source:** `mom_gift.c` in full; `battle_setup.c` (lines 188–255, 394–447); `save_pokegear.c` in full; `player_data.c` in full; `save_pokegear.h`; `sys_flags.c:158–168`; `gear_phone_ring_manager.c:40–170`; `phone_scripts_mother.c` in full; `MAX_MONEY` in `player_data.h`; the relevant item defines in `items.h`.
- **Existing TS the tests depend on:** `phone.ts`, `phone-field-host.ts`, `script-recovery.ts`, `native-rng.ts`, the `boostPhoneTimer` function, the `State` type, `data.ts:newState`, `main.ts:336–359`, and trigger 12 in `phone-triggers.json`.
- **Logs:** `target-tests.log` shows 9/9 passing. `tsc.log` is 0 bytes; that fits a clean compile, but the file doesn't record which command produced it.
- **Not available:** `math_util.c` isn't in the snapshot. I could only infer that `LCRandom` returns 16 bits from `native-rng.ts:4` (`next>>>16`), not from the native source itself.

## Module checks against native (all match)
- **Deposit amount:** `(int)(money2−money1)/4` rounds toward zero, the same as `Math.trunc((after−before)/4)` for inputs from 0 to 999999. It only applies when the amount is positive. The cap `bal+delta>=999999 → 999999−bal` equals `min(delta, MAX−bal)` (`battle_setup.c:399–411`, `mom-savings.ts:50–51`).
- **Inputs are capped wallets:** both wallets are validated to be at most 999999, so passing a raw prize or an uncapped sum throws.
- **Queue capacity:** the queue-full check runs before normal gifts (`mom_gift.c:84` vs `:53`). Within the loop, the order is skip-given → threshold break → set bit → enqueue → subtract with a floor of 0 → stop when full (`mom_gift.c:61–74`, `save_pokegear.c:289–294`).
- **Berries:** if any normal gift is bought, the routine returns before the berry branch (`:88`). The berry tier compares the post-deposit, pre-purchase balance with the pre-deposit balance, divided by 3000. One draw, `% 17`, buys one berry (quantity 5, cost 100), even if several tiers were crossed (`:92–104`).
- **Gift order and costs:** the table matches `mom_gift.c:45–55`, including both Super Potion entries.
- **Zero or negative gain:** gifts are still checked, using the unchanged balance.
- **Savings off:** no bank, queue or phone writes, matching native (`:398`). The module still sets `state.money=after`.
- **Phone event:** the event is returned on every purchase, even if trigger bit 12 is already set. Native `SetCallTrigger` also re-applies the boost each time (`gear_phone_ring_manager.c:136–142`).
- **Queue format:** the compact queue matches native, where entries are only ever added to the first empty slot and removed by shifting, so occupied slots stay contiguous.
- **Atomicity:** all validation, item lookups and the draw happen on a copy before the single write block at line 69. Returned and stored objects are separate copies.

## Confirmed test gaps (no module bug behind them)
1. **The queue-full early return is never tested.** In `mom-savings.test.ts:75`, the only full-queue setup uses mask 511 (all gifts given). Its deposits are +8 at most, which never cross a 3000 tier. As a result, deleting the guard at `mom-savings.ts:53` passes all 9 tests. The berry branch filling the last slot (4 existing gifts plus a berry) and a full queue blocking a berry are also never tested.
   - Witness: a save with mask 0, 5 queued gifts and a balance of at least 900 should produce no purchase per `mom_gift.c:84`. No test covers it.
2. **Skipping an already-given gift is never tested.** Every settlement uses mask 0 or mask 511. Changing `continue` to `break` at `mom-savings.ts:55` therefore passes every test.
   - Witness: mask 1 (first Super Potion bought) with a balance of 4000. Native skips index 0 and buys the Repel; the mutated version buys nothing.
3. **Overclaim:** the 360-case sweep contains no berry purchases (checked by hand for all five wallet cases × nine balances). The varying `draw` values there have no effect. All berry/RNG coverage comes from the 19 cases in test 2, all starting from an empty queue. The sweep's title ("queue boundaries") overstates what it covers.

## Plausible concerns and honest limits
- The C stubs for the ring manager and phone-trigger bits are stand-ins, not native code; acceleration parity rests on the existing `boostPhoneTimer` and one not-equal check in test 9. The harness's `AddMoney` stands in for the battle-side prize code and models no loss path; neither was in the read scope.
- `momSavingsActive` is only tested with savings turned on.
- `readMomSavings` throws on a malformed save even when savings are off. That's stricter than native (which never reads it in that case), not a parity break.

## Requirements for the later host integration (not defects here)
- **Mom payout bug:** it is still open. `main.ts:347/349` still updates `state.money` directly and never calls this module.
- **Capture:** before the battle, record `momSavingsActive` (for the prize-message branch) and the pre-battle wallet. After it, compute the capped wallet the same way native does, with prize or loss already applied.
- **Call site:** call `settleMomBattleMoney` exactly once, where results are copied back. That is the equivalent of `BattleSetup_CopyResultsToSaveData`, which deposits before copying the profile. The call must sit inside the same outer State + FieldPhone checkpoint. Skip any separate `state.money` write.
- **Which battles:** native calls it for every battle that copies results back (wild battles, losses, zero-money outcomes), not just trainer wins.
- **Ordering:** apply `fieldPhone.triggerQueued(12,true)` only after the module's commit, and only from the returned event, never from a loaded bit.
- **Berry draw:** supply `random16` from the real native LC stream owner.
- **Phone call 12 isn't answerable yet:** `FieldPhoneHost.availability` reports any non-Elm call as `unsupported`. Once wired, a boosted trigger 12 will ring but can't be answered until the Mother incoming call and gift collection exist. Collecting gifts (`MomGiftQueue_Get/Peek`), the bank deposit/withdraw UI, Mom's queue-full message (msg 21) and the non-scripted prompt variants (23/24/27/28) all remain explicit gaps.

This review doesn't extend approval to the later main/battle hooks. It also doesn't claim full parity for the Mother call, savings, gift delivery, UI or RNG.
