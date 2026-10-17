# Native evolution field presentation

Presentation-only leaf from campaign `873de2c1`. It consumes the exact shared
`battle-evolution-types.ts` contract from inventory commit `2a4da72a` (local
cherry `1b6ae640`). Predicate, battle queue, Mon/State mutation, move learning,
post-evolution effects and Main admission belong to their separate owners.
Review is pending until the immutable source packet is recorded below.

`createEvolutionPresentation(ports)` returns `BattleEvolutionScenePort`.
`WorldEvolutionView` occupies the existing `World.fieldEffect` slot, uses
original paper Pokémon in the live field, and preserves free yaw/pitch/zoom.
It does not construct a renderer, animation loop, Audio or AudioContext.

| Native source | This leaf |
| --- | --- |
| Battle scene flags3; B admitted only in OSCILLATE before particle-complete test | Same cancellation window; cancelled invokes no gameplay callbacks |
| Initial2, pre-particles20, narrowing40, post-fade8 ticks | Same awaited source-frame counters |
| Old/new cry and picture-animation readiness | Required real borrowed cry poll plus a real16-tick paper nod; nod is a deliberate3D adaptation |
| Original particle scene/emitter activity gates | Actual owned3D particle lifetimes; transform120 ticks covers one complete accelerated8→16→32→64 silhouette cycle. Native emitter resources are not recreated |
| Native palette hardware fades | Actual16-tick shader transitions; DS fade-rate equivalence is not claimed |
| New cry completes, then species/ability/stats change | `callbacks.evolve()` only after new cry and paper-pose completion |
| Message197:918 WAIT3 starts1188, WAIT2 polls it | Printer owns literal source text/control processing. No unconditional second fanfare |
| Congratulations printer then40 ticks | Then `callbacks.register()` |
| Native move menus, final fade, ApplyEvolutionEffects | Exactly await `learnMoves()`, finish actual visual fade and camera return, then `finish()` |
| Native B cancellation restore/old cry/message919/timer20 | Old art is restored,1011 stops, real old cry completes, source message and20 ticks, owned camera return |

The view's particles, nod and camera are intentional3D presentation choices.
Native gameplay decisions and semantic checkpoint order remain separate.
See `source-proof.json` for source hashes and exact qualifications. Four155/156
male/female front exports were compared pixel-for-pixel to the original indexed
source frame with its original normal palette (`art-oracle.json`).

## Required host ports

* `nextFrame(signal)` admits one evolution task update, rather than a dt catch-up
  burst. This is the native evolution scene frame domain, not an extra call to
  the30Hz field task clock. Draw must continue driving `World.fieldEffect.update`.
  A hidden/unloaded/disposed host aborts its scene signal.
  The leaf also observes abort independently of a stalled frame promise. Pure
  frame waits may be detached; mutating move-learning work is always drained.
* `takeBCancel()` returns the current frame's new B edge only. Earlier/held B must
  not be queued into the cancellation window. No keyboard listener is installed
  by the leaf; Main still owns coherent input and source-action priority.
* `print(197,id,operands,glyph,signal)` owns the real source printer, original page
  waits and WAIT callbacks. It must honour abort, and `clear()` must synchronously
  detach only its owned surface/handlers. It adds no acknowledgement after the
  actual printer has completed. Live polls1/2 refer to actual SE/fanfare state.
* `audio.open` synchronously returns an ownership handle with an abortable
  `prepare(signal)`. Its commands provide original1011, SE1528–1531/1510,
  fanfares1188/1184 and the requested original species/form cries. There are no
  default/no-op implementations, invented tones, species substitutions or
  per-scene AudioContexts. All voices borrow the supplied shared-master output.
* The output callback is live: muted admission returnsnull without requesting or
  unlocking a Context. Existing global mute/master gain remains authoritative.
  The backend must implement native no-voice outcomes and real completion/timer
  semantics; this leaf does not claim the borrowed backend is implemented.
  `cryPlaying` becomes true synchronously for an admitted cry. Native
  `fanfarePlaying` completion also performs its stop/background-unpause work.
* Audio preparation and artwork have technical4s watchdogs, distinct from scene
  timing. Session `cancel` stops owned voices synchronously. Independent field
  restoration is bounded1500ms. `retainRestore` preserves a failed/aborted cleanup
  closure; its backend must respect a newer field/music owner and map intent.
* `EvolutionField.actors` supplies the actual live Paper Object3D references and
  `current()` identity guards. A stale/unloaded actor is not resurrected. A field
  effect must be cancelled before replacing its owner, as current World field
  transitions do. A stolen slot is never cleared and its camera never overwritten.

The field is reserved before audio preparation across separate presentation
factories. A competing factory cannot open a session while another owns that
field, including its preparation phase.

Main must release the battle stage before this field view can be admitted, keep
the post-battle outer SourceRecovery transaction open, and defer source script
resume until the evolution queue has finished. Battle/Hatch/scene audio and field
music work must be drained/owned coherently by the eventual host. This leaf does
not add any of those bindings or change accepted Azalea source.

`learnMoves()` is deliberately not raced or detached. Inventory links its native
menu work to the same candidate signal and drains all tasks before rollback.
Native B-cancel returns`cancelled`; abort, missing resources and technical errors
throw. Even an abort during independent audio restoration cannot report success.

Nonzero forms and shiny art are explicitly unsupported until their original
exports are supplied. Base forms use gender-specific original art; genderless
uses the native non-female slot. Audio still must reject any genuinely unavailable
special cry behavior rather than silently substituting another cry.

## Validation and boundaries

Focused tests cover real Three geometry/particles, actual World draw/transition
hooks, source-frame counters, cancellation at final particle completion, native
printer glyphs, mutation order, menu-task draining, stale owners/artwork, bounded
preparation/restoration, live muted output and cached texture disposal/retry.
TypeScript and the source pixel comparison are separate checks. No browser,
GPU screenshot, audible test, production build or deployment has been performed.
No complete DS rendering/scheduler or full campaign parity is claimed.
