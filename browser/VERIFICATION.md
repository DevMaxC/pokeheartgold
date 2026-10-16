# Source runtime verification

## Automated checks

- `npm test`: 110 tests pass, including every imported prop/landscape geometry and all 540 map headers’ geometry/data references.
- Shared renderer audit: 946 prop contexts and 648 landscapes load and repair without invalid vertices. 668 structural assets receive closure geometry; 195 landscapes receive camera-facing trees. The same audit covers 103 solid-fence, 44 flower-volume and 395 terrain-closure contexts, plus 43 remaining upright-cutout contexts. Instance matrices and vertices stay finite. This is a geometry audit, not a visual approval of every asset.
- Renderer regression fixtures cover one-sided façades, planar prop thickness, a disconnected mailbox, rear closure behind a front doorway, preservation of closed volumes/shadows and original tree height/pivot.
- Repeated forest art is split into individual original-tree sprites using exported trunk layouts. A four-tree row has four separate instance pivots, aligned with its ground marks; source alpha foot offsets keep trunks on the ground. Flipped/rotated UVs, mixed-mesh shadows, rear backing depth and blended material depth settings have regression coverage.
- Source opening fixtures execute 17 original quest phases through the catching demonstration for both genders and all three starters: mother/Marill/Elm, starter/aide gifts, guide/Running Shoes/Map Card, Apricorn Box, Mr. Pokémon/Oak/Mystery Egg, emergency call, rival/naming/police, Egg delivery and mother savings. These fixtures model movement and stub battles, UI choices and the tutorial; they prove exercised script state, not a fresh-save browser playthrough. Both first-rival outcomes and the savings-No branch are covered.
- Hidden/variable-sprite NPCs retain logical position before becoming visible, across refresh and Continue. Movement failures retain the script lock until outstanding movement finishes. Bag operations respect source stack/pocket limits atomically; Ball-pocket identity excludes Smoke/Light/Iron Balls.
- Native trainer PID/IV/team generation and first-rival prizes are covered. Battle regressions check victory rendering against the last opponent, rollback/rejection of unsupported effects, and identical damage/PP/EXP/results with presentation enabled or disabled.
- Encounter fixtures check the first-three-step inhibition, independent source movement/table rolls, reverse-turn boosts and all 100 weighted land-slot outcomes. Ability, flute, held-item, radio, repel and special-encounter modifiers remain pending.
- Original blocked-door permissions require a matching north-facing door warp. Nurse Joy Yes/No fixtures execute the native service, restoring HP/status/PP only after acceptance. Field clock boundaries and all five card-star achievements use the source rules.
- Grass geometry is deterministic and restricted to walkable source tall/very-tall grass; floor, cave and blocked tiles receive no clumps. Fence/flower fixtures cover horizontal fence pieces, fixed post roots, crossed flower depth and opaque open-hill backs.
- Pokémon fixtures check original level-5 starter moves/PP, Gen IV Tackle data, stat rounding, Steel’s Gen IV resistances and integer capture bounds.
- TypeScript and Vite production build pass. Both production HTML entry points use the source runtime.

- Flat furniture audit: all 40 native stool, pedestal-seat, bench, cushion and matching box texture variants have closed opaque geometry within their original footprints. Raised seats have floor-reaching supports; floor cushions remain low. Source textures and shadows are retained. Rotated/scaled root and idempotence regressions pass. Native 3D sofas are excluded.

## Browser checks

Using the shared browser on the local build:

- New Bark Southwest House: all four source stools have raised seats and real supports, viewed from the front and side. Room props and character interaction positions retain their source layout.

