# Opening-sequence review: snapshot of base `081c5ec`

**Reviewer:** Claude Opus 5.5 (`claude-opus-5-5`). This was a read-only review using only Read/Grep/Glob. I edited nothing, ran nothing and opened no browser. Everything below comes from reading the source, so none of it is runtime or visual evidence.

## Defects (most important first)

### 1. A failed field start can overwrite the old save (high)
- **Where:** `main.ts:207`, `main.ts:110`, `main.ts:223`, `main.ts:227`
- **Trigger:** The user picks a replacement adventure and finishes the intro. `begin()` sets `started=true` before `enterMap` runs. Then something in `runFieldEntry` or `checkFrameTriggers` throws, such as an unsupported script during the first room's scripts. `enterMap` has no catch for that. Its `finally` resets `transitioning=false`, and the error reaches `boot().catch` (the "Johto could not load" panel).
- **Consequence:** All the guards in `save()` now pass. Clicking that panel's Retry calls `location.reload()`, which fires `pagehide`, which calls `save()`. The old single-slot save is replaced by a new state that never finished field entry. This breaks the doc's claim that only a successful start replaces the save (review doc lines 23–25).
- **Fix:** Only allow persistence after a complete start. Either set `started=true` after `enterMap` resolves, or add a `ready` check to `save()` and set `ready=false` in the bootstrap error path. Add a test where `enterMap` rejects after `createState`, then `pagehide`, and assert storage is unchanged.

### 2. Oak's slide distance depends on the viewport (medium)
- **Where:** `opening.css:8,12`
- **Problem:** `.opening-paper-stage` has an explicit `width`, `aspect-ratio:4/3` and `max-height:76vh`. When `max-height` clamps, the box is no longer 4:3. `object-fit:contain` then letterboxes the art, but `translateX(-20.3125%)` is a percentage of the box width, not of the drawn 256-px image.
- **Example:** At 1440×800 the box is 1000×608 and the art is drawn about 811 px wide. The slide is 203 px, but 52 source px should be about 165 px. The 768-px-wide mobile rule (`width:130vw`, line 33) has the same problem.
- **Side effect:** The Marill SVG uses `meet` on the same box, so Oak and Marill land in different places relative to each other.
- **Fix:** Put Oak inside the same `viewBox="0 0 256 192"` SVG and translate it by 52 source units, or wrap both in an inner element that really is 4:3.
- **Direction:** I couldn't confirm this from the source alone. `sOakPicTranslationParam` (`oaks_speech.c:257`) gives HOFS −52 for the state named SLIDE_OAK_RIGHT. However, Oak's art spans x=97–159 and Marill sits at x=160, so the browser's leftward move is the layout that doesn't overlap. Check against an emulator frame.

### 3. Enter can pick a different option from the one highlighted (low–medium)
- **Where:** `opening-view.ts:34`
- **Problem:** `current` falls back to `0` whenever focus isn't on a button. That happens before the focus `setTimeout` runs, after a click on the background, or after `ui.close()` moves focus to the canvas.
- **Consequence:** If the remembered gender is Girl (`initialIndex=1`), Enter selects Boy. The static `opening-selected` class also doesn't follow arrow-key focus, so two options can look highlighted at once.
- **Fix:** Keep a `cursor` value that starts at `initialIndex` and is updated by arrows and focus, and use it in place of `activeElement`.

### 4. "Understood?" uses the wrong Yes/No labels (low)
- **Where:** `opening.ts:63`
- **Problem:** The source (`oaks_speech.c:1683`) uses `msg_0219_00061/62` ("Yes"/"No" after alignment codes are stripped). The browser uses 47/48 ("YES"/"NO").
- **Fix:** Use `[text(61),text(62)]`. `{ALN_CENTER}` is already stripped.

### 5. Shrink timing differs from the source (low)
- **Where:** `opening-view.ts:52`
- **Source behaviour** (`oaks_speech.c:2110–2147`): fade to black, fade in the full-size player art, hold it for 30 frames, then show frames 22–25 / 26–29 for 9 frames each.
- **Browser behaviour:** `scene('shrink')` and the first shrink frame are set in the same tick. The full-size portrait is never visible, and the PNGs aren't preloaded, so blank frames are possible.
- **Fix:** Wait 30 frames after `scene('shrink')`, and preload or decode the four frames before starting.

