---
'@bilbomd/ui': patch
---

Fix stuck step message on job pages and add adaptive polling. Step messages now reflect the currently Running step instead of relying on iteration order, which caused stale messages from earlier completed steps to persist. SingleJobPage now polls at 10s while a job is Running, stops polling on terminal states, and falls back to 30s for other states.
