---
'@bilbomd/ui': patch
---

Refactor sidebar nav to use group-based dividers. Dividers are now structural separators between item groups (navigation, job forms, utilities, info) rather than properties on individual items, so filtering items like Scoper, SANS, or Multi no longer removes adjacent dividers.