### 6. Exporter provenance issues (low)
- **NSBMA listed as used but never consumed** (`export_opening_assets.py:80,93`): line 80 leaves NSBMA out of the apicula conversion, but line 93 adds all five title files, NSBMA included, to `used`. Its hash is recorded as a conversion input. Only add the files actually passed to apicula.
- **Joint-animation flag isn't checked** (`:109`): `nativeJointAnimation` is set just because `ho-oh.glb` exists, not by looking at its contents. If a regeneration without `--title-model` finds no earlier title sources, the manifest still names the model but has no provenance for it. The fix is to fail or warn in that case.
- **Tile palette bits ignored** (`:29–34`): BG decoding skips the palette-bank bits (`entry>>12`) and has no assert that they are zero. If any tilemap entry uses a non-zero bank, the art is silently recoloured.
- **OAM attributes not checked** (`:51–54`): affine and double-size flags (`a&0x300`) aren't checked, yet bits 12/13 of `b` are read as flips, which is wrong for affine OAM.
- **Logo transparency can silently fail** (`:73`): it relies on the PNG being in palette ('P') mode. In RGB mode no pixel matches 0 and no transparency is applied.
- **Hand-picked palette offset** (`:49`): `basepal=1 if i==2` is chosen per cell instead of being derived from `Sprite_SetPaletteOverride(5/4)` (`oaks_speech.c:1830,1847`). It's correct today only because ball sequence 3 uses only cell 2. Add an assert or a short comment.
- These are risks to a correct regeneration, not evidence the current PNGs are wrong. The asset-hash tests cover the current outputs.

## Non-blocking risks and validation gaps
- **Possible GPU leak (unconfirmed):** `opening-stage.ts:21–25`. Disposal doesn't call `skeleton.dispose()` for SkinnedMesh bone textures; whether that leaks depends on the three.js version. Separately, the title stage stays loaded through the whole introduction because `dispose` only runs in `title()`'s `finally`. Disposing it right after the title would free GPU memory sooner.
- **Title lighting and aspect:** The HemisphereLight at intensity 2 is invented; the source uses light0/light1 vectors (`title_screen.c:696–717`). The aspect follows the viewport rather than 4:3, so horizontal framing differs on wide screens.
- **Camera timing (unverified):** The browser steps the camera 30 times per second. The camera script's steps (5 units) and the `duration*30` comparison match `title_screen.c:815–849`, but I couldn't confirm the native frame rate from the source.
- **Title input:** The source accepts touch anywhere and ignores input for the first 30 frames (`title_screen.c:143,154`). The browser accepts only the button or keys, and accepts them immediately.
- **Typewriter scope:** The browser typewrites every page. Natively, the topic and control/adventure pages (7, 9–17, 28–33) use `PrintAndFadeCenteredFullScreenText`, a fade-in rather than a typewriter.
- **Missing Marill effects:** The 16-step white-to-normal fade before the cry (`oaks_speech.c:1844–1862`) and the blended hide (`:1875`) are absent.
- **Keyboard ordering, as read from the code:** No double-firing found. The UI, main and choose listeners are all on `window`, and a listener added during a dispatch isn't invoked for that event. Main's handler sees `dialogueOpen` already updated, and `interact()` exits while `!started`. The Space keyup-to-click path across panels looks safe but is unconfirmed until tested in a real browser.
- **Bootstrap failures before `started`:** These are safe: `started` is false, so `save()` does nothing. But `boot().catch` shows a "needs WebGL 2" message for asset or message-file failures, which is misleading.
- **Incompatible saves:** An existing save that fails `readSave()` validation (for example, not `version===2`) is treated as no save. New Game then starts with no warning and overwrites it. This predates the change but is relevant to save safety.
- **Symbol row 5 order:** Not fully verifiable here. Glyph order ☽ before ↗ assumes `CHAR_SNORING=0x1DD`, and the CHAR_ header isn't in the snapshot. The charmap code points I checked (`…·‘’“”♂♀~◉☀…↘`) match.
- **No browser evidence:** Without a renderer there's no evidence for title framing, SVG placement, mobile layout, audio, focus or reload. The offline tests check logic and assets, not visual or runtime equivalence.

