# Legacy game entry

At `e01e1290`, `original.html` redirects to the current root interface and retains the query string and fragment using `location.replace`. The old duplicate shell lacked the required global audio, phone and touch elements and could not boot the shared runtime. Same-origin storage remains on the same origin; the browser uses a replacement history entry.

Only the compatibility HTML changes. No TypeScript runtime, original assets, dependencies or gameplay data change. TypeScript and Vite build exit0; no redundant unit test was added for this small HTML change. Full native1478-check evidence remains pinned to2f37f47d; the PR's CI reruns that suite separately.

Actual built-browser check opens `/original.html?legacy-audio-check=1#mute`, lands on `/?legacy-audio-check=1#mute`, displays the modern New Game/Settings title and all8 required audio/phone/touch controls, and retains an isolated origin's synthetic preference/probe values. Pointer/Enter toggle audio back to muted without choosing New Game. Volume stays0. This is functional URL/DOM/control evidence, not a copied user-save migration, campaign or audible check. See browser.json.
