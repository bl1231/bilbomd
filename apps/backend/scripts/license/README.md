# BilboMD License Tooling

Offline tooling for issuing **cryptographically signed BilboMD license tokens**.

BilboMD verifies a signed license before allowing job submission. Tokens are
RS256-signed JWTs. The backend ships only the **public** key
(`apps/backend/src/license/license-public-key.pem`); only the holder of the
**private** key (you, the licensor) can mint valid tokens.

Tokens carry a built-in expiry, so licenses must be renewed to stay valid.

## 1. One-time setup — generate the keypair

```bash
cd apps/backend/scripts/license
./generate-keypair.sh
```

This writes two files into the current directory:

- `license-private-key.pem` — **store OFFLINE** (vault / password manager).
  This is the secret that lets you mint licenses. **Never commit it** and never
  bake it into a Docker image.
- `license-public-key.pem` — copy into the repo and commit:

  ```bash
  cp license-public-key.pem ../../src/license/license-public-key.pem
  ```

> A working placeholder public key is already committed so the app builds and
> tests run. **Replace it with your own** (generated above) before issuing real
> licenses, so that only your offline private key can sign valid tokens.

## 2. Issue a license for a licensee

```bash
cd apps/backend            # so jsonwebtoken resolves
node scripts/license/sign-license.mjs \
  --key        /secure/offline/license-private-key.pem \
  --org        "Acme Biosciences Inc." \
  --contact    "ops@acme.com" \
  --expires    2027-06-30 \
  --deployment "third-party"            # optional, ledger only \
  --notes      "contract #123"          # optional, ledger only
```

The signed token is printed to stdout (diagnostics go to stderr, so you can
redirect just the token to a file). Give it to the licensee, who installs it in
**one** of two ways:

- Environment variable: `BILBOMD_LICENSE_KEY=<token>`
- File: write the token to a file and point `BILBOMD_LICENSE_FILE` at it
  (default `/app/license.jwt`).

Backend env precedence: `BILBOMD_LICENSE_KEY` wins, otherwise the file is read.

### Ledger (automatic bookkeeping)

Every issuance also appends a row to a CSV ledger so your records stay in sync
with what you've actually signed. Columns:

```
issued_at,license_id,org,contact,expires,deployment,notes
```

The ledger path is resolved in this order:

1. `--ledger <path>`
2. `$BILBOMD_LICENSE_LEDGER`
3. `./license-ledger.csv` (default, created with a header on first use)

Keep the ledger in your **private/offline location alongside the signing key**.
`license-ledger.csv` is gitignored so it never lands in this public repo. The
`--deployment` and `--notes` fields are ledger-only annotations — they are NOT
embedded in the token. Pass `--no-ledger` to skip the ledger for a one-off.

> Tip: set `BILBOMD_LICENSE_LEDGER=/secure/offline/license-ledger.csv` once in
> your shell so every `sign-license.mjs` run records to the same private file.

## 3. Inspect / verify a token

```bash
cd apps/backend
node scripts/license/inspect-license.mjs --file /path/to/license.jwt
# or
node scripts/license/inspect-license.mjs --token "eyJ..."
```

Prints the licensee, license id, contact, issue/expiry dates, and a verdict
(`VALID` / `EXPIRED` / `INVALID`). It uses the same verification rules as the
backend, so its verdict matches production. Exit code is non-zero for
expired/invalid tokens.

## Renewal & revocation

- **Renewal:** re-run `sign-license.mjs` with a later `--expires` and send the
  new token. The old one stops working at its expiry.
- **Revocation:** there is no online revocation (validation is fully offline).
  Control is via expiry — issue shorter-lived tokens if you need tighter
  control, and renew as the relationship continues.

## Key rotation

The public key is **compiled into the backend image**. Rotating the keypair
therefore requires:

1. Running `generate-keypair.sh` again,
2. Replacing `apps/backend/src/license/license-public-key.pem`,
3. Cutting a new backend release, and
4. Re-issuing every licensee token with the new private key.

Treat rotation as a deliberate release event, not a hot config change.
