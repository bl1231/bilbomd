# infra/

Deployment configuration for every place BilboMD runs, and the scripts that deploy it.

| Where                               | What runs there                                              | Config                                                         | Deployed with                                                        |
| ----------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------- |
| Your laptop                         | Whole stack for development                                  | `docker-compose.local.yml`, `.env.local` (from `.env.example`) | `./deploy-to-beamline.sh up local`                                   |
| **epyc** (SIBYLS beamline, 2× A100) | Backend, UI, GPU worker, AlphaFold/OpenFold3 services        | `docker-compose-epyc.{dev,prod}.yml`                           | `./deploy-to-beamline.sh <cmd> dev\|prod`                            |
| **hyperion** (SIBYLS beamline)      | SCOPER (needs an Intel CPU)                                  | `docker-compose-hyperion.{dev,prod}.yml`                       | same script; it SSHes to each host                                   |
| **NERSC** Spin + Perlmutter         | Backend, UI, worker on Spin; MD jobs on Perlmutter via Slurm | `helm-nersc/`                                                  | `./nersc.sh <cmd> dev\|prod` (deploy, status, diff, rollback, sfapi) |
| **Berkelium** (LBL Science IT k8s)  | Backend, UI, dispatcher; each job runs as a k8s Job          | `helm-berkelium/`                                              | `./berkelium.sh` (deploy, status, diff, rollback)                    |

## Layout

```
infra/
├── README.md                 this file
├── .env.example              template for the compose env files
├── deploy-to-beamline.sh     compose stacks: local, epyc, hyperion
├── nersc.sh                  NERSC Spin Helm release: deploy, status, diff, rollback, sfapi
├── berkelium.sh              Berkelium Helm release: deploy, status, diff, rollback
├── assign-role.sh            grant or remove a user role in a compose stack's MongoDB
├── docker-compose*.yml       one file per compose target
├── seccomp/                  seccomp profile the compose services use
├── worker-passwd-epyc        /etc/passwd for epyc's worker containers
├── helm-nersc/               NERSC Spin chart
│   ├── NOTES.md              image builds, secrets and Spin notes
│   └── tls-acme/             one-time Let's Encrypt setup on Spin
├── helm-berkelium/           Berkelium chart (README, tests/)
└── scripts/
    ├── sync-image-tags.mjs   runs on release: bumps image tags in compose and charts
    └── list-latest-tags.sh   newest published tag of each BilboMD image
```

## Things that must stay where they are

- **The compose files, `seccomp/`, `worker-passwd-epyc` and `deploy-to-beamline.sh`.**
  - The compose files reference `./seccomp/...` and `./worker-passwd-epyc` relative to themselves.
  - epyc and hyperion run `deploy-to-beamline.sh` from their checkout's `infra/` directory, next to their env files.
- **Env files (`.env.dev`, `.env.prod`, `.env.hyperion.*`, `.env.local`).** They hold secrets and are gitignored. The beamline ones exist only on the servers.
- **`helm-secrets/`.** Your local NERSC secrets, gitignored. `nersc.sh` reads `helm-secrets/red-client/` for the Superfacility API keys.
- **`logs/`, `uploads-dev/`.** Local runtime directories for the local compose stack, gitignored.

## Image tags

Released image tags in the compose files, `helm-nersc/values-{dev,prod}.yaml` and `helm-berkelium/values.yaml` are bumped automatically by `scripts/sync-image-tags.mjs` during `pnpm changeset:version`. Don't edit them by hand in a release PR.

The AlphaFold and OpenFold3 service images aren't released by changesets. Bump them deliberately.

## CI

`ci.yml` ignores `infra/**`. `.github/workflows/helm-charts.yml` runs on changes here:

- Berkelium chart: `helm lint --strict`, render and `helm unittest`.
- NERSC chart: lint and render with the dev and prod values.
- `scripts/` tests.
