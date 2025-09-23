---
'@bilbomd/backend': patch
'@bilbomd/worker': patch
---

fix a bug in the mailer that was hardcoding a boolean `false` as tthe literal template name for all emails. yuck!
