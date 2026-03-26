# BilboMD Installation — Local Linux Machine

This guide covers running BilboMD on a local Linux machine using pre-built Docker
images from the GitHub Container Registry (`ghcr.io`). All services (backend,
worker, UI, MongoDB, Redis) run as containers.

---

## 1. System Prerequisites

### Docker

Docker Engine with the Compose v2 plugin (i.e., `docker compose`, not the legacy
`docker-compose`). Verify with:

```bash
docker compose version
```

### Git

```bash
git --version
```

That's it. No Node.js, pnpm, or local build toolchain is required when pulling
pre-built images.

---

## 2. Clone the Repository

```bash
git clone git@github.com:bl1231/bilbomd.git
cd bilbomd
```

The repo contains the Docker Compose files and environment templates needed to
run the stack — you don't need to build anything from source.

---

## 3. Find the Latest Image Versions

A helper script is included that queries the GitHub API for the latest published
semver tags:

```bash
cd infra
./list-latest-tags.sh
```

Example output:

```
bilbomd-backend   2.5.7    2026-03-20 11:29:19 PDT    ghcr.io/bl1231/bilbomd-backend:2.5.7
bilbomd-ui.       2.6.2    2026-03-19 15:34:27 PDT    ghcr.io/bl1231/bilbomd-ui:2.6.2
bilbomd-worker    2.4.2    2026-03-20 11:29:59 PDT    ghcr.io/bl1231/bilbomd-worker:2.4.2
bilbomd-scoper    1.6.1    2026-02-10 16:31:43 PST    ghcr.io/bl1231/bilbomd-scoper:1.6.1
```

These are the versions currently baked into `infra/docker-compose.local.yml`.
If newer versions are available, update the image tags in that file before starting.
Ignore `bilbomd-scoper` — that container is not portable and is not needed for core functionality.

The script requires `jq` and either the `gh` CLI or `curl`. Install `jq` if
needed:

```bash
sudo apt-get install jq      # Debian/Ubuntu
sudo dnf install jq          # RHEL/Fedora
```

---

## 4. Prepare the Environment File

The local Docker Compose setup reads from `infra/.env.local`:

```bash
cd infra
cp .env.example .env.local
```

Edit `.env.local` as follows:

### Identity

Set these to your actual user and group IDs so file ownership inside containers
matches your host user:

```bash
id -u   # paste result as UID
id -g   # paste result as GID
```

```env
UID=1000
GID=1000
```

### Site settings

```env
BILBOMD_ENV=production
BILBOMD_DEPLOY_SITE=local
BILBOMD_DEV_BIND_ADDR=127.0.0.1
BILBOMD_URL=http://localhost
BILBOMD_FQDN=localhost
BILBOMD_BACKEND_PORT=3501
BILBOMD_UI_PORT=3001
```

### Secrets

Generate four independent random secrets (run once each):

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Or with Python if Node is not installed:

```bash
python3 -c "import secrets; print(secrets.token_hex(64))"
```

Paste each output into:

```env
ACCESS_TOKEN_SECRET=<generated>
REFRESH_TOKEN_SECRET=<generated>
SESSION_SECRET=<generated>
HASH_IP_SALT=<generated>
```

### MongoDB

```env
MONGO_USERNAME=bilbomd
MONGO_PASSWORD=<strong-password>
MONGO_HOSTNAME=mongodb
MONGO_PORT=27017
MONGO_DB=bilbomd
MONGO_AUTH_SRC=admin
MONGO_DEV_BIND_ADDR=127.0.0.1
MONGO_EXTERNAL_PORT=28017
```

### Redis

```env
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=<strong-password>
REDIS_DEV_BIND_ADDR=127.0.0.1
REDIS_EXTERNAL_PORT=7379
```

### Email

Disable email notifications for a local install:

```env
SEND_EMAIL_NOTIFICATIONS=false
SEND_EMAIL_USER=bilbomd@localhost
```

### Feature toggles

For a minimal first install, disable features that require external infrastructure:

```env
ENABLE_BILBOMD_SANS=false
ENABLE_BILBOMD_MULTI=true
ENABLE_BILBOMD_ALPHAFOLD=false   # requires GPU / NERSC
ENABLE_BILBOMD_SCOPER=false      # scoper is commented out in the local compose
ENABLE_HOME_PAGE_ALERT=false
```

### NERSC

```env
USE_NERSC=false
```
---

## 5. Create Docker Volumes

These must exist before the first `up` — they are declared `external: true` in
the compose file:

```bash
docker volume create mongodb-local
docker volume create redis-cache-local
docker volume create uploads-local
docker volume create logs-local
```

---

## 6. Create Local Bind-Mount Directories

The compose file bind-mounts host directories for uploads and logs:

```bash
mkdir -p uploads-dev
mkdir -p logs/backend
mkdir -p logs/worker
```

---

## 7. Pull Images and Start the Services

From the `infra/` directory:

```bash
cd infra

# Pull all images first (optional but confirms connectivity before starting)
docker compose --env-file .env.local -f docker-compose.local.yml -p bilbomd-local pull

# Start all services in the background
docker compose --env-file .env.local -f docker-compose.local.yml -p bilbomd-local up -d
```

---

## 8. Verify Everything is Running

Check container status:

```bash
docker compose -p bilbomd-local ps
```

Check backend health:

```bash
curl http://127.0.0.1:3501/healthcheck
```

Open the UI in your browser:

```
http://127.0.0.1:3001
```

Tail logs for all services:

```bash
docker compose -p bilbomd-local logs -f
```

Or for a specific service:

```bash
docker compose -p bilbomd-local logs -f backend
docker compose -p bilbomd-local logs -f worker
```

---

## 9. Stopping and Cleanup

Stop all services:

```bash
docker compose --env-file .env.local -f docker-compose.local.yml -p bilbomd-local down
```

Stop and remove volumes (destructive — deletes all data):

```bash
docker compose --env-file .env.local -f docker-compose.local.yml -p bilbomd-local down -v
```

---

## Troubleshooting

**`BILBOMD_DEV_BIND_ADDR` or similar variable errors on startup**
The compose file uses `${VAR:?err}` syntax which aborts if a variable is unset.
Double-check that your `.env.local` has all required variables set.

**Permission errors on mounted directories**
Make sure `UID` and `GID` in `.env.local` match the user running Docker on your
host (`id -u` / `id -g`).

**ORCID login fails**
Verify that `ORCID_REDIRECT_URI` in `.env.local` exactly matches the redirect URI
registered in your ORCID developer application. The backend port (default `3501`)
must appear in the URI.

**Worker exits immediately**
Check `docker compose -p bilbomd-local logs worker`. Ensure the `CHARMM_VER` in
`.env.local` matches the version baked into the pulled worker image.
