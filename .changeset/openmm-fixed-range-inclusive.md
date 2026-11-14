---
'@bilbomd/worker': patch
---

OpenMM fixed bodies now include the last residue of each range (`resid 9:108` holds 9–108), as CHARMM and the OpenMM rigid bodies already did. Before, the last residue of every fixed segment was free to move, and a single-residue fixed segment held nothing (#1101).
