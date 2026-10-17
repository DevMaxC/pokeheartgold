Native Cut and TM/HM core
========================

This is an isolated core from production f21d5686. It does not wire the Bag,
party menu, VM, follower animation, field effect, object hiding, saving or World.
It must not be described as an end-to-end working Cut implementation.

Queries and use eligibility
--------------------------

`getPartySlotWithMove(party, move)` matches ScrCmd_GetPartySlotWithMove:
first matching occupied slot, Eggs and checksum-failed Bad Eggs skipped, sentinel
6 if absent. Fainted status and zero PP do not disqualify a user. Missing packed
move entries are native MOVE_NONE. `monHasMove(mon, move)` has the same policy.
The native operand order is destination/move/partySlot for MonHasMove, and
destination/move for GetPartySlotWithMove (macros emit this order unchanged).

`cutFieldResponse({mapLoadType, hasHiveBadge, facingSpriteId})` matches the party
menu's FieldMove_CheckCut: Union/Colosseum return NOT_HERE first, missing Hive
Badge returns NEED_BADGE next, and a literal facing SPRITE_TREE returns OK.
It does not select the party user; the menu must supply a monster that knows Cut.
There is no native CheckCanUseFldMove opcode in this source tree.

The object interaction is standard 10000 / bank0146 entry0. It checks the party
move and Hive Badge, asks Yes/No, selects the appropriate native cut-in/follower
branch, starts effect 0 or 3, waits 7 frames, hides VAR_SPECIAL_LAST_TALKED, then
waits for the effect-completion variable. Its cleanup label only releases the
script lock. Exported `cutCommandClosure` records all 73 reachable interaction
instructions / 36 commands and 51 menu instructions / 28 commands. The parent host
must implement the whole closure, not replace it with immediate tree removal.

Important effect/follower dependencies:

- PlayFieldMoveCutIn waits for completion before deleting its native cut-in.
- StartFieldMoveEffect(kind, doneVar) sets doneVar = 0 immediately, starts an
  independent task, then writes 1 only after the effect finishes and is deleted.
- Kind 0 is Cut at the player; kind 3 is Cut at the following Pokémon.
- GetFollowPokePartyIndex selects the first alive non-Egg, unlike the Cut-user
  query. An all-fainted party hits a native assertion, rather than selecting an
  arbitrary Egg/follower.
- FollowMonIsInactiveOrVisible returns true when inactive OR the native visible
  flag is set. Preserve this literal branch polarity.
- The follower branch swaps player/follower positions, adjusts mood, checks the
  first alive Pokémon's type, hops and plays its original cry.
- Native effect models/animations come from NARC_a_1_3_4. Their export and the
  field renderer remain separate integration work.

Teaching transaction
--------------------

Load `field-moves.json` with `loadNativeFieldMoveData()`. It contains all 100
original TM/HM item/move mappings, the 5 alternate-personal families and source
hashes. Existing `GameData.personal` already preserves the complete original
TM/HM compatibility arrays. All 540 map sections come directly from the native
map headers, so teaching derives its location bonus from state.map rather than
a caller-supplied map section. Standard bank/entry IDs and the TM/HM boundary
are also derived from their native tables and constants. Numeric item IDs must not index the CSV-derived
`GameData.items` array; held-item effects are found by exact item key.

`checkTMHMLearning` returns Egg/notTMHM/known/incompatible/full/empty. It follows
the native first-empty-slot scan. A compatible fainted Pokémon can learn. There
is no badge gate on teaching; the badge gates later field use.

`prepareTMHMTeaching(data, native, state, partyIndex, item, replacement?)`
returns noEffect, chooseReplacement, or an immutable ready plan. A full set needs
an explicit replacement index. Null cancels preparation even when a slot is empty. Existing HM moves are
protected from this teaching/level-up-style replacement; this is not the Move
Deleter. Empty slots are filled automatically. UI cancellation after preparation
must call `cancelTMHMTeaching(plan)` or discard the plan without committing.

`commitTMHMTeaching(state, plan)` is synchronous and has no callbacks or awaits.
It rechecks state/party/bag/object identity, party snapshot, position/map, source
compatibility and target-item quantity before any write. Stale/cancelled/consumed
plans have no effect. On success it installs the new move with base PP (zero PP
Ups), retains HM items, consumes one ordinary TM, and applies native teaching
friendship/mood changes. A cannotForgetHM result must return the host to the forget picker. Cancelling
that picker needs the native Stop trying? Yes/No loop rather than immediately
closing the teaching UI. The host must keep the outer source transaction busy
through prompts/commit/render/save and own field refresh or rollback on failure.

Friendship follows pokemon.c exactly: base1/1/0 by tier, positive Luxury Ball and
EGG_LOCATION=current map section bonuses, then Soothe Bell truncation. It does
not substitute met location for egg location. Mood gains 40, clamped to 127.
`NativeTeachingMon` adds an optional mood field locally, with native zero default
for legacy objects. Normal JSON serialization retains it; the host can declare
this field in its shared Mon type and follower adapter during integration.

Validation
----------

`python3 browser/scripts/export_field_moves.py` reproduces the native export.
`node --experimental-transform-types --test src/source/field-moves.test.ts`
(from browser/) runs ten source-data/query/teaching/transaction tests. Tests use
all 508 original personal rows plus alternate forms and the actual source
standard bank. They cover reusable HM01, consumed TMs, HP/PP/Egg policies,
protected HM replacement, cancellation/stale choices and friendship/mood rules.

TypeScript passes. No browser or production build was used. Independent review
is recorded separately against a frozen snapshot before handoff.
