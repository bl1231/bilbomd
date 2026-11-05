# BilboMD on Berkelium

Helm chart for running BilboMD on [Berkelium](https://berkelium.scs.lbl.gov/docs/), LBL Science IT's Kubernetes cluster. The design is in [issue #1194](https://github.com/bl1231/bilbomd/issues/1194).

This chart has the always-on services only. Each one requests a small amount of CPU and no GPU:

| Component      | Kind                  | Storage                                                   |
| -------------- | --------------------- | --------------------------------------------------------- |
| `ui`           | Deployment + Service  | none                                                      |
| `backend`      | Deployment + Service  | `bilbomd-data` (cephfs, RWX): `uploads/`, `logs/backend/` |
| `mongo`        | StatefulSet + Service | `mongo-data-mongo-0` (ceph-rbd)                           |
| `redis`        | StatefulSet + Service | `redis-data-redis-0` (ceph-rbd)                           |
| `mongo-backup` | CronJob               | `bilbomd-data`: `backups/` (14-day retention)             |
| `bilbomd`      | HTTPRoute             | `bilbomd.bk.lbl.gov` → `ui:80` through the shared gateway |

The chart doesn't include the job dispatcher or the per-job GPU Jobs yet. Until they're added, jobs you submit stay queued in Redis. The dispatcher needs RBAC from Science IT; see #1194.

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

```bash
cd infra/helm-berkelium
helm --kube-context oidc@berkelium -n bilbomd upgrade --install bilbomd .
kubectl --context oidc@berkelium -n bilbomd get pods,pvc,httproute
```

Before the first install, remove the hello-world placeholder that currently owns the hostname:

```bash
kubectl --context oidc@berkelium -n bilbomd delete httproute hello-nginx
kubectl --context oidc@berkelium -n bilbomd delete deploy,svc,configmap -l app=hello-nginx
```

`helm uninstall` keeps `bilbomd-data` (it has `helm.sh/resource-policy: keep`). It also keeps the Mongo and Redis volumes, because the StatefulSets' PVC retention policy is `Retain`.

## Tests

The tests use [helm-unittest](https://github.com/helm-unittest/helm-unittest). CI runs them through `.github/workflows/helm-berkelium.yml`.

```bash
helm plugin install https://github.com/helm-unittest/helm-unittest.git --version v1.2.1 --verify=false
helm unittest infra/helm-berkelium
```
