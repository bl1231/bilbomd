---
'@bilbomd/backend': patch
---

Add a shared `clientIp` helper (CF-Connecting-IP, falling back to `req.ip`) and use it wherever the backend identifies a client: the login, external API, upload-utility and public-job rate limiters, and the public job quota. All per-client limits now identify clients the same way.
