---
'@bilbomd/worker': minor
---

Build CHARMM on the host that runs it instead of shipping it in the published images. The worker base image (0.0.11) no longer includes CHARMM. The new `bilbomd-worker-charmm.dockerfile` adds it on top of a released worker image, from a local source tarball in `apps/worker/charmm/`, and the epyc compose files build that image on `up`. CHARMM jobs on a worker without CHARMM now fail at the start with a clear message instead of partway through the first CHARMM step.
