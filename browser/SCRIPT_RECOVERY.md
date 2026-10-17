# Source scene failure recovery

A source field action owns one checkpoint of the complete `State` and the live
field actors. Nested standard scripts, entry scripts, warps and battles share
that checkpoint. Saving, including autosave and page-close saving, stays blocked
until the outer action finishes or recovery has restored the field.

An explicit script failure restores the root `State` object in place. The VM,
battle and actor collection keep their shared reference. Newly introduced
optional state keys are removed when they did not exist at the checkpoint.
Actor positions and visibility come from the live actor checkpoint, which can
be newer than `State.objectEvents`.

Recovery reloads the checkpoint's field directly. It restores weather, player
height, lift state, actor positions, follower state and camera settings without
running entry scripts, changing the blackout spawn or clearing Flash/Defog.
The failed VM is replaced after its outstanding movement tasks have settled.
Play time remains monotonic, including time spent in failed scenes or load retries.

The error panel identifies an unsupported source command and offers an explicit
scene retry. Returning to the field leaves that scene uncompleted. Automatic
frame polling pauses the failed trigger on the current map; retrying explicitly
or changing maps clears that pause. A failed first entry can also return to the
restored field; it does not trap Continue in a deterministic retry loop. It never treats an unsupported command as a
successful scene. If field hydration also fails, saving and new field actions
stay blocked while the player retries loading.

## Battle commit policy

A battle completed in an earlier field action remains committed. A battle
inside a source scene stays provisional until that entire scene finishes. If a
later phone offer, dialogue or quest command fails, its battle rewards, HP/PP,
experience, inventory and trainer flags roll back together. Committing only the
battle before its source script completes could award money repeatedly while
leaving the trainer undefeated.

## Scope and verification

This prevents new partial scene saves. It does not infer whether an older save
was already advanced by a failed script, and does not rewrite that save's quest
flags. Unsupported commands still require implementation; this is not a claim
of complete original-game parity.

`src/source/script-recovery.test.ts` exercises the actual Sprout Tower 3F script
that sets `VAR_UNK_40A4` before failing at `CreateCameraTarget`, the actual shared
item-gift script, pending movement, live NPC changes, nested map-entry failures,
battle/phone failure consistency, failed hydration retries and automatic-trigger
latching. Run it with:

```sh
node --experimental-transform-types --test src/source/script-recovery.test.ts
```
