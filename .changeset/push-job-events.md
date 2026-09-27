---
'@bilbomd/bilbomd-types': minor
'@bilbomd/worker': minor
'@bilbomd/backend': minor
'@bilbomd/ui': minor
---

Push job updates to the browser instead of relying on polling. The worker publishes a small "job changed" event on Redis (`JOB_EVENTS_CHANNEL`) whenever a job's status, a step, or its progress changes, throttled to about one event per second per job. The backend forwards those events to logged-in browsers over Server-Sent Events at `GET /api/v1/jobs/events`, filtered by the same access rule as the job endpoints, with a 25s heartbeat. The UI keeps one stream per tab and invalidates the changed jobs' RTK Query tags in batches, so the job page and the Jobs list refresh within a couple of seconds. While the stream is connected, pages poll only every 2 minutes as a safety net; if it drops they go back to their old intervals.

Deleting a job no longer removes it from the list optimistically, or refetches right after the request. The request only queues the deletion, so the row shows "Deleting" with its actions disabled until the server confirms. The delete worker announces `deleted` once the document is gone, or `delete_failed` after its last attempt. The UI nginx config gets an unbuffered, uncached location for the stream.
