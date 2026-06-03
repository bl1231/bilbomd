---
'@bilbomd/backend': patch
---

Fix HTTP 500 on user registration (and other broken queries) caused by mongoose `sanitizeFilter`. With `sanitizeFilter` enabled globally, any `{ $op: ... }` filter value is wrapped in `$eq` to block operator injection, which then fails to cast against the field's type. This broke the registration previous-email lookup (`$in`), the `deleteOldJobs` cron (`$lt`), and the anonymous job-quota checks (`$in`). Developer-built operator filters are now either rewritten to scalar matches or wrapped in `mongoose.trusted()`. Added regression tests that exercise real mongoose casting under `sanitizeFilter`.
