---
'@bilbomd/backend': minor
'@bilbomd/ui': minor
---

The public job page now updates live. `GET /api/v1/public/jobs/:publicId/events` streams changes to that one job, using the same access rule as the public job page (an anonymous job's `public_id` or a results token). Each client may hold up to 10 of these streams open at once. The page refreshes the job, and its MD movies, which previously never refreshed, when events arrive, and while connected polls every 2 minutes instead of every 10 seconds.
