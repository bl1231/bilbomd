---
'@bilbomd/backend': patch
---

The Bull Board admin view now shows the real SCOPER queue (`scoper`). It was pointed at a `bilbomd-scoper` queue that nothing uses, so SCOPER jobs never appeared there.
