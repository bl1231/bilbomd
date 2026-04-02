---
'@bilbomd/mongodb-schema': minor
'@bilbomd/bilbomd-types': minor
'@bilbomd/backend': patch
'@bilbomd/worker': minor
'@bilbomd/scoper': minor
'@bilbomd/ui': minor
---

Add results_ready flag to track results packaging outcome independently of job status.

Jobs that complete all MD science steps but fail during final tar.gz creation now remain
Completed rather than Failed. A new results_ready boolean field (false by default) is set
to true only after a successful archive is created, making the packaging outcome observable.

The UI disables the Download Results button and shows a warning when results_ready is false,
and surfaces download errors to the user via an Alert instead of silently logging to console.
