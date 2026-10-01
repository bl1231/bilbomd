---
'@bilbomd/ui': patch
---

Clearer error when a SAXS .dat file's first q value is out of range. The message now says only the starting point is checked, suggests dividing q by 10 for nm⁻¹ data, and tells users to keep their full q-range instead of trimming it.
