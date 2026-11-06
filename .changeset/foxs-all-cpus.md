---
'@bilbomd/worker': patch
---

FoXS now runs one process per available CPU instead of 80% of them. FoXS is single-threaded and nothing else runs during the step, so the step is about 1.4× faster (#1157 benchmark).
