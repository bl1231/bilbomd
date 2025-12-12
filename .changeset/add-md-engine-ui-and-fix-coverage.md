---
"@bilbomd/ui": minor
---

Add MD engine selector (CHARMM/OpenMM) to new job forms (Classic PDB/CRD, Auto, AlphaFold, SANS), with Formik integration and Yup validation. Include unit tests covering default selection and toggling.

Stabilize Vitest coverage under Turbo by ensuring `coverage/.tmp` exists via a pre-test setup file and configuring coverage in `vite.config.ts` (`setupFiles`, `coverage.provider`, `coverage.reportsDirectory`).

No changes to backend, worker, or shared packages.
