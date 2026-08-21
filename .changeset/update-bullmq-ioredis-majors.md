---
'@bilbomd/backend': patch
'@bilbomd/worker': patch
'@bilbomd/scoper': patch
'@bilbomd/ui': patch
---

Update bullmq to v6 and ioredis to v6.

Both are major bumps. Almost no source changes were required — the APIs removed
in bullmq v6 (legacy repeatable jobs, `Queue#client`/`Worker#blockingClient`,
`Job#discard()`, the `debounce` option) are not used here, and the calls that
did change semantics were already compatible: `Worker#resume()` is now async
and was already awaited in `worker.ts` and `workerControl.ts`.

The one user-visible change: bullmq v6 removes the `paused` job state, so
`Queue#getJobCounts()` no longer returns a `paused` count. The admin Queue
Overview grid had a "Paused" column bound to it, which would have rendered
blank, so the column and its now-dead type field are removed. Queue-level pause
state is unaffected — it still comes from `isPaused` and its toggle control.

ioredis v6 negotiates RESP3 by default but keeps `replyMapping: "legacy"`, so
reply shapes remain v5-compatible; the existing `RedisOptions` need no
`protocol: 2` override. `@bull-board` 8.6.1 already declares
`bullmq: "^5.79.2 || ^6.0.0"`.
