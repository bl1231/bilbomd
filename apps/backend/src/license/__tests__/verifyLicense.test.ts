import { describe, it, expect, beforeAll } from 'vitest'
import { generateKeyPairSync } from 'crypto'
import jwt from 'jsonwebtoken'
import { verifyLicenseToken } from '../verifyLicense.js'

const LICENSE_ISSUER = 'bilbomd-license-authority'

let privateKey: string
let publicKey: string
let otherPublicKey: string

const sign = (
  payload: Record<string, unknown>,
  options: jwt.SignOptions = {}
): string =>
  jwt.sign(payload, privateKey, { algorithm: 'RS256', ...options })

beforeAll(() => {
  const pair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  })
  privateKey = pair.privateKey
  publicKey = pair.publicKey

  // An unrelated keypair to simulate a token signed by the wrong key.
  otherPublicKey = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  }).publicKey
})

describe('verifyLicenseToken', () => {
  it('returns "missing" when no token is provided', () => {
    expect(verifyLicenseToken(undefined, publicKey).status).toBe('missing')
    expect(verifyLicenseToken('', publicKey).status).toBe('missing')
    expect(verifyLicenseToken('   ', publicKey).status).toBe('missing')
  })

  it('returns "valid" with claims for a properly signed token', () => {
    const token = sign(
      {
        iss: LICENSE_ISSUER,
        sub: 'Acme Biosciences Inc.',
        lid: 'lic-123',
        contact: 'ops@acme.com'
      },
      { expiresIn: '365d' }
    )

    const state = verifyLicenseToken(token, publicKey)
    expect(state.status).toBe('valid')
    expect(state.licensee).toBe('Acme Biosciences Inc.')
    expect(state.licenseId).toBe('lic-123')
    expect(state.contact).toBe('ops@acme.com')
    expect(state.expiresAt).toBeDefined()
  })

  it('returns "expired" for a token past its expiry', () => {
    const token = sign(
      { iss: LICENSE_ISSUER, sub: 'Acme', lid: 'lic-1' },
      { expiresIn: '-1h' }
    )
    const state = verifyLicenseToken(token, publicKey)
    expect(state.status).toBe('expired')
    expect(state.expiresAt).toBeDefined()
  })

  it('returns "invalid" for a token signed by the wrong key', () => {
    const token = sign(
      { iss: LICENSE_ISSUER, sub: 'Acme', lid: 'lic-1' },
      { expiresIn: '365d' }
    )
    const state = verifyLicenseToken(token, otherPublicKey)
    expect(state.status).toBe('invalid')
  })

  it('returns "invalid" for the wrong issuer', () => {
    const token = sign(
      { iss: 'someone-else', sub: 'Acme', lid: 'lic-1' },
      { expiresIn: '365d' }
    )
    const state = verifyLicenseToken(token, publicKey)
    expect(state.status).toBe('invalid')
  })

  it('returns "invalid" for a garbage token', () => {
    const state = verifyLicenseToken('not-a-jwt', publicKey)
    expect(state.status).toBe('invalid')
  })

  it('rejects HS256 tokens (asymmetric algorithm enforced)', () => {
    // Attempt to forge using the public key as an HMAC secret — must not verify.
    const forged = jwt.sign({ iss: LICENSE_ISSUER, sub: 'Hacker' }, publicKey, {
      algorithm: 'HS256',
      expiresIn: '365d'
    })
    const state = verifyLicenseToken(forged, publicKey)
    expect(state.status).toBe('invalid')
  })
})
