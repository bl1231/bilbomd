import { discovery, Configuration } from 'openid-client'

const ORCID_ISSUER = new URL(process.env.ORCID_ISSUER || 'https://orcid.org')

export const clientConfig = {
  client_id: process.env.ORCID_CLIENT_ID!,
  client_secret: process.env.ORCID_CLIENT_SECRET!,
  redirect_uri: process.env.ORCID_REDIRECT_URI!,
  response_types: ['code'],
  scope: 'openid'
}

export let discovered: Configuration

export async function initOrcidClient() {
  discovered = await discovery(
    ORCID_ISSUER,
    clientConfig.client_id,
    clientConfig.client_secret
  )
}
