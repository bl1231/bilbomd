---
'@bilbomd/ui': minor
---

Display per-conformation weights beneath the Molstar viewer for multi-state ensembles. When a 2+ state ensemble is toggled visible, the viewer now shows each contributing conformation of the best-fit model with its weight (value plus a proportion bar), sourced from the MultiFoXS results already included in the job data.

Add a "Starting Model" toggle to the Molstar viewer that overlays the original minimized input structure (rendered semi-transparent light green) independently of the ensemble selection, so users can compare the best N-state ensemble models against the starting model. The toggle only appears when a starting model is available for the job.

Make the ensemble size selector in the Molstar viewer exclusive: exactly one ensemble is displayed at a time, so selecting a "Size N" button now hides the others (the "Show All / Hide All" button is removed).

Add a "Color by Conformation" button to the Molstar viewer that colors each ensemble member structure a distinct color, with matching color swatches shown next to each conformation in the weights panel so color, structure, and weight line up. For jobs with a multi-member ensemble this coloring is now the default when the viewer loads. This is independent of the existing "Color by Domain" button (fixed/rigid/flexible domains from the MD constraints); the two are mutually exclusive and each toggles back to the standard per-structure coloring.
