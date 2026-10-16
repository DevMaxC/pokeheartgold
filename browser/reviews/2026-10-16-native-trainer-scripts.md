# Native trainer script restoration

This change restores COMMON_0953 trainer execution and its native data contracts. It is not an in-browser playthrough or a completed trainer sight detector.

## Implemented

- Retain the original numeric 3000/5000 script identity and originating map/last-interacted object across nested standard scripts.
- Derive native trainer IDs, single/double/partner message parameters, defeated branches and durable trainer flags at offset `0x550`.
- Read the exported original trainer introduction/after/rematch messages; preserve both double-trainer partners' different dialogue and reject a double battle without two living non-egg Pokémon.
- Invoke the existing awaited battle hook with the original trainer/options, and follow the source win/loss/whiteout branches. An aborted or lost battle does not set the victory flag.
- Import all 75 phone book contacts, their original dialogue banks, and 63 rematch sets from the repository's source tables. `python3 browser/scripts/export_trainer_contacts.py` reproduces the data file.
- Resolve variable-based registration to the canonical contact key, including refusal, later offers, existing registrations, queued item gifts, native rematch group gating and clearing rematch requests.
- Preserve source guarded Ecruteak candle no-ops outside that gym, while requiring a host implementation inside it.
- Admit the original shared trainer-approach script only with explicit, validated engaged-trainer context and awaited field path/step hooks.

## Field host contracts

The existing `message`, `battle`, `face`, `move`, `whiteOut` and other hooks retain their contracts. New optional hooks are required by the corresponding gameplay commands when reached:

- `objectMovement(object, next?) -> number`: read/set the live actor's native movement type.
- `objectFacing(object) -> number`: read live native facing (north/south/west/east = 0/1/2/3).
- `followerActive() -> boolean`: the actual field follower state.
- `trainerPath(index, {trainer, object}) -> Promise<void>` and `trainerStep(index, {trainer, object}) -> Promise<boolean>`: prepare/await actual trainer approach work. `true` means the native approach task is complete; the shared script polls otherwise.
- `trainerCandle(action, useLastInteracted)`: actual Ecruteak gym effect.
- `encounterMusic(trainer)`: optional presentation hook.

The field's sight detector calls `vm.runTrainerApproach(map, {eyeType, trainers})`; eye types 0/1/2 mean single / paired double trainer / two independently engaging trainers. The VM validates that each object actually owns that source trainer script. It does not detect sight, synthesize paths or move NPCs itself. Manual trainer scripts also require movement/facing hooks before battle.

`trainerIdForScript`, `trainerDefeated` and `setTrainerDefeated` in `trainer-script-state.ts` provide the shared identity/flag contracts for field integration. Optional saved `trainerPhone` stores native queued gifts and rematch-seeking contact IDs. Scheduling incoming trainer phone calls and the existing `phoneCall` module's unported trainer callers are outside this change.

## Validation

- TypeScript: `npx tsc --noEmit` passed.
- Full baseline suite including the first 19 trainer cases: `npm test`, 183 passed.
- Final focused trainer suite: 20 passed, including the added actual source rematch flow.
- Tests use actual source map/common-script/trainer/phone exports and awaited fake host callbacks. They cover Wade acceptance/refusal/reoffer/repeat/loss/aborted battle/gift/rematch, Nico, Abe, Rod, hidden trainer identity, double partners, raw trainer flag condition semantics, explicit host admission and Morty candle guards.

No `main.ts`, `battle.ts`, browser automation or Vite build changes are included. Field hook integration, natural playthrough and rendered battle verification remain necessary.
