---
'@bilbomd/bilbomd-types': minor
'@bilbomd/backend': minor
'@bilbomd/worker': patch
'@bilbomd/ui': minor
---

New jobs and MD movie progress now reach the browser without polling. The backend announces each newly submitted job (a `created` event), so the owner's job list, and every Admin's and Manager's, picks it up right away. The movie enqueuer and movie worker publish a `movies` event when movies are queued, start rendering, become ready or fail, and the job page refreshes its movies from it. While the stream is connected the job page polls movies only every 2 minutes instead of every 15 seconds.
