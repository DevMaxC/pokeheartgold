"""Inventory parity work from the exact checkout, without treating imported data as working gameplay."""
from pathlib import Path
import json, re, hashlib
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'browser/parity';OUT.mkdir(exist_ok=True)
GROUPS={
'Opening and identity':('src/intro.c',[
'New Game and Continue with explicit save-replacement rules','Original title and introduction sequence','Professor Oak introduction and Pokémon demonstration','Boy/girl player selection and matching overworld sprites','Character naming, length limits, confirmation and name substitutions','Original starting bedroom, spawn position and facing','Bedroom stairs, PC, Wii and interactive scenery','Mother dialogue, Pokégear acquisition and tutorial','Clock, weekday, date and daylight cycle','Correct initial money, inventory, flags and Pokédex locks']),
'Opening story progression':('files/fielddata/script/scr_seq',[
'Lyra/Ethan introduction and Marill scene','New Bark Town exits gated by original story flags','Professor Elm first conversation and Mr. Pokémon errand','Lab starter selection at original device with confirm and cancel','Starter received at level 5, ownership and nickname prompt','Opposing starter acquired by rival','Elm contact registration and laboratory healing','Laboratory aide’s original item gift','Mother visit and contact registration before departure','Running Shoes and Cherrygrove guide tour','Map Card and guide return scene','Route 30 NPCs, Apricorn Box and original item gifts','Mr. Pokémon house and Mystery Egg','Professor Oak meeting, Pokédex and contact','Elm emergency phone call and return journey','First rival battle at original location with correct team','Police investigation and rival naming','Mystery Egg delivered to Elm','Mother’s money-saving choice','Lyra/Ethan catch tutorial and starter Poké Balls','Route 31 arrival and Violet progression']),
'Johto story':('files/fielddata/script/scr_seq',[
'Sprout Tower trainers, elder, rival and rewards','Violet Gym puzzle, trainers and Falkner badge/TM','Elm aide Egg delivery and Togepi hatching progression','Ruins of Alph puzzles, Unown and chambers','Union Cave and Route 32/33 progression','Azalea Team Rocket occupation, Kurt and Slowpoke Well','Azalea Gym puzzle, trainers and Bugsy badge/TM','Ilex rival battle and Farfetch’d cut puzzle','Cut HM acquisition, badge requirement and field use','Ilex Forest shrine, Headbutt tutor and exits','Goldenrod City services, Radio Card quiz and Bicycle','Goldenrod Gym, Whitney defeat aftermath and Plain Badge','SquirtBottle and Sudowoodo roadblock','National Park and Bug-Catching Contest','Ecruteak Dance Theater, Kimono Girl and Surf','Burned Tower rival, legendary beasts and Morty Gym','Olivine lighthouse climb and sick Ampharos','Cianwood SecretPotion, Chuck Gym and Fly gift','Ampharos cured and Jasmine Gym','Lake of Rage, Red Gyarados and Lance meeting','Mahogany Rocket Hideout switches, passwords and battles','Mahogany Gym sliding puzzle and Pryce badge/TM','Goldenrod Radio Tower takeover and underground rescue','Rocket executives, Radio Tower liberation and version item','Ice Path puzzles, Strength boulders and Waterfall','Blackthorn Gym, Clair and Dragon’s Den trial','Kimono Girls battle sequence and version legendary event','HeartGold Bell Tower Ho-Oh story and encounter','SoulSilver Whirl Islands Lugia story and encounter','Route 27/26, Victory Road and final rival','Elite Four Will, Koga, Bruno and Karen','Champion Lance and Hall of Fame','Credits and postgame unlocks']),
'Kanto and postgame':('files/fielddata/script/scr_seq',[
'S.S. Aqua ticket, maiden voyage and missing granddaughter','Vermilion arrival and Lt. Surge Gym','Power Plant missing part and Rocket investigation','Cerulean Misty return and Gym','Lavender Radio expansion and Poké Flute','Snorlax roadblock and Diglett’s Cave','Pewter Brock Gym and fossil museum','Cerulean, Saffron Sabrina and Celadon Erika Gyms','Fuchsia Janine Gym and Safari relocation','Copycat doll, Magnet Train and regional travel','Seafoam Blaine Gym and Cinnabar/Blue progression','Viridian Blue Gym and 16 badges','Oak access to Mt. Silver','Mt. Silver traversal and Red battle','Gym Leader phone registration and rematches','Elite Four rematch teams','S.S. Aqua repeat voyages and weekday trainers','Steven Hoenn starter and Oak Kanto starter','Embedded Tower Groudon/Kyogre/Rayquaza events','Cerulean Cave Mewtwo and stationary legendary birds','Roaming beasts and roaming Latias/Latios','Safari Zone Baoba missions, blocks and time gates','Battle Frontier facilities, ranks and rewards']),
'World and movement':('src/field/map_load_manager.c',[
'Every source map header imported with original IDs','Every source map matrix imported at exact dimensions','Original landscape mesh geometry and textures','Original prop models, transforms and placement','Original tile collision/terrain permissions','Original elevations, ledges, bridges and stairs','Seamless outdoor matrix connections at original coordinates','Every doorway uses original warp destination and anchor','Interior room layouts and original furniture placement','Caves, towers, dungeons and multi-floor transitions','Original moving/elevator/warp-panel puzzles','Walking, running and movement rate','Camera-relative control without changing collision rules','Free third-person camera with occlusion handling','Bicycle acquisition, mounting and restrictions','Surf mount, water restrictions and dismount','Waterfall, Whirlpool, Rock Climb and Strength field traversal','Cut trees, Rock Smash rocks and respawn behavior','Fly destinations, Teleport, Escape Rope and Dig','Follower positioning, sprite, dialogue and restrictions','Swimming, sand, snow and terrain-specific presentation','Original signs, hidden objects and inspectable scenery','Map names, region display and town-map markers','Weather, time-of-day and day-of-week maps/events']),
'NPCs and scripts':('src/scrcmd.c',[
'Original NPC sprite and facing from event tables','Original NPC spawn/hide conditions','Original dialogue text with player/rival/partner substitutions','Dialogue pages, confirmations and choice menus','Facing and distance requirements for interaction','NPC walking routes, movement locks and cutscenes','Trainer vision, approach, battle and defeat persistence','Coordinate trigger conditions, priority and one-shot behavior','Map entry and load scripts','Persistent script flags and variables','Script calls, branches, comparisons and return stack','Inventory/party checks in scripts','Event item, Pokémon and money grants','NPC phone registration and call outcomes','Multi-character cutscene timing and camera events','Daily, weekly and conditional NPC presence','Every script command implementation tracked against source']),
'Pokémon data and ownership':('src/pokemon.c',[
'All original species and forms with source base stats','Original front/back sprites, sex differences and shinies','Original types, abilities and form conditions','Trainer ID, secret ID, personality and shiny calculation','Original IVs, EVs, natures and stat formulas','Levels, experience curves and experience totals','Gender ratios, friendship and obedience','Six-member party limit and party order','Pokémon summary with stats, moves, ability, nature and ownership','Four move slots, current PP and PP Ups','Level-up learnsets and move replacement choice','Held items, giving, taking and effects','Major status and persistent HP/PP','Nicknames, name rater and language/length constraints','Evolution level, trade, item, friendship and special conditions','Evolution presentation, cancellation and Pokédex update','Egg generation, steps, hatching and inherited data','Original starter/gift/trade/static encounter acquisition','Release, deposit, withdrawal and PC boxes','Pokédex seen/caught, forms, locations and completion']),
'Wild encounters and catching':('src/wild_encounter.c',[
'Random grass encounters on movement; no visible overworld wild encounters','Original encounter rates, slot weights, species and level ranges','Morning/day/night encounter substitutions','Version-specific encounter slots','Cave and floor-specific encounter tables','Surf encounters and water levels','Old/Good/Super Rod timing, tables and failures','Rock Smash, Headbutt and special encounter tables','Repel level comparison, depletion and expiry','Ability, item, weather, radio and swarm encounter modifiers','Roamers preserve location, HP and status','Stationary encounters, legendary flags and respawns','Catch formula, species catch rate and status bonus','All Poké Ball modifiers and four shake checks','Trainer battle capture restriction','Caught Pokémon naming and party/box delivery','Experience on fainting with Gen IV capture behavior','Run success, trapping and escape attempts']),
'Battle core':('src/battle/battle_command.c',[
'Familiar Fight/Bag/Pokémon/Run command menu','Front enemy and back player battle presentation','Correct levels, sex, status, HP bars and names','Four moves with type, PP, category, power and accuracy','Player selects action; opponent selects action each turn','Action order: switch/item priority, move priority, speed and ties','Physical/special/status split and attack/defense formulas','Gen IV damage rounding, random range and minimum damage','STAB and full Gen IV type-effectiveness chart','Critical-hit stages, exceptions and damage behavior','Accuracy/evasion stages and move accuracy rolls','Attack/Defense/SpAtk/SpDef/Speed stat stages','Major status burn, paralysis, poison, toxic, sleep and freeze','Confusion, flinch, infatuation and other volatile statuses','Residual damage, weather, healing and turn-end order','Abilities and move/item suppression conditions','Recoil, drain, multi-hit, charge, recharge and rampage moves','Protect, priority, redirection, substitutes and screens','Weather, hazards, field effects and turn duration','Move restrictions, disabled moves, PP exhaustion and Struggle','Player and trainer switching, forced switch and pursuit','Fainting, replacement, double KO and win/loss detection','Original trainer AI, movesets, items and teams','Experience sharing, trainer bonus, EVs and level-up','Money rewards, held Amulet Coin and defeat penalties','Whiteout healing and last-Pokémon-Center respawn','Battle healing/status/PP items and turn consumption','Switch/Set option and trainer replacement prompts','Wild, trainer, rival, double and multi battles','Original battle scripts/move effects coverage','Battle animation toggle, text pacing and battle sound']),
'Inventory, economy and services':('src/bag.c',[
'Correct bag pockets, stack limits and item ordering','Source item names, descriptions, prices and use metadata','Key Items, registration and contextual use','Medicines heal correct HP/status with consumption rules','Poké Balls inventory and battle use','Repels, Escape Rope, flutes and field consumables','TMs/HMs: compatibility, teaching, replacement and reuse rules','Evolution stones and other evolution items','Berries, held effects and growing Berry Pots','Apricorn picking, daily reset and Kurt’s ball crafting','Mart original inventories, badge unlocks and prices','Buy, sell, quantity and money cap','Pokémon Center heal party HP/PP/status and respawn point','PC storage boxes, capacity, names and organization','Day Care deposit, cost, experience, eggs and pickup','Move Deleter, Move Reminder, tutors and Heart Scales','In-game NPC trades with original requested/offered species','Lottery, department store, vending machines and prizes','Mother savings, deposits, withdrawals and purchases','Game Corner/Voltorb Flip, coins and prize exchange','Haircuts, massages, friendship and time conditions']),
'Interface, saves and settings':('src/save.c',[
'Original menu unlock progression','Trainer Card, player name, money, play time and badges','Party menu, summary, reorder and field moves','Bag menu item selection and target selection','Pokédex search, habitat and species information','Pokégear phone, map, radio and cards','Save menu and resumable exact world position/facing','Flags, variables, party, storage, inventory and all progression persist','Save schema versioning and safe migration','New Game does not overwrite existing progress without confirmation','Multiple sessions and corrupt-save recovery','Text speed, battle scene, battle style and sound settings','Keyboard and controller bindings','Touch equivalents for movement, confirm, cancel and menus','Accessible focus, dialogue paging and modal input locking','Loading, asset failures and recoverable errors']),
'Audio and presentation':('src/sound.c',[
'Original route, town, interior and dungeon music selection','Time-of-day music variants and transitions','Battle music, rival/gym/legendary themes and victory jingles','Pokémon cries by species/form','Menu, dialogue, movement, item and field sound effects','Original weather and lighting cues','3D conversion retains geometry, layout and visibility of interactables','Directional character sprite animations and followers','Door, warp, encounter and battle transitions','Frame pacing, chunk streaming, disposal and memory budgets']),
'Connectivity and special systems':('src/pokewalker.c',[
'Local link trades and trade evolution','Link single/double/multi battles and rules','Union Room interactions','GTS listing, searching and trade completion','Wi-Fi Plaza activities and minigames','Mystery Gift, Wonder Cards and delivery man','Pokéwalker transfer, routes, steps, catches and items','Pokeathlon events, stats, records and rewards','Pal Park migration and capture','GB Sounds, photo album, ribbons and records','Event distributions: Sinjoh Ruins, Celebi, Spiky-eared Pichu','Version exclusives and clock-dependent event compatibility'])
}
GROUPS['3D battle presentation']=('browser/src/source/battle-stage.ts',[
'Battles use the actual encounter location and surrounding 3D field geometry',
'Paper Pokémon have separate ground positions, shadows and camera-relative front/back artwork',
'Battle camera supports orbit, vertical drag and zoom without changing turn rules',
'Physical attacks, special projectiles, stat moves and hits animate in world space',
'Poké Balls travel through the world and capture shakes preserve original capture results',
'Trainers remain present in battle scenes and field actors return after combat',
'Battle HUD and commands remain usable on desktop and touch viewports',
'Battle exit and error recovery restore field camera, actor visibility and progression locks',
'Original battle art uses the correct normal or shiny palette for both facings',
'Full campaign battle environments and all move-specific 3D effects receive visual verification'])
GROUPS['3D world depth and navigation']=('browser/src/source/world.ts',[
'Source fence runs become solid posts and rails, including flat side-on atlas pieces',
'Flower bunches have separately rooted crossed artwork with depth from side views',
'3D long-grass clumps stay on original encounter tiles and react to movement',
'Hill and cliff backs are opaque from newly accessible camera angles',
'Background matrix cells render original scenery instead of exposing empty grey gaps',
'Original building door warps, interior return exits and counter interactions work',
'Following Pokémon move continuously along the original one-tile trailing path',
'Every world camera angle, terrain boundary and scenery variant receives visual verification',
'Connected outdoor headers preserve camera pose, held movement and follower continuity without entry overlays',
'Source entrance positions identify continuous opaque rear walls while real opposing entrances stay open',
'Native ledges have distinct terrain heights, open-path slopes and directional two-tile jumps',
'Rock cutouts become separately rooted closed boulders retaining original pixel textures',
'Generated textured surfaces provide every enabled vertex attribute and remain free of black backing rectangles',
'Native sand and shallow shore tiles have solid substrate below surf artwork without filling deep sea',
'Raised background forests and authored forest platforms have opaque terrain sides',
'Building entrance direction comes from original tile behaviours across the complete matrix',
'Forked tree roots never count as multiple individual trees',
'Door mats and warp stairs use original push or step rules and final facing',
'Headerless interiors sharing geometry retain separate map ownership after warps',
'Map connections, rebuilds and battle returns select their original entry script phases',
'Field scenery streams without locking movement or removing the current cell during backtracking',
'Camera obstruction checks exclude hidden scenery and paper vegetation while retaining solid architecture'])
GROUPS['3D sky and weather']=('browser/src/source/sky.ts',[
'A coloured horizon and sky follow the original morning, day, evening and night clock',
'Clouds have separately modelled solid pixel silhouettes, shaded undersides and slow drift',
'Illustrated sun, moon and twinkling stars complement the original field artwork',
'Original map weather selects field rain, snow, diamond dust and mist presentation',
'Original summit dates and post-Rocket Wednesday Lake of Rage weather are retained',
'Sky and weather persist during 3D battles and stay outside interiors and ordinary caves',
'Original weather audio, lightning, darkness, clock penalties and all battle weather rules are verified'])
# Audited progression reconciliation at this immutable source checkpoint.
# These scoped overrides are authoritative for the listed feature evidence;
# update/remove them when later evidence supersedes the checkpoint. Never infer
# campaign or browser parity merely from imported data or leaf fixture success.
PROGRESSION_CHECKPOINT='536758a553891a934e5cbfca29473b3cbe77a647'
PROGRESSION_AUDIT={'P01-002': ('partial',
             'Native Ho-Oh model/joint animation, source title artwork/camera and cry are implemented. Five-scene '
             'boot movie, title material/pattern effects, idle return, native BGM and hardware menus remain '
             'missing. opening-art/opening-view fixtures and reviews/2026-10-17-opening-sequence.md are offline '
             'evidence; rendered title parity is pending.'),
 'P01-003': ('implemented',
             'Original Oak topic/control/adventure branches, five RTC greetings and awaited ball/Marill '
             'demonstration use native messages, OAM/NANR artwork and original cries. '
             'opening.test.ts/opening-art.test.ts/opening-view.test.ts cover the leaf behavior. Oak BGM, exact DS '
             'timing/layout and fresh browser validation remain pending; see '
             'reviews/2026-10-17-opening-sequence.md.'),
 'P01-004': ('implemented',
             'Native boy/girl portraits, gender confirmation/rejection loops and remembered cursor feed the '
             'matching field identity; opening*.test.ts covers draft selection and field handoff. '
             'Browser-rendered framing, input and full identity playthrough remain unverified; see '
             'reviews/2026-10-17-opening-sequence.md.'),
 'P01-005': ('implemented',
             'Player naming uses the native English mapped glyph set, seven-glyph limit, imported gendered '
             'defaults, case/spaces and source confirmation/rejection loops. '
             'opening-input.test.ts/opening.test.ts and the actual startup-save fixture cover leaf behavior. '
             'Browser navigation and general Pokemon/name-rater constraints are separate incomplete '
             'requirements.'),
 'P01-010': ('implemented',
             'newState plus original opening scripts initialize the implemented money/bag/menu/Pokedex locks; '
             'trainer ID/native Egg RNG are persisted when required by the gift path. Complete native save '
             'initialization, flag960, fishing/RTC/system records and PC mail remain gaps documented in '
             'reviews/2026-10-17-opening-sequence.md. This is not a full startup-equivalence claim.'),
 'P02-021': ('pending',
             'Source Route31/Violet maps are imported and shared trainer fixtures cover real Route31, Sprout and '
             'Gym definitions, but a natural Route31-to-Violet/Sprout/Falkner traversal is not established. '
             'Isolated trainer, lift and reward fixtures do not verify this combined story arrival.'),
 'P03-001': ('pending',
             'trainer-scripts.test.ts/trainer-encounters.test.ts exercise actual Sprout Tower sage Nico through '
             'the generic source single-trainer path. The complete tower traversal, elder, rival cutscene and '
             'rewards have not been verified together; this combined requirement stays Pending.'),
 'P03-002': ('implemented',
             'Native map135 VioletGymInit/Elevator drives original dynamic model111, 3x3 collision plate, 2-to-31 '
             'height ride, player/follower, Continue/warp/recovery and free camera; gym-violet*.test.ts includes '
             'actual main/VM/World hooks. Actual0859 Falkner reward fixtures cover badge, +30 score, TM51 '
             'full-bag retry and persistence; battle outcomes are supplied by the fixture. Natural rendered Gym '
             'traversal/combat and complete campaign parity remain unverified.'),
 'P03-003': ('implemented',
             'Actual Violet aide script gives the native level1 Togepi Egg with PID/IV/OT/met data and '
             'Extrasensory. Saved step cycles, ability modifiers, awaited 3D field hatch, original cry, '
             'native1011/1188 audio, nickname/memo/Dex/Elm flags and rollback are implemented and covered by '
             'eggs/egg-hatching/egg-field-main/party-field-main fixtures. Triggered Elm call selection exists as '
             'a core; incoming field delivery and full hatch-to-call-to-lab browser playthrough are pending '
             'at536758a. Breeding/inheritance is not included.'),
 'P05-011': ('pending',
             'Violet lift is implemented with native model111, source grid/plate height selection, rider '
             'animation, save/Continue and unload/failure cleanup (gym-violet*.test.ts). Other native '
             'moving/elevator/warp-panel puzzles are not established; the all-world requirement remains Pending.'),
 'P05-020': ('pending',
             'Continuous following and Egg/usable-mon selection are implemented. Field party switching refreshes '
             'distinct same-species follower identity/appearance and keeps native fainted fallback '
             '(party-field-main.test.ts/egg-consumers.test.ts). Complete source follower dialogue, restrictions '
             'and all contexts remain pending.'),
 'P06-007': ('implemented',
             'Source single-trainer sight/approach uses live facing, native ranges/type1/type2 and normalized4-8 '
             'behavior, terrain/directional/height/actor/follower occupancy, distance-minus-one movement and '
             'defeat persistence. Actual Wade/Sprout/Abe/Rod fixtures cover win/loss/repeat and save; battle '
             'outcomes are fixture ports. Double/multi combat and hidden51-54 emergence remain explicitly '
             'unsupported. See reviews/native-trainer-encounters-opus-adjudication.json; natural browser '
             'encounters remain unverified.'),
 'P06-013': ('pending',
             'Original opening grants, Falkner badge/TM51 full-bag retry and native Togepi Egg gift execute '
             'through source scripts with capacity/flags/persistence fixtures. These implemented leaves do not '
             'establish every event item/Pokemon/money grant or complete campaign command coverage.'),
 'P06-014': ('pending',
             'Shared trainer registration/refusal/gift/rematch state and native Elm incoming-script/trigger '
             'scheduler core have source fixtures (trainer-scripts.test.ts, phone*.test.ts). At536758a main has '
             'no incoming-ring/answer/RTC field host; random callers, broader callers, forced-call contexts and '
             'ring audio remain incomplete. Historical core review notes are not field-delivery approval.'),
 'P06-015': ('partial',
             'Native virtual camera actor241 Create/RemoveCameraTarget and scripted movement preserve free orbit; '
             'Violet lift awaits player/follower animation. Source-action recovery restores actors/height/camera '
             'after failure (script-camera.test.ts/gym-violet-integration.test.ts). Full multi-character '
             'cutscene/movement-command coverage and rendered campaign timing remain pending.'),
 'P07-004': ('pending',
             'Native gift/hatch paths persist trainer ID, personality, OT/provenance and native Egg RNG; native '
             'gender/PID bounds and Ranger anti-shiny leaf have source fixtures. Whole-game '
             'ID/secret-ID/shiny/global-RNG equivalence for every acquisition path remains pending.'),
 'P07-008': ('implemented',
             'Native field Summary/Switch/Cancel exchanges whole occupied Mon records, including Eggs and fainted '
             'leads; source-slot/Cancel preserves order. Actual main binding saves the swap, returns target focus '
             'and refreshes same-species follower identity. party-order.test.ts and party-field-main.test.ts '
             'cover gift/hatch/reorder/Elm reward, save/Continue, abort and recovery. Native Battle Tower '
             'partner-room Switch exception is retained. Browser interaction remains unverified.'),
 'P07-009': ('partial',
             'Normal party summary and native Egg Watch presentation exist; Egg '
             'species/level/HP/gender/stats/moves remain concealed until hatching. party-display.test.ts covers '
             'native thresholds and normal-summary restoration. Complete original summary pages, forms and '
             'ownership presentation are not verified.'),
 'P07-014': ('pending',
             'Opening player naming and source starter/hatch nickname prompts are implemented; actual native187 '
             'hatch text/choices have fixtures. All Pokemon nickname glyph/language constraints and the original '
             'name-rater service remain incomplete.'),
 'P07-017': ('pending',
             'Native gifted Togepi Egg, persistent shared step counter/cycle order, special dates, Flame '
             'Body/Magma Armor modifier and awaited field hatching/memo/Dex/OT lifecycle are implemented. '
             'eggs/egg-hatching/egg-field-main fixtures cover source order and transactional failure/retry. '
             'Breeding, inherited data, global RTC-penalty detection, generic forced/poison/Safari step systems, '
             'alternate-form/Jirachi rewards and full cry coverage remain gaps; the combined requirement stays '
             'Pending.'),
 'P07-018': ('pending',
             'Original starter acquisition and actual Violet aide Togepi Egg gift are implemented, including '
             'capacity/non-award behavior and persistent identity. Source fixtures do not establish all gifts, '
             'trades, static encounters or complete acquisition parity.'),
 'P11-003': ('pending',
             'Field party menu/summary/reorder is connected in536758a, including owned Escape/Cancel, saved '
             'whole-record swap, target focus, follower refresh and native partner-room exception '
             '(party-field-main.test.ts). Field moves and complete native party contexts remain missing; the '
             'combined requirement stays Pending.'),
 'P11-006': ('pending',
             'Native scripted phone calls and triggered Elm selection/state core exist, but main536758a has no '
             'field incoming-ring/answer host or complete Pokegear UI. Map/radio/cards, random-caller fallback '
             'and full phone delivery remain incomplete. Do not infer field support from phone-scheduler '
             'fixtures.'),
 'P11-007': ('implemented',
             'Saved position/facing plus fieldHeight/Violet lift state restore through actual Continue/World/main '
             'hooks; real warp/reentry resets source lift state. Recovery fixtures preserve actor/follower height '
             'and free orbit. Egg counter/provenance and field party order survive JSON restoration. '
             'All-map/browser save-resume parity remains unverified.'),
 'P11-008': ('implemented',
             'Flags/vars/inventory/party persistence now includes native Egg profile/seed/cycles/provenance, '
             'badge rewards and whole-record party order. Source-action checkpoints block autosave of provisional '
             'hatches and restore failed step/script state. Actual binding fixtures cover save gates and '
             'Retry/Return; this does not establish every campaign/storage subsystem.'),
 'P11-012': ('pending',
             'Native opening typewriter and Shift/Set option exist; saved sound:false explicitly mutes hatch '
             'cues/cry and sound:true uses the original native assets. The current options panel exposes battle '
             'style only. Complete sound/text-speed/scene controls and native settings parity remain pending; '
             'audio module tests are not option-UI verification.'),
 'P11-016': ('implemented',
             'Source-action recovery checkpoints State, field actors, camera/lift state and gates saves/input '
             'through awaited script/hatch work. Actual main fixtures cover failed field hydration, abort/drain, '
             'Retry/Return and provisional follower suppression. General error UX across the campaign and '
             'rendered checks remain pending; see native-hatch-host-final-adjudication.json.'),
 'P12-001': ('pending',
             'No global route/town/interior/dungeon BGM player exists at536758a. Native1011 hatch music and1188 '
             'fanfare have a dedicated owned session; its actual preexisting field snapshot is no track. An '
             'injected future field-port contract is not implemented map-music selection.'),
 'P12-002': ('pending',
             'General day/night BGM selection and field transitions remain unimplemented. Hatch-session '
             'restoration can preserve an injected actual voice identity/phase, but current main supplies no '
             'global field/radio/Surf music player.'),
 'P12-003': ('pending',
             'Original battle/rival/Gym/legendary themes and victory jingles remain incomplete. The separately '
             'exported1011 hatch music and1188 hatch fanfare do not fulfill battle-music coverage; see '
             'reviews/2026-10-17-native-hatch-music/README.md.'),
 'P12-004': ('pending',
             'Original PCM cries183/250 serve the opening and175 serves the 3D Togepi hatch, with exact '
             'source-byte/rate fixtures. Missing hatch species/form cries reject explicitly rather than '
             'substituting. All-species/form cry coverage and audible browser verification remain pending.'),
 'P12-005': ('pending',
             'Original hatch music1011 and fanfare1188 are source-SSEQ/native-bank renders with owned awaited '
             'playback, deliberate mute and abort cleanup. Menu/dialogue/movement/item/general field sound '
             'effects remain unimplemented; emulator output is not DS hardware/DAC fidelity or whole-music '
             'parity.'),
 'P15-020': ('implemented',
             'Connections run OnTransition; rebuilds use OnTransition/OnLoad/OnResume and battle/demo returns '
             'OnLoad/OnResume. Native Violet entry/lift hooks and real trainer-phone commands complete in offline '
             'actual-main fixtures. A consuming connection frame event precedes Egg/wild processing exactly once '
             '(egg-field-main.test.ts). All special/menu transitions and natural rendered playthrough remain '
             'pending.')}
