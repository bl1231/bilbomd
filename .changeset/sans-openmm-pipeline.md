---
'@bilbomd/worker': minor
---

Implement OpenMM engine path for BilboMD SANS pipeline. Previously all OpenMM function calls were stubbed out (commented), causing OpenMM SANS jobs to produce no MD output and fail at Pepsi-SANS. Now wires up prepareOpenMMConfig, runOmmMinimize, runOmmHeat, runOmmMD, and a new mirrorOmmMdToPepsiSANS step that symlinks PDB frames from openmm/md/rg_{N}/ into pepsisans/rg{N}/ for Pepsi-SANS to consume.
