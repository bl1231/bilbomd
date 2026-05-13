---
'@bilbomd/worker': patch
'@bilbomd/ui': patch
---

Replace print() with Python logging in all OpenMM scripts, add a post-minimization energy gate, and surface OpenMM stderr errors to the UI job status pages.

All OpenMM Python scripts (minimize.py, heat.py, md.py, plot_rgyrs.py and all utils) now use a shared `utils/logger.py` logger. INFO-level output goes to stdout (visible as `[step][stdout]` in worker logs); WARNING and ERROR go to stderr (`[step][stderr]`), matching the log levels already applied by the Node.js worker.

A post-minimization energy gate in minimize.py checks potential energy after `minimizeEnergy()` completes and exits with code 1 if the value is NaN/Inf or exceeds 1,000,000 kJ/mol — catching severe atom-clash failures at the correct step rather than as an opaque NaN crash during heating.

The heating loop in heat.py now reports potential energy alongside temperature at each 1000-step checkpoint and includes NaN position detection with an early abort.

A pre-minimization clash detection step (clash_check.py) was added to identify severe atom overlaps before minimization begins.

The UI (SingleJobPage and PublicJobPage) now displays the stderr error message from the failed step in the job failure alert, giving users actionable feedback instead of a generic error message.
