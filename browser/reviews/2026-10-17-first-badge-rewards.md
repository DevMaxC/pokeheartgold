# First badge reward commands

Base: integration commit `10ba994`; isolated branch `feat/native-first-badge-rewards`. This is a script/state implementation. The tests supply battle-host outcomes; they do not play a battle, move through the rendered Gym, or establish a fresh-save browser playthrough. No parity requirement is promoted to Verified.

## Native behavior and implementation

| Source | Behavior |
| --- | --- |
| `src/scrcmd_17.c:34–62`, `src/player_data.c:132–143` | `GiveBadge` resolves a ScriptGetVar operand and sets one of16 badge bits idempotently. `CountBadges` counts the bitset. Browser badges remain the existing numeric array; duplicates are never added. |
| `src/scrcmd_c.c:3687–3691,4324–4328` | `AddSpecialGameStat` and its second opcode read a **literal halfword** score-event ID, rather than dereferencing a variable. Both call the same native scoring function. Invalid/unimported event IDs stop explicitly in the VM. |
| `src/game_stats.c:180–220,275–293,371–379`, `include/constants/game_stats.h` | Score events use40 weighted increments,149 stat-width flags and native word/halfword bounds. Badge event22 adds30 to `GAME_STAT_SCORE`(stat2); it does not increment counter22. Score addition has a separate99,999,999 ceiling, although stat2's ordinary storage cap is999,999,999. |
| `src/scrcmd_c.c:521–527`, `src/script_manager.c:446–449`, `asm/macros/script.inc:267–270` | Existing `SetTrainerFlag` correctly resolves a ScriptGetVar trainer number and sets flag at `TRAINER_FLAG_BASE + id`. The fixture explicitly exercises its variable operand alongside `GiveBadge`, then rejects variable dereferencing for the literal score opcode. |
| `files/fielddata/script/scr_seq/scr_seq_0859_T22GYM0101.s:64–126` | Original Falkner win/loss/reward/repeat flow executes unchanged. Original COMMON0003 supplies the TM item/fanfare/text script; no replacement reward script is invented. |

After a reported win, native0859 grants Zephyr0 and30 score, marks Abe50/Rod29 defeated, sets Violet City scene1 and Elm Lab scene6, and sets192/0F4/Wi-Fi closed-lady flags. It then checks TM51 space. Only successful TM delivery sets `FLAG_GOT_TM51_FROM_FALKNER` and reveals the friend in their bedroom.

A full99-item TM51 stack keeps the earned badge/score/story flags and leaves the item/friend flags pending. After making space, the original already-badged conversation retries the gift without fighting or scoring again. Subsequent conversations use native after-badge text and issue no duplicate item. Loss performs whiteout without victory rewards; a rejected battle host cannot enter the reward block.

`State.gameStats` is an optional sparse numeric-counter map, initialized empty for new games. Existing v2 saves without it read zero and allocate it on first score update. JSON persistence retains the native values. The change does not infer/backfill historical events, alter the save version or emulate the DS encrypted save/checksum layout.

## Import and repeatable tests

```sh
python3 browser/scripts/export_game_stat_rules.py
cd browser
node --experimental-transform-types --test src/source/first-badge.test.ts
npx tsc --noEmit
```

The generated `game-stat-rules.ts` records SHA256 hashes of native C/header inputs. Tests independently compare all40 modifiers and149 width flags to the native arrays, check the special score cap, older missing counters, all16 badge bits and raw-vs-variable ABI.

Twelve fixtures pass against the actual exported map135/script0859 and COMMON0003, plus the post-badge city and aide scripts: reported win/loss/host failure, repeated conversation, full-stack/retry, JSON restore, flags/counters, native tables and ABI, Elm call, explicit Egg blocker, refusal/full-party branches. The combined trainer/cache/reward regression passes34 tests; TypeScript passes. Full branch suite:477/478 pass; the sole failure is the unchanged base `opening-save.test.ts` missing the merged `sourceActions`/`recoveryPrompt` context required by the real save callback. Root integration owns that fixture correction; this branch does not change opening/main/recovery files. No build or browser was run.

## Next explicit blocker and retained gaps

The actual map73 `scr_seq_T22_000` completes Elm's call and moves Violet scene1→2, reveals the shop aide and hides the lab aide. In map157, accepting that aide's gift with party space reaches **`GiveTogepiEgg`**, opcode776, and throws `UnsupportedScript` before receipt flags or party mutation. Refusal/full-party cases complete their native retry dialogue and flag06F without issuing an Egg.

This command remains unsupported intentionally. `src/field/scrcmd_pokemon_misc.c:1034–1078` requires `SetEggStats`, level1 Togepi, gift/met provenance, Extrasensory with correct PP, party capacity, and stored personality/gender. `src/field_misc_events.c:278` later verifies OT ID/gender, language, game and recorded identity. Proper implementation also needs Egg combat/follower exclusion and hatching behavior. A regular Togepi would counterfeit this quest; none is granted.

Violet Gym initialization/elevator geometry and field hooks belong to the separate Gym branch. This branch does not implement battle move rules, native battle score events elsewhere, generic game-stat script commands, badge obedience/Rock Smash field mechanics, badge/TM audio, a score UI or additional Egg systems. Existing presentation-only audio commands remain simplified. Full-game parity still requires those systems and actual gameplay verification.
