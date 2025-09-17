import axios from 'axios'
import jwt from 'jsonwebtoken'
import fs from 'fs'
import { logger } from '../middleware/loggers.js'
import { Request, Response, NextFunction } from 'express'

const tokenUrl = 'https://oidc.nersc.gov/c2id/token'
const clientId = process.env.SFAPI_CLIENT_ID as string
const privateKeyPath = '/secrets/priv_key.pem'

let cachedToken: string | null = null
let tokenExpiry: number | null = null

interface AccessTokenResponse {
  access_token: string
  scope: string
  token_bearer: string
  expires_in: number
}

interface AccessToken {
  accessToken: string
  expiresIn: number
}

// Function to generate a JWT for client assertion
function generateClientAssertion(clientId: string, privateKeyPath: string): string {
  const privateKey = fs.readFileSync(privateKeyPath, 'utf8')

  // Prepare the payload
  const payload = {
    iss: clientId,
    sub: clientId,
    aud: tokenUrl,
    exp: Math.floor(Date.now() / 1000) + 5 * 60 // Current time + 5 minutes
  }

  // Sign the JWT
  const assertion = jwt.sign(payload, privateKey, { algorithm: 'RS256' })
  // logger.info(`client assertion: ${assertion}`)
  return assertion
}

// Exchange clientAssertion for an accessToken
async function getAccessToken(clientAssertion: string): Promise<AccessToken> {
  const params = new URLSearchParams()
  params.append('grant_type', 'client_credentials')
  params.append(
    'client_assertion_type',
    'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'
  )
  params.append('client_assertion', clientAssertion)

  try {
    logger.info(`getting new accessToken`)
    const response = await axios.post<AccessTokenResponse>(tokenUrl, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })
    // logger.info(`accessToken: ${JSON.stringify(response.data)}`)
    logger.info(`scope: ${response.data.scope}`)
    return {
      accessToken: response.data.access_token,
      expiresIn: Math.floor(Date.now() / 1000) + response.data.expires_in - 10
    }
  } catch (error) {
    console.error('Error fetching access token:', error)
    throw error
  }
}

const ensureSFAuthenticated = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Check if a valid token is already cached and not about to expire
    if (!cachedToken || !tokenExpiry || tokenExpiry <= Math.floor(Date.now() / 1000)) {
      const clientAssertion = generateClientAssertion(clientId, privateKeyPath)
      const { accessToken, expiresIn } = await getAccessToken(clientAssertion)

      // Cache the new token and its expiry time
      cachedToken = accessToken
      tokenExpiry = expiresIn

      // Log the new token's expiry time in seconds from now
      const secondsUntilExpiry = expiresIn - Math.floor(Date.now() / 1000)
      logger.info(`New token acquired. Seconds until expiry: ${secondsUntilExpiry}`)
      // logger.info(`New token acquired. Token: ${accessToken}`)
    } else {
      // For an existing token, calculate and log the remaining time until expiry
      const secondsUntilExpiry = tokenExpiry - Math.floor(Date.now() / 1000)
      logger.info(
        `Existing token being used. Seconds until expiry: ${secondsUntilExpiry}`
      )
    }
    if (process.env.BILBOMD_ENV === 'development') {
      logger.info(cachedToken)
    }
    req.sfApiToken = cachedToken
    next()
  } catch (error) {
    logger.error(`Failed to authenticate with SF API: ${error}`)
    res.status(500).send('Failed to authenticate with SF API')
  }
}

export { ensureSFAuthenticated }
