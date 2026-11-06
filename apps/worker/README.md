# bilbomd-worker

## Docker images

We build a custom `bilbomd-worker-base` image to include all the scientific software, libraries, and dependencies (like CUDA, OpenMM, CHARMM, IMP, and Conda environments) needed for molecular modeling and analysis. This base image is shared and reused, so we don’t have to reinstall these heavy dependencies every time we build the main worker image.

The main `bilbomd-worker` image then builds on top of this base, adding only the application code and Node.js runtime. This approach makes builds faster, keeps images smaller, and ensures consistency across deployments.

### `bilbomd-worker-base` and `bilbomd-worker` (epyc, hyperion, Berkelium)

Both are built by CI and pushed to `ghcr.io/bl1231`:

- `bilbomd-worker-base` (`bilbomd-worker-base.dockerfile`): the `worker-base-image` workflow builds it on a merge to `main` that changes `base-image-version`, tags it with that version and runs `scripts/smoke_test.sh` against it.
- `bilbomd-worker` (`bilbomd-worker.dockerfile`): built by CI on every push to `main`, and tagged with its version when a Version Packages merge bumps it. Point `BASE_IMAGE` at a new base version only after that base image is in the registry, in a separate PR.

Versions inside the base image are pinned in the Dockerfile's `ARG`s (`OPENMM_VERSION`, `OPENMM_CUDA_VERSION`, …). Keep `OPENMM_CUDA_VERSION` at or below the CUDA version the GPU hosts' drivers support: OpenMM compiles its kernels at run time, and a newer NVRTC makes it fall back to the CPU (#1222).

### NERSC images (Perlmutter)

Slurm jobs on Perlmutter use images that live only in NERSC's podman-hpc store. They are built by hand on a Perlmutter login node (building them in CI is issue #1138). The tags are hard-coded in `scripts/nersc/gen-openmm-slurm-file.py` and `scripts/nersc/gen-charmm-slurm-file.py`.

| image                               | Dockerfile                             | used for                                                  |
| ----------------------------------- | -------------------------------------- | --------------------------------------------------------- |
| `bilbomd/bilbomd-openmm-worker`     | `bilbomd-openmm.dockerfile`            | OpenMM steps (OpenMM built from source against CUDA 12.9) |
| `bilbomd/bilbomd-perlmutter-worker` | `bilbomd-perlmutter-worker.dockerfile` | CHARMM, FoXS and helper steps                             |

(`scripts/nersc/build-perlmutter-worker.sh` is out of date — it clones the old `bilbomd-worker` repo — don't use it.)

1. Push the branch with the Dockerfile change, then on Perlmutter update the clone in `~/projects/bilbomd` (read-only deploy key) and check it out:

   ```bash
   ssh perlmutter
   hostname        # note the login node, e.g. login12
   cd ~/projects/bilbomd && git fetch origin && git checkout <branch>
   ```

   The build cache and any image that isn't migrated yet exist only on that login node. Do every later step on the same node (`ssh login12` from another login node).

2. Build from the repo root. Use an explicit version tag, **never `latest`**:

   ```bash
   podman-hpc build --network slirp4netns \
     -t bilbomd/bilbomd-openmm-worker:<version> \
     -f apps/worker/bilbomd-openmm.dockerfile .
   ```

   `--network slirp4netns` is needed for network access during the build on login nodes. A source build of OpenMM takes a while, so run it under `nohup … > build.log 2>&1 &`.

3. Test on the login node's GPU. Check that the CUDA platform passes, not just CPU:

   ```bash
   podman-hpc run --rm --gpu bilbomd/bilbomd-openmm-worker:<version> python -m openmm.testInstallation
   ```

4. Migrate the image to the shared store so Slurm jobs on compute nodes can use it:

   ```bash
   podman-hpc migrate bilbomd/bilbomd-openmm-worker:<version>
   ```

   Don't migrate a `latest` tag. A second image with the same name in the read-only store (`$SCRATCH/storage/overlay-images/images.json`) breaks every podman-hpc command on every node, Slurm jobs included.

5. Bump the tag in the Slurm generator script(s) in the same PR, plus a changeset for `@bilbomd/worker`. NERSC picks the new tag up when that worker release is deployed to Spin (`infra/nersc.sh`), which syncs the generators to CFS (`scripts/nersc/sync-nersc-scripts-to-cfs.sh`).
