---
'@bilbomd/ui': patch
---

Fix OF3 job type display and add Rg/conformations to all MD pipelines. Corrects "Unknown Job Type" for OF3 jobs, fixes a runtime error when rendering OF3 job details, and makes the sans, alphafold, and of3 handlers consistent with pdb/crd/auto by showing Number of MD Runs, Rg values, and Number of conformations.
