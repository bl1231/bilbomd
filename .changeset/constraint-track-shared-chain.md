---
'@bilbomd/ui': patch
---

Fix the MD constraint track, body list and schematic for CRD/PSF jobs whose segids share a chain ID (for example PROA and DNAA, both chain A). They were merged into one chain, hiding the DNA segment, labeling it as protein and misreporting the flexible ranges. Such jobs now show one track per segid, named by segid, with its molecule type read from the segid. Other jobs look as before.
