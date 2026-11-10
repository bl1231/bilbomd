---
'@bilbomd/ui': minor
---

Redesign the Feedback & Validation tab and surface model/data mismatches on the job page.

- The tab leads with a verdict, three headline tiles (fit quality, molecular weight, data), a residuals plot of the assessed model, the findings, and tables by q-region and ensemble size.
- A banner above the analysis tabs appears when the model's mass and the SAXS estimate differ, with a button that opens the tab.
- The tab label carries a warning icon when the assessment found a warning or a problem.
- Jobs assessed before the molecular-weight fix are shown without their molecular-weight comparison.
