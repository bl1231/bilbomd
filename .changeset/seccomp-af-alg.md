---
'@bilbomd/backend': patch
'@bilbomd/ui': patch
'@bilbomd/worker': patch
'@bilbomd/scoper': patch
---

Add custom seccomp profile blocking AF_ALG sockets (CVE-2026-31431) and other dangerous syscalls not needed by BilboMD containers. Profile applied to all services in all Docker Compose environments. Addresses F-6 pen test finding.
