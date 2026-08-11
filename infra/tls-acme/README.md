# TLS / HTTPS on NERSC Spin — bilbomd

NERSC Spin does not run cert-manager. TLS for bilbomd is handled by the
[NERSC/spin-helm tls-acme](https://github.com/NERSC/spin-helm/tree/main/tls-acme)
chart, which runs a CronJob every two months to obtain/renew a Let's Encrypt
certificate via the HTTP-01 ACME challenge and writes it into a Kubernetes
`tls-cert` secret. The bilbomd Helm Ingress then references that secret.

This **replaces** the old manual InCommon certificate process (annual certs from
https://certificates.lbl.gov/ stored in `infra/helm-secrets/ui-tls-secrets*.yaml`).
It is a **one-time setup per environment** (dev and prod). Once the CronJob is
deployed, certificate renewal is fully automatic.

## Architecture

```
Internet ──HTTPS──► Spin nginx ingress ──► ui:80
                         │
                    tls-cert secret
                         │
                    tls-acme CronJob (renews every 2 months via Let's Encrypt)
```

### Ingress ownership (important)

There is exactly **one** Ingress named `ingress`, and it is owned by the **bilbomd
app Helm chart** (`infra/helm/templates/ingress.yaml`). It routes `/` to `ui:80`
and references the `tls-cert` secret (via `ingress.secret` in
`infra/helm/values-<env>.yaml`).

The tls-acme chart is therefore installed with **`ingress.enabled=false`** — it
must *not* create its own Ingress, or Helm fails with
`Ingress "ingress" exists and cannot be imported`.

The renewal CronJob still needs the Ingress *name* (via `ingress.name`, which is
independent of `ingress.enabled`). On each run, the ACME script
(`get_cert_update_ssl.sh`) backs up the live `ingress`, temporarily repoints all
hosts to the dummy challenge webserver on port 8080, completes the HTTP-01
challenge, writes the new cert into `tls-cert`, then restores the original Ingress.
So the app chart owns the Ingress and the CronJob borrows it during renewal — no
second Ingress is ever created.

## Prerequisites

1. **NERSC uid/gid** — run `id` on a NERSC login node and confirm the values in
   `prepare-values-<env>.yaml` (`nersc_user_id`, `nersc_user_group`).
2. **DNS CNAME records** (already in place for bilbomd; verify with `dig`):
   - `bilbomd-nersc-dev.bl1231.als.lbl.gov` → `ingress.bilbomd.development.svc.spin.nersc.org`
   - `bilbomd-nersc.bl1231.als.lbl.gov` → `ingress.bilbomd.production.svc.spin.nersc.org`
3. **kubectl contexts** configured (`nersc-spin-dev` and `nersc-spin-prod`).
4. **Clone the NERSC spin-helm repo** (needed for `prepare-values.py`):
   ```bash
   git clone https://github.com/NERSC/spin-helm.git /tmp/spin-helm
   ```

## Step-by-step (per environment)

Replace `<ENV>` with `dev` or `prod` throughout. **Do dev first**, confirm HTTPS,
then repeat for prod.

### 1. Switch to the correct cluster context

```bash
kubectl config use-context nersc-spin-<ENV>
```

### 2. Create the kubeconfig secret

The tls-acme CronJob needs cluster credentials to patch the `tls-cert` secret after
each renewal. Download the kubeconfig for the environment from the Rancher UI
(Cluster → Kubeconfig).

> **Critical:** the renewal script derives the internal Spin hostname from
> `kubectl config current-context` *inside this kubeconfig*:
> `SPIN_DOMAIN=<ingress-name>.<namespace>.<current-context>.svc.spin.nersc.org`.
> Spin's OPA admission policy (`ING-002`) requires that segment to be the
> **cluster name** — `development` or `production` — **not** a local alias like
> `nersc-spin-dev`. If the context is misnamed, the init job fails with
> `ingress must have one host with the name ingress.<ns>.development.svc.spin.nersc.org`.
> So rename the context to match the cluster before creating the secret:
>
> ```bash
> # In the downloaded kubeconfig, rename the context to exactly
> # <development|production> and make it current:
> kubectl --kubeconfig=<downloaded> config rename-context \
>   "$(kubectl --kubeconfig=<downloaded> config current-context)" <development|production>
> kubectl --kubeconfig=<downloaded> config use-context <development|production>
> ```

```bash
kubectl -n bilbomd create secret generic kubeconfig \
  --from-file=kubeconfig=<path-to-downloaded-kubeconfig>
```

### 3. Generate tls-acme values.yaml

`prepare-values.py` only needs Python + PyYAML + Jinja2. A minimal conda env is
provided in `environment.yml` (do **not** reuse a full app env — it pulls in
unrelated, repo-specific requirements):

```bash
conda env create -f /path/to/bilbomd/infra/tls-acme/environment.yml
conda activate bilbomd-tls-acme
```

Then render the values:

```bash
cd /tmp/spin-helm/tls-acme

# Use the checked-in bilbomd template as a starting point
cp /path/to/bilbomd/infra/tls-acme/prepare-values-<ENV>.yaml prepare-values.yaml

# Confirm your NERSC uid/gid and email, then generate values.yaml
python3 prepare-values.py
```

### 4. Deploy the tls-acme chart (its own Ingress disabled, cert secret = tls-cert)

The app chart owns the Ingress, so install tls-acme with `ingress.enabled=false`
(see "Ingress ownership" above). We also pin the cert secret name to `tls-cert`
explicitly (the chart default, made explicit here for clarity).

```bash
helm install -n bilbomd -f values.yaml \
  --set ingress.enabled=false \
  --set cert.secretName=tls-cert \
  acmecron .
```

This creates:
- A self-signed `tls-cert` secret (placeholder until the first ACME run)
- A minimal challenge web server deployment + PVC (case2)
- A CronJob scheduled every 2 months to renew the cert

It does **not** create an Ingress. At this point the bilbomd app Ingress is still
pointing at the old `ui-tls`/`ui-tls-dev` InCommon secret, so **the live site is
unaffected**.

### 5. Trigger the initial certificate request

The CronJob runs on its schedule, but trigger it manually right away to get a real
cert. Look up the CronJob name first (it is `<release>-spin-acme-cron`, e.g.
`acmecron-spin-acme-cron`):

```bash
kubectl -n bilbomd get cronjob
kubectl -n bilbomd create job --from=cronjob/acmecron-spin-acme-cron acmecron-init
kubectl -n bilbomd logs -f job/acmecron-init
```

A successful run ends with the `tls-cert` secret holding a valid Let's Encrypt
certificate. Verify:

```bash
kubectl -n bilbomd get secret tls-cert -o jsonpath='{.data.tls\.crt}' \
  | base64 -d | openssl x509 -noout -dates -issuer
# issuer should be Let's Encrypt (R-series); validity ~90 days
```

### 6. Cut the app Ingress over to tls-cert (zero downtime)

Only **after** `tls-cert` holds a real cert (step 5), point the bilbomd Ingress at
it. In `infra/helm/values-<ENV>.yaml` set:

```yaml
ingress:
  secret: 'tls-cert'   # was ui-tls-dev (dev) / ui-tls (prod)
```

Then redeploy the app chart:

```bash
./infra/nersc.sh deploy <ENV>
```

nginx now serves the Let's Encrypt cert from `tls-cert`. Because the real cert was
already in place before the flip, there is no window serving the self-signed
placeholder.

### 7. Verify HTTPS

```bash
curl -vI https://bilbomd-nersc-<ENV>.bl1231.als.lbl.gov/
# Expect: HTTP/2 200, valid Let's Encrypt chain, no SSL warning
```

Also load the site in a browser and confirm a trusted padlock.

## Ongoing renewal

The CronJob runs automatically every two months. No manual action is needed.
To check the last renewal:

```bash
kubectl -n bilbomd get cronjob acmecron-spin-acme-cron
kubectl -n bilbomd get jobs --sort-by=.metadata.creationTimestamp | tail -5
kubectl -n bilbomd get secret tls-cert -o jsonpath='{.data.tls\.crt}' \
  | base64 -d | openssl x509 -noout -dates
```

## Rollback

If anything goes wrong, revert `ingress.secret` back to `ui-tls`/`ui-tls-dev` in
`infra/helm/values-<ENV>.yaml` and redeploy. The manual InCommon secret is still
present in the namespace (see `infra/helm-secrets/ui-tls-secrets*.yaml`) and will be
served again immediately.

## Updating the tls-acme chart

If the upstream chart or `prepare-values.yaml` template changes:

```bash
cd /tmp/spin-helm && git pull
cd tls-acme
cp /path/to/bilbomd/infra/tls-acme/prepare-values-<ENV>.yaml prepare-values.yaml
python3 prepare-values.py
helm upgrade -n bilbomd -f values.yaml \
  --set ingress.enabled=false --set cert.secretName=tls-cert acmecron .
```

## Files in this directory

| File | Purpose |
|------|---------|
| `prepare-values-dev.yaml` | Template config for the dev tls-acme chart (verify uid/gid/email) |
| `prepare-values-prod.yaml` | Template config for the prod tls-acme chart |
| `README.md` | This file |

`values.yaml` (generated by `prepare-values.py`) and any local `prepare-values.yaml`
copy are gitignored — they contain your personal NERSC uid/gid and email.
