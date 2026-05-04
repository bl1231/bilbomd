---
'@bilbomd/worker': patch
'@bilbomd/bilbomd-types': patch
'@bilbomd/backend': patch
'@bilbomd/ui': patch
---

Surface step progress messages on the public job page. The FoXS step now writes periodic progress text (e.g. "FoXS: 1800/3600 (50%)") to the MongoDB step message alongside the BullMQ update. The public job API now includes steps data, and the public job progress box displays the latest step message below the progress bar.
