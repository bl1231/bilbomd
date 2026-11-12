---
'@bilbomd/bilbomd-types': patch
'@bilbomd/md-utils': patch
---

Reject constraint files in which two `shape desc` lines share a name (for example `dock1` twice). CHARMM treats the repeat as a change to the earlier rigid body, not a new one, so a copy-paste typo silently dropped a rigid body. The job forms and the backend now explain the problem and ask for unique names.
