---
'@bilbomd/ui': patch
---

Fix the FoXS "Ensemble Models - I vs. q" chart rendering empty when a MultiFoXS ensemble curve goes negative at high q. Non-positive model values are now left out of the log-scale series instead of being set to 0, and the residuals use the real model values.
