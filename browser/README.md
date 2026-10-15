# HeartGold in 3D

A browser runtime using the original HeartGold map geometry, prop placement, event tables, dialogue, Pokémon data and scripts. The presentation uses a movable third-person camera and original 2D character/Pokémon artwork in 3D space.

Battles take place in the live 3D field, with grounded paper Pokémon, an orbiting shoulder camera, in-world attack/capture motion and the familiar turn-based commands. Q/E, drag, scroll and touch camera buttons work during battle.

The requested destination is complete original-game parity. **That work is ongoing.** [PARITY.md](PARITY.md) catalogs 274 system requirements, 540 maps and 832 script/movement commands. Imported content, implemented behavior and verified parity are tracked separately. This build does not execute the original Nintendo DS binary or provide a completed port.

## Run

Requires Node 22.18+ and WebGL 2.

```sh
cd browser
npm ci
npm run dev
```

Open the printed URL. New Game starts with Oak’s introduction, gender/name selection and the original bedroom. The previous exploration prototype has been replaced as the default entry point. Its old local save is separate from the source runtime’s save.

| Control | Action |
| --- | --- |
| WASD / arrows | Move relative to the camera on original map tiles |
| F / Enter | Interact and confirm dialogue |
| Q / E or drag | Rotate the camera |
| Scroll | Zoom |
| Shift | Run after receiving Running Shoes |
| Escape / Menu | Open unlocked game menus |

The world includes solid fences, fuller flower bunches and 3D long grass on the original encounter tiles. Building door warps and counter interactions support entering the Pokémon Center and using Nurse Joy; following Pokémon move smoothly between tiles.

Touch movement and interaction buttons are available. Progress saves to local browser storage. `?qa=1` uses a separate QA save and does not overwrite the ordinary adventure.

## Original source import

Committed browser data includes 540 map headers, 288 matrices, 648 landscape/texture contexts, 946 prop/texture contexts, 493 species, 471 moves, 738 trainers and 893 overworld sprite mappings. Eight Apricorn-tree sprite palette conversions remain unresolved in `public/source/import-report.json`.

`scripts/import_source.py` reads files from this repository. It imports original collision/elevation data, event coordinates, script instruction lists, messages, encounters, learnsets, stats, items, evolution data and battle type tables. NSBMD/NSBTX geometry is converted with [apicula](https://github.com/scurest/apicula), with textures embedded in GLBs. Original artwork retains its original ownership.

To reimport, install `scripts/requirements.txt` in a Python virtual environment, build apicula at `../.local-tools/apicula/target/release/apicula`, then run:

```sh
python scripts/import_source.py
python scripts/build_parity.py
```

The DS build remains separate; see the root `INSTALL.md`.

## Verification and remaining work

```sh
npm test
npm run build
npm run preview
```

Tests cover the imported opening quest for both characters/all starters, hidden object state, atomic item grants, trainer generation, encounter rolls, capture bounds, battle error recovery, presentation/mechanics separation, all imported geometry contexts and rendering regressions. See [VERIFICATION.md](VERIFICATION.md) for evidence and current limitations.

`src/source/render-repair.ts` repairs missing rear façades within each connected prop component, adds thickness to planar props and turns tilted tree artwork into upright camera-facing panels. This shared loader path covers streamed locations. Development fixture `/tests/render-review.html` provides front/rear/side views of original buildings, mailbox, sign and trees; it is excluded from the production entry points.

The script VM explicitly stops at unsupported gameplay commands. Battle AI, many move/ability/item effects, services, puzzles, later story progression, audio and connectivity systems still need implementation and verification. Asset import counts do not establish that those locations or systems are playable.

Both `/` and `/original.html` build the source runtime. Deploy `browser/` as the existing Vercel project using `vercel.json`. There is currently no server dependency in the local single-player runtime.
