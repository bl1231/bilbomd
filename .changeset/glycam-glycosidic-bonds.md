---
'@bilbomd/worker': minor
---

Fix OpenMM glycoprotein preparation for branched and complex N-glycans. Previously, glycoprotein jobs failed during energy minimization with `Template match failed for residue: NLN` because the GLYCAM-renamed glycan was imported without any glycosidic linkages or sugar-skeleton bonds, and branched/reducing-end sugars were assigned incorrect GLYCAM residue names.

- `glycam_rename.py`: derive the full set of substituted hydroxyls for every sugar and map it to the correct GLYCAM linkage prefix (including branched letter codes such as `VMB`, `XMA`), so reducing-end and branch-point sugars are named correctly (e.g. an O4-linked reducing GlcNAc is now `4YB`, not `0YB`).
- `model_prep.py`: recognize letter-prefixed GLYCAM codes; rebuild sugar intra-residue bonds from the GLYCAM templates; and add protein→sugar and sugar→sugar glycosidic bonds by geometry.

Verified end-to-end on a previously failing high-mannose glycoprotein job (minimization now completes successfully). Adds Python test coverage for the new naming and bond-repair logic.
