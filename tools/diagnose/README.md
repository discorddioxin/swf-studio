PASS — Mock GSI gateway answers method 50 correctly.
Servers returned: 2 (Angelic Fishing, Demonic Fishing)
Raw response serialized correctly; unlocks checklist.
If your Execute console does NOT show "GSI gateway POST → 50(...)", the AS2 LoadVars hasn't fired yet (try refreshing / waiting a few ticks after frame 75). If it DOES show but list stays blank, the List refresh is an engine-side timing issue.
