---
'@bilbomd/worker': patch
'@bilbomd/mongodb-schema': minor
'@bilbomd/bilbomd-types': minor
'@bilbomd/ui': patch
---

Fix and restructure the SAXS fit assessment behind the Feedback & Validation tab.

- Model molecular weight no longer drops segments that share a chain letter and residue numbers (protein–DNA complexes were under-counted).
- The SAXS molecular weight now uses the published Rambo–Tainer volume-of-correlation method, and the comparison is advisory: a mismatch no longer replaces the fit assessment.
- The assessment no longer fails when a model PDB is empty or missing, when the data end below q = 0.2 Å⁻¹, or with ten or more ensemble sizes.
- `feedback.json` and `Job.feedback` gain `version`, `findings`, `regions`, `models` and `mw`; the existing fields remain, and the molecular-weight fields can now be null.
