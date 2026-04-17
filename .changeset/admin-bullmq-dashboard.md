---
'@bilbomd/backend': minor
'@bilbomd/ui': minor
---

Add admin-only BullMQ dashboard access. Admins can now open the bull-board queue dashboard via a new sidebar link. Protected by nginx auth_request using the session cookie, so no unauthenticated access is possible.
