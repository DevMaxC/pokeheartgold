# Native field transition review — Claude Opus 5.5

Reviewed immutable head `6b9b7c9` against base `cce305514b810432073f2fa3e4f7010327232fa8`. CLI model usage confirms `claude-opus-5-5`; auxiliary CLI Haiku usage was 18 output tokens. Read/Grep/Glob only, no edits or agents. The reviewer did not execute tests or browser checks.

## Adjudication

1. Confirmed missing north/south ladder pushes. Native `field_control.c:500–512` checks them before facing collision; 166 imported warp events use them. Added directional pushes independent of blocked floor.
2. Confirmed departure reset occurred after coordinate-event early return. Clear suppression before coordinate events whenever the current anchor differs.
3. Confirmed native rebuild phases: battle returns need OnLoad → OnResume, with no OnTransition. Corrected helper, callers and test expectation.
4. The shared-room failure sequence is possible at the API boundary regardless of whether a native direct warp currently exercises it. Reset stream keys and current request centre on room/matrix changes; added failure/retry fixtures. Matrix download assignment is also atomic so failed fetches remain retryable.

Author validation after corrections: 107 tests and TypeScript/Vite build pass. Original Center entry/sideways mat crossing/south exit/immediate re-entry were checked in isolated browser storage. Other prior browser evidence and explicit remaining limitations are in VERIFICATION.md.

## Reviewer report

I found one high-severity regression (cave ladders can no longer warp), one narrow new regression, one native gap that a new test locks in, and one low-severity retry risk that depends on data I couldn't confirm. I read the code at head 6b9b7c9 against the native C. I ran no tests and no browser.

## Findings

### 1. High, new regression: north and south ladder warps (behaviours 60 and 61) can no longer fire
- **Code:** `browser/src/source/field-transitions.ts:3-19`. The step table `stepWarpFacing` only covers 100, 110, 62, 103, 106 and 107. The push table `pushWarp` only covers 94/98/108, 95/99/109 and 101/111.
  - `TILE_BEHAVIOR_LADDER_NORTH` is 60 and `LADDER_SOUTH` is 61 (`include/constants/metatile_behavior.h:68-69`). Neither table includes them.
- **Native behaviour:** `src/field/field_control.c:500-512` handles both ladders before the facing-tile collision check at `:516`. The player stands on the ladder and holds north or south, and the warp fires with transition 7. No wall in front is needed.
- **Before the patch:** `checkEvents` warped on stepping onto any tile with a warp event.
- **After the patch:**
  - In `main.ts:114`, `stepWarpFacing(60|61)` returns `null`, so stepping on doesn't warp.
  - In `main.ts:149`, `pushWarp` returns false. That push branch also only runs when the tile ahead is blocked (`!world.walkable`), which native doesn't require for ladders.
- **Data:** the imported cave lands contain these tiles. For example, `browser/public/source/lands/528.json` has a 60 and a 61 surrounded by cave floor (8). That suggests real cave ladders, but I didn't trace which map uses that land or confirm a warp event sits on those tiles.
- **Trigger:** stand on a cave ladder tile and press north (60) or south (61).
- **Effect:** nothing happens, so ladder-only routes can't be traversed.
- **Fix direction:**
  - Add 60→north and 61→south to `pushWarp`.
  - Evaluate them in `step()` even when the tile ahead is walkable. In native, ladders don't need collision ahead.

### 2. Low–medium, new regression: a coord event can leave the arrival warp suppressed
- **Code:** `main.ts:113` returns as soon as a coord trigger fires. The `if(warpIndex<0)lastWarp=''` reset is now at `main.ts:115`, after that return. Before the patch, the warp check and the reset ran before the coord check.
- **Trigger:**
  1. Warp onto an anchor that is triggered by stepping on it and has no arrival step: warp panel 103, north entrance 100/110, or ladder-down 62. `lastWarp` is set to that tile.
  2. Step onto an adjacent tile whose coord event fires.
  3. Step back onto the anchor.
- **Effect:** `key!==lastWarp` is false, so the warp is skipped. It recovers only after the player steps on a tile that has no warp and no firing coord event.
- **Native comparison:** native has no `lastWarp` equivalent. It never evaluates the arrival tile because no step happened, and stepping back onto it always warps.

