---
'@bilbomd/backend': patch
---

Fix two startup crashes: use `ipKeyGenerator` helper in `publicJobLimiter` to satisfy express-rate-limit v8 IPv6 validation, and demote swagger JSON write failure from fatal (`process.exit`) to a non-fatal warning (the file is not used at runtime).
