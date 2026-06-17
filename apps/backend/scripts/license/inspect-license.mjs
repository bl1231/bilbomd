#!/usr/bin/env node
//
// inspect-license.mjs — decode and verify a BilboMD license token without
// standing up the backend. Handy for support and sanity checks.
//
// Usage:
//   node inspect-license.mjs --token <jwt>
//   node inspect-license.mjs --file ./license.jwt
//   node inspect-license.mjs --file ./license.jwt --public-key ./license-public-key.pem
//
// The verification mirrors apps/backend/src/license/verifyLicense.ts exactly
// (RS256 + issuer check, expired vs invalid), so its verdict matches what the
// running backend would decide. Defaults to the committed public key.
//
// Requires the jsonwebtoken package — run from within the backend workspace.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import jwt from 'jsonwebtoken'

const LICENSE_ISSUER = 'bilbomd-license-authority'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_PUBLIC_KEY = path.join(
  __dirname,
  '..',
  '..',
  'src',
  'license',
  'license-public-key.pem'
)

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
    'Usage: node inspect-license.mjs (--token <jwt> | --file <path>) [--public-key <pem>]'
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

  let token = args.token
  if (!token && args.file) {
    try {
      token = fs.readFileSync(args.file, 'utf8').trim()
    } catch {
      fail(`Could not read token file at "${args.file}"`)
    }
  }
  if (!token) fail('Provide --token <jwt> or --file <path>')

  const publicKeyPath = args['public-key'] || DEFAULT_PUBLIC_KEY
  let publicKey
  try {
    publicKey = fs.readFileSync(publicKeyPath, 'utf8')
  } catch {
    fail(`Could not read public key at "${publicKeyPath}"`)
  }

  try {
    const claims = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: LICENSE_ISSUER
    })
    console.log('Status:     VALID')
    console.log(`Licensee:   ${claims.sub}`)
    console.log(`License ID: ${claims.lid ?? 'n/a'}`)
    console.log(`Contact:    ${claims.contact ?? 'n/a'}`)
    console.log(`Issued:     ${new Date(claims.iat * 1000).toISOString()}`)
    console.log(`Expires:    ${new Date(claims.exp * 1000).toISOString()}`)
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      console.log('Status:     EXPIRED')
      console.log(`Expired at: ${error.expiredAt.toISOString()}`)
      process.exitCode = 2
      return
    }
    console.log('Status:     INVALID')
    console.log(`Reason:     ${error.message}`)
    process.exitCode = 2
  }
}

main()
