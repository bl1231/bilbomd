---
'@bilbomd/ui': patch
---

Fix usePersist hook crashing on corrupted localStorage data. The hook now safely falls back to `false` when the stored `persist` value is not valid JSON, instead of throwing a SyntaxError during render.
