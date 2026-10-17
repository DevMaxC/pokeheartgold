# HeartGold 3D parity ledger

Source baseline: `d7886a5`. This ledger defines the requested full-game destination; it does not declare the current browser build complete. Imported assets/data, implemented behavior, and verified original-game parity are separate states.

Inventory: **295 system requirements, 540 map headers, 832 script/movement command names**. The machine-readable files in `parity/` retain per-map and per-command gaps. Every species, move, item, trainer and encounter remains governed by its original source data, not a hand-picked substitute.

## Completion standard

- Pending: missing or not audited. Implemented: behavior exists but original-game equivalence is not established. Verified: a repeatable source-backed fixture or gameplay check confirms the behavior. Unsupported: an identified gap; never silently skip it.
- Map parity requires original mesh, textures, tile permissions, elevations, prop transforms, warps, NPC/event coordinates, and story conditions. A recreated town shape is insufficient.
- Battle parity requires the original turn rules, damage/status/move/item/ability behaviors, trainer teams/AI, and progression consequences. A catch-only screen is insufficient.
- End-to-end completion requires a fresh save through Red and the listed postgame/special systems, with inventory, party and flags surviving save/reload. Imported content and isolated menus do not satisfy this.
- Connectivity/hardware-dependent systems must be implemented and tested against an explicit browser equivalent; unavailable original services must stay marked unsupported until that equivalent is agreed and working.
- Production changes must be committed, merged into the fork default branch, deployed from that commit, and checked on the live site.

## Implementation sequence

1. Import original matrices, landscape/prop meshes, permissions, headers, event tables, messages, Pokémon/moves/items/trainers and script instruction lists. Validate IDs and cross-references.
2. Replace invented layout and visible-wild encounters. Render the original world, enter original buildings, and use original tile terrain for collisions and random encounters.
3. Implement identity, opening bedroom/mother/lab sequence, starter acquisition and the complete Mr. Pokémon/rival/catching-tutorial loop with original event state.
4. Implement familiar turn-based battles and party/bag/healing/storage services with formula and move-effect tests.
5. Expand generic script-command support and progress location by location through Johto, the League, Kanto and postgame. Test each dependency and prevent sequence breaks.
6. Complete side systems, connectivity equivalents, audio, options, and the full fresh-save regression playthrough.

## System requirements

### Opening and identity

| ID | Requirement | Status | Source |
| --- | --- | --- | --- |
| P01-001 | New Game and Continue with explicit save-replacement rules | Implemented | `src/intro.c` |
| P01-002 | Original title and introduction sequence | Pending | `src/intro.c` |
| P01-003 | Professor Oak introduction and Pokémon demonstration | Pending | `src/intro.c` |
| P01-004 | Boy/girl player selection and matching overworld sprites | Implemented | `src/intro.c` |
| P01-005 | Character naming, length limits, confirmation and name substitutions | Implemented | `src/intro.c` |
| P01-006 | Original starting bedroom, spawn position and facing | Verified | `src/intro.c` |
| P01-007 | Bedroom stairs, PC, Wii and interactive scenery | Pending | `src/intro.c` |
| P01-008 | Mother dialogue, Pokégear acquisition and tutorial | Implemented | `src/intro.c` |
| P01-009 | Clock, weekday, date and daylight cycle | Pending | `src/intro.c` |
| P01-010 | Correct initial money, inventory, flags and Pokédex locks | Implemented | `src/intro.c` |

### Opening story progression

| ID | Requirement | Status | Source |
| --- | --- | --- | --- |
| P02-001 | Lyra/Ethan introduction and Marill scene | Implemented | `files/fielddata/script/scr_seq` |
| P02-002 | New Bark Town exits gated by original story flags | Implemented | `files/fielddata/script/scr_seq` |
| P02-003 | Professor Elm first conversation and Mr. Pokémon errand | Implemented | `files/fielddata/script/scr_seq` |
| P02-004 | Lab starter selection at original device with confirm and cancel | Implemented | `files/fielddata/script/scr_seq` |
| P02-005 | Starter received at level 5, ownership and nickname prompt | Verified | `files/fielddata/script/scr_seq` |
| P02-006 | Opposing starter acquired by rival | Implemented | `files/fielddata/script/scr_seq` |
| P02-007 | Elm contact registration and laboratory healing | Implemented | `files/fielddata/script/scr_seq` |
| P02-008 | Laboratory aide’s original item gift | Implemented | `files/fielddata/script/scr_seq` |
| P02-009 | Mother visit and contact registration before departure | Implemented | `files/fielddata/script/scr_seq` |
| P02-010 | Running Shoes and Cherrygrove guide tour | Implemented | `files/fielddata/script/scr_seq` |
| P02-011 | Map Card and guide return scene | Implemented | `files/fielddata/script/scr_seq` |
| P02-012 | Route 30 NPCs, Apricorn Box and original item gifts | Pending | `files/fielddata/script/scr_seq` |
| P02-013 | Mr. Pokémon house and Mystery Egg | Implemented | `files/fielddata/script/scr_seq` |
| P02-014 | Professor Oak meeting, Pokédex and contact | Implemented | `files/fielddata/script/scr_seq` |
| P02-015 | Elm emergency phone call and return journey | Implemented | `files/fielddata/script/scr_seq` |
| P02-016 | First rival battle at original location with correct team | Implemented | `files/fielddata/script/scr_seq` |
| P02-017 | Police investigation and rival naming | Implemented | `files/fielddata/script/scr_seq` |
| P02-018 | Mystery Egg delivered to Elm | Implemented | `files/fielddata/script/scr_seq` |
| P02-019 | Mother’s money-saving choice | Implemented | `files/fielddata/script/scr_seq` |
| P02-020 | Lyra/Ethan catch tutorial and starter Poké Balls | Implemented | `files/fielddata/script/scr_seq` |
| P02-021 | Route 31 arrival and Violet progression | Pending | `files/fielddata/script/scr_seq` |

