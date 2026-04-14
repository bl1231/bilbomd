---
'@bilbomd/ui': patch
---

Fix FoXS plot visual break caused by low-SNR data points (#572).

- Filter data points where error ≥ intensity (SNR < 1) before plotting; these
  points produce negative lower error-bar bounds that break log-scale rendering
- Display a count of hidden low-SNR points as a caption below the chart title
- Add Recharts ErrorBar to the experimental-intensity line so data uncertainty
  is visible for the remaining points
- Replace `domain={['auto','auto']}` on log-scale Y-axes with an explicit
  floor-of-log10 domain function to prevent Recharts auto-domain artifacts
- Add `hasSaxsQualityIssues()` to ValidationFunctions for future per-form
  data-quality warnings (infrastructure only; per-form integration is a
  follow-up task)
