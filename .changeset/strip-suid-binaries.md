---
'@bilbomd/backend': patch
'@bilbomd/ui': patch
'@bilbomd/worker': patch
'@bilbomd/scoper': patch
---

Strip all SUID/SGID bits from container filesystems before dropping to non-root user. Added to backend, ui, worker-base, worker, scoper-base, and scoper Dockerfiles. Addresses F-6 pen test finding (SUID binary privilege escalation).
