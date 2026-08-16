---
'@bilbomd/ui': patch
---

Fix Chi² / C1 / C2 values being hidden behind the residual trace on the "Chi² residuals" plots (#971). The values now render as a larger, theme-aware header line above the plot instead of as fixed-position SVG text inside the plot area. The ensemble/multi-state plot gains a matching row of colour-keyed Chi² chips for each visible ensemble, and the ensemble results table uses a larger font.
