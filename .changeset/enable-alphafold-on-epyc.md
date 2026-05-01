---
'@bilbomd/backend': patch
'@bilbomd/worker': minor
---

Enable BilboMD AlphaFold pipeline on local GPU hosts (initial target: epyc, 2× NVIDIA A100) and implement the OpenMM engine path for the SANS pipeline.

### AlphaFold pipeline (local GPU)

Adds `processBilboMDAlphaFoldJob` — a new worker pipeline that runs ColabFold in a
sibling Docker container via the host Docker socket, then continues through the existing
OpenMM minimize / heat / md / FoXS / MultiFoXS path. `bilboMdHandler` now routes
`alphafold` jobs to this local pipeline when `USE_NERSC=false`; CHARMM AlphaFold
remains NERSC-only.

New env vars (see `infra/.env.example`):

- `HOST_UPLOAD_DIR` — host-side path that backs DATA_VOL inside the worker
- `HOST_COLABFOLD_CACHE` — host-side path for the ~50GB ColabFold weights cache
- `COLABFOLD_IMAGE` — overridable image tag (default `bl1231/bilbomd-colabfold:latest`)
- `COLABFOLD_TIMEOUT_MS` — per-AF-run timeout in ms (default 1h)
- `DOCKER_GID` — host docker group GID; added to the worker container via `group_add`
  so the non-root `bilbo` user can access `/var/run/docker.sock`

### Bug fixes

- **Docker socket permissions**: worker's non-root user (`bilbo`) now gets the host
  docker group added via `group_add` in both epyc Compose files, fixing
  "permission denied on /var/run/docker.sock" when spawning sibling containers.
- **ColabFold working directory**: added `--workdir /bilbomd/work` to the `docker run`
  args so `colabfold_batch` resolves the relative `af-entities.fasta` path correctly
  against the mounted volume.
- **AutoRg step display**: AlphaFold jobs now initialize the `autorg` step as `Success`
  (with computed Rg values) at submission time rather than `Waiting`, since AutoRg runs
  as a submission precondition and is never re-run by the worker pipeline.

### OpenMM SANS pipeline

Previously all OpenMM function calls in `bilbomd-sans.ts` were commented out, causing
OpenMM SANS jobs to skip MD entirely and fail at Pepsi-SANS with no PDB files. Now wires
up `prepareOpenMMConfig`, `runOmmMinimize`, `runOmmHeat`, `runOmmMD`, and a new
`mirrorOmmMdToPepsiSANS` step that symlinks PDB frames from `openmm/md/rg_{N}/` into
`pepsisans/rg{N}/` for Pepsi-SANS to consume. `remediatePDBFiles` is correctly skipped
for OpenMM since its PDBs already use standard chain IDs.

### Operator setup on epyc

1. Find the host docker GID: `getent group docker | cut -d: -f3`
2. Add `DOCKER_GID=<value>` to `.env.prod`.
3. Pre-create `/bilbomd/colabfold-cache` on the host.
4. Pull and prime the ColabFold weights:
   ```
   docker pull $COLABFOLD_IMAGE
   docker run --rm -v /bilbomd/colabfold-cache:/cache $COLABFOLD_IMAGE \
     colabfold_batch --download-only
   ```
5. Set `ENABLE_BILBOMD_ALPHAFOLD=true` and `USE_NERSC=false` in `.env.prod`.
