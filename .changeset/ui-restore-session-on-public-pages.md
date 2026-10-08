---
'@bilbomd/ui': patch
---

Restore a logged-in session on public pages. A returning user who hard-reloads or follows a link to `/`, `/welcome`, `/help`, `/about`, or an anonymous job form now gets the dashboard chrome instead of the anonymous header. A cold `/` or `/welcome` sends them to `/dashboard`, and the anonymous job form URLs redirect to their authenticated equivalents so a shared link never submits an anonymous job for a logged-in user. First-time visitors are unaffected.
