---
'@bilbomd/worker': patch
---

NERSC CHARMM templates now deploy with the generator. `sync-nersc-scripts-to-cfs.sh` copies `bilbomd-templates/` next to `gen-charmm-slurm-file.py` on CFS, and the generator reads them from there instead of the hand-maintained `$CFS/.../templates` directory. The generator now supplies the `../../` and `charmm/md/` paths that were hand-edited into the CFS copies, so the rendered CHARMM inputs are unchanged. `dcd2pdb` now uses `bomlev -2` like the beamline (#640), so ligand-containing systems no longer abort on the CGenFF NBFIX warning.