- Fresh name/gender flow into original bedroom map 64 at tile 6,6.
- Bedroom stairs into original downstairs map 63; mother’s original scene completes and grants the original menu unlocks.
- Separate QA save leaves ordinary player progress untouched.
- Targeted browser checkpoints (separate QA storage): native starter device → Cyndaquil with original confirmation/nickname choice → aide’s five Potions; first rival encounter → real battle turns, EXP/level-up, ₽500 and saved source scene 4. The 3D presentation was also exercised in this real rival battle.
- Route 29 catching scene runs Marill level 5 versus Rattata level 2 in the actual field geometry, throws a 3D Poké Ball, restores the player’s party/inventory and grants five Balls via the original script.
- Battle camera orbit checked without HP/world-position changes; front/back art changes with viewpoint. Desktop 1280×800 and mobile 390×844 were inspected; all four commands remain on screen. Mobile camera distance adjusts to fit the fighters. Vertical drag/scroll share the field-camera controls.
- Cherrygrove Center: walk through the original blocked door tile into map 69, approach the counter, accept Nurse Joy’s original dialogue, restore HP/status/PP, and leave through the original return warp.
- Follower movement sampled halfway through a step: follower Z 391.9048 between 391.5 and 392.5, then exactly 392.5 at completion; no instantaneous tile jump.
- Route 29 previously grey background cells now display the original forest and hills (19 loaded cells at this fixture). Long grass has visible volume. Cherrygrove fence rails/posts and fuller flower beds inspected in the live field. Hill closures retain original visible faces and add textured opaque backing.
- Original New Bark home, Elm’s lab/mailbox, neighboring house, sign and trees inspected from front, rear and sides with the same loader used by the game. Rear façades remain opaque; flat trees remain upright as the camera changes direction.

## 3D sky and source weather

- A procedural gradient sky, solid stepped cumulus clouds, illustrated sun/moon and twinkling stars extend the source artwork into the free camera. Local clock palettes tint both ordinary field materials and the original camera-facing tree shaders. Original indoor/cave exclusions include the outdoor Mount Silver summit exception.
- Header weather selects rain, snow, diamond dust and mist. The native dispatch is used for the incomplete weather constants: ID 4 is snow and ID 7 uses the Sunny task. Original summit dates and post-Rocket Wednesday Lake of Rage weather have source-backed fixtures. GetWeatherType reads the active field effect; Flash/Defog flags and FlashEffect have explicit handlers rather than being silently skipped. Native cave darkness and Flash lighting still need restoration.
- Browser QA inspected Cherrygrove clear/sunset/night, original Route 33 rain and original Sinjoh exterior snow. A real first-rival battle in sunset lighting completed with EXP/level-up and source scene 4. Geometry/tint/clock/weather fixtures pass; original audio, lightning, RTC penalties, battle weather modifiers and every weather location remain pending.
- Repeated forest variants ending in `_re_lm1` now load the original complete individual tree image, including the native `tree01gs_lm1` naming variant. Ground-mark matching also handles lightmap suffixes. Regression fixtures cover both ordinary and lightmap repeated rows; all repeated manifest entries resolve to individual artwork.
- The preceding deployed 3D battle milestone was checked live: the original first rival battle produced a real level-up, prize and saved source scene; Cherrygrove Center entry, counter dialogue, HP/PP restoration and return exit also passed on production.

## Known gaps

The complete story and world have not received a fresh-save end-to-end playthrough. Individual imported maps still require warp, NPC/event and progression verification. Dynamic warp-return destinations, movement/puzzle details, ambient NPC movement, the full follower system, Pokégear, PC/shops and advanced service variants, field items, evolution, many battle effects/AI and original audio remain incomplete. Eight Apricorn-tree sprite variants have unresolved source palette references. The 3D battle staging uses generic physical lunges, special projectiles and status/hit effects; move-specific animations, species scale, every environment, trainer identity in crowded scenes and shiny/form artwork still need verification.

Basic single battles have enemy turns, move/PP selection, type/stats, status/stage effects, switching, basic balls, EXP/level-up and familiar commands. These are partial implementations. Unported move effects stop explicitly; advanced effects, AI, ball modifiers and several progression consequences are not yet faithful.

The 3D repair synthesizes surfaces absent from DS assets. Missing rear walls use source sidewall cladding over opaque sections identified from original doorway positions; no original rear artwork exists for those surfaces. Combined nearby header warps preserve real two-sided gate entrances. Stacked wall bands remain continuous and roof slopes are excluded from the wall outline. All original front art and source coordinates are retained. Camera-facing trees are the intended paper-style presentation. Fence posts/rails and grass blades are new 3D geometry placed from source runs/permissions; flower bunches use crossed original art. New cliff backing uses original rock textures over opaque skirts. These presentation additions do not alter collision or encounter boundaries. Species scale, crowded scenery intersections and the full set of newly exposed terrain angles still need broader visual checks.

