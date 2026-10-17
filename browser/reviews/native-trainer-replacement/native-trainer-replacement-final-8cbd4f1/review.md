I found no confirmed defects, and all three original test gaps (G1–G3) are closed. The patch also introduces no false parity or coverage claims and no callback protocol mismatch. This was read-only: I didn't run the tests, compile the C harness, or compute any hashes.

## G1: carrying the Stage 1 score into Stage 2 (closed)
The test is at `scoped.patch:170-171`, which is file line 164.
- **Fixture:** Seismic Toss is id 69, power 1, Fighting. Tackle is id 33, power 35, Normal (`moves.json`).
- **Stage 1** (`battle_controller_opponent.c:1131-1201`): both Normal/Normal reserves score 40+40=80 against Psychic/Psychic. Fighting is not very effective on Psychic and Normal is neutral, so neither reserve has a super-effective move. Both are discarded, the next round picks nothing, and the loop ends. `score` is left at 80.
- **Stage 2** (`:1210-1258`): slot 1 has only Seismic Toss (power 1) plus empty moves, so its score stays at the carried 80 and slot 1 is picked. Slot 2's Tackle reaches the damage port at 20 and doesn't beat 80. The result is 1, with exactly one damage call, `[33,0,20]`. The 0 is correct because native `TrainerAI_GetMoveType` returns `TYPE_NORMAL`=0 by default (`:1368-1369`).
- **Mutant:** resetting the score to 0 picks slot 2. The log fails at `test.ts:120` (2 vs 1), called from `:164`, which matches the patch.

## G2: full call logging and the Fire Plate Judgment override (closed)
- **Logging:** the C stand-in now logs every `(move,type,score)` tuple, and `compare` deep-compares the whole list in order (`patch:76,110,127`).
- **Protocol check:** the real `BattleSystem_ApplyTypeEffectiveness` (`battle_util.c:2228,2249-2255`) treats a nonzero type as an override, a zero as "use the move's data type", and checks Normalize first. That matches the TS contract (`patch:224-227`) and the call at TS `:326`.
- **Judgment fixture** (`patch:172-173`):
  - Fire vs Normal is neutral, so Stage 1 rejects both reserves and Stage 2 runs.
  - Judgment (id 449, power 100) is called with type `TYPE_FIRE`. The harness's `GetItemVar` returns the per-slot hold effect, which feeds native `:1277`.
  - The drop-override mutant's log shows the tuple compare failing (expected `449,10`, got `449,0`).
- **Hidden Power** has native power 1, so Stage 2 skips it (`:1225`). The Hidden Power IV rows only test the move-type routine, and the patch doesn't claim otherwise.

## G3: charge-hit flag varied independently of Gravity (closed)
- The loop at `patch:149` crosses 4 attacker abilities × 3 target abilities × 3 type pairs × Gravity × charge-hit × 2 held effects × 5 moves = 1440 contexts.
- It includes Solar Beam (effect 151, one of the charge effects at `battle_util.c:6490`) against Wonder Guard on Ground/Flying. Grass is super-effective on Ground and not very effective on Flying, which cancels to not-very-effective. With charge-hit on and Gravity off, native sets NO_EFFECT (`:2373`) but the mutant doesn't. That matches the logged failure (expected 8, got 0) in test 4.

## The three mutations as negative controls
Each one is a minimal, realistic single-token change, labelled as synthetic. Each one fails exactly the targeted test, for the reason I would predict from the source. That's what I checked; I didn't take the claimed output on trust.

## Partner handling and the comment-only changes
- **Singles partner:** native singles returns the battler itself as partner (`battle_system.c:305-306`), and the opponent is `battler^1` (`battle_util.c:3570-3571`). The harness (`patch:62-63,93`) matches. It only switches to partner battler 2 when an explicit extra exclusion is supplied, and the comment says so.
- **Stage 1/2 and task fallback:** the exclusion checks (`:1143-1146,1217-1220`) and the task fallback (`:5556-5575`) line up with TS `:298-299,340-343`.
- **Comment changes:** the singleton-partner wording (TS `:215`) and the fog-only Weather Ball note (`:260`) are accurate. Fog is part of `FIELD_CONDITION_WEATHER` (`battle.h:259,265`) but has no type branch.
- **Unchanged algorithm:** I compared the TS logic again with the native source and didn't rely on the transpile proof.

Two minor notes, neither of them defects:
- The flag rows always pass override 0; override coverage comes from G2.
- The TS environment has no fog flag, so the caller has to map fog-only weather to an empty weather list.

## What I read
- **`battle_controller_opponent.c`:** 54, 1097–1374, 5546–5580
- **`battle_util.c`:**
  - 2228–2258 and 2331–2414
  - 3554–3575 and 6484–6500
  - the forward declarations at 33–37
- **`battle_system.c`:** 300–316
- **`battle.h`:** grepped for the flag and field constants
- **`moves.json`:** the entries for Tackle, Seismic Toss, Solar Beam, Hidden Power and Judgment
- **`proof/`:** all files (I only grepped the drop-override and Gravity-for-charge logs)

## Limits
- I didn't check hashes, the transpile proof, the 9/9 pass, the `tsc` result, `git diff --check`, or the claim that the base is `d090` with only two new files.
- Both damage functions are still neutral stand-ins. Real damage parity, the engine adapter, and correct binding of `currentActorDamage` to the outgoing actor are outside this review.
- The Bugsy test checks the real team data, but its outcomes depend on those stand-ins. The arithmetic and partner fixtures are synthetic controls.
- Nothing here approves broader battle, host or progression behaviour.
