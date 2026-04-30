---
'@bilbomd/worker': minor
---

Enable the BilboMD AlphaFold pipeline on local GPU hosts (initial target:
epyc, 2× NVIDIA A100). Adds a new `processBilboMDAlphaFoldJob` pipeline
that runs ColabFold in a sibling Docker container via the host docker
socket, then continues through the existing OpenMM minimize / heat / md /
FoXS / MultiFoXS path. CHARMM AlphaFold remains NERSC-only.

The `bilboMdHandler` no longer hard-routes `alphafold` jobs to NERSC; it
now selects between `processBilboMDJobNersc` and the new local pipeline
based on `USE_NERSC`.

New env vars (see `infra/.env.example`):

- `HOST_UPLOAD_DIR` — host-side path that backs DATA_VOL inside the worker
- `HOST_COLABFOLD_CACHE` — host-side path for the ~50GB ColabFold weights
- `COLABFOLD_IMAGE` — overridable image tag (default
  `ghcr.io/bl1231/bilbomd-colabfold:0.0.10`)
- `COLABFOLD_TIMEOUT_MS` — per-AF-run timeout (default 1h)

Operator setup on epyc:

1. Pre-create `/bilbomd/colabfold-cache` on the host.
2. Pull the colabfold image once: `docker pull $COLABFOLD_IMAGE`.
3. Prime weights: `docker run --rm -v /bilbomd/colabfold-cache:/cache $COLABFOLD_IMAGE colabfold_batch --download-only`.
4. Set `ENABLE_BILBOMD_ALPHAFOLD=true` and `USE_NERSC=false` in `.env.prod`.
