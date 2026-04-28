---
'@bilbomd/ui': patch
'@bilbomd/bilbomd-types': patch
---

Fix UI cofactor alerts to reflect GAFF2 support for organic small molecules. Split STRIPPABLE_COFACTORS into GAFF_COFACTORS (organic, now parameterized via GAFF2) and METAL_COFACTORS (heme/porphyrins, still removed). FAD and similar molecules now show a blue info alert instead of a yellow warning.
