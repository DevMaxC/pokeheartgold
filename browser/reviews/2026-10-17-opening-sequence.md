# Opening-sequence implementation and remaining parity gaps

Implementation base: `081c5ec`. This change implements the original Oak dialogue branches, character choice and name rejection loops with native artwork and an original model. It does not establish full title, introduction, startup-state or full-game parity. No requirement is promoted to Verified.

## Exact source map

| Source | Original behavior | Browser implementation/evidence |
| --- | --- | --- |
| `src/main.c:72–81`, `src/intro_movie.c:39–45,79–114,163` | Five-scene opening movie precedes the title. | Movie remains missing; browser begins at title. |
| `src/title_screen.c:137–185,350,690–767` | Ho-Oh title, native placement/camera script, cry, A/Start/touch, idle return, erase-save chord and microphone test. | Original Ho-Oh model at `(30,95,0)`, original joint clip, source camera/translation, logo/background and cry. Enter/F/Space/touch/click starts. Remaining title behaviors below are missing. |
| `src/application/main_menu/main_menu.c:596–604,881–920,1391–1395` | Existing save offers Continue/New Game; warning says a new session cannot save. Without a save, New Game starts automatically. Continue summary includes player/time/badges/caught, with caught gated by the Pokédex. | Imported bank442 labels and gated summary; no-save automatically opens the introduction. Browser has one slot, with an explicit truthful replacement warning before starting a draft. Native restriction is not reproduced. |
| `src/oaks_speech.c:1526–1799` | Topic menu7 and choices44/45/46; CONTROL pages9/10/11/12/23/25/13/14/15/16/17/26; No repeats, Yes returns to topics. ADVENTURE28..33 returns to topics. | `runOakIntroduction` preserves branch order using imported219 messages. Message25 is a code-only confirm exercise, represented by an actual browser Continue action. Original DS hardware wording remains accompanied by actual browser-control guidance. |
| `src/oaks_speech.c:1477–1494` | Five RTC greetings: midnight–03:59,04:00–10:59,11:00–15:59,16:00–18:59,19:00–23:59. These differ from field daylight boundaries. | Exact local RTC windows in `oakGreetingMessage`; boundary tests. |
| `src/oaks_speech.c:1800–1906`, `src/oaks_speech_obj.c:76–95` | Oak6, slide,34, native ball/Marill sequences and cry,35, hide,36. Sprite anchor160,80. | Native Oak BG and Marill NCER/OAM/NANR cells/frames; original cries. Controller effects awaited in original order. SVG attributes and cell-anchor projection have focused tests. Rendering/timing remains visually unverified. |
| `src/oaks_speech.c:1907–2059` | Gender37, confirmation38/39, name40, confirmation41/42. Gender No retries gender. Name No also returns to gender, retaining last gender cursor and clearing name entry. | Tested exact rejection loops, cursor memory and empty naming input. Original boy/girl choice portraits. |
| `src/naming_screen.c:254–282,645–712`, `include/constants/global.h` | Native English keyboard, seven player glyphs; blank/all-space names use the18 HeartGold defaults per gender. Custom case and meaningful spaces retained. | Native mapped English glyph set, three keyboard pages and seven-glyph bound; blank defaults come from imported bank254 entries0..17/18..35. ASCII apostrophe maps to its native curly glyph. Tests exercise every default and invalid glyph rejection. |
| `src/oaks_speech.c:2067–2148` | Final43, gender-specific shrinking art, then field handoff. | Original four shrink backgrounds per gender, awaited before constructing the new State. Intro returns a draft identity only. |
| `src/overlay_36.c:180–260`, `src/location_backup.c:10–16`, `src/field_warp_tasks.c:410–413` | Initialize save, room, money3000, fishing record56150, flag960, trainerID, RTC/system records, PC mail, initial scripts and play time. | Existing `newState`/field startup is reused. No State/VM/mail migration in this branch. Missing startup fields/flags remain gaps. |
| `src/options.c:18–27` | Mid text speed, stereo, Shift battle style, scenes on, normal buttons, frame1. | Introduction uses a mid-speed typewriter; existing field dialogue remains instant by default. Full native options/settings remain incomplete. |

## Save boundary

`runOpeningSession` keeps the existing State intact while choices and animations operate on a draft. Continue bypasses intro/default-name preparation. A rejected replacement confirmation returns to the menu. Only a successfully completed final shrink invokes `newState`; the existing `begin` path then performs field entry and saving. `save()` already ignores pagehide while `started` is false, so leaving during the introduction does not persist its draft.

Controller tests cover Continue, replacement cancellation, failed asset preparation, an awaited final shrink, a separate resumed Continue while the draft is pending and a rejected final effect. These are repeatable offline behavior checks. Browser reload/pagehide/storage behavior, field entry failures and actual rendered interactions still require integration verification; they are not inferred from the controller tests.

The browser uses one localStorage key per normal/QA mode. It has no independent adventure slots. Its agreed adaptation allows the newly confirmed adventure to replace the slot after character creation; the DS instead prohibits saving a new session while an old save exists. The warning states the browser behavior and never copies the native prohibition falsely.

## Asset provenance and regeneration

`public/source/opening/assets.json` records original-file SHA256 hashes, exact NCGR/NCLR/NSCR portrait sources, NCER cell bounds and NANR transforms, source PCM hashes and unsupported title effects. The2D decoder uses original indices, tile flips, palettes and OAM entries; it does not redraw the art. Sprite palette overrides replace the OAM palette nibble (`src/sprite.c:368–373`, `lib/NitroSystem/src/g2d_renderer.c:75`); a decoded-pixel regression protects the red/white ball from a double palette offset. Ho-Oh is converted from original NSBMD/NSBCA/NSBTA/NSBTP via apicula. The invalid targetless material-animation clip is excluded; valid57-channel native joint animation remains. Marill183 and Ho-Oh250 cries retain exact mono PCM8 sample data at10512Hz, wrapped in WAV for browser playback.

Recreate the complete export from the repository root with Python containing Pillow+ndspy and a built apicula:

```sh
python browser/scripts/export_opening_assets.py --title-model --audio --apicula /path/to/apicula
```

Without optional flags, the script regenerates2D artwork and preserves existing optional artifacts' original provenance. It does not silently rehash old conversions against changed native inputs.

## Validation and limits

- `node --experimental-transform-types --test src/source/opening*.test.ts`:21 tests pass after the final source/DOM/resource/palette fixes. Covers native branches and save boundary, exact art/audio provenance, native joint animation matrices, camera script, SVG visibility/projection, decoded ball colors, typewriter paging and partial-load resource cleanup.
- `npx tsc --noEmit`: passes.
- Full `npm test`:184/184 pass at checkpoint `eacc233`, including20 opening tests. The subsequent bounded palette/Control Info label correction passes all21 current opening tests and TypeScript; no claim of a second full-suite run.
- Decoded Oak/Marill/title artwork was inspected as local PNGs. Those inputs are not browser-rendered screenshots.
- No Vite build or browser automation was run for this branch. The preview host is disconnected; actual title framing, mobile layout, audio timing, focus/navigation and save/reload gameplay remain unverified.

Still missing: five-scene boot movie; title material/pattern/palette playback(NSBTA/NSBTP/NSBMA28); separate sparkle model38..40; native title/tutorial/Oak BGM and transition sound effects; idle2340-frame movie return; original erase-save chord/microphone/hardware menus; DS dual-screen layouts, tutorial button artwork and exact palette/fade timing; shared save initialization fields, flag960, fishing record, trainerID, RTC/system data and PC mail. Source wording and imported assets alone do not establish equivalence for these systems.
