# Paper Johto

A browser-playable first slice of a HeartGold-inspired 3D world: camera-relative analog movement, low-poly scenery, and original 2D character sprites standing in 3D space. This is an independent browser runtime alongside the Nintendo DS decompilation. It does not execute or compile the original C game engine.

## Play locally

Use Node.js 22.18 or newer and a WebGL 2 browser with hardware acceleration.

```sh
cd browser
npm ci
npm run dev
```

Open the URL Vite prints. Choose Chikorita, Cyndaquil, or Totodile, then explore west from New Bark Town into Route 29.

| Control | Action |
| --- | --- |
| WASD / arrow keys | Move relative to the camera, including diagonally |
| Shift | Run |
| Q / E or drag the world | Rotate camera |
| Scroll | Zoom |
| F | Interact with the nearest sign, doorstep, or wild Pokémon |
| Escape | Close a panel |
| Camera button | Alternate adventure and panoramic views |

Touch devices have movement and interaction buttons. Drag on the world to rotate the camera.

Wild Pokémon wander visibly in the route. Approach one, use Tackle to weaken it, then throw a Poké Ball. Elm’s lab replenishes your bag. Field notes track your catches. The help panel switches day/night encounters and returns you to town. Position, partner, catches, ball count, time of day, and the exploration objective save automatically to local browser storage. Clearing site data resets this progress.

## What comes from the original project

- Pokémon artwork: `files/poketool/pokegra/pokegra/<species>/male/front.png`. Each exported PNG crops the first 80×80 animation frame and trims transparent padding.
- Ethan’s 32 walking/running frames: decoded directly from `files/data/mmodel/mmodel/mmodel_00000069.NSBTX`, packed into a 4×8 sheet. The export manifest records its source.
- Route 29 species and levels: the `R29` entry in `files/fielddata/encountdata/gs_enc_data.json`, resolving HeartGold’s daytime/nighttime slots.
- Place names and the New Bark/Route 29 connection: `src/data/map_headers.h` (`MAP_NEW_BARK`, `MAP_ROUTE_29`).

The town layout, terrain, buildings, interactions, catch probability, and following behavior are newly authored prototype systems. They are not faithful ports of the original maps, scripts, battle formulas, AI, or save format. Original assets retain their original ownership; this prototype adds no license grant to those assets.

Re-export the small committed asset set from this checkout:

```sh
python3 -m venv ../.local-tools/browser-assets
../.local-tools/browser-assets/bin/pip install -r scripts/requirements.txt
../.local-tools/browser-assets/bin/python scripts/export_assets.py
```

No ROM or DS SDK is needed to run the browser prototype. The DS build remains separate and follows the root `INSTALL.md`.

## Structure and verification

- `src/world.ts`: terrain height, walkability, camera-relative movement, deterministic scenery seeds, collision substeps.
- `src/scene.ts`: 3D scenery, instanced trees/grass, camera blockers, flat sprite planes.
- `src/main.ts`: input, third-person camera, follower, source-backed encounter selection, simplified catching, UI, save/load.
- `public/assets/manifest.json`: source provenance for exported sprites.

```sh
npm test
npm run build
npm run preview
```

CI runs the collision/movement tests and TypeScript/production build. Browser verification covers startup, walking from town to the route, encountering and catching a Pokémon, objective updates, save restoration, night species, desktop layout, and touch layout. `window.__JOHTO__` exposes read-only diagnostic snapshots for inspecting position, region, FPS, nearby interaction, and visible wild Pokémon.

Deploy the `browser/` directory as a Vite project; `vercel.json` contains its build configuration. There is no backend dependency in this single-player slice.

## Continuing the conversion

This build is a bounded exploration prototype with two connected areas. It is not the complete HeartGold game or a DS ROM patch. Doorsteps open short interactions; there are no interior maps yet. Battles currently provide Tackle and catch/leave actions, with no enemy attack turns or full team management.

The next milestones are an importer for the original map matrices/event coordinates and Nitro models, streamed region chunks, interior transitions, original script-event compatibility, and a complete battle/party engine. Keep source-data adapters separate from renderer and movement code so later ports can replace the prototype rules without rebuilding the browser presentation.
