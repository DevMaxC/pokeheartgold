This is a concrete integration plan, not an applied Main/VM patch. DEPLOYMENT GATE: do not deploy the factory-false or new-state-marker change separately. The SAME deployment must also update every live Main naming setter; wrong booleans saved in an interim release cannot later be reconstructed by the compatibility migration. Reconcile against Root's then-current Main; do not replace its reviewed audio/recovery/other bindings with this older base.

1. In Main's admitted old local `Continue` path, after the version2 state has been selected and before any battle/evolution queue exists, call `migrateLegacyBrowserNicknames(data,state,{origin:'local-browser-v2'})`. Retain the receipt and persist the helper-written `state.nicknameMetadata` marker with successful metadata in the ordinary save transaction. New states already carry the fresh-browser marker. On marked saves the helper performs no inference and reports new missing flags explicitly; do not delete the marker to rerun migration. Surface unresolved actual evolution slots through the existing explicit unsupported/recovery path; do not pass a manufactured false. New games use the factory's known false. Rollback snapshots after this admission retain the flag. This policy must not be run on arbitrary native/foreign saves or on each queue invocation.

2. Import `applyNativeFieldNicknameInput`, `applyNativeNicknameResult`, `resolveNativeNicknameInput`, and the `NativeNicknameInputCode` type. Replace only the field naming hook with an exact return:

```ts
nickname:async index=>{
 const mon=state.party[index];
 if(!mon)throw new UnsupportedNativeNickname('Missing native party naming subject');
 const input=await ui.input('Pokémon nickname',10,mon.name /* existing owner signal */);
 // Check the owning scene/signal/current subject after the await as Main's
 // existing transaction/lifecycle contract requires, before committing.
 return applyNativeFieldNicknameInput(data,mon,input);
}
```

Index255 is the original Bug Contest subject. Current Main has no real contest subject port; leave it explicit unsupported until that owner is implemented, rather than silently succeeding for a missing party slot. The current `UI.input` returns a required string. Do not pretend it supplies cancellation/null or widen it with a noop fallback. The helper's null is an explicit future no-input port, not an exception-catching conversion. A submitted unchanged ordinary name already maps to1. The English UI's trim/charset/blank gaps require a separate source-owned UI task if full naming parity is desired.

3. In `ScriptHooks`, require `nickname:(index:number)=>Promise<NativeNicknameInputCode>`. In the `NicknameInput` VM handler, await that code, require exactly0 or1 at runtime (throw the existing `UnsupportedScript` for another value), and write the actual code into `a[1]`. Never use `Promise<void|number>`, `result??0` or a compatibility noop. Update every actual Main hook/test mock explicitly and add a VM branch test where unchanged names take the native noInput1 path and changed names take0.

4. Capture Main currently edits the caught enemy object retained in party/boxes. On accepted naming, use `applyNativeNicknameResult(data,mon,resolveNativeNicknameInput(input))`. This is deliberately not the field wrapper: capture's original buffer starts blank, so explicitly entering its species name is an applied0 result with false flag. “No” leaves the factory's false untouched. Use the existing ownership/capture transaction before any commit. Preserve the accepted egg-hatching path's own noInput/flag flow; do not rewrite it merely to deduplicate.

5. Bind the evolution queue metadata port to the stored `mon.hasNickname` boolean after the above admission/setter work. Queue/controller remains strict and owns no migration/name inference. Add real Main tests for default starter, custom starter, unchanged field name, capture custom/default, old default/custom saves, failed naming rollback and missing/foreign metadata. A historical helper test is not approval of those future Main bytes.

The currently pinned historical Main/VM fragments and whole-file hashes are in `legacy-main-naming.json`. The exact source return ABI is `src/scrcmd_c.c:2115` → `CallTask_NamingScreen` → task state3 `*retVar=args->noInput`; the name is written only when `noInput==0`. No Main, VM or UI file is edited in this leaf.
