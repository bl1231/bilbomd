---
'@bilbomd/ui': patch
---

Warn users on the Classic job form when the chosen Rg Max is more than 2× the measured Rg. Targets far above the measured Rg can cause numerical instability that crashes the MD simulation. The non-blocking warning shows the ratio, the AutoRg-suggested value, and a recommended Rg Max.
