---
'@bilbomd/worker': patch
---

Fix non-protein atoms (glycans, FAD, cofactors) being reassigned to Chain B in OpenMM output PDB files. Added `keepIds=True` to all `PDBFile.writeFile` calls in heat.py, md.py, and pdb_writer.py so chain IDs from the input structure are preserved throughout the pipeline.
