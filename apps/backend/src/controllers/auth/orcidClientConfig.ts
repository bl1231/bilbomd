import { discovery, Configuration } from 'openid-client'
import { getEnvVar } from '../../config/config.js'

export interface OrcidClientConfig {
  client_id: string
  client_secret: string
  redirect_uri: string
  response_types: ['code']
  scope: string
}

// Populated by initOrcidClient(). Importing this module is a no-op; callers
// at request time access these after app.ts has awaited initOrcidClient().
// initOrcidClient() is only invoked when ORCID_AUTH_ENABLED is true, so
// validation of the required ORCID env vars happens there — not at import.
export let clientConfig: OrcidClientConfig
export let discovered: Configuration

const REQUIRED_ENV_VARS = [
  'ORCID_CLIENT_ID',
  'ORCID_CLIENT_SECRET',
  'ORCID_REDIRECT_URI',
  'ORCID_ISSUER',
  'ORCID_BASE_URL',
  'ORCID_PUBLIC_API_URL'
] as const

export async function initOrcidClient() {
  // Fail fast on misconfiguration: every URL the ORCID flow touches must
  // be set explicitly. We previously fell back to sandbox defaults, which
  // silently mixed sandbox and production endpoints when an env var was
  // missing — see https://github.com/bl1231/bilbomd/issues/817 (C3).
  REQUIRED_ENV_VARS.forEach((name) => getEnvVar(name))

  clientConfig = {
    client_id: getEnvVar('ORCID_CLIENT_ID'),
    client_secret: getEnvVar('ORCID_CLIENT_SECRET'),
    redirect_uri: getEnvVar('ORCID_REDIRECT_URI'),
    response_types: ['code'],
    scope: 'openid'
  }

  discovered = await discovery(
    new URL(getEnvVar('ORCID_ISSUER')),
    clientConfig.client_id,
    clientConfig.client_secret
  )
}
