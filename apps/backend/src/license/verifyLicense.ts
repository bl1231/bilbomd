import jwt from 'jsonwebtoken'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { logger } from '../middleware/loggers.js'

/**
 * Offline, cryptographically signed license validation for BilboMD.
 *
 * License tokens are RS256-signed JWTs. The backend ships only the *public* key
 * (committed alongside this module); valid tokens can only be minted with the
 * licensor's offline *private* key. Tokens carry a built-in expiry.
 *
 * See apps/backend/scripts/license/ for the licensor tooling that generates the
 * keypair and signs tokens.
 */

const LICENSE_ISSUER = 'bilbomd-license-authority'

export type LicenseStatus = 'valid' | 'missing' | 'invalid' | 'expired'

export interface LicenseState {
  status: LicenseStatus
  licensee?: string
  licenseId?: string
  contact?: string
  /** ISO-8601 expiry timestamp, when the token decoded far enough to know it. */
  expiresAt?: string
  /** Human-readable explanation for non-valid states (for logs/admins). */
  reason?: string
}

interface LicenseClaims {
  iss: string
  sub: string
  lid?: string
  contact?: string
  iat: number
  exp: number
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * The embedded public key. Loaded once from the .pem committed next to this
 * module (copy-assets copies it into dist/ during build). The verifier uses
 * ONLY this key, by design — it must not be made configurable at runtime.
 */
const loadEmbeddedPublicKey = (): string => {
  const pemPath = path.join(__dirname, 'license-public-key.pem')
  return fs.readFileSync(pemPath, 'utf8')
}

/**
 * Verify a raw license token against a public key. Pure and synchronous so it
 * can be unit-tested with an injected throwaway key. `publicKeyPem` defaults to
 * the embedded key used in production.
 */
export const verifyLicenseToken = (
  token: string | undefined | null,
  publicKeyPem: string = loadEmbeddedPublicKey()
): LicenseState => {
  if (!token || token.trim() === '') {
    return { status: 'missing', reason: 'No license token configured' }
  }

  try {
    const claims = jwt.verify(token.trim(), publicKeyPem, {
      algorithms: ['RS256'],
      issuer: LICENSE_ISSUER
    }) as LicenseClaims

    return {
      status: 'valid',
      licensee: claims.sub,
      licenseId: claims.lid,
      contact: claims.contact,
      expiresAt: new Date(claims.exp * 1000).toISOString()
    }
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return {
        status: 'expired',
        expiresAt: error.expiredAt.toISOString(),
        reason: 'License has expired'
      }
    }
    const reason =
      error instanceof Error ? error.message : 'License verification failed'
    return { status: 'invalid', reason }
  }
}

/**
 * Resolve the raw token from the environment: BILBOMD_LICENSE_KEY takes
 * precedence, otherwise read the file at BILBOMD_LICENSE_FILE (default
 * /app/license.jwt). Returns undefined when neither is present/readable.
 */
const resolveRawToken = (): string | undefined => {
  const inlineToken = process.env.BILBOMD_LICENSE_KEY
  if (inlineToken && inlineToken.trim() !== '') {
    return inlineToken
  }

  const filePath = process.env.BILBOMD_LICENSE_FILE || '/app/license.jwt'
  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    // No file present — treated as a missing license.
    return undefined
  }
}

let licenseState: LicenseState = {
  status: 'missing',
  reason: 'License not yet initialized'
}

/**
 * Validate the configured license at startup and cache the result. Logs a
 * prominent banner. Does NOT throw or exit — enforcement happens per-request in
 * the requireValidLicense middleware so the app stays browsable.
 */
export const initLicense = (): void => {
  licenseState = verifyLicenseToken(resolveRawToken())

  if (licenseState.status === 'valid') {
    logger.info(
      `BilboMD license OK — licensed to "${licenseState.licensee}" ` +
        `(id ${licenseState.licenseId ?? 'n/a'}), expires ${licenseState.expiresAt}`
    )
  } else {
    logger.warn(
      `BilboMD license ${licenseState.status.toUpperCase()} — ` +
        `${licenseState.reason ?? 'no valid license'}. ` +
        'Job submission is disabled until a valid license is installed.'
    )
  }
}

/**
 * Return the cached license state, recomputing the time-based expiry on every
 * call so a long-running process flips to "expired" without needing a restart.
 */
export const getLicenseState = (): LicenseState => {
  if (
    licenseState.status === 'valid' &&
    licenseState.expiresAt &&
    Date.now() >= Date.parse(licenseState.expiresAt)
  ) {
    return {
      ...licenseState,
      status: 'expired',
      reason: 'License has expired'
    }
  }
  return licenseState
}
