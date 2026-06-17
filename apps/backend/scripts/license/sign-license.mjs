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
//     [--lid    <license-id>]
//
// Prints the signed JWT to stdout. Hand it to the licensee, who installs it via
// the BILBOMD_LICENSE_KEY env var or a file mounted at /app/license.jwt
// (BILBOMD_LICENSE_FILE).
//
// Requires the jsonwebtoken package — run from within the backend workspace so
// it resolves (e.g. `cd apps/backend && node scripts/license/sign-license.mjs ...`).

import fs from 'fs'
import { randomUUID } from 'crypto'
import jwt from 'jsonwebtoken'

const LICENSE_ISSUER = 'bilbomd-license-authority'

const parseArgs = (argv) => {
  const args = {}
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]
    const value = argv[i + 1]
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error(`Malformed argument near "${key}"`)
    }
    args[key.slice(2)] = value
  }
  return args
}

const fail = (message) => {
  console.error(`Error: ${message}`)
  console.error(
    'Usage: node sign-license.mjs --key <pem> --org <name> --contact <email> --expires <YYYY-MM-DD> [--lid <id>]'
  )
  process.exit(1)
}

const main = () => {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    fail(error.message)
  }

  const { key, org, contact, expires, lid } = args
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
  console.error('Token (give the line below to the licensee):')
  console.log(token)
}

main()
