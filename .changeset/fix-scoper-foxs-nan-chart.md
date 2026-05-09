---
'@bilbomd/ui': patch
---

Fix NaN SVG errors in scoper job FoXS chart. Guard against NaN/Infinity error values in residuals calculation and handle fewer than 2 FoXS entries gracefully.
