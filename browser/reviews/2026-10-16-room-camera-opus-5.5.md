# Room camera review — Claude Opus 5.5

Preliminary read-only review of runtime commit `0979d24`; CLI confirms `claude-opus-5-5` with auxiliary Haiku usage, success, no permission denials. The reviewer used only Read/Grep/Glob and executed no tests, builds or browser work.

## Adjudication at `22cc488`

- Failed scene loading: main now retains its outer camera guard while a non-dismissible Retry choice waits. Retrying continues the original warp stack, then releases only after actors are placed. Actual guarded metadata-failure/recovery evidence is in `2026-10-16-room-camera-retry-runtime.json`. Connected-border failures retain existing behavior. Direct World.enter guard cleanup remains self-contained; main is its only runtime caller and owns the failure guard.
- Spawn cache: independent follow-up identified a rejected cached spawns.json promise that prevented recovery. The cache now clears on rejection; a native-data 503-to-200 regression verifies both spawn APIs share the recovered success without refetching it.
- Input while loading: Q/E, pointer dragging and wheel zoom now honor the guard. A pre-existing drag is canceled at entry. Actual frozen-input fixture retains yaw/pitch/zoom exactly.
- Resize while loading: canvas resize is deferred to guard release. A targeted ownership test checks one flush; actual viewport/canvas receipts preserve the outgoing canvas during the pending load and show the new size after recovery. The browser receipt was taken before its queued resize event and does not itself assert the pending flag.
- Boolean guard: current game transitions are serialized by existing movement/interaction and script awaits; no new concurrent transition contract is claimed. Runtime fixtures exercise real main/warp ordering, in addition to deferred map/stream and outer-owned actor-placement tests.
- Tight-room obstruction easing remains existing behavior; no change to orbit controls, obstacle distance or connected camera smoothing.

Validation at the refined source: all 164 tests and production build pass; final Opus follow-up below confirms no blockers.

## Original response

I found no blockers in `0979d24`. I only read code and the evidence file; I ran nothing, so I'm not claiming any test, build or browser result.

**What checks out against the intended behavior**
- **Guard order in `main.ts`:** the guard starts before `state.map/x/z` are changed (`main.ts:91`). It stays on through `world.enter`, NPC loading, the `mapBlackoutSpawn` wait and player/follower placement (`:93`). It's released before `runFieldEntry` (`:94`), and the extra release in `finally` (`:96`) does nothing harmful.
- **Direct `World.enter`:** it guards both the room-metadata wait and the stream wait, and only releases a guard it started itself (`world.ts:78-89`). It is the only caller of `enter` besides `main`. `connect` (`:91-95`) is unchanged and never touches the guard.
- **Rebase:** with `warp=true`, `fieldCameraEntry` always moves the target and camera by the same amount and never calls `lookAt` (`camera.ts:20`), so the offset and rotation are kept even for nearby coordinates.
- **Starting the game:** `begin()` sets `started=true` and calls `enterMap` in the same synchronous step, so no frame draws before the guard is on. The `!cameraReady` setup still runs.
- **Arrival height:** the camera target (`height(x,z)+.9`, `world.ts:86`) matches the player height `main.ts:93` sets. The first unfrozen `draw` therefore adds no vertical jump.
- **Nested warps:** a warp triggered from an entry script runs its own guard after the outer one has been released, so nothing overlaps.
- **Evidence file:** it agrees with the code. The camera-to-target offset before entry is about (0, 5.06, 12.01) and the first frame in the room is about (0, 5.06, 11.99). Rotation is unchanged during the 3 frozen frames, and the exit kept the rotated orbit.

**Findings, most severe first**

1. **Low-medium: if loading fails, the old flip comes back.** `main.ts:91` sets the new coordinates. If `world.map`, the matrix fetch or `stream` then throws, `world.ts:86` never runs, so the camera is never moved. The `finally` at `main.ts:96` then releases the guard. `draw` goes back to chasing the new coordinates through the old scene, or through an empty one if `releaseCell` had already run at `world.ts:83`.
   - **Trigger:** any single failed cell or prop download, because `stream` rejects if any one job fails (`world.ts:143`).
   - The error then reaches `step`'s `.catch` (`main.ts:199`) and the game keeps running.
   - `camera-transition.test.ts:32-38` only checks that rendering resumes after a failure, not where the camera is.
   - **Fix options:** put `state` back as it was, move the camera on failure, or stay frozen until there's a retry or error screen.

