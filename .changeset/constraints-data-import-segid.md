---
'@bilbomd/bilbomd-types': patch
---

`importConstraintsFromData`: with the structure given, a selection by segid alone that the structure doesn't have is left out with a problem, instead of being read as the chain its name suggests (which can be the wrong chain, e.g. PROA when protein chain a is PROA and chain A is DNA).
