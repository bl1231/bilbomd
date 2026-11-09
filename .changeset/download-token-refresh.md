---
'@bilbomd/ui': patch
---

Fix "Download Results" failing on a job page that has been open for a few minutes. The download is made outside RTK Query, so an expired access token was never refreshed and the request returned 403. The download now refreshes the token and retries once.
