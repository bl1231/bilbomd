#!/usr/bin/env node
//
// sign-license.mjs — mint a signed BilboMD license token for a licensee.
//
// Usage:
//   node sign-license.mjs \
//     --key     ./license-private-key.pem \
//     --org     "Acme Biosciences Inc." \
//     --contact "ops@acme.com" \
//     --expires 2027-06-30 \
//     [--lid        <license-id>] \
//     [--deployment "third-party / epyc / NERSC"] \
//     [--notes      "contract #123"] \
//     [--ledger     ./license-ledger.csv] \
//     [--no-ledger]
//
// Prints the signed JWT to stdout. Hand it to the licensee, who installs it via
// the BILBOMD_LICENSE_KEY env var or a file mounted at /app/license.jwt
// (BILBOMD_LICENSE_FILE).
//
// Bookkeeping: every issuance also appends a row to a CSV ledger so your records
// can't drift from what you've actually signed. The ledger path is, in order:
//   --ledger <path>  >  $BILBOMD_LICENSE_LEDGER  >  ./license-ledger.csv
// Keep the ledger in your private/offline location alongside the signing key —
// it is gitignored here so it never lands in the public repo. --deployment and
// --notes are ledger-only annotations (NOT embedded in the token). Pass
// --no-ledger to skip the ledger for a one-off.
//
// Requires the jsonwebtoken package — run from within the backend workspace so
// it resolves (e.g. `cd apps/backend && node scripts/license/sign-license.mjs ...`).

import fs from 'fs'
import { randomUUID } from 'crypto'
import jwt from 'jsonwebtoken'

const LICENSE_ISSUER = 'bilbomd-license-authority'
const DEFAULT_LEDGER = 'license-ledger.csv'
const LEDGER_HEADER =
  'issued_at,license_id,org,contact,expires,deployment,notes\n'

const BOOLEAN_FLAGS = new Set(['no-ledger'])

const parseArgs = (argv) => {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (!key?.startsWith('--')) {
      throw new Error(`Malformed argument near "${key}"`)
    }
    const name = key.slice(2)
    if (BOOLEAN_FLAGS.has(name)) {
      args[name] = true
      continue
    }
    const value = argv[i + 1]
    if (value === undefined) {
      throw new Error(`Missing value for "${key}"`)
    }
    args[name] = value
    i++
  }
  return args
}

const fail = (message) => {
  console.error(`Error: ${message}`)
  console.error(
    'Usage: node sign-license.mjs --key <pem> --org <name> --contact <email> --expires <YYYY-MM-DD>\n' +
      '         [--lid <id>] [--deployment <text>] [--notes <text>] [--ledger <path>] [--no-ledger]'
  )
  process.exit(1)
}

// RFC-4180 CSV field: wrap in quotes and double any embedded quotes.
const csvField = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`

const appendToLedger = (ledgerPath, row) => {
  const line =
    [
      row.issuedAt,
      row.licenseId,
      row.org,
      row.contact,
      row.expires,
      row.deployment,
      row.notes
    ]
      .map(csvField)
      .join(',') + '\n'

  try {
    if (!fs.existsSync(ledgerPath)) {
      fs.writeFileSync(ledgerPath, LEDGER_HEADER + line)
    } else {
      fs.appendFileSync(ledgerPath, line)
    }
    console.error(`Recorded in ledger: ${ledgerPath}`)
  } catch (error) {
    // Never lose a token over a bookkeeping hiccup — the token is already on
    // stdout. Warn loudly so the operator can record it by hand.
    console.error(
      `WARNING: could not write ledger at "${ledgerPath}" (${error.message}). ` +
        'Record this license manually.'
    )
  }
}

const main = () => {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    fail(error.message)
  }

  const { key, org, contact, expires, lid, deployment, notes } = args
  if (!key) fail('--key (path to private key PEM) is required')
  if (!org) fail('--org (licensee organization name) is required')
  if (!contact) fail('--contact (licensee contact email) is required')
  if (!expires) fail('--expires (YYYY-MM-DD) is required')

  // Expire at end of the given day, UTC.
  const expiryMs = Date.parse(`${expires}T23:59:59Z`)
  if (Number.isNaN(expiryMs)) {
    fail(`--expires "${expires}" is not a valid YYYY-MM-DD date`)
  }
  const expSeconds = Math.floor(expiryMs / 1000)
  if (expSeconds <= Math.floor(Date.now() / 1000)) {
    console.error(`Warning: --expires ${expires} is in the past.`)
  }

  let privateKey
  try {
    privateKey = fs.readFileSync(key, 'utf8')
  } catch {
    fail(`Could not read private key at "${key}"`)
  }

  const licenseId = lid || randomUUID()
  const issuedAt = new Date().toISOString()

  const token = jwt.sign(
    {
      iss: LICENSE_ISSUER,
      sub: org,
      lid: licenseId,
      contact,
      exp: expSeconds
    },
    privateKey,
    { algorithm: 'RS256' }
  )

  console.error(
    `Signed license for "${org}" (id ${licenseId}), expires ${new Date(expiryMs).toISOString()}`
  )

  if (!args['no-ledger']) {
    const ledgerPath =
      args.ledger || process.env.BILBOMD_LICENSE_LEDGER || DEFAULT_LEDGER
    appendToLedger(ledgerPath, {
      issuedAt,
      licenseId,
      org,
      contact,
      expires: new Date(expiryMs).toISOString(),
      deployment: deployment || '',
      notes: notes || ''
    })
  }

  console.error('Token (give the line below to the licensee):')
  console.log(token)
}

main()
