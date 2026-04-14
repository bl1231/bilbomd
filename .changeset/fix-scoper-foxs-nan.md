---
'@bilbomd/ui': patch
---

Fix NaN crash in Scoper FoXS plots by guarding against zero error values in residual calculation and empty/non-finite domain values in Y-axis — mirrors the same fix applied to FoXSAnalysis in #573.
