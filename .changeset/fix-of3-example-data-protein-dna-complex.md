---
'@bilbomd/ui': patch
---

Fix OF3 "Load Example Data" to populate the correct protein-DNA complex example: a 203-aa protein plus two 24-nt DNA strands, matching the actual files in `example-data/of3/`. Previously a different, unrelated 823-aa single-protein sequence was hard-coded.
