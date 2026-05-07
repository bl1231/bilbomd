---
'@bilbomd/ui': patch
---

Add CHARMM keyword allowlist to frontend const.inp validation. Dangerous directives like `system`, `open`, and `read` are now rejected client-side before upload, giving immediate feedback and layering the defence already present on the backend.
