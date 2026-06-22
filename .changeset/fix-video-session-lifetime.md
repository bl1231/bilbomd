---
'@bilbomd/backend': patch
---

Fix MD movie playback failing with "Video access attempt without valid session". Native `<video>` requests authenticate via the `bilbomd-session` cookie (they can't carry the JWT), but the cookie expired 15 minutes after creation while the 7-day refresh token kept the app working — so movies 401'd after a short idle. The session is now `rolling` (expiry slides forward on each request) with a `maxAge` matching the 7-day refresh-token lifetime. See issue #911.
