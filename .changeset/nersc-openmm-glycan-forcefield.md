---
'@bilbomd/worker': patch
---

Fix NERSC OpenMM jobs that failed on glycoproteins and were reported as "Cancelled". The Perlmutter Slurm generator now picks the force field the same way the local worker does (GLYCAM for glycans, CHARMM36 for phosphorylated residues, Amber19 otherwise) reads the uploaded constraints from `openmm_const.yml` instead of dropping them, and strips waters and ions from the input PDB as the local worker does. A failed step now fails the Slurm job rather than cancelling it, so the owner gets a failure email, and the monitor stops polling jobs that are Failed or Cancelled. Requires the `bilbomd-openmm-worker:0.0.13` image on Perlmutter.
