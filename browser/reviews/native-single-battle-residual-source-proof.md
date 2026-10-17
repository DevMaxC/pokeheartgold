# Native single-battle residual order (source-only)

Native files are copied from exact commit514a01e; no root source edits, browser, build or new Claude call.

- `battle_controller_player.c:795–799`: ExecuteNextAction calls SortMonsBySpeed immediately before selecting UPDATE_FIELD_CONDITION after all actions. Each previous action boundary can also sort, so this is a fresh sort, not reuse of selected Fight executionOrder/tie.
- `battle_util.c:2899–2909`: SortMonsBySpeed resets IDs and compares with CheckSortSpeed flag1. `battle_controller_player.c:1193–1194` selects each residual battler from this turnOrder; `1547–1550` completes its condition chain before moving on. There is no sort/RNG in UMC traversal, so retain that sorted order throughout the residual pass even if EXP later changes speed.
- `battle_util.c:1162–1183`: flag1 suppresses MOVE priority. `1029–1030` computes integer stage-adjusted speed; `1058–1059/1117–1118` then integer-divides by4 for paralysis (unless QuickFeet). For browser's presently supported stage/PAR subset, use these two truncations rather than a single floating-point comparison.
- The native comparator additionally includes weather abilities, held-item modifiers, QuickFeet/SlowStart/Unburden/Tailwind, QuickClaw/Custap, LaggingTail/Stall and TrickRoom. Flag1 does not suppress those. This bounded phase fix alone does not prove all of them ported.
- Ordinary equal-speed case `battle_util.c:1227–1228` calls NEW BattleSystem_Random&1; lowbit1 swaps IDs, lowbit0 retains. `battle_system.c:1112–1114` advances native battle LCG and returns high16. Move execution sort independently compares via flag0 (`battle_controller_player.c:699–705`), so never reuse its tie result for residual. Native may consume tie draws at multiple action-boundary sorts; adding one browser residual draw is distributional behavior, not proof of complete native battle RNG draw-order parity.
- Every scheduled poison/burn effect returns to controller (`UMC1552–1554`), then `1181–1189` handles faint, grants EXP, checks battle outcome before another condition/battler. Final battle outcome redirects Main161–166 to BattleEnd. Never batch both last-battler residual damages before adjudication.
- If both last mons are atHP1 and poisoned, faster player takes poison first and loses immediately while foeHP remains1. Faster foe takes poison first, awards EXP to live player and ends in a win before player poison. Equal speed uses the fresh residual tie draw.
- If the first poisoned foe has a healthy bench, EXP/level-up can increase the live player's HP before its later poison; actual replacement waits TurnEnd1667 after residual. If foe is final, outcome skips later residual entirely.
- Speed changes during an action (stage/paralysis/level-up) affect the end-of-actions fresh sort. Speed changes during a residual interruption do not trigger a mid-pass resort.

This is literal source control flow, not an executed native ROM or rendered-browser claim.