### Johto story

| ID | Requirement | Status | Source |
| --- | --- | --- | --- |
| P03-001 | Sprout Tower trainers, elder, rival and rewards | Pending | `files/fielddata/script/scr_seq` |
| P03-002 | Violet Gym puzzle, trainers and Falkner badge/TM | Pending | `files/fielddata/script/scr_seq` |
| P03-003 | Elm aide Egg delivery and Togepi hatching progression | Pending | `files/fielddata/script/scr_seq` |
| P03-004 | Ruins of Alph puzzles, Unown and chambers | Pending | `files/fielddata/script/scr_seq` |
| P03-005 | Union Cave and Route 32/33 progression | Pending | `files/fielddata/script/scr_seq` |
| P03-006 | Azalea Team Rocket occupation, Kurt and Slowpoke Well | Pending | `files/fielddata/script/scr_seq` |
| P03-007 | Azalea Gym puzzle, trainers and Bugsy badge/TM | Pending | `files/fielddata/script/scr_seq` |
| P03-008 | Ilex rival battle and Farfetch’d cut puzzle | Pending | `files/fielddata/script/scr_seq` |
| P03-009 | Cut HM acquisition, badge requirement and field use | Pending | `files/fielddata/script/scr_seq` |
| P03-010 | Ilex Forest shrine, Headbutt tutor and exits | Pending | `files/fielddata/script/scr_seq` |
| P03-011 | Goldenrod City services, Radio Card quiz and Bicycle | Pending | `files/fielddata/script/scr_seq` |
| P03-012 | Goldenrod Gym, Whitney defeat aftermath and Plain Badge | Pending | `files/fielddata/script/scr_seq` |
| P03-013 | SquirtBottle and Sudowoodo roadblock | Pending | `files/fielddata/script/scr_seq` |
| P03-014 | National Park and Bug-Catching Contest | Pending | `files/fielddata/script/scr_seq` |
| P03-015 | Ecruteak Dance Theater, Kimono Girl and Surf | Pending | `files/fielddata/script/scr_seq` |
| P03-016 | Burned Tower rival, legendary beasts and Morty Gym | Pending | `files/fielddata/script/scr_seq` |
| P03-017 | Olivine lighthouse climb and sick Ampharos | Pending | `files/fielddata/script/scr_seq` |
| P03-018 | Cianwood SecretPotion, Chuck Gym and Fly gift | Pending | `files/fielddata/script/scr_seq` |
| P03-019 | Ampharos cured and Jasmine Gym | Pending | `files/fielddata/script/scr_seq` |
| P03-020 | Lake of Rage, Red Gyarados and Lance meeting | Pending | `files/fielddata/script/scr_seq` |
| P03-021 | Mahogany Rocket Hideout switches, passwords and battles | Pending | `files/fielddata/script/scr_seq` |
| P03-022 | Mahogany Gym sliding puzzle and Pryce badge/TM | Pending | `files/fielddata/script/scr_seq` |
| P03-023 | Goldenrod Radio Tower takeover and underground rescue | Pending | `files/fielddata/script/scr_seq` |
| P03-024 | Rocket executives, Radio Tower liberation and version item | Pending | `files/fielddata/script/scr_seq` |
| P03-025 | Ice Path puzzles, Strength boulders and Waterfall | Pending | `files/fielddata/script/scr_seq` |
| P03-026 | Blackthorn Gym, Clair and Dragon’s Den trial | Pending | `files/fielddata/script/scr_seq` |
| P03-027 | Kimono Girls battle sequence and version legendary event | Pending | `files/fielddata/script/scr_seq` |
| P03-028 | HeartGold Bell Tower Ho-Oh story and encounter | Pending | `files/fielddata/script/scr_seq` |
| P03-029 | SoulSilver Whirl Islands Lugia story and encounter | Pending | `files/fielddata/script/scr_seq` |
| P03-030 | Route 27/26, Victory Road and final rival | Pending | `files/fielddata/script/scr_seq` |
| P03-031 | Elite Four Will, Koga, Bruno and Karen | Pending | `files/fielddata/script/scr_seq` |
| P03-032 | Champion Lance and Hall of Fame | Pending | `files/fielddata/script/scr_seq` |
| P03-033 | Credits and postgame unlocks | Pending | `files/fielddata/script/scr_seq` |

