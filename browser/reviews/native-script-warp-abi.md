# Scripted Warp operand repair

This follows `5bc31256` and supersedes only that checkpoint's incorrect Warp-coordinate blocker. It does not declare a rendered campaign playthrough.

Native `src/scrcmd_c.c:2210` reads map, unused halfword, X, Z, direction and calls `CallTask_ScriptWarp(...,map,-1,x,z,direction)`. The assembler macro emits those five halfwords in that order. The second operand is not a destination anchor:113 exported rows have0 and the actual Ecruteak Gym row has7; native still passes−1. `field_warp_tasks.c:638` preserves X/Z/direction in Location.

The VM previously read operands3/4 as X/Z. It now reads2/3 and passes operand4 as an optional fourth `ScriptHooks.warp` argument. All114 exported Warp rows exercise that ABI, including variable map/coordinates,23 variable facings and ignored7. The actual Ilex first-Farfetch'd branch now reaches hook117,15,65,North; actual Proton victory reaches164,4,5,North and its later story flags. Battle/animation/warp ports are injected; these are actual script fixtures, not natural traversal. Loss never warps, and a rejecting warp hook prevents later source statements. Source-action recovery remains responsible for restoring mutations before a failed hook.

36 affected coordinate/warp/recovery tests and TypeScript pass. Exact source hashes, exported row inventory and log hashes are in `native-script-warp-abi.json`. Main/UI/World are unchanged. Parent still needs to forward the optional native direction in the real main warp hook; a three-argument consumer remains source-compatible but ignores that direction. The pure coordinate matcher likewise still awaits main wiring. Apricorn queries, Azalea's gym and field Cut remain separate campaign work. Total parity remains partial.
