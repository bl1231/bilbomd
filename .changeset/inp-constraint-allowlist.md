---
'@bilbomd/md-utils': patch
---

Add keyword allowlist to validateInpConstraints to block CHARMM directives like 'system', 'open', 'read', etc. that could execute OS commands or perform file I/O. Mirrors the existing backend isValidConstInpFile allowlist, closing the gap on the worker-side validator. Addresses F-4 pen test finding.
