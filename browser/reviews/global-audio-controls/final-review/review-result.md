I couldn't confirm any scoped defect in `84864cb7`. All four original findings are closed, with the qualifications below. This is a static, read-only review: I ran no tests and drove no browser.

## F1: keyboard while global Mute is focused — closed
- **Main (`main.ts:289`)** now returns early only for Enter or Space when the target is the Mute button, and never calls `preventDefault`. W/A/S/D/Q/E/F/arrows/Escape continue into the normal field path.
- **UI (`ui.ts:44`)** returns early only for Enter/Space/F. Tab, arrows, Home/End, Escape and B fall through to the panel's own rules (`ui.ts:45-61`) and dialogue's own rules (`ui.ts:63`).
- **Order of handling:** UI listens first (capture, `ui.ts:24`), then Main (bubble). For Enter/Space on Mute, neither calls `preventDefault`, so the browser's own button press calls `toggle` once (`audio-controls.ts`). No pending choice or dialogue is advanced, and nothing is added to `keys`.
- **F on Mute:**
  - With a panel or dialogue open: UI returns, then Main calls `unlockSound()` and returns on `ui.busy`. F does nothing, so it can't accept a pending choice.
  - In the field: Main calls `preventDefault`, adds to `keys` and calls `interact()`, so ordinary F still works.
- **Battle ownership:** Battle is built on the same `UI` (`new Battle(data,state,ui)`, per the test fixture), and only `ui.ts` and `main.ts` have keydown handlers. Mute is a direct child of `#game` (`index.html:14`), not inside the elements made inert while a panel is open (`ui.ts:31`). `focusables()` adds Mute last in the panel cycle (`ui.ts:38`), and the `focusin` handler doesn't pull focus back from it (`ui.ts:25`).

## F2: Mute overlapping the Battle camera-right button — closed (static only)
- Line `style.css:558` (`#game-hud, .battle-heading { right: calc(88px + var(--safe-right)) }`) has specificity 0,1,0 for `.battle-heading`. It comes after the media-query overrides at `:443` (14px), `:515` (16px) and base `:290` (24px), so it wins at every breakpoint.
- Nothing more specific sets `right` on `.battle-heading` (searched). The later `@media (max-width:680px)` at `:559` doesn't touch it.
- Mute sits at z-index 40 above `#battle-screen` at z-index 10. Its bottom edge (top 12 + min-height 44 = 56px) is above the enemy status box at all breakpoints (70/86/108px).
- Your 390×844 numbers check out: heading right edge at 302, Mute left edge at 309.68, a 7.68px gap. That holds only while the Mute button is at most 76px wide. Rendered width depends on fonts, and I make no claim about browser layout.

## F3: Settings On/Off and Volume going stale — closed
- `watchMusic(updateMusicStatus)` is now registered unconditionally (`interface-panels.ts:53`). `updateMusicStatus` (`:52`) re-reads the shared preferences and only writes to the DOM: button text, `aria-pressed`, slider `value`, and the output text.
- **No loop:** setting the slider's `value` from code doesn't fire `input`, and the function never calls `updatePreferences`. Storage events call `updatePreferences(…,false)` (no write), which notifies listeners, which only render.
- **No stale DOM access:** the `current()` guard checks `!settled && panelTask===task` (`ui.ts:117`). When the panel is replaced, `finish` runs `cleanup()` first (`ui.ts:30,114`), which unregisters the watcher before the HTML is swapped.
- **No snap-back mid-drag:** preferences update synchronously on each `input`, so later async refreshes restore the latest slider value.

## F4: turning Music On from a saved, never-unlocked mute — closed
At `interface-panels.ts:58`, the order on click is:
1. The generic `gesture()` runs first. With music still off, `unlockSound` returns immediately (`main.ts:61`).
2. `update({music:true})` sets `preferences.music=true` synchronously (`main.ts:78`).
3. `gesture()` runs again. `unlockSound` now passes its check and calls `music.unlock()`, which creates and resumes the AudioContext in the same click.

Other paths:
- **Keyboard:** Enter/Space on the button goes through UI `preventDefault` and then `.click()` from inside the keydown (`ui.ts:59`), so it is still within the key press. Main then sees `defaultPrevented` and returns.
- **Unlock already in progress:** `unlockSound` returns, and the earlier request was itself started by a user action.
- **Battle owns audio:** nothing new here. `music.unlock` still awaits `cueSession.preferences`.
- **Storage events and the Settings watcher** never call `unlock` or `gesture`.

## Earlier conclusions
`field-music.ts`, `audio-controls.ts` and `interface-preferences.ts` are unchanged since 66a. In `main.ts` only the keydown line changed. So these still hold:
- one AudioContext, with every voice going through a shared gain;
- page hidden/pagehide sets output to 0 synchronously, and becoming visible restores only what the user enabled;
- timers and script completion are not suspended.

The module-level `bindAudioControls` call (`main.ts:79`) only uses bindings declared at lines 30–47 or hoisted functions, so there's no use-before-declaration error at startup. The native-campaign hatch capture is outside this code path and not assessed.

## Minor, unconfirmed concerns (not scoped defects)
1. **Stale camera/text-speed display:** a cross-tab storage event while Settings is open updates `cameraSensitivity`/`textSpeed`, but `updateMusicStatus` only refreshes the music/volume controls. The camera slider and Text speed labels can show old values, though the next click or input works from the correct current value. Display only; outside F3's music/volume scope.
2. **Unneeded AudioContext on mute:** switching Music On→Off from Settings in a never-unlocked session lets the generic gesture create and resume an AudioContext just before muting. The gain is set to 0 synchronously in the same click (`setPreferences` → `updateGain`), so nothing is audible. This was already the case in 66a.
3. **Untested browser behaviour:**
   - holding Enter on Mute (auto-repeat) may toggle it repeatedly;
   - whether Space activation still happens after `preventDefault` on a panel button;
   - real focus behaviour, real autoplay or audition, and mobile backgrounding.

## Test and evidence limits
- The changed tests run in a fake DOM with a synthetic AudioContext. They simulate the browser's own button press with `if(!defaultPrevented) click()`, so they don't prove browser default activation or that audio actually plays.
- I didn't execute anything. The earlier 125-targeted/674-full passes were on `71b` source, not `84864`. The final 126-targeted/675-full runs and the build are yours.
- Your 390×844 check was on `82b`, before the final F4 commit.
