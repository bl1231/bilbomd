---
'@bilbomd/worker': patch
---

Replace print() with Python logging in all OpenMM scripts and add a post-minimization energy gate.

All OpenMM Python scripts (minimize.py, heat.py, md.py, plot_rgyrs.py and all utils) now use a shared `utils/logger.py` logger. INFO-level output goes to stdout (visible as `[step][stdout]` in worker logs); WARNING and ERROR go to stderr (`[step][stderr]`), matching the log levels already applied by the Node.js worker.

A post-minimization energy gate in minimize.py checks potential energy after `minimizeEnergy()` completes and exits with code 1 if the value is NaN/Inf or exceeds 1,000,000 kJ/mol — catching severe atom-clash failures at the correct step rather than as an opaque NaN crash during heating.

The heating loop in heat.py now reports potential energy alongside temperature at each 1000-step checkpoint and includes NaN position detection with an early abort.