### Kanto and postgame

| ID | Requirement | Status | Source |
| --- | --- | --- | --- |
| P04-001 | S.S. Aqua ticket, maiden voyage and missing granddaughter | Pending | `files/fielddata/script/scr_seq` |
| P04-002 | Vermilion arrival and Lt. Surge Gym | Pending | `files/fielddata/script/scr_seq` |
| P04-003 | Power Plant missing part and Rocket investigation | Pending | `files/fielddata/script/scr_seq` |
| P04-004 | Cerulean Misty return and Gym | Pending | `files/fielddata/script/scr_seq` |
| P04-005 | Lavender Radio expansion and Poké Flute | Pending | `files/fielddata/script/scr_seq` |
| P04-006 | Snorlax roadblock and Diglett’s Cave | Pending | `files/fielddata/script/scr_seq` |
| P04-007 | Pewter Brock Gym and fossil museum | Pending | `files/fielddata/script/scr_seq` |
| P04-008 | Cerulean, Saffron Sabrina and Celadon Erika Gyms | Pending | `files/fielddata/script/scr_seq` |
| P04-009 | Fuchsia Janine Gym and Safari relocation | Pending | `files/fielddata/script/scr_seq` |
| P04-010 | Copycat doll, Magnet Train and regional travel | Pending | `files/fielddata/script/scr_seq` |
| P04-011 | Seafoam Blaine Gym and Cinnabar/Blue progression | Pending | `files/fielddata/script/scr_seq` |
| P04-012 | Viridian Blue Gym and 16 badges | Pending | `files/fielddata/script/scr_seq` |
| P04-013 | Oak access to Mt. Silver | Pending | `files/fielddata/script/scr_seq` |
| P04-014 | Mt. Silver traversal and Red battle | Pending | `files/fielddata/script/scr_seq` |
| P04-015 | Gym Leader phone registration and rematches | Pending | `files/fielddata/script/scr_seq` |
| P04-016 | Elite Four rematch teams | Pending | `files/fielddata/script/scr_seq` |
| P04-017 | S.S. Aqua repeat voyages and weekday trainers | Pending | `files/fielddata/script/scr_seq` |
| P04-018 | Steven Hoenn starter and Oak Kanto starter | Pending | `files/fielddata/script/scr_seq` |
| P04-019 | Embedded Tower Groudon/Kyogre/Rayquaza events | Pending | `files/fielddata/script/scr_seq` |
| P04-020 | Cerulean Cave Mewtwo and stationary legendary birds | Pending | `files/fielddata/script/scr_seq` |
| P04-021 | Roaming beasts and roaming Latias/Latios | Pending | `files/fielddata/script/scr_seq` |
| P04-022 | Safari Zone Baoba missions, blocks and time gates | Pending | `files/fielddata/script/scr_seq` |
| P04-023 | Battle Frontier facilities, ranks and rewards | Pending | `files/fielddata/script/scr_seq` |

### World and movement

