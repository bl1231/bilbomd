---
'@bilbomd/bilbomd-types': patch
'@bilbomd/md-utils': patch
'@bilbomd/worker': patch
'@bilbomd/ui': patch
'@bilbomd/backend': patch
---

Handle long const.inp commands the way CHARMM reads them. CHARMM cuts input lines over 200 characters short, and the MD steps run with `bomlev -2`, so an over-long `cons fix` or `shape desc` line was skipped and its constraint silently dropped. The constraint file checks and the INP-to-YAML conversion for OpenMM now join `-` continuation lines before reading them, so files wrapped by the Inp Jiffy are accepted and parsed whole. Lines over 200 characters, or commands over 5000 once joined, are rejected with a clear message. pae2const.py, the YAML-to-INP conversion, and the Inp Jiffy now wrap long commands at word boundaries. The backend's upload rewrap of long const.inp lines now uses the same wrapper, so it keeps `-` continuations intact instead of appending `end` after them. pae2const.py fails instead of writing a command over 5000 characters, and inline `!` comments no longer leak into selections in the INP-to-YAML conversion.
