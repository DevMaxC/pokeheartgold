I found **four confirmed, actionable defects** in the exact `66a1858f` bytes, all from reading the code and doing CSS arithmetic. The audio gating itself checks out. Nothing was run in a browser, so focus, autoplay and layout behaviour are inferred, not observed.

## 1. Confirmed findings

### F1 (Medium): when the Mute button has focus, it swallows every key except Tab. The preliminary witness is **confirmed**.
- **Where:** `main.ts:289` returns early for *any* key when the target is inside `[data-global-audio]`. `ui.ts:44` does the same for every key except Tab.
- **Trigger:** In the field, click Mute (Chromium and Windows/Linux Firefox give a button focus on click; Safari and macOS Firefox usually don't), or reach it with Tab and press Enter/Space. Focus stays on the button.
- **Wrong outcome:** WASD/arrows, Shift (run), Q/E (camera), F (interact) and Escape (menu) all do nothing until focus moves. In dialogue, F no longer advances. In a modal, Arrow/Home/End/Escape/B stop working while the button has focus.
- **It can come back:** `ui.panel` saves `returnFocus=document.activeElement` (`ui.ts:31`). If a panel opens while Mute has focus, `hidePanel` hands focus back to Mute (`ui.ts:36`) and the field is dead again.
- **Why it's a regression:** before this change, field keys on a focused HUD button reached the field handler. `main-battle-keyboard.test.ts:67-72` relies on exactly that for `#open-menu`. The new early return is wider than the stated goal, which only needs Enter/Space.
- **Fix:** in both handlers, return early only for `Enter`/`Space` on the mute target (`ui.ts` already lets Tab through). Other keys then follow the normal path. In a modal, F on a focused Mute would then click Mute through `controls[index].click()`, which is acceptable.
- **Counterevidence:** the button still works, and Tab or a canvas click recovers. That makes this a usability and keyboard-access regression, not a progression blocker.

### F2 (Medium on mobile, Low on desktop): the button covers the battle "rotate right" camera button.
- **Where:** the new `#audio-toggle` rule (`style.css:556`) overlaps the existing `.battle-heading`/`.battle-camera` rules (`style.css:290,293-294,443,448,515`). The camera buttons are rendered at the right end of the heading (`battle.ts:57`).
- **Geometry, before safe-area insets (which apply equally to both elements):** Mute sits at top 12px, right 12px, at least 64×44, z-index 40, above `#battle-screen` (z-index 10).
  - Desktop: `#battle-camera-right` is at x [vw−68, vw−24], y [20, 64]. About 82% of it is covered.
  - Width ≤680px: it is at x [vw−58, vw−14], y [12, 56]. It is **completely covered**, and the left camera button loses about 13px.
  - Short landscape: almost fully covered.
- **Wrong outcome:** a touch user aiming at camera-right toggles mute instead. Camera input is disabled during battle (`main.ts:82`), so these two buttons are the only pointer rotation controls.
- **Fix:** add right offset to `.battle-heading` (or `.battle-camera`) equal to the button's width plus its gap, as was already done for `#game-hud` (`style.css:558`).

### F3 (Low): an open Settings panel shows stale Music/Volume values after a change from the Mute button or another tab.
- **Where:** `interface-panels.ts:48,57-58`. `#setting-music` text and `aria-pressed`, and the volume slider and output, are written only at render time and by their own handlers. The `watchMusic` callback (`:52-53`) refreshes only the status line.
- **Trigger:** open Settings (from the title or the menu), then activate Mute. That is reachable by design: the button is not inert and is part of the modal Tab loop (`ui.ts:25,38`). A same-origin storage event (`audio-controls.ts:56`) has the same effect, and also leaves Volume stale.
- **Wrong outcome:** Settings says Music "On" (`aria-pressed=true`) next to the status "Music is off." Pressing the Settings Music button, intending "turn off", computes `!false` and **unmutes**, while the label still reads "On". The saved data is never corrupted, because `update` re-reads `preferences()`.
- **Fix:** inside Settings, subscribe a renderer for `#setting-music` and the volume controls to `watchMusic`.

### F4 (Low): turning Music on in Settings doesn't unlock audio in that tap if audio was never unlocked this page load.
- **Where:** the new guard at `main.ts:61` (`if(!preferences.music…)return;`) combined with the Settings `bind`, which calls `this.ports.gesture()` *before* `action()` (`interface-panels.ts:50`).
- **Trigger:** the page loads with saved `music:false`, so nothing has been unlocked. Open Settings and turn Music On.
- **Wrong outcome:** `unlockSound` runs while music is still false and exits. Then `setPreferences` runs `reconcile`, which returns `locked`. The status says "Music is on." but nothing plays until the next gesture (Done, another control, or a key). Before this change, the same gesture unlocked the context.
- **Fix:** call `gesture()` after `update` for the Music action. Alternatively, have `updatePreferences` call `unlockSound()` when music turns on and `persist===true`, so storage events still never unlock.
- The global button doesn't have this problem: `audio-controls.ts:53` updates first, then unlocks.

## 2. Traces and counterevidence (no defect found)
- **All audio goes through one gain node.** The only production `AudioContext` is in `field-music.ts:160`, and its gain node is the only thing connected to `destination`. Every `AudioBufferSourceNode` is created in `voice()` and connects to `gain` (`:87`). Field, cue-session/battle and hatch audio all use `voice()`. `createHatchTransport` isn't used in `main.ts`. A grep found no other `AudioContext`, `<audio>`, `new Audio` or oscillator. No path bypasses the shared gain.
- **Hidden page goes silent at once:** `updateGain` (`:65`) assigns `gain.value` immediately, and is called from `setPageActive`, `setPreferences` and gain creation in `unlock`. A load or decode that finishes later still connects to the zeroed gain. An unlock already in flight builds its gain with `pageActive` applied. `unlockSound` refuses to start while hidden (`main.ts:61`). No timers, completion or `ended` events are paused.
- **Restore on return:** `pageshow` and `visibilitychange` both run `visibility()`, and gain comes back as `enabled ? volume : 0`, so it only becomes audible if the user has music on.
- **Main startup order / TDZ:** `bindAudioControls` (`main.ts:79`) runs after `preferences`, `preferenceStorage`, `music` and `musicListeners` exist (`:40-43`). `unlockSound`, `updatePreferences` and `watchMusic` are hoisted functions that don't use `touch`, `camera` or `state` before `started`. The module script comes after `#audio-toggle` in `index.html:14,62`. No TDZ problem.
- **Storage events:** the `persist=false` path never writes, so there is no write loop. Events for other keys or from sessionStorage are ignored. With null storage, all events are ignored. `key===null` (clear) loads defaults, which is reasonable.
- **Modal focus:** `focusin` doesn't pull focus back from Mute, and Tab and Shift+Tab cycle through the panel's controls plus Mute. Pending choices can't be accepted by Mute; the `ui.ts:44` early return comes before the panel's Enter/Space click logic. One edge case: if a panel has no focusable controls, `focusPanel` would land on Mute. I found no such production panel.
- **Field HUD layout:** the new `#game-hud` right offset comes later in the file than the earlier media rules at the same specificity, so it wins. At ≤680px the location card fits (vw−174 ≤ vw−100−56−6).

## 3. Scope and limitations
- **Read:** `change.patch`, `before/`, and the current `main.ts`, `ui.ts`, `field-music.ts`, `audio-controls.ts`, `interface-panels.ts`, `interface-preferences.ts`, `index.html`, the relevant parts of `style.css` and `battle.ts`, and `main-battle-keyboard.test.ts`. Read/Grep/Glob only; nothing was executed and nothing outside the snapshot was read.
- **Not verified:** real-browser focus-on-click per engine, native Enter/Space activation, AudioContext autoplay and resume behaviour, how mobile browsers handle background tabs and bfcache, and rendered layout. F2 is CSS arithmetic. The fake-DOM tests (`ui-test-dom.ts` and the extracted keydown handler) don't stand in for browser QA, and none of them cover the cases in F1–F4.
- **Untested layout concern (not a finding):** on narrow screens, long `.ui-toast` (z-index 25) and `#loading` (z-index 30) messages can stretch under the button's top-right area and have their right edge hidden.
- This review covers only these original bytes. It is not approval of any follow-up commit.
