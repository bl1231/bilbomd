import axios from 'axios'
import jwt from 'jsonwebtoken'
import fs from 'fs'
import { logger } from '../../helpers/loggers.js'

const tokenUrl = 'https://oidc.nersc.gov/c2id/token'
const clientId = process.env.SFAPI_CLIENT_ID as string
const privateKeyPath = '/secrets/priv_key.pem'

let cachedToken: string | null = null
let tokenExpiry: number | null = null

// Generate a JWT for client assertion
const generateClientAssertion = (): string => {
  const privateKey = fs.readFileSync(privateKeyPath, 'utf8')
  const payload = {
    iss: clientId,
    sub: clientId,
    aud: tokenUrl,
    exp: Math.floor(Date.now() / 1000) + 30 * 60 // Current time + 30 minutes
  }
  const assertion = jwt.sign(payload, privateKey, { algorithm: 'RS256' })
  return assertion
}

// Exchange clientAssertion for an accessToken
const getAccessToken = async (clientAssertion: string): Promise<string> => {
  const params = new URLSearchParams()
  params.append('grant_type', 'client_credentials')
  params.append(
    'client_assertion_type',
    'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'
  )
  params.append('client_assertion', clientAssertion)

  try {
    // logger.info('getAccessToken about to request accessToken')
    const response = await axios.post(tokenUrl, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })
    // logger.info(`Response from NERSC API: ${JSON.stringify(response.data, null, 2)}`)
    const accessToken = response.data.access_token
    const expiresIn = response.data.expires_in
    const scope = response.data.scope

    // Update cache
    cachedToken = accessToken
    tokenExpiry = Math.floor(Date.now() / 1000) + expiresIn - 10 // Adjust for clock skew

    logger.info(
      `New access token acquired, expires in ${expiresIn} seconds scope ${scope}`
    )
    return accessToken
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      logger.error('Authentication failed: Invalid credentials')
      throw new Error('AuthenticationFailed')
    } else {
      logger.error('Failed to fetch token:', error)
      throw error
    }
  }
}

// Ensure the token is valid, renewing if necessary
const ensureValidToken = async (forceRefresh: boolean = false): Promise<string> => {
  if (
    forceRefresh ||
    !cachedToken ||
    !tokenExpiry ||
    tokenExpiry <= Math.floor(Date.now() / 1000)
  ) {
    const clientAssertion = generateClientAssertion()
    return getAccessToken(clientAssertion)
  } else {
    // const secondsUntilExpiry = tokenExpiry - Math.floor(Date.now() / 1000)
    // logger.info(`Using cached token, expires in ${secondsUntilExpiry} seconds`)
    return cachedToken
  }
}

export { ensureValidToken }
