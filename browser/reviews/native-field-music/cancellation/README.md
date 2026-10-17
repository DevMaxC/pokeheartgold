# Bounded native music I/O and restoration

Scope: `3b80e77e` + `09faeb1f` on base `cf8c15a3bb4c9560f4268f3fd353bf1e68b6fada`, touching only field-music.ts and its tests. No main/UI/World/corpus/export changes. All prior three player and three exporter review receipts are retained unchanged. The host independently owns end-to-end1500ms preparation/restore AbortControllers and retained cleanup.

## API and ownership

- `catalog(signal?:AbortSignal)`: cancellation rejects this caller promptly. Other consumers share the same catalog request, whose own lifetime/deadline still applies. Failed/timed-out shared requests evict for retry; a late result cannot replace a newer catalog.
- `field.restore(saved,signal?:AbortSignal)` and `createCueSession().restore(signal?:AbortSignal)`: optional caller cancellation actually unwinds stalled I/O. Owned battle nodes stop synchronously even when a restore signal is already aborted. Failed cleanup is retryable; the host must retain the session and restore in finally. A successful newer map/cue generation wins over stale restoration; player disposal rejects, rather than reporting a newer-map success.
- `isUnlocked():boolean`: successful Context permission plus actual running state, independent of song-load success. The host must use this when unlock joins another caller's cancellable load.
- `FieldMusicOptions.ioTimeoutMs` defaults4000. Catalog and complete fetch/hash/decode preparation each have a bound; AAC and MP3 share one preparation budget. There is no claim of a4000ms whole-session bound across catalog plus preparation; the host supplies its shorter end-to-end deadline. Ignored-abort fetch, digest and decode promises are observed explicitly; cancellation/deadline rejects without waiting for platform completion. Late results cannot enter the decoded cache or create an audio node. Shared hatch transport uses the same guards.

A permanently unsettled platform promise may retain native resources/data internally; JavaScript cannot force the browser decoder to release them. Logical cancellation prevents publication. The default background deadline is an explicit loading failure, not permission denial or a silent audio skip.

## Actual independent review and adjudication

The initial actual read-only Opus5.5 review found no medium-or-higher correctness bugs and confirmed the cancellation/cache/voice/deadline/shared-catalog/restore guards. Four reachableLow behaviors are preserved in the raw result:

1. Joining an active restore/load inherits the first owner's cancellation. This is the deliberate operation-ownership contract; catalog consumers are independently observed. `isUnlocked()` lets the host distinguish song failure from audio permission and avoid ordinary gesture song retries.
2. Disposal incremented generation and could falsely resolve a pending restore. Fixed by `09faeb1f` with a disposed guard before newer-map suppression; two direct-field/session disposal regressions pass.
3. A player's own I/O deadline is a normal failure and stops the old committed field voice; an external caller abort preserves it. Both remain retryable. This existing error-versus-cancellation policy is explicit.
4. A start failure after suspension leaves field interruption until that same session's restore. The host's retained finally cleanup is mandatory; this leaf does not silently abandon an owned interruption.

The separate bounded follow-up reviews only the disposed-restore fix. Raw results include exact modelUsage, prompts, zero-denial receipts and immutable source manifests. Reviewers did not execute tests. The initial packet's main.ts is explicitly the pre-host-hardening context, not evidence that the final host deadlines landed.

## Verification and limits

Initial42 targeted player/session tests and production TypeScript check passed. Final44 targeted tests and TypeScript check pass after the disposal fix. Fixtures explicitly hold catalog/fetch/digest/decode promises that ignore abort, verify prompt rejection without resolving them, then resolve late and check no cache/node publication; they also cover catalog consumer independence/deadline retry, field/session restore abort/retry, already-aborted cleanup, shared hatch decode disposal and real running-Context permission reporting. Logs are committed.

No broad suite, Vite build, browser/mobile audio audition or deployment was run for this leaf. Native cue rendering/export fidelity limitations remain in the original music receipts. This patch is not whole music/campaign parity or a production rollout claim.