2. **Low (inference): camera input during a load swings the camera on release.** `ui.loading` doesn't count as `ui.busy` (`ui.ts:10`). Dragging and the wheel (`main.ts:207`) and Q/E presses made after the `keys.clear()` (`main.ts:197`) still change yaw, pitch and zoom while drawing is frozen. The camera move keeps the old offset, and the first `draw` then moves the camera in a straight line toward the new orbit (`world.ts:192`). After a large yaw change during a slow load, the camera passes close to the target quickly, which is a smaller version of the flip being fixed. The same could happen before this commit.

3. **Low: resizing during a load blanks the canvas.** `renderer.setSize` (`world.ts:54`) clears the canvas, and `draw` returns early (`world.ts:186`), so nothing is shown until the guard is released. This only matters if the loading overlay doesn't cover the canvas.

4. **Low, test coverage: the guard is a plain flag and `main.ts` ordering is untested.**
   - `beginFieldTransition` and `endFieldTransition` set a single true/false flag (`world.ts:75-76`). If two non-connected `enterMap` calls ever overlapped, the first to finish would release the other's guard. Current callers run one at a time (`transitioning` gates `step` and `interact`), so this is a hardening note.
   - Test 2 imitates main by calling the guard by hand. No test covers the real order in `main.ts:91-96`: guard before the coordinate change, release after placement and before entry scripts, and guard re-taken by a nested warp.

5. **Info, not a regression:** the first frames in a room still use the old-room camera distance. The obstruction ray only shortens it gradually (`world.ts:191-192`, about 0.25 s), so in tight rooms those frames may be seen from beyond a wall. The old version also moved the camera across in one jump, so this is the same as before.

## Final follow-up at `22cc488`

CLI success, requested model `claude-opus-5-5` confirmed, no permission denials; read-only review, no execution claims. Source bytes are unchanged from the 164-test/build/runtime-verified revision.

Remaining low-severity notes: a permanently unavailable or malformed asset can keep Retry waiting; the browser can reload the last saved game. No rollback-to-previous-scene behavior is claimed. The actual registered resize listener was additionally exercised via a synthetic resize event in the constructed T3 World: pending=true with 0 resize calls during the guard, then exactly 1 on release (see 2026-10-16-room-camera-resize-runtime.json). Main retry ordering is covered by the actual runtime fixture rather than an automated DOM harness. The 37-second timestamp gap reflects T3 not advancing animation frames between tool interactions; the draw hook records each call, but this is frame-state evidence, not continuous video.

I found no blockers in `22cc488`. I only read the code, tests and evidence files and ran nothing. The 164-test and build results are yours, not mine.

## Previous findings: status

| # | Previous finding | Status at `22cc488` |
|---|---|---|
| 1 | Failed load releases the guard and the camera chases the new coordinates | **Fixed.** The guard is taken at `main.ts:92` and kept through the retry loop at `main.ts:95-104`. It is only released at `:105` after actors are placed, which is before `runFieldEntry` at `:106`. |
| 2 | Orbit input during load swings the camera on release | **Fixed.** Q/E is blocked at `main.ts:208`, pointerdown and pointermove at `:218`, and the wheel at `:218`. A stale drag is canceled at `:92`, and `keys.clear()` runs again after Retry at `:102`. |
| 3 | Resize during load blanks the canvas | **Fixed in code.** The resize is deferred at `world.ts:55` and applied once at `world.ts:77`. |
| 4 | Boolean guard; main ordering untested | The guard is unchanged and still only a hardening note. Main ordering is now covered by runtime evidence only (see F3). |
| 5 | Tight-room obstruction easing | Unchanged, same as before. |

## Retry semantics and ownership: checks out