| ID | Requirement | Status | Source |
| --- | --- | --- | --- |
| P05-001 | Every source map header imported with original IDs | Verified | `src/field/map_load_manager.c` |
| P05-002 | Every source map matrix imported at exact dimensions | Implemented | `src/field/map_load_manager.c` |
| P05-003 | Original landscape mesh geometry and textures | Implemented | `src/field/map_load_manager.c` |
| P05-004 | Original prop models, transforms and placement | Implemented | `src/field/map_load_manager.c` |
| P05-005 | Original tile collision/terrain permissions | Implemented | `src/field/map_load_manager.c` |
| P05-006 | Original elevations, ledges, bridges and stairs | Implemented | `src/field/map_load_manager.c` |
| P05-007 | Seamless outdoor matrix connections at original coordinates | Implemented | `src/field/map_load_manager.c` |
| P05-008 | Every doorway uses original warp destination and anchor | Implemented | `src/field/map_load_manager.c` |
| P05-009 | Interior room layouts and original furniture placement | Implemented | `src/field/map_load_manager.c` |
| P05-010 | Caves, towers, dungeons and multi-floor transitions | Pending | `src/field/map_load_manager.c` |
| P05-011 | Original moving/elevator/warp-panel puzzles | Pending | `src/field/map_load_manager.c` |
| P05-012 | Walking, running and movement rate | Implemented | `src/field/map_load_manager.c` |
| P05-013 | Camera-relative control without changing collision rules | Implemented | `src/field/map_load_manager.c` |
| P05-014 | Free third-person camera with occlusion handling | Implemented | `src/field/map_load_manager.c` |
| P05-015 | Bicycle acquisition, mounting and restrictions | Pending | `src/field/map_load_manager.c` |
| P05-016 | Surf mount, water restrictions and dismount | Pending | `src/field/map_load_manager.c` |
| P05-017 | Waterfall, Whirlpool, Rock Climb and Strength field traversal | Pending | `src/field/map_load_manager.c` |
| P05-018 | Cut trees, Rock Smash rocks and respawn behavior | Pending | `src/field/map_load_manager.c` |
| P05-019 | Fly destinations, Teleport, Escape Rope and Dig | Pending | `src/field/map_load_manager.c` |
| P05-020 | Follower positioning, sprite, dialogue and restrictions | Pending | `src/field/map_load_manager.c` |
| P05-021 | Swimming, sand, snow and terrain-specific presentation | Pending | `src/field/map_load_manager.c` |
| P05-022 | Original signs, hidden objects and inspectable scenery | Implemented | `src/field/map_load_manager.c` |
| P05-023 | Map names, region display and town-map markers | Pending | `src/field/map_load_manager.c` |
| P05-024 | Weather, time-of-day and day-of-week maps/events | Pending | `src/field/map_load_manager.c` |

### NPCs and scripts

| ID | Requirement | Status | Source |
| --- | --- | --- | --- |
| P06-001 | Original NPC sprite and facing from event tables | Implemented | `src/scrcmd.c` |
| P06-002 | Original NPC spawn/hide conditions | Implemented | `src/scrcmd.c` |
| P06-003 | Original dialogue text with player/rival/partner substitutions | Implemented | `src/scrcmd.c` |
| P06-004 | Dialogue pages, confirmations and choice menus | Implemented | `src/scrcmd.c` |
| P06-005 | Facing and distance requirements for interaction | Implemented | `src/scrcmd.c` |
| P06-006 | NPC walking routes, movement locks and cutscenes | Implemented | `src/scrcmd.c` |
| P06-007 | Trainer vision, approach, battle and defeat persistence | Pending | `src/scrcmd.c` |
| P06-008 | Coordinate trigger conditions, priority and one-shot behavior | Implemented | `src/scrcmd.c` |
| P06-009 | Map entry and load scripts | Implemented | `src/scrcmd.c` |
| P06-010 | Persistent script flags and variables | Implemented | `src/scrcmd.c` |
| P06-011 | Script calls, branches, comparisons and return stack | Implemented | `src/scrcmd.c` |
| P06-012 | Inventory/party checks in scripts | Implemented | `src/scrcmd.c` |
| P06-013 | Event item, Pokémon and money grants | Pending | `src/scrcmd.c` |
| P06-014 | NPC phone registration and call outcomes | Pending | `src/scrcmd.c` |
| P06-015 | Multi-character cutscene timing and camera events | Pending | `src/scrcmd.c` |
| P06-016 | Daily, weekly and conditional NPC presence | Pending | `src/scrcmd.c` |
| P06-017 | Every script command implementation tracked against source | Pending | `src/scrcmd.c` |

### Pokémon data and ownership

| ID | Requirement | Status | Source |
| --- | --- | --- | --- |
| P07-001 | All original species and forms with source base stats | Implemented | `src/pokemon.c` |
| P07-002 | Original front/back sprites, sex differences and shinies | Pending | `src/pokemon.c` |
| P07-003 | Original types, abilities and form conditions | Pending | `src/pokemon.c` |
| P07-004 | Trainer ID, secret ID, personality and shiny calculation | Pending | `src/pokemon.c` |
| P07-005 | Original IVs, EVs, natures and stat formulas | Implemented | `src/pokemon.c` |
| P07-006 | Levels, experience curves and experience totals | Implemented | `src/pokemon.c` |
| P07-007 | Gender ratios, friendship and obedience | Pending | `src/pokemon.c` |
| P07-008 | Six-member party limit and party order | Implemented | `src/pokemon.c` |
| P07-009 | Pokémon summary with stats, moves, ability, nature and ownership | Pending | `src/pokemon.c` |
| P07-010 | Four move slots, current PP and PP Ups | Implemented | `src/pokemon.c` |
| P07-011 | Level-up learnsets and move replacement choice | Implemented | `src/pokemon.c` |
| P07-012 | Held items, giving, taking and effects | Pending | `src/pokemon.c` |
| P07-013 | Major status and persistent HP/PP | Implemented | `src/pokemon.c` |
| P07-014 | Nicknames, name rater and language/length constraints | Pending | `src/pokemon.c` |
| P07-015 | Evolution level, trade, item, friendship and special conditions | Pending | `src/pokemon.c` |
| P07-016 | Evolution presentation, cancellation and Pokédex update | Pending | `src/pokemon.c` |
| P07-017 | Egg generation, steps, hatching and inherited data | Pending | `src/pokemon.c` |
| P07-018 | Original starter/gift/trade/static encounter acquisition | Pending | `src/pokemon.c` |
| P07-019 | Release, deposit, withdrawal and PC boxes | Pending | `src/pokemon.c` |
| P07-020 | Pokédex seen/caught, forms, locations and completion | Pending | `src/pokemon.c` |

