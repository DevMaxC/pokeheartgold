# Root evolution integration checks

Accepted evolution bd13 was merged with released background-cliff BCC as 7ae8da09. Runtime Main, Battle and field music remain byte-identical to the accepted evolution source; World remains byte-identical to the released cliff source.

The first full run finished 1,865/1,874 tests, with nine failures. The Violet fixture extracted restoreField without its newly required actual cancelEvolutionField/evolutionHost dependency. Eight opening-story cases still provided a void nickname hook after the native hook became a required 0/1 result. These original failures are preserved.

The test-only fixes extract the actual cancellation function and include an absent host in the old no-evolution fixture. A new deferred-owner case proves real recovery cannot start field hydration before the evolution owner drains, then checks the raised lift, player/follower height and camera orbit. The opening trace calls the real native nickname helper with an explicit no-input result and verifies code1, unchanged species name and hasNickname=false for all six boy/girl starter paths. No runtime guard was relaxed.

The first new drain-order assertion expected one beginFieldTransition call; actual World.enter legitimately starts the transition too. The final assertion requires all hydration calls to occur after cancellation and drainage, without assuming an implementation call count. The original 18/19 run is retained. Final affected tests pass19/19. Full combined checks and browser/GPU release verification are separate pending steps.
