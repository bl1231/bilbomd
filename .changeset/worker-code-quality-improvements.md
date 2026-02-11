---
'@bilbomd/worker': minor
---

Improve worker code quality, maintainability, and performance. Consolidate duplicated progress tracking into a reusable helper function (reducing ~178 lines of code). Refactor handler switch statements to use configuration-driven approach for better maintainability. Remove module-level mutable state in favor of BullMQ's built-in metrics API. Parallelize NERSC job monitoring with concurrency limit of 10 for up to 10x performance improvement when processing multiple jobs.
