---
'@bilbomd/ui': patch
---

Fix the account menu's Dashboard item, the breadcrumb Home link, and the anonymous header logo sending logged-in users to `/welcome`, which is claimed by the anonymous route tree and rendered them in the logged-out layout. Authenticated entry points now land on `/dashboard`.
