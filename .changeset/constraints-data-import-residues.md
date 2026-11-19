---
'@bilbomd/bilbomd-types': patch
---

`importConstraintsFromData`: a segment whose `residues` isn't `{ start, stop }` (e.g. `"1:10"`) is now left out with a problem, instead of being widened to the whole segment. Merging several fixed bodies into one is reported as a note rather than a problem, since nothing is lost.
