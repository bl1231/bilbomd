---
'@bilbomd/ui': patch
---

Auto job forms: warn when an uploaded PDB/CIF structure has an all-zero B-factor (pLDDT) column. The non-blocking warning explains that AlphaFold3-style PAE JSON will let BilboMD recover pLDDT automatically, and otherwise no rigid bodies will be defined. Applies to both the new and resubmit auto-job forms.
