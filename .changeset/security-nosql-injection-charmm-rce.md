---
'@bilbomd/backend': patch
---

Fix critical security vulnerabilities: NoSQL injection in OTP auth flow and CHARMM system directive RCE.

Cast `email` and `otp` inputs to string before Mongoose queries to prevent MongoDB operator injection. Enable `mongoose.set('sanitizeFilter', true)` globally as defence-in-depth. Add keyword allowlist to `isValidConstInpFile` to reject CHARMM directives (`system`, `open`, etc.) that could execute arbitrary OS commands when the constraint file is STREAMed by the worker.
