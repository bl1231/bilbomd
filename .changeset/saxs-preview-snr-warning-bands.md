---
'@bilbomd/ui': minor
---

Enhance SAXS Data Preview plot with green Guinier region and low-SNR warning bands. The Guinier fit region is now highlighted in green, and any q-ranges where σ(q) > I(q) (SNR < 1) are highlighted in red so users can see at a glance which portions of their experimental data may be unreliable.
