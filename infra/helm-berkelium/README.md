# BilboMD on Berkelium

Helm chart for running BilboMD on [Berkelium](https://berkelium.scs.lbl.gov/docs/), LBL Science IT's Kubernetes cluster. The design is in [issue #1194](https://github.com/bl1231/bilbomd/issues/1194).

The always-on services each request a small amount of CPU and no GPU. The science runs in one short-lived Kubernetes Job per BilboMD job, which the dispatcher creates:

| Component      | Kind                  | Storage                                                   |
| -------------- | --------------------- | --------------------------------------------------------- |
| `ui`           | Deployment + Service  | none                                                      |
| `backend`      | Deployment + Service  | `bilbomd-data` (cephfs, RWX): `uploads/`, `logs/backend/` |
| `mongo`        | StatefulSet + Service | `mongo-data-mongo-0` (ceph-rbd)                           |
| `redis`        | StatefulSet + Service | `redis-data-redis-0` (ceph-rbd)                           |
| `mongo-backup` | CronJob               | `bilbomd-data`: `backups/` (14-day retention)             |
| `dispatcher`   | Deployment            | `bilbomd-data`: `uploads/`                                |
| `bilbomd-gpu`  | ResourceClaimTemplate | none (one A40 per GPU job pod)                            |
| `bilbomd`      | HTTPRoute             | `bilbomd.bk.lbl.gov` → `ui:80` through the shared gateway |

## Jobs

The `dispatcher` is the worker running with `EXECUTION_BACKEND=k8s`. It takes jobs off the BullMQ queues and, for each one, creates a Kubernetes Job named `bilbomd-<uuid>` (`bilbomd-multi-<uuid>` for Multi jobs), then polls it until it finishes.

- **Job pods** run `node dist/run-job.js` in the same worker image and tag as the dispatcher. They run the normal pipeline against MongoDB and `bilbomd-data` and record their own progress and results.
  - OpenMM jobs (and AlphaFold/OpenFold) get one GPU through the `bilbomd-gpu` ResourceClaimTemplate. CHARMM and Multi jobs run on CPUs only.
  - AlphaFold and OpenFold jobs also run their structure-prediction service (`bilbomd-colabfold-service` / `bilbomd-of3-service`, see `images` and `foldSidecar`) as a native sidecar in the job pod, sharing its GPU. The ColabFold weights are in its image. The OpenFold3 weights are downloaded once to `of3-data/` on the data volume by the `of3-weights` post-install/upgrade hook Job, and checked against `of3Weights.sha256`.
  - Pod size is `resources.job`. Every job pod gets the same size during the pilot.
  - Movies are off (`ENABLE_MOVIES=false`).
- **Concurrency:** at most `dispatcher.maxJobs` BilboMD jobs run at once (2 by default; Science IT asked for 2–4 GPUs to start). Multi jobs run one at a time on top of that. The dispatcher counts the unfinished Jobs in the namespace before creating one, so Jobs left running across a dispatcher restart count too.
- **Private images:** `images.pullSecrets` is passed to the job pods as well as the dispatcher.
- **Failures** the pod can't report itself (out of memory, the `dispatcher.jobDeadlineSeconds` limit, an image that can't be pulled) fail the job with that reason. A Job that fails before it finishes (a config or image error) is deleted first, and the dispatcher waits for its pod to stop.
- **Kubernetes API outages** don't fail running jobs: the dispatcher keeps retrying until the Job's deadline has passed.
- **Cancel:** deleting a job in the UI deletes its Kubernetes Job, retrying until the API accepts it. If the dispatcher was down when the job was deleted, it finds the Job by the job's UUID and deletes it when it starts.
- **Restarts:** a running Job keeps going while the dispatcher restarts or upgrades. The new dispatcher adopts it, and doesn't run a job again if it completed while the dispatcher was down.
- **Cleanup:** finished Jobs and their pods are kept for `dispatcher.jobTtlSeconds` (a day), then removed.

The dispatcher uses the `bilbomd` ServiceAccount, which Science IT created with a Role that allows creating, watching and deleting Jobs and reading pods and their logs. This chart doesn't create it.

```bash
kubectl --context oidc@berkelium -n bilbomd get jobs,pods -l app.kubernetes.io/component=job
kubectl --context oidc@berkelium -n bilbomd logs job/bilbomd-<uuid>
```

## Berkelium specifics

- **Pods are IPv6-only.**
  - `mongod` runs with `--ipv6`.
  - The UI image adds `listen [::]:80` at startup (`apps/ui/nginx/15-listen-on-ipv6.sh`).
  - Redis and Node listen on `::` by default.
