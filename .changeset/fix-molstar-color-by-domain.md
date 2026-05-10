---
'@bilbomd/ui': patch
'@bilbomd/backend': patch
---

Fix Color by Domain preset in Molstar viewer for Classic CRD jobs.

Two-phase component creation prevents "Could not find node" errors when coloring ensemble structures. Also stores `md_constraints` in MongoDB for Classic CRD jobs so the domain-coloring preset has the constraint data it needs.