### Wild encounters and catching

| ID | Requirement | Status | Source |
| --- | --- | --- | --- |
| P08-001 | Random grass encounters on movement; no visible overworld wild encounters | Verified | `src/wild_encounter.c` |
| P08-002 | Original encounter rates, slot weights, species and level ranges | Implemented | `src/wild_encounter.c` |
| P08-003 | Morning/day/night encounter substitutions | Implemented | `src/wild_encounter.c` |
| P08-004 | Version-specific encounter slots | Implemented | `src/wild_encounter.c` |
| P08-005 | Cave and floor-specific encounter tables | Pending | `src/wild_encounter.c` |
| P08-006 | Surf encounters and water levels | Pending | `src/wild_encounter.c` |
| P08-007 | Old/Good/Super Rod timing, tables and failures | Pending | `src/wild_encounter.c` |
| P08-008 | Rock Smash, Headbutt and special encounter tables | Pending | `src/wild_encounter.c` |
| P08-009 | Repel level comparison, depletion and expiry | Pending | `src/wild_encounter.c` |
| P08-010 | Ability, item, weather, radio and swarm encounter modifiers | Pending | `src/wild_encounter.c` |
| P08-011 | Roamers preserve location, HP and status | Pending | `src/wild_encounter.c` |
| P08-012 | Stationary encounters, legendary flags and respawns | Pending | `src/wild_encounter.c` |
| P08-013 | Catch formula, species catch rate and status bonus | Implemented | `src/wild_encounter.c` |
| P08-014 | All Poké Ball modifiers and four shake checks | Pending | `src/wild_encounter.c` |
| P08-015 | Trainer battle capture restriction | Implemented | `src/wild_encounter.c` |
| P08-016 | Caught Pokémon naming and party/box delivery | Implemented | `src/wild_encounter.c` |
| P08-017 | Experience on fainting with Gen IV capture behavior | Pending | `src/wild_encounter.c` |
| P08-018 | Run success, trapping and escape attempts | Pending | `src/wild_encounter.c` |

### Battle core

| ID | Requirement | Status | Source |
| --- | --- | --- | --- |
| P09-001 | Familiar Fight/Bag/Pokémon/Run command menu | Implemented | `src/battle/battle_command.c` |
| P09-002 | Front enemy and back player battle presentation | Implemented | `src/battle/battle_command.c` |
| P09-003 | Correct levels, sex, status, HP bars and names | Implemented | `src/battle/battle_command.c` |
| P09-004 | Four moves with type, PP, category, power and accuracy | Implemented | `src/battle/battle_command.c` |
| P09-005 | Player selects action; opponent selects action each turn | Implemented | `src/battle/battle_command.c` |
| P09-006 | Action order: switch/item priority, move priority, speed and ties | Implemented | `src/battle/battle_command.c` |
| P09-007 | Physical/special/status split and attack/defense formulas | Implemented | `src/battle/battle_command.c` |
| P09-008 | Gen IV damage rounding, random range and minimum damage | Implemented | `src/battle/battle_command.c` |
| P09-009 | STAB and full Gen IV type-effectiveness chart | Implemented | `src/battle/battle_command.c` |
| P09-010 | Critical-hit stages, exceptions and damage behavior | Pending | `src/battle/battle_command.c` |
| P09-011 | Accuracy/evasion stages and move accuracy rolls | Implemented | `src/battle/battle_command.c` |
| P09-012 | Attack/Defense/SpAtk/SpDef/Speed stat stages | Implemented | `src/battle/battle_command.c` |
| P09-013 | Major status burn, paralysis, poison, toxic, sleep and freeze | Implemented | `src/battle/battle_command.c` |
| P09-014 | Confusion, flinch, infatuation and other volatile statuses | Pending | `src/battle/battle_command.c` |
| P09-015 | Residual damage, weather, healing and turn-end order | Pending | `src/battle/battle_command.c` |
| P09-016 | Abilities and move/item suppression conditions | Pending | `src/battle/battle_command.c` |
| P09-017 | Recoil, drain, multi-hit, charge, recharge and rampage moves | Pending | `src/battle/battle_command.c` |
| P09-018 | Protect, priority, redirection, substitutes and screens | Pending | `src/battle/battle_command.c` |
| P09-019 | Weather, hazards, field effects and turn duration | Pending | `src/battle/battle_command.c` |
| P09-020 | Move restrictions, disabled moves, PP exhaustion and Struggle | Pending | `src/battle/battle_command.c` |
| P09-021 | Player and trainer switching, forced switch and pursuit | Pending | `src/battle/battle_command.c` |
| P09-022 | Fainting, replacement, double KO and win/loss detection | Pending | `src/battle/battle_command.c` |
| P09-023 | Original trainer AI, movesets, items and teams | Pending | `src/battle/battle_command.c` |
| P09-024 | Experience sharing, trainer bonus, EVs and level-up | Implemented | `src/battle/battle_command.c` |
| P09-025 | Money rewards, held Amulet Coin and defeat penalties | Pending | `src/battle/battle_command.c` |
| P09-026 | Whiteout healing and last-Pokémon-Center respawn | Pending | `src/battle/battle_command.c` |
| P09-027 | Battle healing/status/PP items and turn consumption | Pending | `src/battle/battle_command.c` |
| P09-028 | Switch/Set option and trainer replacement prompts | Pending | `src/battle/battle_command.c` |
| P09-029 | Wild, trainer, rival, double and multi battles | Pending | `src/battle/battle_command.c` |
| P09-030 | Original battle scripts/move effects coverage | Pending | `src/battle/battle_command.c` |
| P09-031 | Battle animation toggle, text pacing and battle sound | Pending | `src/battle/battle_command.c` |

