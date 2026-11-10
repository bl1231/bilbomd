---
'@bilbomd/ui': patch
---

Stop showing OpenMM as the engine of BilboMD BioEmu2 jobs, which sample with BioEmu2 and only use OpenMM to polish the final ensemble members. The jobs list column is now titled "MD Engine" and shows "N/A" for BioEmu2 jobs; the job page and the mobile job cards show no engine for them. The submission confirmation no longer says the job will use OpenMM for a Molecular Dynamics step.
