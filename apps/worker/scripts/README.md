# The `bilbomd-worker` scripts directory

Some notes on stuff in the scripts directory.

## `/topper`

The directory contains all of the CHARMM topology and parameter files. They will be copied into the container when it is built.

## `/nersc`

This directory will contain various scripts used submitting NERSC jobs.

## `/sans`

This directory will contain various scripts used for BilboMD SANS jobs.

## Notes to build docker image on Perlmutter login node

Since all jobs on Perlmutter will use Docker containers to run `python`, `charmm`, `foxs`, and `multi_foxs` in our well-defined container environment, we need to use [podman-hpc](https://docs.nersc.gov/development/containers/podman-hpc/podman-beginner-tutorial/#podman-hpc-for-beginners-tutorial) to build our container images, and then "deploy/migrate" them to `$SCRATCH`.

You will build our images locally on a login node. If you'd like to use this image in a job (or access it on any other login node), you'll need to migrate your image onto the `$SCRATCH` filesystem.

```bash
cd ~/projects/bilbomd/bilbomd-worker
podman-hpc build -t bilbomd/bilbomd-perlmutter-worker:0.0.1 --build-arg CHARMM_VER=c48b2 --build-arg USER_ID=$UID -f bilbomd-perlmutter-worker.dockerfile
podman-hpc migrate bilbomd/bilbomd-perlmutter-worker:0.0.1
podman-hpc images
```
