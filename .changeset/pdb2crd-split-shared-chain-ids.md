---
'@bilbomd/worker': patch
'@bilbomd/bilbomd-types': patch
'@bilbomd/ui': patch
---

Stop CHARMM jobs from bonding separate molecules that share a chain ID (#1331). `pdb2crd.py` now starts a new CHARMM segment after a TER record, when the segid changes, or where consecutive nucleotides are not bonded (O3′–P over 2.5 Å). Before, it built every chain ID as one segment, so two DNA strands under one chain ID were generated as one polymer and minimization joined them. A chain's first segment keeps its name (`DNAD`). A later one gets its own type and letter if that name is free (`CARA` for a glycan after protein chain A), otherwise its input segid's letter (`DNAB`), otherwise the first letter no chain uses. Only the first model of a multi-model file is read. Ions and waters after a chain's TER no longer block the protein's C-terminal patch.

`readPdbSegments` and `readCifSegments` predict the same segments, so the constraints editor and the server's validator match what CHARMM builds. In PDB mode, constraint segments now carry their segid wherever it's known (the editor, resubmits, const.inp and data imports). For a chain that is several segments, the validator picks the segment by segid or residue range. It rejects a whole-chain selection or a range that crosses segments, and says how to fix it.