## Original battle palettes

`files/poketool/pokegra/pokegra.mk` extracts the normal palette from the front PNG and the shiny palette from the back PNG. The browser exporter now applies the normal palette to both facings, preserving the original indexed pixels across 1,972 exported images. Rendering a back PNG with its embedded palette incorrectly made normal Pokémon shiny. Actual shiny identity remains unimplemented.

## Connected headers and building rears

- Connected outdoor headers now stream without running camera-entry placement, showing an entry overlay, clearing held movement or resetting the follower onto the player. Actual room warps translate the existing camera offset and target together; angle and preferred zoom remain intact.
- A held-input browser crossing from original Cherrygrove to Route 29 retained yaw 0.9, pitch 0.61 and distance 17. The loading overlay was never shown; the first Route 29 sample kept the follower at the preceding tile. Three camera fixtures cover initial placement, nearby connected headers and distant real warps.
- Actual imported Cherrygrove Center, Mart and house models block rear sight lines before the front wall. Original-texture model renders confirm the house rear is continuous cladding, including the former doorway opening, with horizontal bands and the original roof retained. Split wall bands, opaque texture settings, world transforms, neighbouring corner doors and opposing entrances have regression fixtures. This is targeted evidence, not visual certification of all building variants.
- The reported rock, black cut-out, shoreline and floating forest cases received the repairs and targeted checks recorded below. All building/scenery variants and genuine ledge terraces/jumps still require further verification or implementation.

## Scenery semantics audit and Opus 5.5 review

- Claude Opus 5.5 completed the requested read-only codebase review. The CLI model usage confirms `claude-opus-5-5`; 130 turns inspected the rendering/field runtime, exporters, sampled metadata and native C references. The report and its explicit coverage limits are retained in `reviews/2026-10-15-opus-5.5.md`. It did not execute tests or inspect the browser.
- Textured terrain backs now include source vertex colours. The missing attribute caused the black rectangles in the actual Cherrygrove coast; a renderer toggle reproduced/removes those rectangles, and the complete imported-geometry audit now checks the material/attribute contract.
- Each native rock card receives a separate closed faceted volume with depth. Original opaque sprite pixels extend into transparent margins to texture that volume without rectangular backings or alpha holes. The actual coast yields 32 separate rocks; adjacent-card, closed-edge and four-direction ray fixtures pass. Native XY placement, tile collision and water encounters are retained. Other material families such as `allpeak` remain part of the wider cut-out audit.
- Shore backing follows original sand (33) and shallow-water (23) permissions below the original surf/sand art. Deep sea and blocked tiles remain excluded. Actual coastline close-side and elevated model renders confirm continuous sand behind the former blue seam.
- Matrix background forest steps receive native cliff sides. The additional floating strip was traced to the actual Route 30 `land/7-2` tree-ground platform extending outside its cell at y=5 over surrounding y=1 ground. Raised authored tree-ground patches now receive cliff sides too, preserving native positions. A streamed Cherrygrove scene renders these changes alongside real buildings and adjacent maps.
- The foliage exporter groups forked root runs using each canonical individual tree. Forked roots form one tree, while measured off-centre trunks and genuine numbered composite images are preserved. Ecruteak repeated variants describe two trees rather than four roots; numbered water-tree/bush composites also resolve to two individual images with canonical foot-U offsets.
- Building rears now use a compact, immutable manifest of 666 directional source entrances across 280 matrices. Original door/gate behaviours select the façade; non-directional warps cannot choose a façade but remain safeguards against sealing real passages. This removes the loaded-window dependency and corner-bound ambiguity identified during review. All building variants still require broader visual approval.

Remaining review work includes cut-out outline handling for additional hill materials, original non-white fence palettes, more robust non-quad topology handling, remaining special warp effects and overlay/menu resume paths, native ledge jumps/heights, encounter terrain coverage and toxic counters. These remain incomplete rather than being counted as fixed by the geometry checks.

## Follow-up review corrections