- **Every container must set CPU and memory requests and limits.** PVCs must use `ceph-rbd` or `cephfs`.
  - A server-side dry run does **not** enforce these rules, so the chart tests check them.
- **Images come through Harbor's public proxy-cache projects,** for example `harbor.bk.lbl.gov/ghcr.io/bl1231/bilbomd-backend:<tag>`.
  - No push step or pull secret is needed.
  - For images in the private `harbor.bk.lbl.gov/bilbomd` project, create a pull secret and set `images.pullSecrets`.
- **Exposure uses a Gateway API `HTTPRoute`,** not an Ingress.
  - `*.bk.lbl.gov` is internal to LBL.
  - Public access needs a Cloudflare CNAME requested through iprequest.lbl.gov.

## Secrets

Create these by hand before installing. They are not in the chart or the repo.

`bilbomd-secrets` keys:

| Key                                                                             | Used by                                                          |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, `SESSION_SECRET`, `HASH_IP_SALT` | backend                                                          |
| `MONGO_PASSWORD`                                                                | backend, mongo (root password on first start), mongo-backup      |
| `REDIS_PASSWORD`                                                                | backend, redis                                                   |
| `ORCID_CLIENT_SECRET`                                                           | backend (a placeholder is fine while `orcid.enabled` is `false`) |
| `BILBOMD_MAILER_USER`, `BILBOMD_MAILER_PASS`                                    | backend (optional, for email)                                    |

```bash
kubectl --context oidc@berkelium -n bilbomd create secret generic bilbomd-secrets \
  --from-literal=ACCESS_TOKEN_SECRET="$(openssl rand -hex 32)" \
  --from-literal=REFRESH_TOKEN_SECRET="$(openssl rand -hex 32)" \
  --from-literal=SESSION_SECRET="$(openssl rand -hex 32)" \
  --from-literal=HASH_IP_SALT="$(openssl rand -hex 16)" \
  --from-literal=MONGO_PASSWORD="$(openssl rand -hex 24)" \
  --from-literal=REDIS_PASSWORD="$(openssl rand -hex 24)" \
  --from-literal=ORCID_CLIENT_SECRET=unused
```

Mongo only reads `MONGO_PASSWORD` when it initializes an empty data volume. Changing the secret later doesn't change the database password.

## Install and upgrade

Use `infra/berkelium.sh`. It runs from anywhere and never changes your current kubectl context:

```bash
infra/berkelium.sh status     # read-only: release, workloads, job pods, images, warnings
infra/berkelium.sh diff       # read-only: what an upgrade would change
infra/berkelium.sh            # deploy: shows versions, history and running jobs, asks, then upgrades
infra/berkelium.sh rollback   # to the previous revision (or: rollback <revision>)
```

Every helm and kubectl call it makes names `--kube-context oidc@berkelium -n bilbomd` (override the context with `BERKELIUM_KUBE_CONTEXT`). Before doing anything, it checks that the cluster has Berkelium's APIs (Gateway API HTTPRoute, DRA ResourceClaimTemplate). A plain `helm upgrade` without `--kube-context` uses whatever context is current (`nersc.sh` switches it to NERSC Spin). That once sent a Berkelium install to NERSC, where it failed on the missing HTTPRoute and DRA types.

The equivalent by hand:

```bash
helm --kube-context oidc@berkelium -n bilbomd upgrade --install bilbomd infra/helm-berkelium --timeout 20m
```

Keep `--timeout 20m` (the script's default). Helm waits for the `of3-weights` hook Job even without `--wait`, and the default 5-minute timeout is too short for its first run. On a fresh volume, that run is a cold of3-service image pull (~3 min) plus a 2.2 GB download (~5 min). Once the weights are there, the hook finishes in seconds. Until the download has finished, OpenFold job pods wait for the weights, for up to 30 min, in a `wait-for-weights` init container.

Before the first install, remove the hello-world placeholder that currently owns the hostname:

```bash
kubectl --context oidc@berkelium -n bilbomd delete httproute hello-nginx
kubectl --context oidc@berkelium -n bilbomd delete deploy,svc,configmap -l app=hello-nginx
```

`helm uninstall` keeps `bilbomd-data` (it has `helm.sh/resource-policy: keep`). It also keeps the Mongo and Redis volumes, because the StatefulSets' PVC retention policy is `Retain`.

## Tests

The tests use [helm-unittest](https://github.com/helm-unittest/helm-unittest). CI runs them through `.github/workflows/helm-charts.yml`.

```bash
helm plugin install https://github.com/helm-unittest/helm-unittest.git --version v1.2.1 --verify=false
helm unittest infra/helm-berkelium
```
