---
'@bilbomd/ui': minor
'@bilbomd/bilbomd-types': minor
'@bilbomd/md-utils': patch
---

Show an interactive bead-and-spring schematic of the generated const.inp in the const.inp Jiffy (Preview & Download step) and the PAE Jiffy: fixed segments are pinned, each rigid body moves as one piece, and flexible linkers coil when slack and turn orange at full stretch. The const.inp parser moves from md-utils into bilbomd-types (`parseConstInp`, `segidToChainId`) so the UI and the worker share one parser; md-utils behaviour is unchanged.
