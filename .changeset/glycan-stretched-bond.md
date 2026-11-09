---
'@bilbomd/worker': patch
---

Glycoprotein (OpenMM) jobs no longer fail with "Template match failed for residue: 0MA" when a glycosidic bond in the input is slightly stretched. A sugar C1 within 2.4 Å of exactly one acceptor is now treated as bonded, with a warning in `glycam_rename.log`. A sugar that still can't be linked fails with a message naming the residue, its nearest acceptor and the distance. The GLYCAM rename and the OpenMM topology repair now share one bond-picking rule, so they always agree on which sugars are linked.
