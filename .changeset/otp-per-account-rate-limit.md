---
'@bilbomd/backend': patch
'@bilbomd/mongodb-schema': patch
---

Add per-account OTP attempt counter to prevent brute-force of magic link tokens. After 5 failed attempts (expired OTP submissions), the OTP is nulled and the user must request a new magic link. Addresses F-1 pen test finding (per-account rate limiting).
