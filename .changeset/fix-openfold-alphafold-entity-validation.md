---
'@bilbomd/backend': patch
---

Fix OF3 and AlphaFold job submission failure caused by entity validation schema incorrectly requiring an `id` field. The `id` field is UI-only and not part of `IOpenFoldEntity` or `IAlphaFoldEntity`, so it was never present in the parsed form data, causing all submissions to fail backend validation with a 400 error.