### Inventory, economy and services

| ID | Requirement | Status | Source |
| --- | --- | --- | --- |
| P10-001 | Correct bag pockets, stack limits and item ordering | Pending | `src/bag.c` |
| P10-002 | Source item names, descriptions, prices and use metadata | Pending | `src/bag.c` |
| P10-003 | Key Items, registration and contextual use | Pending | `src/bag.c` |
| P10-004 | Medicines heal correct HP/status with consumption rules | Pending | `src/bag.c` |
| P10-005 | Poké Balls inventory and battle use | Pending | `src/bag.c` |
| P10-006 | Repels, Escape Rope, flutes and field consumables | Pending | `src/bag.c` |
| P10-007 | TMs/HMs: compatibility, teaching, replacement and reuse rules | Pending | `src/bag.c` |
| P10-008 | Evolution stones and other evolution items | Pending | `src/bag.c` |
| P10-009 | Berries, held effects and growing Berry Pots | Pending | `src/bag.c` |
| P10-010 | Apricorn picking, daily reset and Kurt’s ball crafting | Pending | `src/bag.c` |
| P10-011 | Mart original inventories, badge unlocks and prices | Pending | `src/bag.c` |
| P10-012 | Buy, sell, quantity and money cap | Pending | `src/bag.c` |
| P10-013 | Pokémon Center heal party HP/PP/status and respawn point | Pending | `src/bag.c` |
| P10-014 | PC storage boxes, capacity, names and organization | Pending | `src/bag.c` |
| P10-015 | Day Care deposit, cost, experience, eggs and pickup | Pending | `src/bag.c` |
| P10-016 | Move Deleter, Move Reminder, tutors and Heart Scales | Pending | `src/bag.c` |
| P10-017 | In-game NPC trades with original requested/offered species | Pending | `src/bag.c` |
| P10-018 | Lottery, department store, vending machines and prizes | Pending | `src/bag.c` |
| P10-019 | Mother savings, deposits, withdrawals and purchases | Pending | `src/bag.c` |
| P10-020 | Game Corner/Voltorb Flip, coins and prize exchange | Pending | `src/bag.c` |
| P10-021 | Haircuts, massages, friendship and time conditions | Pending | `src/bag.c` |

### Interface, saves and settings

