# Persistent global audio control

Runtime reviewed at `84864cb72f650069d72bbd14877ba1bc04b63518`, based on production `d81f0b230ea251a4ce99d9125a64ddda5265bd5a`.

The always-available Mute/Unmute button uses the existing stored sound preference, follows Settings and same-origin storage events, and remains independently operable during owned panels. One master gain silences field, battle and shared hatch output while hidden or page-hidden, including late loads. Foregrounding cannot override an explicit mute. The shared context remains able to complete owned native sound work.

The original actual Opus 5.5 review found four defects: focused-button field keys, overlap with battle camera controls, stale open Settings labels, and Settings-On unlock ordering after a saved mute. All original findings/raw output are retained. The final actual Opus review traces all four corrections and reports no remaining scoped defect. Original/final immutable snapshots, manifests, prompts, raw/model-usage results, invalid first follow-up launch receipt and exact-source probes are preserved separately.

Final checks: 126 affected tests, 675 full tests, TypeScript and Vite build pass at the exact final source. The final two CI runs also pass. The first full run's two AST extraction failures are preserved; the fixtures now bind the actual shared preference function after it moved out of the constructor object.

Actual browser checks cover the title/Settings mute, Enter/Space without dismissing Settings, natural same-origin cross-tab updates, and responsive button bounds. The three battle-control captures use actual Battle.draw/menu on an unsaved fixture State, **not** a battle playthrough or scene-renderer check. Volume stayed zero throughout all new browser checks. The identified background Elm-lab preview was muted and reloaded to its saved title. Other old disconnected previews could not be inspected. No real-phone, audible or FPS approval is inferred. See browser/receipt.json.

Offline review files are excluded from deployment uploads. No original media or gameplay data was changed. Native-campaign integration and its live hatch preference handling are separate work.
