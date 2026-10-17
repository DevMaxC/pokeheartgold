Production battle keyboard backport review contract

Base:333423a4, live production tree/UI22 line; isolated fix/production-battle-keyboard in pokeheartgold-tree-release. Native campaign dd64b5c2 identified the same issue, but its approval is not transferred here.

Only runtime change: move the EXISTING inline field-availability return before the field movement/Space/Enter preventDefault call in Main's global keydown callback. No condition operands, precedence, sound unlock, editable target, UI.busy, modifier, Escape, keyup or interaction behavior is rewritten. No campaign, renderer, tree, audio, Battle or UI implementation edits.

The bug is reachable on real Battle.menu buttons: UI.busy is false, so the old Main prevents Enter/Space before noticing battle.active. This cancels ordinary button default activation. New Main returns first when the field is unavailable, leaving battle button activation to the browser. Available-field HUD Enter still prevents default and runs interact once; UI-owned panels retain capture-handler ownership.

Focused tests parse/extract the ACTUAL production Main keydown callback with TypeScript AST. Real production Battle.menu/moveMenu/Back render and handle real source-data Cyndaquil/Rattata fixtures; real production UI handles owned choices. Explicit fake DOM supplies the browser's button default click ONLY when no event listener prevented it. This is headless event/handler evidence, NOT actual browser layout/default-activation QA. No GPU/audio is instantiated.

Original exact Main negative control:3642e3ed94adfc3d318c8cec66e6c21971c6cd8125240a9c59a4f16303deddef; callback598365b91ed2636baaa0476bc9ec9a75e2589c34cf3b2a28cd171719ebcb67ad. It fails the real Fight Enter case (expected defaultPrevented false, actual true); other two tests pass.

Fixed Main:973aace60664d103d6d7ffa99b64cced46c829864390f0fd0f8440c4d6150a30; callback56a1f8ff521886748ee0271df3805f94454c643e4c2f66c009470d71ce1ecb0d. All3 focused tests pass. TSC and git diff --check pass. No Vite/build/browser/full-suite/deployment claim; parent will integrate with roofs and verify the merged/live artifact.
