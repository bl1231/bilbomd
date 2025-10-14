# bilbomd-worker

description

## building docker images

We build a custom `bilbomd-worker-base` image to include all the scientific software, libraries, and dependencies (like CUDA, OpenMM, CHARMM, IMP, and Conda environments) needed for molecular modeling and analysis. This base image is shared and reused, so we don’t have to reinstall these heavy dependencies every time we build the main worker image.

The main `bilbomd-worker` image then builds on top of this base, adding only the application code and Node.js runtime. This approach makes builds faster, keeps images smaller, and ensures consistency across deployments.

Build on a Perlmutter login node. Make a note of which node you are building on so that if you get disconnected or need to come back later, you will still have access to the docker build cache and subsequent builds will be much faster.

Build from root of repo:

```bash
podman-hpc build -t ghcr.io/bl1231/bilbomd-worker-base -f bilbomd-worker-base.dockerfile .
```

Run the smoke test to make sure all the goodies are there:

```bash
podman-hpc run --rm ghcr.io/bl1231/bilbomd-worker-base:latest bash -c "/usr/local/bin/smoke_test.sh"

Testing CLI tools...
CHARMM OK
Pepsi-SANS OK
FOXS OK - Version: "2.23.0"
Multi-FOXS OK - Version: "2.23.0"
Testing Python packages...
numpy OK - 2.3.3
scipy OK - 1.16.2
lmfit OK - 1.3.4
pandas OK - 2.3.3
dask OK - 2025.9.1
openmm OK - 8.4
Smoke test complete.
```

Tag the image and push to ghcr.io

```bash
podman-hpc tag ghcr.io/bl1231/bilbomd-worker-base:latest ghcr.io/bl1231/bilbomd-worker-base:0.0.3
echo ghp_xxxxx | docker login ghcr.io -u username --password-stdin
podman-hpc push ghcr.io/bl1231/bilbomd-worker-base:0.0.3
```

### bilbomd-worker-base:0.0.3

CUDA 12.4.1
CHARMM c49b2
IMP (foxs, multi_foxs)
OpenMM

## build `bilbomd-worker`

Assuming we have an available `bilbomd-worker-base` image.

```bash

```

