---
'@bilbomd/ui': minor
'@bilbomd/bilbomd-types': minor
'@bilbomd/md-utils': patch
---

Show an interactive bead-and-spring schematic, with a linear chain view, of the generated const.inp in the const.inp Jiffy (Preview & Download step) and the PAE Jiffy, and behind a "Show schematic" button in the job page's MD Constraints. Every constraint view (chain track, schematic, 3D viewer's Color by Domain) now shares one palette, with a color per rigid body. In the schematic, fixed segments are pinned, each rigid body moves as one piece, and flexible linkers coil when slack and turn orange at full stretch. The const.inp parser moves from md-utils into bilbomd-types (`parseConstInp`, `segidToChainId`) so the UI and the worker share one parser; md-utils behaviour is unchanged.
