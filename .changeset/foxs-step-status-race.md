---
'@bilbomd/worker': patch
---

Fix the FoXS step sometimes staying "Running" on a completed job. Progress updates to the step were fire-and-forget, so the last one could land after the final "Success" and overwrite it. They are now written in order, and FoXS waits for them before reporting its result.