- **Retry after a partial `World.enter` failure:**
  - If the matrix fetch fails, `activeMatrix` is not updated. The retry sees `matrixChanged` again and refetches.
  - If the stream fails, `activeHeader=id` was already set at `world.ts:87`. The retry therefore skips the room reset and streams only the missing cells, because failed jobs never keep their cell (`world.ts:143`).
- **Failure after the camera has already moved** (for example `mapBlackoutSpawn` on a spawns 503): the retry calls `fieldCameraEntry(...,warp=true)` with a zero shift, so the camera doesn't move. `clearNPCs`, `objects.load` and `restore` are run again and appear safe to repeat.
- **Connections:** `if(connection)throw error` at `:100` keeps the old behavior. The guard and loading screen are never touched for connections.
- **`World.enter` ownership:** `ownsTransition` (`world.ts:81,92`) still releases only a guard it started itself. `main` is the only runtime caller; tests and `streaming.test.ts` are the others.
- **Order of calls:** the release at `:105` and the second release in `finally` at `:107` are harmless. A nested warp from an entry script takes and releases its own guard first, and the outer `finally` then clears an already-clear flag.
- **Escape doesn't dismiss Retry:** `ui.choose` sets `canDismiss=false`, and the Escape handler respects it. `menu()` closes panels without checking `canDismiss`, but `#open-menu` appears to sit inside `#game-hud`, which `panel()` makes inert. That last point is inferred from the element order in `index.html`, and the same path already exists for `chooseStarter`.
- **Saving during Retry:** `transitioning` blocks `save()` and `pagehide`, so the new map ID is never saved over a scene that failed to load.
- **Spawns:** `rows=null` runs inside the rejection handler, before any caller sees the rejection. The 503→200 test also checks that both APIs share the same rows.
- **Error field:** `lastError` is cleared only after a successful retry (`:98`).

## Remaining findings

**F1. Low (inference): a permanent failure leaves the player stuck with only a Retry button.**
- **Where:** `main.ts:99-103`.
- **Trigger:** any error that fails the same way every time inside the loop. Examples are a missing or broken prop or land asset (`stream` rejects if any prop fails, `world.ts:141`) or a data error from `objects.load` or `restore`.
- **What happens:** Retry is the only choice, so the loop never ends and reloading the page is the only way out. Reloading returns to the last save, which may be up to about 10 seconds old, or older if the warp came from a script.
- **Before this commit:** the same failure gave a broken scene, but the game kept running.
- I don't know whether the shipped assets contain any such failure. If you want a way out, add a second choice such as "Return" that puts the old `state.map/x/z` back, or offer a reload after N attempts.

**F2. Low, test gap: the resize-deferral path is never exercised by a real resize event.**
- **Where:** `camera-transition.test.ts:39-43` builds the world with `Object.create`, so the resize listener at `world.ts:55` is never attached. The test sets `cameraResizePending` by hand.
- **Runtime evidence:** the receipt shows `duringResize.pending:false`, with the canvas still at 2048×1280 while the viewport is already 1100×740. That fits a deferred resize, but it also fits a resize event that simply hadn't fired yet. Your adjudication already says this.
- **Result:** the `if(this.cameraTransition)` branch is reasoned correct but not observed. Dispatching a `resize` event in a test with the listener attached would close the gap.

**F3. Low, evidence gap: the retry loop in `main.ts` has no automated test.**
- The only coverage is `2026-10-16-room-camera-retry-runtime.json`.
- That receipt is consistent with the fix:
  - 7 frozen frames with no change.
  - Yaw, pitch and distance stay at 0, 0.4 and 13 after the Q and wheel input.
  - The new room is map 69 with `error:""`.
  - The camera offset stays around 12.1–12.2 across the transition.
- It has a ~37 s gap with no samples, between the last frozen frame (t≈250425) and the first unfrozen one (t≈287382). Any frames drawn between the release and the first sample weren't recorded.
- The final pose shows a clean re-anchor, so this isn't a bug claim, only a limit on what the receipt proves.

The single-flag guard (old #4) and tight-room easing (old #5) are unchanged, as your adjudication states. I'm not raising either again.
