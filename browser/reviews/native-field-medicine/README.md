# Native field medicine core

This leaf implements pure field-party medicine planning/application. It does not add a Bag UI, battle item use, held-item activation or a campaign playthrough. Base: `c39003b1dff9ad589b5f13912357e9f906facb6a`.

`planFieldMedicine(data, {party,bag}, {item,partySlot,moveSlot?})` returns cancellation, no effect, explicit unsupported dependencies, a PP move picker, or a preview. `partySlot:null` / `moveSlot:null` cancel. `applyFieldMedicine` replans from current inputs and returns both updated party and bag without modifying either input. A preview is not a commit token. The host must lock selection, use apply inside its source-action recovery, assign both records together, await owned field presentation, then save coherent state. Cancellation/no effect/unsupported/data errors consume nothing.

Native item parameters, not item-name lists, drive HP restoration, major-status cures, Revive/Max Revive and one/all-move PP restoration, including route8 Berries. Egg/checksum failures are rejected. Source status admission precedes HP; there is no invented blanket fainted/level100 exclusion. HP sentinels255/254/253 use full/half/quarter with integer truncation and the native maxHP1 exception. Exactly PP127 means full; ordinary PP restoration uses native u8 addition then the actual boosted capacity. Confusion/infatuation flags are field-inert in the original functions. Nonempty moves retain original slots in the PP picker; full moves remain selectable but produce no effect.

Unsupported whole-item dependencies stay explicit: friendship/mood (including bitter medicine), Rare Candy/learn/evolution, vitamins/EVs, PP Up/Max, stat stages/Guard Spec, Sacred Ash/all-party ownership and other field-use handlers. They never partially heal while omitting a secondary effect. Synthetic CSV combinations absent from original data (both PP flags, zero-valued effect consumption, revive without HP restoration, impossible maxHP2/3) do not claim exact native consumption behavior; actual no-change is deliberately nonconsuming. Persistent toxic counters are not represented in current Mon and no battle volatile-state API is claimed.

## Native references

- `include/item.h:22–66`: complete ItemPartyParam flags and u8 restoration parameters.
- `files/itemtool/itemdata/item_data.csv`: every exported item row; fixture compares the complete CSV to actual items.json.
- `src/field_use_item.c:103–112,225–243,385–389`: HealingItem/Berry field routes.
- `src/party_menu.c:2331–2448`: Egg/party admission and move-picker dispatch before eligibility.
- `src/party_menu_items.c:909–990`: nonempty move slots, cancellation and consume only after successful selected-move use.
- `src/use_item_on_mon.c:30–99,239–336,441–457,491–566`: status-first admission, HP/PP mutation, friendship dependencies and integer rules.
- `src/move.c:19–26`: exact PP-Up capacities.

## Verification and independent review

17 targeted tests pass, including actual Potion/Full Restore/Revive/Max Revive/Ether/Elixir/status/Berry data, actual gift Egg, level100/fainted conditions, maxHP1, PP boosts/sentinels/u8, cancel/no-effect, immutable whole-Mon/bag inputs, unsupported secondary effects and rollback after an awaited field-effect failure. Production TypeScript check passes. Logs are committed. No broad suite, Vite build or browser/mobile playthrough was run for this leaf.

Two actual read-only Claude Opus5.5 reviews are committed with raw JSON/modelUsage, prompts, source-hash manifests and zero permission denials. Both report no confirmed production bugs. The first snapshot lacked the selected-move callback and incorrectly generalized the PP range; the follow-up includes all of `party_menu_items.c`, the full native u8 parser and final17-test snapshot, resolving both limits. Reviewers did not execute tests. Low synthetic-data/preview-host limitations are retained above, not treated as full inventory parity. `receipt.json` pins exact final runtime/test and evidence hashes.
