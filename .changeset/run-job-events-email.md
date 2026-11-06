---
'@bilbomd/bilbomd-types': minor
'@bilbomd/worker': patch
---

Add `flush()` to the job event notifier, which publishes events still held back by the throttle. `run-job` now publishes job events (as the worker does) and flushes them before it exits, and SIGTERM stops its MongoDB connection retries, so a job cancelled before it starts exits as cancelled. Job emails are now awaited, so a failed send is caught and recorded on the email step instead of becoming an unhandled rejection, and `run-job` can't exit in the middle of one.
