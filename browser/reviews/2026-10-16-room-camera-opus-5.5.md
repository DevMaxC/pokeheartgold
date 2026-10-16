# Room camera review — Claude Opus 5.5

Preliminary read-only review of runtime commit `0979d24`; CLI confirms `claude-opus-5-5` with auxiliary Haiku usage, success, no permission denials. The reviewer used only Read/Grep/Glob and executed no tests, builds or browser work.

## Adjudication at `22cc488`

- Failed scene loading: main now retains its outer camera guard while a non-dismissible Retry choice waits. Retrying continues the original warp stack, then releases only after actors are placed. Actual guarded metadata-failure/recovery evidence is in `2026-10-16-room-camera-retry-runtime.json`. Connected-border failures retain existing behavior. Direct World.enter guard cleanup remains self-contained; main is its only runtime caller and owns the failure guard.
- Spawn cache: independent follow-up identified a rejected cached spawns.json promise that prevented recovery. The cache now clears on rejection; a native-data 503-to-200 regression verifies both spawn APIs share the recovered success without refetching it.
- Input while loading: Q/E, pointer dragging and wheel zoom now honor the guard. A pre-existing drag is canceled at entry. Actual frozen-input fixture retains yaw/pitch/zoom exactly.
- Resize while loading: canvas resize is deferred to guard release. A targeted ownership test checks one flush; actual viewport/canvas receipts preserve the outgoing canvas during the pending load and show the new size after recovery. The browser receipt was taken before its queued resize event and does not itself assert the pending flag.
- Boolean guard: current game transitions are serialized by existing movement/interaction and script awaits; no new concurrent transition contract is claimed. Runtime fixtures exercise real main/warp ordering, in addition to deferred map/stream and outer-owned actor-placement tests.
- Tight-room obstruction easing remains existing behavior; no change to orbit controls, obstacle distance or connected camera smoothing.

Validation at the refined source: all 164 tests and production build pass; final Opus follow-up remains pending below.

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
