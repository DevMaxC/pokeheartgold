Route 30/31 traversal qualification
=================================

The northern Route 30 screenshot shows Mr. Pokémon's house in matrix 0 cell 17,9
(land 6), next to Route 31 cell 17,8 and the Dark Cave approach. The exact player
tile cannot be inferred reliably from the image.

The source house warp is 568,294. Its south approach 568,295 is reachable from the
southern Route 30 entrance 548,383 in 114 steps without Cut. The short west route
through 559,295 contains the original Cut tree. Terrain there is walkable; the
visible source object supplies the intended obstruction. Source ledges remain
one way. Dark Cave and the Violet gate become reachable after the original
Mystery Egg return sequence hides the Route 30 battlers; Cut trees remain present.

No generic terrain collision change is justified by these results. A separate
confirmed progression gap remains: standard 10000/bank 0146 entry 0 uses unported
Cut/follower operations, starting with GetPartySlotWithMove MOVE_CUT. Native HM
teaching is also absent from the current normal Bag binding. Removing the tree
or bypassing its collision would conceal that gap.

Evidence
--------

`route30-31-hill-candidate.json` pins production base 93bf982, 15 code files and 280
original data files/Git blobs. It compares baseline terrace SHA 2088d879949b with
Civic's frozen candidate 277bac25178f99dfe3caa9ace134cf9097fbe5149e7e3733fb58f16ebfd87323.

- 205,824 imported permissions from 201 exterior land members exactly match their
 original NARC bytes, decoded independently of the source importer.
- 6,712 ordinary directed Route 30/31 transitions pass actual World.walkable on
 both height fields; no native or presented center-to-center step reaches the
 native 1.25 tile collision threshold. Maximum candidate step is 0.98046875.
- 214,784 actual within-step height samples cover both fields, including tile,
 cell and header boundaries. Maximum consecutive sample change is 0.0628481 tile.
- Actual main.ts step() is extracted and evaluated in the tests. Animation,
 encounters and UI are stubbed leaves; movement priority is not reimplemented.
 This verifies north-facing door entry, downhill-only jumping, original Cut
 object visibility, water blocking and the native cave approach.
- The global exterior door population is checked separately. Route 48 land 74 also
 supplies a real overlapping-floor bridge fixture: current height 10.5 or 13
 retains its native floor throughout the overlapping portion and upper-deck
 traversal keeps the source side barrier.

The native 1.25 threshold comes from FieldSystem_GetHeightStep in field_terrain.c.
Production 93bf World.walkable itself does not apply a general height threshold;
this qualification checks visual height eligibility without adding such a gate.

Reproduce from browser/
-----------------------

    node --experimental-transform-types --test src/source/native-route-traversal.test.ts
    NATIVE_ROUTE_TERRACE_DATA=/absolute/path/to/candidate/0.json node --experimental-transform-types --test src/source/native-route-traversal.test.ts

Reproduce the report from the repository root:

    node --experimental-transform-types browser/scripts/audit_native_route_traversal.ts /absolute/path/to/candidate/0.json /tmp/route-traversal.json

Six tests pass against both baseline and the pinned candidate. TypeScript passes.
No browser, production build, renderer, save mutation or runtime change was used.

Limits
------

This is numerical source/movement evidence, not visual approval or a claim that
all maps are fully traversable. The graph uses actual initial/static event
positions and a documented native flag transition; a user's saved actor state
or a walking NPC may differ. Outdoor generated-furniture arrays are empty in
this fixture, so it does not prove GLB furniture extraction. The 16 samples per
ordinary step are finite, not a proof for every real coordinate.

Bridge height selection also does not prove native on-bridge/Surf behavior.
Native MapObject_UpdateOnBridgeFlag sets flag 28 on behavior 112, and behavior 115
is water when that flag is absent. The old web fixture has no equivalent actor
flag. Default height reference 0 on the Route 48 bridge chooses the lower 10.5
plane, so entry/resume must preserve the appropriate native floor independently.
No bridge runtime fix or lower-water walking permission is asserted here.
