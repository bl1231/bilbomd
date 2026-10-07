---
'@bilbomd/worker': patch
---

NERSC OpenMM jobs handle two inputs the way the beamline does:

- An mmCIF upload (Classic PDB or Auto) is converted to PDB on the worker before the Slurm script is generated, with the same `cif_to_pdb.py` step the beamline runs. The generator reads the PDB on a login node to strip waters/ions and pick the force field, and couldn't read a CIF.
- The FoXS step no longer fails the whole job when a few conformers fail; MultiFoXS only uses the profiles that succeeded. It still fails when no profile was produced, and now also when there are no `rg_*` directories to run.