## Source behaviours confirmed to match
- **Topic menu** (`oaks_speech.c:1553–1594`): message 7, choices 44/45/46, cursor resets to 0. CONTROL INFO pages 9, 10, 11, 12, 23, then 25, then 13–17, then 26. No repeats from 9 (`:1708–1713`); Yes returns to the topics (`:1702–1705`). ADVENTURE INFO 28–33 returns to the topics (`:1772`).
- **Greeting time windows** (`:1477–1494`): match exactly.
- **Effect and message order** (`:1817–1890`): 6, slide, 34, ball, Marill appear, cry, 35, hide, slide back, 36.
- **Gender selection** (`:1896–1993`): 37 is repeated after a No; `lastChosenGender` is remembered (`:1409,1437,1918`); 38/39 use the 47/48 Yes/No.
- **Name prompt** (`:2009–2062`): the name is cleared each time (`String_SetEmpty`); 41/42 confirmation; a name rejection goes back to message 37.
- **Default names** (`naming_screen.c:645–712`): blank, unchanged or all-space input picks from HG pool 254 entries 0–17 (boy) or 18–35 (girl). Non-blank input keeps case and spaces.
- **Keyboard rows** (`naming_screen.c:254–282`): match the browser keyboard, including CHAR_SPACE keys, ASCII ' mapped to ’, and the 7-character limit.
- **Main menu** (`main_menu.c:891–921`): CONTINUE/NEW GAME labels, and summary order PLAYER/TIME/BADGES/POKéDEX with the Pokédex line gated on having one.
- **Title setup** (`title_screen.c:351,508,693–695,721–753,815–849`): Ho-Oh at (30,95,0); FOV 2×0xB60 (about 32°); near plane 0.5; camera start 625/152/256 aimed at −2/124/−38; the HG camera script.
- **Save boundary at the controller level:** Continue returns the saved State untouched. Cancelling the replacement loops back to the menu. A data, prepare or effect rejection reaches no `createState`. `createState` runs only after message 43 and an awaited `player-shrink`. The one exception is defect 1, which happens after the controller.

## Still missing, correctly reported as gaps
- The five-scene boot movie and the 2340-frame idle return to it.
- NSBTA/NSBTP/NSBMA (palette 28) title playback and the sparkle models 38–40.
- All BGM and sound effects (`SEQ_GS_STARTING/STARTING2`, BOWA2, HERO_SHUKUSHOU, select sounds).
- Palette and brightness fades.
- The erase-save and microphone button combos.
- DS dual-screen layout and tutorial button artwork.
- The native "a new session cannot be saved" restriction (intentionally replaced by the browser's replacement warning).
- Field-start data: flag960, trainerID, RTC and mail, which are scoped to later work as you said.

## Implementation response after review

The review is a source inspection of a copied snapshot; it is not final rendered approval. Actual modelUsage records claude-opus-5-5. The small claude-haiku-4-5 CLI routing request (14 output tokens) is reported separately in the JSON receipt.

1. **Initial field-entry persistence:** standalone `save` now requires `ready`, and an unrecovered `begin` failure resets `started`/`ready`. A test executes the actual save callback against a retained serialized slot: incomplete/failed entry cannot write, completed ready entry can. Integrated recovery keeps its stronger outer action/rollback/hydration guards. An explicit Return after successful coherent field hydration may commit the confirmed new-game checkpoint, consistent with the replacement warning. Browser pagehide/Retry playback remains pending.
2. **Stage aspect:** the stage width is constrained by both viewport dimensions while height derives solely from4:3; there is no independent max-height clamp. Oak's52-unit displacement and Marill now share the same uniformly scaled256×192 area. Exact original slide direction and actual mobile framing still need rendered/emulator comparison.
3. **Cursor/focus:** one explicit cursor owns keyboard, focus, click and highlight state. The opening opts out of generic queued first-button focus, which otherwise could override the remembered Girl selection. Tests exercise confirmation before deferred focus, arrows, explicit focus, clicks and the default UI focus opt-out.
4. **Understood labels:** corrected to61/62 in6b6af53; other Yes/No menus retain47/48.
5. **Shrink:** all16 required portrait/choice/cell images are decoded before new-game dialogue starts; a decoding failure rejects preparation. Full-size gender portrait is held30 frames before four9-frame originals. Palette/fade timing remains missing.
6. **Exporter:** unsupported NSBMA28 is no longer attributed as a conversion input. Existing title output requires preserved provenance and the actual57-channel native joint clip is checked. Added assertions reject nonzero BG palette banks, affine/double-size OAM and a non-indexed logo instead of silently misdecoding them. Native disjoint ball/Marill cell sets are asserted; palette overwrite semantics and actual red/white pixels have a regression test. Full optional conversion and art-only regeneration both succeeded.

The actual title asset has a SkinnedMesh, so owned Skeleton bone textures are now disposed exactly once too. The title stage is released on the first non-title scene. Native title lighting/aspect, exact browser timing, legacy/incompatible save handling and original movie/hardware/effect gaps remain open, with no Verified promotion. Current startup guard protects valid existing v2 saves; it does not create a legacy-save migration or corrupt-save recovery system.