- 93 tests pass. The actual texture-presence audit now exercises 3,622 textured terrain backs using map placeholders; source pixel decoding remains a browser check. Off-centre trunk/image offsets, true numbered multi-tree textures, stray rock triangles and cap UV locality have regression fixtures.
- Export reports 666 directional entrances and 430 additional passage safeguards, with zero missing-cell warps. Unknown-facing source exits preserve real passages without selecting a building front.
- The snapshot review and adjudication are in `reviews/2026-10-16-scenery-followup-opus-5.5.md`. Publication of the scenery batch was held while its confirmed foliage, pairing, UV and cache issues were corrected.

## Native field transitions and streaming

- `field_control.c` distinguishes automatic step warps from pushing east/west/south exits and warp stairs. Coordinate events precede step transitions. The browser preserves transition facing; warp stairs finish on their native anchor facing away from the stair wall, following `FieldTransition_PlaceOffWarpStairs` and its return movement. Stair arrival animation itself remains simplified. Exterior door exits take the original southward step clear of the doorway.
- Actual Center QA: enter north to map 69 at (8.5,19.5); walk east off the exit mat and west back onto it without warping; push south to return to Cherrygrove at (564.5,392.5) after the door step-out; immediately re-enter north. No runtime errors. Original bedroom/downstairs stairs work in both directions, ending at source anchors facing east.
- Connections run only OnTransition. True map rebuilds run OnTransition → OnLoad → OnResume; frame scenes defer until warp arrival placement is complete. Normal battle and catching-demo returns rebuild through OnLoad → OnResume. Blackout spawn updates stay on non-connection entries. Other overlay/menu resume paths and special transition effects still require work.
- Fresh source state, separate QA storage: walk from original bedroom (6.5,6.5) down the source stairs. Mother’s original scene completes, sets house scene 1, and unlocks Bag, Trainer Card, Save and Options. This checks the revised runtime ordering beyond the existing stubbed opening-quest fixtures.
- Headerless matrices are geometry templates, not room identity. Twenty-four Centers share matrix 73; there are 27 shared headerless matrix families in the source. Switching from actual Cherrygrove Center to Violet Center in one OriginalWorld changes ownership from 69 to 81 and releases old cells. Connected header matrices retain their world cells.
- Field prefetch follows the latest cell without awaiting distant downloads in the walking lock. Late cleanup preserves cells near the current player when backtracking. An actual held-input Cherrygrove → Route 29 crossing advanced four tiles in 1.31 seconds while three source fetches were delayed six seconds; zero entry-overlay activations, no error, follower one tile behind, chosen yaw 0.9/pitch 0.61/zoom 17 retained.
- Camera obstruction queries ignore hidden meshes and decorative vegetation instances while retaining buildings and opaque hills. In the measured 18-cell New Bark view, the same camera ray took 49.2 ms recursively and 2.1 ms with filtering (including candidate traversal). This is one view/device measurement, not a general frame-rate guarantee. Regression rays also confirm a hidden parent cannot cause an early collision.
- Failed scenery downloads leave caches retryable. Partial cells wait for outstanding prop loads before releasing their resources; streamed skeleton textures are disposed without disposing shared template geometry/materials or other cells. These failure/retry and resource-ownership paths have integration fixtures.
- 107 tests pass. Native streaming/room integration fixtures import OriginalWorld directly; the Node 22 test command now enables TypeScript transformation for constructor parameter properties. Production rendering still uses the existing Vite build.

## Native field review corrections

- A scoped Claude Opus 5.5 review of head `6b9b7c9` found omitted north/south ladder pushes, arrival-warp suppression surviving a coordinate-event early return, incomplete battle-return phases, and a conditional shared-room retry risk. The report and adjudication are in `reviews/2026-10-16-native-field-opus-5.5.md`.
- North/south ladders now push in their original direction even with clear floor ahead. The imported source contains 166 warp events on those behaviours. Warp suppression clears before coordinate-event processing when the player leaves an anchor.
- Actual browser ladder check: Slowpoke Well B2F map 181 at (13.5,20.5), north push over clear ladder floor → B1F map 177 at (27.5,20.5), with no runtime error. This exercises the native warp table through the game input path.
- Battle returns run OnLoad before OnResume, matching the rebuilt native field overlay. Matrix/room changes reset the stream key; a failed matrix download never marks the old matrix as the new one. Shared-room retry and matrix failure fixtures pass.