features=[]
for gi,(group,(source,items)) in enumerate(GROUPS.items(),1):
 for i,title in enumerate(items,1): features.append({'id':f'P{gi:02}-{i:03}','group':group,'feature':title,'source':source,'status':'pending','verification':None})
# Every map receives separate geometry/events/story verification; counts never imply parity.
text=(ROOT/'src/data/map_headers.h').read_text()
maps=[]
for m in re.finditer(r'\[(MAP_\w+)\]\s*=\s*\{(.*?)\}',text,re.S):
 fields=dict(re.findall(r'\.(\w+)\s*=\s*(\w+)',m.group(2)))
 maps.append({'map':m.group(1),'fields':fields,'geometry':'pending','warps':'pending','events':'pending','progression':'pending'})
commands=[]
for p in sorted((ROOT/'files/fielddata/script/scr_seq').glob('scr_seq_*.s')):
 for raw in p.read_text().splitlines():
  line=raw.strip()
  if not line or line.startswith(('#','.','@')) or line.endswith(':'):continue
  command=line.split()[0]
  if command not in commands:commands.append(command)
# Preserve audited status/evidence when regenerating the source inventory.
for name,rows,key in [('features',features,'id'),('maps',maps,'map')]:
 path=OUT/(name+'.json')
 if rows is not None and path.exists():
  prior={row[key]:row for row in json.loads(path.read_text())}
  for row in rows:
   if row[key] in prior:
    for field,value in prior[row[key]].items():
     if field not in (key,'feature','source','group','fields'):row[field]=value