| ID | Requirement | Status | Source |
| --- | --- | --- | --- |
| P11-001 | Original menu unlock progression | Implemented | `src/save.c` |
| P11-002 | Trainer Card, player name, money, play time and badges | Implemented | `src/save.c` |
| P11-003 | Party menu, summary, reorder and field moves | Pending | `src/save.c` |
| P11-004 | Bag menu item selection and target selection | Pending | `src/save.c` |
| P11-005 | Pokédex search, habitat and species information | Pending | `src/save.c` |
| P11-006 | Pokégear phone, map, radio and cards | Pending | `src/save.c` |
| P11-007 | Save menu and resumable exact world position/facing | Implemented | `src/save.c` |
| P11-008 | Flags, variables, party, storage, inventory and all progression persist | Implemented | `src/save.c` |
| P11-009 | Save schema versioning and safe migration | Pending | `src/save.c` |
| P11-010 | New Game does not overwrite existing progress without confirmation | Implemented | `src/save.c` |
| P11-011 | Multiple sessions and corrupt-save recovery | Pending | `src/save.c` |
| P11-012 | Text speed, battle scene, battle style and sound settings | Pending | `src/save.c` |
| P11-013 | Keyboard and controller bindings | Pending | `src/save.c` |
| P11-014 | Touch equivalents for movement, confirm, cancel and menus | Implemented | `src/save.c` |
| P11-015 | Accessible focus, dialogue paging and modal input locking | Implemented | `src/save.c` |
| P11-016 | Loading, asset failures and recoverable errors | Implemented | `src/save.c` |

### Audio and presentation

| ID | Requirement | Status | Source |
| --- | --- | --- | --- |
| P12-001 | Original route, town, interior and dungeon music selection | Pending | `src/sound.c` |
| P12-002 | Time-of-day music variants and transitions | Pending | `src/sound.c` |
| P12-003 | Battle music, rival/gym/legendary themes and victory jingles | Pending | `src/sound.c` |
| P12-004 | Pokémon cries by species/form | Pending | `src/sound.c` |
| P12-005 | Menu, dialogue, movement, item and field sound effects | Pending | `src/sound.c` |
| P12-006 | Original weather and lighting cues | Pending | `src/sound.c` |
| P12-007 | 3D conversion retains geometry, layout and visibility of interactables | Implemented | `src/sound.c` |
| P12-008 | Directional character sprite animations and followers | Implemented | `src/sound.c` |
| P12-009 | Door, warp, encounter and battle transitions | Pending | `src/sound.c` |
| P12-010 | Frame pacing, chunk streaming, disposal and memory budgets | Pending | `src/sound.c` |

### Connectivity and special systems

| ID | Requirement | Status | Source |
| --- | --- | --- | --- |
| P13-001 | Local link trades and trade evolution | Pending | `src/pokewalker.c` |
| P13-002 | Link single/double/multi battles and rules | Pending | `src/pokewalker.c` |
| P13-003 | Union Room interactions | Pending | `src/pokewalker.c` |
| P13-004 | GTS listing, searching and trade completion | Pending | `src/pokewalker.c` |
| P13-005 | Wi-Fi Plaza activities and minigames | Pending | `src/pokewalker.c` |
| P13-006 | Mystery Gift, Wonder Cards and delivery man | Pending | `src/pokewalker.c` |
| P13-007 | Pokéwalker transfer, routes, steps, catches and items | Pending | `src/pokewalker.c` |
| P13-008 | Pokeathlon events, stats, records and rewards | Pending | `src/pokewalker.c` |
| P13-009 | Pal Park migration and capture | Pending | `src/pokewalker.c` |
| P13-010 | GB Sounds, photo album, ribbons and records | Pending | `src/pokewalker.c` |
| P13-011 | Event distributions: Sinjoh Ruins, Celebi, Spiky-eared Pichu | Pending | `src/pokewalker.c` |
| P13-012 | Version exclusives and clock-dependent event compatibility | Pending | `src/pokewalker.c` |

### 3D battle presentation

| ID | Requirement | Status | Source |
| --- | --- | --- | --- |
| P14-001 | Battles use the actual encounter location and surrounding 3D field geometry | Implemented | `browser/src/source/battle-stage.ts` |
| P14-002 | Paper Pokémon have separate ground positions, shadows and camera-relative front/back artwork | Implemented | `browser/src/source/battle-stage.ts` |
| P14-003 | Battle camera supports orbit, vertical drag and zoom without changing turn rules | Implemented | `browser/src/source/battle-stage.ts` |
| P14-004 | Physical attacks, special projectiles, stat moves and hits animate in world space | Implemented | `browser/src/source/battle-stage.ts` |
| P14-005 | Poké Balls travel through the world and capture shakes preserve original capture results | Implemented | `browser/src/source/battle-stage.ts` |
| P14-006 | Trainers remain present in battle scenes and field actors return after combat | Implemented | `browser/src/source/battle-stage.ts` |
| P14-007 | Battle HUD and commands remain usable on desktop and touch viewports | Implemented | `browser/src/source/battle-stage.ts` |
| P14-008 | Battle exit and error recovery restore field camera, actor visibility and progression locks | Implemented | `browser/src/source/battle-stage.ts` |
| P14-009 | Original battle art uses the correct normal or shiny palette for both facings | Implemented | `browser/src/source/battle-stage.ts` |
| P14-010 | Full campaign battle environments and all move-specific 3D effects receive visual verification | Pending | `browser/src/source/battle-stage.ts` |

### 3D world depth and navigation

