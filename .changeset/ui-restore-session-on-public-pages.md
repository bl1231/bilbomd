---
'@bilbomd/ui': patch
---

Restore a logged-in session on public pages. A returning user who hard-reloads or follows a link to `/`, `/welcome`, `/help`, `/about`, or the anonymous job forms now gets the logged-in header instead of the anonymous one, and a cold `/` or `/welcome` sends them to `/dashboard`. First-time visitors are unaffected.
