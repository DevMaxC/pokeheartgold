# Native battle accuracy rounding

Base: a0d26ee60af51e26e26c548c35629098a755aa62.

The existing accuracy/evasion/Foresight hit check now uses the literal native
`sHitChanceTable` in `src/battle/battle_controller_player.c`, followed by integer
division as in the `u16 hitChance` assignment. A zero-based roll of71 now misses
against Tackle after one evasion increase:95*75/100 becomes71, not71.25. The
table also uses rounded entries such as133/100 and36/100, rather than4/3 and3/8.
The native final test `(random%100)+1 > hitChance` is equivalent to the existing
zero-based `roll >= hitChance` once the threshold is integer.

Only the already implemented stage/Foresight path changes. Tutorial, zero
accuracy, existing always-hit effect bypasses, PP use, single accuracy draw per
multi-hit move, Rage cleanup, critical/damage draws and3D presentation hooks
retain their current order. The ordinary damage/speed stage multiplier is
unchanged.

Native accuracy calculation order reviewed: Simple/Unaware affect stages;
Foresight/MiracleEye ignore beneficial target evasion; sun may change Thunder's
base chance; stage table and division precede CompoundEyes; weather-based
SandVeil/SnowCloak/fog precede Hustle/TangledFeet; target/attacker held items and
MicleBerry precede Gravity and the final roll. Weather suppression applies to
the native weather clauses. These additional accuracy rules are not yet
implemented by this browser hit check and are outside this rounding fix.
Existing ability support for damage, multi-hit counts or weather healing does
not imply support for accuracy abilities. This is not complete battle parity.

Validation includes actual source table comparison for all exported positive
move accuracies and every legal pair of accuracy/evasion stages; legal
Rattata/Pidgey Tackle, DoubleTeam and SandAttack on both sides; Bellsprout
SweetScent/SleepPowder at99%; Hoothoot Foresight with accuracy loss; PP, RNG and
view callback boundaries; and the unchanged Rage/per-hit regressions.

Independent Opus5.5 review and final test results are recorded separately once
available. No browser, build, main, world or Egg changes are included.
