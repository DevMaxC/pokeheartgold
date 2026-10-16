# Furniture collision review — 2026-10-16

Claude Code was explicitly run with `claude-opus-5-5`, using only Read/Grep/Glob; no edits, agents, tests or shell commands were delegated. Immutable reviewed snapshot: `0a6ad1f`. Auxiliary Haiku usage also appears in the CLI metadata.

## Resolution and evidence

- The reviewer found no blocking defect, but identified an inferred save-escape bypass near thin furniture. Corrected: strictly interior starts can escape; overlapping starts outside the footprint can move away or tangentially, but cannot cross inward through a seat. A thin-seat regression covers both directions.
- Native push-warp blocking now reads `terrainWalkable`, preserving the original tile permission decision independently of furniture. Ordinary movement and arrival auto-steps continue to include furniture collision.
- Arrival steps and battle placement checks now carry the actual player floor reference instead of assuming floor zero. Separate-floor regressions cover the collision helper.
- All 40 native variants now test an outside-to-outside swept crossing and an old-save escape, as well as blocking at the centre. An additional regression covers a prop extending from its owning neighbouring cell, including collider removal when that cell unloads.
- Floor cushion props whose visible top is already below the current floor do not block the player. This follows actual vertical overlap; it does not create an invisible obstacle above a buried visual.
- 115 tests pass. TypeScript/Vite build passes. Shared browser: north from (8.5,6.5) into the round stool remains at (8.5,6.5), and east then north through x9.5 advances to z4.5 without an error.

## Original static review

I found no blocking defects. The main fix holds up on reading the code: stools block the player and the aisle stays open. Findings below are marked **Confirmed** (I traced the code path) or **Inferred** (it depends on map data I can't see with Read/Grep). This was a static review only; I ran no tests and no browser.

### 1. You can walk through furniture you start out touching, not just furniture you start inside — Inferred, low–medium
`browser/src/source/furniture-collision.ts:32`
```ts
const end=touches(to,obstacle,radius);if(touches(from,obstacle,radius)&&!end)continue;
```
`touches()` is true when the start is inside the outline **or within 0.24 of it**. So the save-escape rule also applies to a player standing just outside a piece of furniture. When it applies, it skips the whole sweep for that obstacle, so the step can pass straight through it if the end point is clear.
- **When it can happen:** the furniture is thinner than about 0.76 − d in the step direction, where d is the distance from the start to the furniture (0 < d < 0.24). Bench cushions are 0.56–0.8 wide across (`furniture.ts:47`, 0.75 × a 12–17 native width), so they qualify.
- **How a player gets there:** normal steps can't end within 0.24 of furniture (`end` blocks them). Warp arrival points, `enterMap` spawns, scripted moves and old saves can.
- **Why it's only inferred:** for seats centred on tiles, adjacent tile centres are at least about 0.5 from the outline, so this can't happen. It needs furniture placed off the tile grid or rotated, like the 45° bench in the test. I couldn't check prop placements in the map data.
- **Fix:** only skip when `from` is strictly inside the outline (the `every(cross>=0)` half of `touches`). Otherwise keep the sweep, or require the distance to the outline not to shrink along the step.

### 2. Furniture now counts as "blocked" for the push-to-exit warp check — Confirmed path, impact inferred
`browser/src/source/main.ts:149`: `pushWarp(standing,facing,!world.walkable(x,z))`
- Exit tiles with behaviours 98/99/108/109/94/95/101/111 warp the player when the tile ahead is blocked (`field-transitions.ts:13-18`). Before this commit, "blocked" meant only the tile's permission. Now furniture counts too.
- So if furniture sits on a walkable tile right next to one of those exit tiles, pressing toward it will warp the player out instead of just bumping.
- This rarely matters because exit tiles are usually at map edges. If it should only follow the tile permission, pass `!permissionWalkable(world.permission(x,z))` here instead.

### 3. Some `walkable` calls use floor height 0 instead of the player's height — Confirmed, impact inferred
`main.ts:103` (the step after arriving through a door), `main.ts:149` and `battle-stage.ts:42` call `walkable(x,z)` without the player's height, so it defaults to `currentY=0`. `world.ts:128` then picks the floor nearest y=0 when deciding which furniture overlaps vertically.
- On maps with several floors at one spot, these checks would test the ground floor's furniture, not the player's floor.
- Normal steps (`main.ts:152`) pass `player.group.position.y` and are correct.
- Pass `player.group.position.y` at 103 and 149.

### 4. Floor cushions may stop blocking on slightly raised floors — Inferred
Cushions are 2.5 native units tall, so the top (`maxY`) is about 0.156 above the prop's base. The height check at `furniture-collision.ts:30` ignores an obstacle when the player's floor is at or above `maxY − 0.025`, about 0.131. If a room's floor is more than about 0.13 above where cushion props are placed, cushions become walk-through. Seats (0.5 tall) have plenty of margin. I couldn't check room floor heights against prop heights with these tools.

### 5. Test gaps — Confirmed
- **`source-assets.test.ts:71`:** the step ends at the seat's centre, so only the end-point check runs. It would still pass if the sweep or the escape rule were broken. It also tests the raw asset at native 16-unit scale, not real placed props with rotation and scale. Adding one step that starts and ends outside the seat, plus one save-escape step per variant, would make it a real regression test.
- **`furniture-collision.test.ts`:** nothing tests finding #1 (start near but outside, thin furniture, clear end point), and nothing tests a world-level step across two cells.

### Checked, no problem found
- **Door rule (`main.ts:151-152`):** `enteredDoor` does skip `walkable` entirely, including furniture. But it only applies to a warp tile with behaviour 0x69 entered facing north (`terrain.ts:20`), so furniture can't realistically be in the way. No actionable bypass.
- **Map streaming:** obstacles are stored per cell (`world.ts:116`) and only after the generation check, so stale loads can't add them. `walkable` checks every loaded cell, so furniture hanging over a cell boundary still counts. Changing matrix or room clears the cells and their obstacles together (`world.ts:69`). Unloading (`world.ts:120`) drops a cell and its obstacles together.
- **Visibility snapshot:** `traverseVisible` only runs at load. Nothing in the game code toggles prop visibility afterwards; only the replaced flat cards are hidden (`furniture.ts:53`, `render-repair.ts:169,355`), so the snapshot is correct today.
- **Collision maths:** the outline builder winds counter-clockwise, so the inside test (`cross>=0`) agrees with it. The sweep checks segment crossings plus the four point-to-segment distances, which is the correct distance between the step and the outline. Mirrored transforms are fine because the outline is rebuilt from world-space points.
- **Height units:** `terrainHeight` adds the cell's `altitude*.5`, the same offset the cell group's position uses, so the floor and furniture heights compare in the same units.


