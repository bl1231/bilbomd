---
'@bilbomd/ui': minor
'@bilbomd/backend': patch
---

Add the BilboMD BioEmu2 job form at /dashboard/jobs/bioemu (bilbomd#1200), for Admins while the pipeline is being validated: sequence entities (Protein, DNA) with copies, SAXS data, instructions and a pipeline schematic. The size limit comes from the backend's new `bioemuMaxTokens` config value, so the form and the server agree. The OpenFold3 form's entity editor moved to a shared component; it looks and works the same.