| ID | Requirement | Status | Source |
| --- | --- | --- | --- |
| P15-001 | Source fence runs become solid posts and rails, including flat side-on atlas pieces | Implemented | `browser/src/source/world.ts` |
| P15-002 | Flower bunches have separately rooted crossed artwork with depth from side views | Implemented | `browser/src/source/world.ts` |
| P15-003 | 3D long-grass clumps stay on original encounter tiles and react to movement | Implemented | `browser/src/source/world.ts` |
| P15-004 | Hill and cliff backs are opaque from newly accessible camera angles | Partial | `browser/src/source/world.ts` |
| P15-005 | Background matrix cells render original scenery instead of exposing empty grey gaps | Implemented | `browser/src/source/world.ts` |
| P15-006 | Original building door warps, interior return exits and counter interactions work | Implemented | `browser/src/source/world.ts` |
| P15-007 | Following Pokémon move continuously along the original one-tile trailing path | Implemented | `browser/src/source/world.ts` |
| P15-008 | Every world camera angle, terrain boundary and scenery variant receives visual verification | Pending | `browser/src/source/world.ts` |
| P15-009 | Connected outdoor headers preserve camera pose, held movement and follower continuity without entry overlays | Implemented | `browser/src/source/world.ts` |
| P15-010 | Source entrance positions identify continuous opaque rear walls while real opposing entrances stay open | Partial | `browser/src/source/world.ts` |
| P15-011 | Native ledges have distinct terrain heights, open-path slopes and directional two-tile jumps | Implemented | `browser/src/source/world.ts` |
| P15-012 | Rock cutouts become separately rooted closed boulders retaining original pixel textures | Implemented | `browser/src/source/world.ts` |
| P15-013 | Generated textured surfaces provide every enabled vertex attribute and remain free of black backing rectangles | Implemented | `browser/src/source/world.ts` |
| P15-014 | Native sand and shallow shore tiles have solid substrate below surf artwork without filling deep sea | Implemented | `browser/src/source/world.ts` |
| P15-015 | Raised background forests and authored forest platforms have opaque terrain sides | Partial | `browser/src/source/world.ts` |
| P15-016 | Building entrance direction comes from original tile behaviours across the complete matrix | Implemented | `browser/src/source/world.ts` |
| P15-017 | Forked tree roots never count as multiple individual trees | Implemented | `browser/src/source/world.ts` |
| P15-018 | Door mats and warp stairs use original push or step rules and final facing | Implemented | `browser/src/source/world.ts` |
| P15-019 | Headerless interiors sharing geometry retain separate map ownership after warps | Implemented | `browser/src/source/world.ts` |
| P15-020 | Map connections, rebuilds and battle returns select their original entry script phases | Implemented | `browser/src/source/world.ts` |
| P15-021 | Field scenery streams without locking movement or removing the current cell during backtracking | Implemented | `browser/src/source/world.ts` |
| P15-022 | Camera obstruction checks exclude hidden scenery and paper vegetation while retaining solid architecture | Verified | `browser/src/source/world.ts` |

### 3D sky and weather

| ID | Requirement | Status | Source |
| --- | --- | --- | --- |
| P16-001 | A coloured horizon and sky follow the original morning, day, evening and night clock | Implemented | `browser/src/source/sky.ts` |
| P16-002 | Clouds have separately modelled solid pixel silhouettes, shaded undersides and slow drift | Implemented | `browser/src/source/sky.ts` |
| P16-003 | Illustrated sun, moon and twinkling stars complement the original field artwork | Implemented | `browser/src/source/sky.ts` |
| P16-004 | Original map weather selects field rain, snow, diamond dust and mist presentation | Implemented | `browser/src/source/sky.ts` |
| P16-005 | Original summit dates and post-Rocket Wednesday Lake of Rage weather are retained | Implemented | `browser/src/source/sky.ts` |
| P16-006 | Sky and weather persist during 3D battles and stay outside interiors and ordinary caves | Implemented | `browser/src/source/sky.ts` |
| P16-007 | Original weather audio, lightning, darkness, clock penalties and all battle weather rules are verified | Pending | `browser/src/source/sky.ts` |

## Content inventories

- `parity/maps.json`: every source map header and four independent verification tracks.
- `parity/script-commands.json`: every script/movement instruction encountered in the source scripts.
- `parity/features.json`: stable system requirement IDs and verification evidence.

## Work log

- Baseline: previous exploration prototype uses new scenery and simplified catch rules; it does **not** satisfy original-game parity. Its artwork extraction, input, and camera experiments can be reused.
- Source runtime: original asset/data import, opening event execution, basic turn-based battles, persistence and shared scenery repairs are implemented. Evidence and remaining gaps are recorded in `parity/features.json` and `VERIFICATION.md`. Full-game parity remains incomplete.
