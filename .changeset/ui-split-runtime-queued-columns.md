---
'@bilbomd/ui': minor
---

Split job timing into separate Queued and Runtime columns. Runtime now shows time from when processing started (time_started) to completion, excluding queue wait. The new Queued column shows time from submission until processing began (or until now for pending/submitted jobs).
