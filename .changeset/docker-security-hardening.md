---
'@bilbomd/backend': patch
'@bilbomd/ui': patch
'@bilbomd/worker': patch
'@bilbomd/scoper': patch
---

Harden Docker Compose deployments: remove Docker socket mount from worker, add no-new-privileges to all services, set read_only root filesystem on worker containers with /tmp tmpfs, and drop all Linux capabilities from worker. Addresses F-7 pen test finding (Docker socket privilege escalation).
