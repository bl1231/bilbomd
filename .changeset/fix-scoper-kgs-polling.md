---
'@bilbomd/scoper': patch
---

Fix KGS progress polling: suppress noisy ENOENT error on first poll before output directory exists, and stop polling once all conformers are generated.
