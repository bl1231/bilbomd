---
'@bilbomd/backend': patch
---

Fix 500 on the admin Users list and on self-service account deletion. With mongoose `sanitizeFilter` enabled, the `deletedAt: { $exists: false }` and `status: { $in: [...] }` filters were mangled into `$eq` literals and failed to cast; they are now wrapped in `mongoose.trusted()` (#1146).
