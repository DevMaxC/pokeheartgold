# Native field party order

Base: `506fbd108322bd5d79b1cd2379ca62d799ab183f`.

This isolated change supplies the normal field-party swap and a chooser over the existing UI. Integration into `main.ts` is deliberately left to the parent change: the party row needs Summary/Switch/Cancel actions, followed by saving and refreshing the field after a completed swap. No battle-switch behavior, root UI class, World, main binding, or native asset is changed here.

## Native behavior checked

- `src/party_menu.c:1613` (`PartyMenu_SetContextMenuItems_Field`) always starts with Summary. Its normal non-Egg branch adds enum value0 (`PARTY_MON_CONTEXT_MENU_SWITCH`); the Egg branch explicitly adds Switch. No HP test is used. The separate Battle Tower partner-selection context has its own menu, outside this field-only helper.
- `src/party_menu.c:1868` (`PartyMenu_HandleSelectSwitchMonInput`) allows any occupied target slot. Source-slot selection and B/Cancel cancel without exchanging records. It does not forbid Eggs or fainted Pokémon in slot0.
- `src/party_menu_list_items.c:327–448` prepares selection, cancels selection and commits the completed swap through `Party_SwapSlots`. Some other decomp revisions name this `Party_SwapMons`/`party_menu_switch`; this checkout's literal symbols/files above are used.
- `src/party.c:107` (`Party_SwapSlots`) exchanges the complete Pokémon and its complete per-mon Aprijuice modifier struct. There is no eligibility or species filter. The browser has no separate parallel Aprijuice array, so its whole `Mon` references move without rebuilding/normalizing any fields.
- `src/follow_mon.c:1518` derives the first living non-Egg or, if none remain alive, the first non-Egg. Its selection is separate from field slot ordering. Existing `firstFollowerMon` and battle eligibility consumers remain unchanged.
- `files/fielddata/script/scr_seq/scr_seq_0843_T20R0101.s:_055F` selects the first living party member before testing Togepi/Togetic/Togekiss. This change introduces no alternate quest check or gift-identity gate.
- `files/msgdata/msg/msg_0300.gmm:146` supplies the original target prompt: “Move to where?”

## API and ownership

`swapFieldPartySlots(party, sourceSlot, targetSlotOrNull)` returns a new shallow array containing precisely the two exchanged records. Cancellation and the source slot return the original array. Mutable/readonly overloads preserve caller types. Dense occupied1–6 party slots and occupied integer indices are required; this is not a general save-schema validator. Eggs, fainted Pokémon, duplicate species and all other valid records are eligible.

`chooseFieldPartySwitchTarget(() => state.party, sourceSlot, ui, signal?)` presents every occupied slot in its original order plus Cancel, and returns an occupied target index or `null`. Egg labels conceal their species/level/HP as native panels do. Existing `UI.choose` owns string escaping, listeners and panel cancellation; the helper propagates abort/replacement, checks abort again after awaiting and rejects stale slot identities before the caller commits a swap. It never writes state. Replacing only the array while preserving the identical slot references is semantically unchanged and permitted.

Caller responsibilities are the root source action's serialization/rollback, committing the returned array, save/updateHUD and submenu return. The existing chooser makes `canDismiss=false`; explicit Cancel works, while keyboard B/Escape cancellation must be bound by that root action if desired. No keyboard handler is installed by this module.

## Verification

Ten targeted tests pass, including all36 six-slot source/target pairs, complete nested and unknown-field preservation, Egg/fainted-first orders, native follower/battler consumers, cancellation, invalid/sparse/overfull parties, abort/replacement and stale awaited indices. An integration test uses the actual gifted Egg, hatches it at its newly selected lead slot, verifies identity after save/Continue, and runs the actual Elm map61 script: a live starter lead cannot receive the Everstone; a normal swap to the hatched Togepi lead receives exactly one Everstone and the original flags.

TypeScript and all638 full-suite tests pass. A subsequent test-only extension added validation-before-opening coverage and in-place `reverse()` coverage; the final ten targeted tests pass. Runtime bytes were unchanged after the full run. No build or browser run was performed for this scoped helper.

## Independent review

Claude Opus5.5 (`claude-opus-5-5`) completed a read-only review using native source and current consumers. The complete actual CLI receipt is [native-field-party-order-opus.json](native-field-party-order-opus.json), SHA256 `b14ee54b3fa432cd0e2dc6de938d42eae36550c8bc7e945c8a2534a8cb502e8b`. It reported no introduced implementation defect or native mismatch. Its two minor coverage suggestions (chooser validation before opening and same-array in-place reordering) were added and pass; no runtime correction was needed.

The review also identified caller integration responsibilities: preserve the native Battle Tower multi-partner room menu exception when that context is supported; return selection to the target slot; and refresh the existing species-only follower binding when swapping distinct same-species Pokémon with different form/gender/shiny appearance. These were handed to the parent responsible for `main.ts`; this isolated helper does not alter those bindings or claim their integration is finished.

Implementation SHA256: `ba0979064cd72441edc94935d007f6464cbc9640c65de72431d46f365cbaae33`.

Final test SHA256: `59dc43f5a9c6c8602c022664203b3296473bae207a654a03251cb5cac63d76de`. The review/full-suite checkpoint preceded the final test-only additions and used test SHA256 `24dea967b05e8549573d9e7d8e6101d948260137da549857be4bbbfde58b9260`.
