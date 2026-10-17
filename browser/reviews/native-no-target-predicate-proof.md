# Native pre-effect no-target predicate closure

Reference: original `battle_controller_player.c:2069–2089`, `TryMove:2647–2714`, `CheckMoveHit:2719–2725`, `battle_util.c:1358–1479,2544–2559,3554–3572`, and native range/effect headers. This is a source trace, not a native-ROM execution or full target/effect parity claim.

The first no-target check occurs after attacker status and PP deduction and before the move's own effect script is dispatched. Its literal return predicate is:

`target == BATTLER_NONE && (!charge_class || locked_into_move || charge_move_hit)`.

The complete charge class is the ten `case` labels in `BattleCtx_IsIdenticalToCurrentMove`: Bide26, RazorWind39, SkyAttack75, SkullBash145, SolarBeam151, Fly155, Dive255, Dig256, Bounce263 and ShadowForce272. The browser has no modeled charge/locked-turn lifecycle; every member remains explicitly unsupported. It never invents charge-hit/lock flags to finish a no-target action. This denies the bypass for the entire class, including unknown multi-turn states. The source-owned test table parses the actual switch and numeric header and exercises every effect.

Weather suppression, sunny Solar Beam and Power Herb only affect the following redirect-to-user condition at2081–2086. They do not make the first call return TRUE for an initial charge turn. Native can subsequently reach another no-target check at2723 after dispatching a charge script. The browser cannot skip that unported script and claim its later no-target outcome. Consequently charge effects remain unsupported in all of these contexts.

For the modeled single-battle target resolver:

| Native range | Value | Missing opposing active mon |
| --- | ---: | --- |
| SINGLE_TARGET |0|None|
| SINGLE_TARGET_SPECIAL |1|Actor target remains|
| RANDOM_OPPONENT |2|None|
| ADJACENT_OPPONENTS |4|None|
| ALL_ADJACENT |8|None|
| USER |16|Actor target remains|
| USER_SIDE |32|Actor/side remains|
| FIELD |64|Field/actor target remains|
| OPPONENT_SIDE |128|Side target remains, even if its active mon fainted|
| ALLY |256|Actor fallback in singles|
| SINGLE_TARGET_USER_SIDE |512|Actor fallback in singles|
| FRONT |1024|None when unchanged; a reselected move keeps the opposing battler ID|

`FightInput:1698–1706` sets its retarget flag when the selected move slot changes. The browser threads the originally selected move ID to compare against the current slot after intervening EXP/learning. That preserves the modeled FRONT distinction. The native flag also has Encore/cannot-select-action causes; those state systems are unported and cannot be claimed by this correction. Struggle's native flag does not change its SINGLE target rule. Unknown target families do not qualify for the bypass.

A no-target completion is therefore allowed only for a proven missing live-opponent target (0/2/4/8, or unchanged FRONT) outside the complete unported charge class. An unsupported effect is still rejected if its actual self/field/side/target script would run. The bypass implements the original no-target path, not the move effect. Attacker sleep/wake/paralysis and PP remain in the existing order, followed by attack message and literal197:1234; no accuracy, view attack, damage or effect executes. Native Rage cleanup is retained by the existing finally block.

Tests cover all12 native range macros against source-owned header values, all10 source-owned charge effects, changed/unchanged FRONT, opponent-side/self/field unsupported controls, both recoil directions and real selected-slot changes. The legally trained Diglett17→18 example survives the faster foe with HP/Defense EVs252/252, learns original Dig into the selected slot and explicitly rejects its unported charge effect. No invented HP, Focus Sash, charge engine, doubles or Draw policy is used.