### 3. Native gap, not a regression vs base: battle returns skip `OnLoad`
- **Code:** `field-transitions.ts:21` defines the resume kind as OnResume only. It is used at `main.ts:132` (battle return) and `:178` (catching tutorial).
- **Native behaviour:** a battle return rebuilds the field map. `src/field/fieldmap.c:189` runs `INIT_SCRIPT_ON_LOAD`, then `:213` runs `ON_RESUME`. `include/constants/init_script_types.h:36-41` says OnLoad "can run again without leaving the map" and handles warp-event and object-flag setup.
- **Test:** `field-transitions.test.ts:14-16` is titled "battle returns do not replay field rebuild scripts". That contradicts native and freezes the gap in place.
- **Effect:** state that OnLoad would re-derive after a battle is not refreshed before OnResume runs.
- **Severity:** base ran nothing after battles, so this is an improvement but still incomplete. It's documented in `VERIFICATION.md:82`.

### 4. Low, conditional on unverified data: a failed same-matrix room entry may never retry streaming
- **Code:** `world.ts:67-70` bumps `generation` and clears cells, but never resets `streamCenter`.
  - The `streamCenter` key at `world.ts:82` is `matrix:chunkX,chunkZ`. Every headerless room in one matrix shares the same key (for example `73:0,0`, which 24 maps use).
- **Trigger:**
  1. While in headerless room A, the frame loop's `updateStreaming` sets `streamCenter='73:0,0'`.
  2. The player warps directly to room B in the same matrix.
  3. `world.enter` → `stream` partially fails, for example a prop request errors.
- **Effect:** room B's key equals `streamCenter`, so `updateStreaming` (`world.ts:83`) returns early and never retries. Its 1-second backoff only applies to failures of its own requests. The missing cell makes `walkable()` false (`world.ts:124`), so the player is stuck in a one-chunk room.
- **What doesn't trigger it:** going through an outdoor map (a different matrix key) resets the situation correctly.
- **Unverified:** I didn't confirm that any headerless rooms sharing a matrix warp directly into each other.

## Checked and found no regression
- **Step tables vs `field_control.c:532-575` and `:703-748`:**
  - Entrance/warp east, west and south, plus stairs east and west, are push warps gated on facing collision.
  - North entrance, north warp and ladder-down step-warp facing north.
  - Escalator flip and plain escalator match.
  - Warp-panel facing is carried through.
- **Arrival placement:**
  - Door exit steps out only when facing south, matching `door_transition.c:683` and `:714`.
  - Stairs end on the anchor facing west for east stairs and east for west stairs, matching `field_transition_tasks.c:278-302` plus the walk-back at `:83-86`.
- **Entry script order:** OnTransition → OnLoad → OnResume matches `field_warp_tasks.c:268` and `fieldmap.c:189`/`:213`. Connections run only OnTransition, and blackout spawn is now skipped on connections, matching `field_warp_tasks.c:262-267`.
- **Frame triggers:** deferring them until after arrival placement has no frame-loop gap. Everything between `enterMap`'s `finally` and the next `transitioning=true` runs as microtasks.
- **Shared headerless rooms:**
  - A room change bumps `generation`, so any in-flight old jobs release their own groups (`world.ts:114-115`).
  - `connect()` now refuses cross-room ownership.
- **Prefetch failure handling:**
  - `allSettled` waits for late sibling props before releasing (the `finally` at `world.ts:115`).
  - The asset, land, foliage, tree, entrance and cliff caches evict rejected promises.
  - The pending cleanup skips unwanted-cell pruning on failure or a generation mismatch.
- **Stale `latestStream` (minor, not reported as a finding):** after a long same-matrix warp, `enter()` doesn't update `latestStream`, so cells near the old position are kept for one cycle. The next `updateStreaming` call clears them.
- **Camera obstruction:**
  - `traverseVisible` now honours hidden parents, which the old code didn't (it checked only the hit object's own `visible`).
  - The vegetation regex is anchored on `_`/start, so `powerplant_wall` is kept as an obstacle.
  - Solid alpha-tested hills are kept.
  - I found no concrete case where a solid building material is dropped, but I didn't inspect material names or opacities across the imported assets.

## Coverage limits
- I didn't run tests, the build or the browser. Your validation (104 tests, production build, targeted Center/stair transitions, and the six-second network-delay connected-header test) is your own, and I haven't reproduced any of it.
- Data checks were limited to one land file (ladder behaviours) and one matrix/map pair (`73`, maps 69 and 81). I didn't enumerate which warp events sit on 60/61 tiles, or whether same-matrix headerless rooms warp into each other directly.
- I didn't review `ScriptVM` internals, `tweenPlayer`, `doorwayEntry`'s data assumptions, `originalMaterial`/`repairOriginalAsset` opacity handling, or which Node versions support the `--experimental-transform-types` flag.
- I didn't compare special transitions against native: warp-panel animation, Union Room, Colosseum, ladder transitions 7 and 8, or overlay/menu resume paths beyond battles.
