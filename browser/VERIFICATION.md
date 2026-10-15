# Source runtime verification

## Automated checks

- `npm test`: 24 tests pass, including every imported prop/landscape geometry and all 540 map headers’ geometry/data references.
- Shared renderer audit: 946 prop contexts and 648 landscapes load and repair without invalid vertices. 675 structural assets receive closure geometry; 195 landscapes receive camera-facing trees. This is a geometry audit, not a visual approval of every asset.
- Renderer regression fixtures cover one-sided façades, planar prop thickness, a disconnected mailbox, rear closure behind a front doorway, preservation of closed volumes/shadows and original tree height/pivot.
- Source opening fixtures execute the original mother scene, starter-device script and shared item-gift script. They check menu flags, scene variables, exactly one level-5 starter and correct item quantity. Unsupported commands halt before subsequent story mutation.
- Encounter fixtures check the first-three-step inhibition, independent source movement/table rolls, reverse-turn boosts and all 100 weighted land-slot outcomes. Ability, flute, held-item, radio, repel and special-encounter modifiers remain pending.
- Pokémon fixtures check original level-5 starter moves/PP, Gen IV Tackle data, stat rounding, Steel’s Gen IV resistances and integer capture bounds.
- TypeScript and Vite production build pass. Both production HTML entry points use the source runtime.

## Browser checks

Using the shared browser on the local build:

- Fresh name/gender flow into original bedroom map 64 at tile 6,6.
- Bedroom stairs into original downstairs map 63; mother’s original scene completes and grants the original menu unlocks.
- Separate QA save leaves ordinary player progress untouched.
- Original New Bark home, Elm’s lab/mailbox, neighboring house, sign and trees inspected from front, rear and sides with the same loader used by the game. Rear façades remain opaque; flat trees remain upright as the camera changes direction.

## Known gaps

The complete story and world have not received a fresh-save end-to-end playthrough. Individual imported maps still require warp, NPC/event and progression verification. Dynamic warp-return destinations, movement/puzzle details, ambient NPC movement, the full follower system, Pokégear, PC/shops/healing services, field items, evolution, many battle effects/AI and original audio remain incomplete. Eight Apricorn-tree sprite variants have unresolved source palette references.

Basic single battles have enemy turns, move/PP selection, type/stats, status/stage effects, switching, basic balls, EXP/level-up and familiar commands. These are partial implementations. Unported move effects stop explicitly; advanced effects, AI, ball modifiers and several progression consequences are not yet faithful.

The 3D repair synthesizes surfaces absent from DS assets. Missing rear walls use mirrored source façade artwork plus solid backing; no original rear artwork exists for those surfaces. All original front art and source coordinates are retained. Camera-facing trees are the intended paper-style presentation.
