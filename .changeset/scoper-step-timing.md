---
'@bilbomd/scoper': patch
'@bilbomd/ui': patch
---

Fix Scoper step status and timing: RNAView, KGS and IonNet now go Running before Success so their durations are recorded, steps are marked done when the next stage starts rather than when they start, FoXS no longer has its duration stretched by the final combined-model FoXS run, and the job page lists IonNet after FoXS to match the pipeline order (#1106).