feature_by_id={row['id']:row for row in features}
for feature_id,(status,evidence) in PROGRESSION_AUDIT.items():
 if feature_id not in feature_by_id:raise ValueError(f'Unknown audited feature {feature_id}')
 if status not in ('pending','partial','implemented'):raise ValueError('This reconciliation cannot promote parity to Verified')
 feature_by_id[feature_id].update(status=status,verification=evidence)
source_revision='d7886a5'
command_rows=[{'command':x,'status':'pending'} for x in sorted(commands)]
prior_commands={row['command']:row for row in json.loads((OUT/'script-commands.json').read_text())} if (OUT/'script-commands.json').exists() else {}
command_rows=[{**row,**prior_commands.get(row['command'],{})} for row in command_rows]
for name,data in [('features',features),('maps',maps),('script-commands',command_rows)]:
 (OUT/(name+'.json')).write_text(json.dumps(data,indent=2)+'\n')
lines=['# HeartGold 3D parity ledger','',f'Source baseline: `{source_revision}`. This ledger defines the requested full-game destination; it does not declare the current browser build complete. Imported assets/data, implemented behavior, and verified original-game parity are separate states.','',f'Inventory: **{len(features)} system requirements, {len(maps)} map headers, {len(commands)} script/movement command names**. The machine-readable files in `parity/` retain per-map and per-command gaps. Every species, move, item, trainer and encounter remains governed by its original source data, not a hand-picked substitute.','',
'## Completion standard','',
'- Pending: missing or not audited. Partial: an implemented subset leaves identified requirement gaps. Implemented: behavior exists but original-game equivalence is not established. Verified: a repeatable source-backed fixture or gameplay check confirms the behavior. Unsupported: an identified gap; never silently skip it.',
'- Map parity requires original mesh, textures, tile permissions, elevations, prop transforms, warps, NPC/event coordinates, and story conditions. A recreated town shape is insufficient.',
'- Battle parity requires the original turn rules, damage/status/move/item/ability behaviors, trainer teams/AI, and progression consequences. A catch-only screen is insufficient.',
'- End-to-end completion requires a fresh save through Red and the listed postgame/special systems, with inventory, party and flags surviving save/reload. Imported content and isolated menus do not satisfy this.',
'- Connectivity/hardware-dependent systems must be implemented and tested against an explicit browser equivalent; unavailable original services must stay marked unsupported until that equivalent is agreed and working.',
'- Production changes must be committed, merged into the fork default branch, deployed from that commit, and checked on the live site.','',
'## Native progression checkpoint','',
f'Ledger reconciliation: `{PROGRESSION_CHECKPOINT}`. Native opening branches, single-trainer sight/approach, Violet lift/rewards, the real Togepi Egg gift/hatch/audio and field party switching are implemented in scoped source paths. Their offline fixtures and historical review receipts do not establish a fresh-save campaign or browser playthrough.',
'',
'P03-001 stays Pending for the complete Sprout Tower sequence. P03-002/P03-003 are Implemented with explicit limits; no requirement is promoted to Verified here. Breeding/inheritance, broader puzzles, full battle/audio coverage and incoming phone field delivery at this checkpoint remain incomplete.',
'',
'See [the reconciliation evidence and boundaries](reviews/2026-10-17-parity-reconciliation.md) and `parity/features.json` for each updated requirement. Historical branch notes retain their original scope; later fixes are qualified in the reconciliation rather than retroactively approved.',
'',
'## Implementation sequence','',
'1. Import original matrices, landscape/prop meshes, permissions, headers, event tables, messages, Pokémon/moves/items/trainers and script instruction lists. Validate IDs and cross-references.',
'2. Replace invented layout and visible-wild encounters. Render the original world, enter original buildings, and use original tile terrain for collisions and random encounters.',
'3. Implement identity, opening bedroom/mother/lab sequence, starter acquisition and the complete Mr. Pokémon/rival/catching-tutorial loop with original event state.',
'4. Implement familiar turn-based battles and party/bag/healing/storage services with formula and move-effect tests.',
'5. Expand generic script-command support and progress location by location through Johto, the League, Kanto and postgame. Test each dependency and prevent sequence breaks.',
'6. Complete side systems, connectivity equivalents, audio, options, and the full fresh-save regression playthrough.','',
'## System requirements','']
for group in GROUPS:
 lines += [f'### {group}','', '| ID | Requirement | Status | Source |','| --- | --- | --- | --- |']
 for f in features:
  if f['group']==group:lines.append(f"| {f['id']} | {f['feature']} | {f['status'].title()} | `{f['source']}` |")
 lines.append('')
lines += ['## Content inventories','', '- `parity/maps.json`: every source map header and four independent verification tracks.', '- `parity/script-commands.json`: every script/movement instruction encountered in the source scripts.', '- `parity/features.json`: stable system requirement IDs and verification evidence.', '', '## Work log','', '- Baseline: previous exploration prototype uses new scenery and simplified catch rules; it does **not** satisfy original-game parity. Its artwork extraction, input, and camera experiments can be reused.', '- Source runtime: original asset/data import, opening event execution, basic turn-based battles, persistence and shared scenery repairs are implemented. Evidence and remaining gaps are recorded in `parity/features.json` and `VERIFICATION.md`. Full-game parity remains incomplete.','']
(ROOT/'browser/PARITY.md').write_text('\n'.join(lines))
print(f'Catalogued {len(features)} requirements, {len(maps)} maps, {len(commands)} script/movement commands.')
