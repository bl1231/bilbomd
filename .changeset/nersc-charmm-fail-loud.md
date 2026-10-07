---
'@bilbomd/worker': patch
---

NERSC CHARMM jobs now fail instead of reporting Success when a step silently went wrong:

- every CHARMM step (meld, minimize, heat, md, dcd2pdb) fails if its output says a file "cannot be opened". CHARMM only warns about this under `bomlev -2` and exits 0, which is how CRD jobs ran without their constraint file.
- meld's exit code is now checked.
- PDB remediation fails when dcd2pdb produced no PDB files, instead of exiting 0 and ending the Slurm job as COMPLETED with no results.
- `run-foxs-after-charmm.py` exits 1 when no FoXS profile was produced. As on the beamline, a few failed conformers are only a warning.
