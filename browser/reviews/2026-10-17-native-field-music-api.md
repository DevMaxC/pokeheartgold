# Native field music host API (source leaf)

Base: `93bf982b0d866a1150f22eae6ad6caf91da46bc5`. Source player frozen for host integration; native corpus/export review continues separately. No main/UI/World integration or browser audio audition is claimed here. Initial actual Opus5.5 review found three reproducible lifecycle defects; this follow-up fixes them with regression tests. Follow-up independent review is pending.

```ts
const player = createNativeFieldMusicPlayer({enabled: true, volume: 0.7});
// Call directly from pointer/keyboard handler. Context construction and resume()
// run synchronously, before unlock() first awaits. Await/report its Promise.
await player.unlock();
await player.playMap(map, {hour, flags, surfing, override}, signal);
await player.playCue({id, key}, 'other', signal);
await player.setPreferences({enabled, volume}); // volume 0..1
const catalog = await player.catalog(); // small JSON only, no song/context
const snapshot = player.capture();
const paused = await player.field.suspend(snapshot);
await player.field.restore(paused); // independent of aborted hatch signal
await player.dispose();
```

`playMap/playCue/setPreferences` resolve `{status: 'playing'|'locked'|'muted'|'silence', cue?}`; absent/unsupported original tracks and decode/network failures reject explicitly. `playMap` takes `{id}` and local RTC hour 0..23. Flags accept canonical native names or `#<numericId>`. Surf, ordered source story overrides, then a saved nonzero music override follow native field selector priority. Radio requires the actual radio owner's cue through `playCue`; no fabricated radio state.

`capture()` and `field.capture()` return `{kind:'none'}` or `{kind:'playing',cue:{id,key},positionSeconds,source:'map'|'surf'|'radio'|'other',identity}`. Paused/muted owned voices retain identity/phase. `field.suspend(expected)` returns the authoritative actual paused snapshot (including load latency). `field.restore(snapshot)` resumes that identity/phase only if its requested cue is still current; newer map intent wins. Restore is idempotent.

For the existing hatch session factory, create one transport per invocation:

```ts
createNativeHatchMusicSession({
  enabled, field: player.field, transport: player.createHatchTransport(),
});
```

Hatch transport uses the same unlocked Context and volume gain. Its dispose stops only its owned hatch voices; player dispose stops all shared voices, rejects outstanding completions, and closes the Context. No new gesture is required after the shared Context has actually unlocked. The independent hatch module is intentionally not imported by this production-base leaf.

Construction does not request any song or create audio. A bounded decoded cache (default two cues) prevents all-track preload. AAC/M4A is primary, MP3 is an independently verified fallback; both are original native sequence/sample renders with lossy compression, not hardware bit-exact output. Native frame loop positions retain phase across pauses. Actual Safari/mobile decoding and listening remain browser verification work.

Validation: 23 focused lifecycle/selector/session tests pass. Production TypeScript is checked for each scoped code handoff. Focused tests use an instrumented WebAudio port and do not constitute audio audition.

Battle cue ownership (additive API):

```ts
const {cue, parameter} = nativeBattleMusic(await player.catalog(), {
  battleType, mapId, trainerClass, leadSpecies, flags,
});
const battleMusic = player.createCueSession();
try { await battleMusic.start(cue, signal); /* actual encounter */ }
finally { await battleMusic.restore(); }
```

`nativeBattleMusic` is exported by `battle-music.ts`. Pass actual native setup values; trainerClass is required for bit0 trainer battles, first-alive enemy species for wild battles. The original source tables and flag/map region selectors are exported in the small catalog. The music selector does not imply special battle modes or their transition effects are implemented.

`createCueSession().start(cue, signal)` prepares the original compressed song, then suspends the actual field voice and starts a separate owned voice on the shared Context. `restore()` stops that cue and idempotently restores the actual field phase; new map/blackout intent wins. Failed field restoration remains retryable. A pending start is cancelled by restore, and nested interruptions reject. Mute skips song loading; unmuting an active session loads its own requested native cue rather than field music. Volume-only changes retain active field fetch/caller cancellation.
