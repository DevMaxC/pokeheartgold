# Source runtime verification

## Automated checks

- `npm test`: 54 tests pass, including every imported prop/landscape geometry and all 540 map headers’ geometry/data references.
- Shared renderer audit: 946 prop contexts and 648 landscapes load and repair without invalid vertices. 675 structural assets receive closure geometry; 195 landscapes receive camera-facing trees. This is a geometry audit, not a visual approval of every asset.
- Renderer regression fixtures cover one-sided façades, planar prop thickness, a disconnected mailbox, rear closure behind a front doorway, preservation of closed volumes/shadows and original tree height/pivot.
- Repeated forest art is split into individual original-tree sprites using exported trunk layouts. A four-tree row has four separate instance pivots, aligned with its ground marks; source alpha foot offsets keep trunks on the ground. Flipped/rotated UVs, mixed-mesh shadows, rear backing depth and blended material depth settings have regression coverage.
- Source opening fixtures execute 17 original quest phases through the catching demonstration for both genders and all three starters: mother/Marill/Elm, starter/aide gifts, guide/Running Shoes/Map Card, Apricorn Box, Mr. Pokémon/Oak/Mystery Egg, emergency call, rival/naming/police, Egg delivery and mother savings. These fixtures model movement and stub battles, UI choices and the tutorial; they prove exercised script state, not a fresh-save browser playthrough. Both first-rival outcomes and the savings-No branch are covered.
- Hidden/variable-sprite NPCs retain logical position before becoming visible, across refresh and Continue. Movement failures retain the script lock until outstanding movement finishes. Bag operations respect source stack/pocket limits atomically; Ball-pocket identity excludes Smoke/Light/Iron Balls.
- Native trainer PID/IV/team generation and first-rival prizes are covered. Battle regressions check victory rendering against the last opponent, rollback/rejection of unsupported effects, and identical damage/PP/EXP/results with presentation enabled or disabled.
- Encounter fixtures check the first-three-step inhibition, independent source movement/table rolls, reverse-turn boosts and all 100 weighted land-slot outcomes. Ability, flute, held-item, radio, repel and special-encounter modifiers remain pending.
- Pokémon fixtures check original level-5 starter moves/PP, Gen IV Tackle data, stat rounding, Steel’s Gen IV resistances and integer capture bounds.
- TypeScript and Vite production build pass. Both production HTML entry points use the source runtime.

## Browser checks

Using the shared browser on the local build:

- Fresh name/gender flow into original bedroom map 64 at tile 6,6.
- Bedroom stairs into original downstairs map 63; mother’s original scene completes and grants the original menu unlocks.
- Separate QA save leaves ordinary player progress untouched.
- Targeted browser checkpoints (separate QA storage): native starter device → Cyndaquil with original confirmation/nickname choice → aide’s five Potions; first rival encounter → real battle turns, EXP/level-up, ₽500 and saved source scene 4. The 3D presentation was also exercised in this real rival battle.
- Route 29 catching scene runs Marill level 5 versus Rattata level 2 in the actual field geometry, throws a 3D Poké Ball, restores the player’s party/inventory and grants five Balls via the original script.
- Battle camera orbit checked without HP/world-position changes; front/back art changes with viewpoint. Desktop 1280×800 and mobile 390×844 were inspected; all four commands remain on screen. Mobile camera distance adjusts to fit the fighters. Vertical drag/scroll share the field-camera controls.
- Original New Bark home, Elm’s lab/mailbox, neighboring house, sign and trees inspected from front, rear and sides with the same loader used by the game. Rear façades remain opaque; flat trees remain upright as the camera changes direction.

## Known gaps

The complete story and world have not received a fresh-save end-to-end playthrough. Individual imported maps still require warp, NPC/event and progression verification. Dynamic warp-return destinations, movement/puzzle details, ambient NPC movement, the full follower system, Pokégear, PC/shops/healing services, field items, evolution, many battle effects/AI and original audio remain incomplete. Eight Apricorn-tree sprite variants have unresolved source palette references. The 3D battle staging uses generic physical lunges, special projectiles and status/hit effects; move-specific animations, species scale, every environment, trainer identity in crowded scenes and shiny/form artwork still need verification.

Basic single battles have enemy turns, move/PP selection, type/stats, status/stage effects, switching, basic balls, EXP/level-up and familiar commands. These are partial implementations. Unported move effects stop explicitly; advanced effects, AI, ball modifiers and several progression consequences are not yet faithful.

The 3D repair synthesizes surfaces absent from DS assets. Missing rear walls use mirrored source façade artwork plus solid backing; no original rear artwork exists for those surfaces. All original front art and source coordinates are retained. Camera-facing trees are the intended paper-style presentation.

## Original battle palettes

`files/poketool/pokegra/pokegra.mk` extracts the normal palette from the front PNG and the shiny palette from the back PNG. The browser exporter now applies the normal palette to both facings, preserving the original indexed pixels across 1,972 exported images. Rendering a back PNG with its embedded palette incorrectly made normal Pokémon shiny. Actual shiny identity remains unimplemented.
