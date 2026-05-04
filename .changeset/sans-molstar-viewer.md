---
'@bilbomd/worker': patch
'@bilbomd/ui': patch
---

Add Molstar viewer support for SANS jobs.

Worker: fix SANS ensemble PDB files to use proper MODEL N / ENDMDL formatting so Molstar can load each conformation as a separate assembly. Populate results.sans.ensembles in MongoDB after each SANS job completes.

UI: enable the Molstar viewer for completed SANS jobs in SingleJobPage. Viewer.tsx now routes SANS jobs through the same ensemble loading path as classic/auto/alphafold jobs.
