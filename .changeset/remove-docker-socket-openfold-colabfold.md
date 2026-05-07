---
'@bilbomd/worker': minor
---

Replace docker socket spawning with HTTP sidecars for OpenFold3 and ColabFold.

The worker no longer requires `/var/run/docker.sock` to be mounted. OpenFold3 and
ColabFold now run as dedicated long-lived HTTP microservice containers
(`bilbomd-of3-service`, `bilbomd-colabfold-service`) that the worker calls over the
internal Docker network. This eliminates the root-equivalent host access that the
docker socket granted and was the vector exploited in the recent security breach.
