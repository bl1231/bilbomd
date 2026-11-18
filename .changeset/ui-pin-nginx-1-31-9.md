---
'@bilbomd/ui': patch
---

Pin the UI image's nginx base to `nginx:1.31.9-alpine` to pick up the fixes for CVE-2026-123007, CVE-2026-123633, CVE-2026-123634, CVE-2026-113425 and CVE-2026-121810. The UI's nginx config (plain HTTP/1.1 on :80, no `resolver`, no mail module) doesn't reach the affected code, but the previous 1.31.8 base was in the vulnerable range.
