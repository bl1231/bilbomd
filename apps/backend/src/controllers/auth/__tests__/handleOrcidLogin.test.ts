import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response } from 'express'

vi.mock('../../../config/config.js', () => ({
  config: { logLevel: 'info', sendEmailNotifications: false },
  getEnvVar: vi.fn().mockReturnValue('test-secret'),
  isCookieSecure: vi.fn(() => true)
}))

const { buildAuthorizationUrlMock, randomStateMock, randomNonceMock } =
  vi.hoisted(() => ({
    buildAuthorizationUrlMock: vi.fn(),
    randomStateMock: vi.fn(),
    randomNonceMock: vi.fn()
  }))

vi.mock('openid-client', () => ({
  buildAuthorizationUrl: buildAuthorizationUrlMock,
  randomState: randomStateMock,
  randomNonce: randomNonceMock
}))

vi.mock('../orcidClientConfig.js', () => ({
  clientConfig: {
    client_id: 'test-client',
    client_secret: 'test-secret',
    redirect_uri: 'http://localhost/callback',
    response_types: ['code'],
    scope: 'openid'
  },
  discovered: {}
}))

import { handleOrcidLogin } from '../handleOrcidLogin.js'

const makeRes = () => {
  const cookieCalls: Array<[string, string, Record<string, unknown>]> = []
  const res = {
    cookie: vi.fn((name: string, value: string, opts: Record<string, unknown>) => {
      cookieCalls.push([name, value, opts])
      return res
    }),
    redirect: vi.fn().mockReturnValue(undefined)
  } as unknown as Response
  return { res, cookieCalls }
}

beforeEach(() => {
  vi.clearAllMocks()
  randomStateMock.mockReturnValue('state-value')
  randomNonceMock.mockReturnValue('nonce-value')
  buildAuthorizationUrlMock.mockReturnValue(
    new URL('https://orcid.test/oauth/authorize?stuff')
  )
})

describe('handleOrcidLogin — M1 cookie hardening', () => {
  it('sets state cookie with sameSite=lax, secure, httpOnly, and 5-minute maxAge', async () => {
    const { res, cookieCalls } = makeRes()

    await handleOrcidLogin({} as Request, res)

    const stateCookie = cookieCalls.find(([name]) => name === 'orcid_oauth_state')
    expect(stateCookie).toBeDefined()
    expect(stateCookie?.[1]).toBe('state-value')
    expect(stateCookie?.[2]).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 5 * 60 * 1000
    })
  })

  it('sets nonce cookie with the same hardened options', async () => {
    const { res, cookieCalls } = makeRes()

    await handleOrcidLogin({} as Request, res)

    const nonceCookie = cookieCalls.find(([name]) => name === 'orcid_oauth_nonce')
    expect(nonceCookie).toBeDefined()
    expect(nonceCookie?.[1]).toBe('nonce-value')
    expect(nonceCookie?.[2]).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 5 * 60 * 1000
    })
  })

  it('redirects to the ORCID authorization URL with the generated state', async () => {
    const { res } = makeRes()

    await handleOrcidLogin({} as Request, res)

    expect(buildAuthorizationUrlMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        client_id: 'test-client',
        redirect_uri: 'http://localhost/callback',
        response_type: 'code',
        scope: 'openid',
        state: 'state-value'
      })
    )
    expect(res.redirect).toHaveBeenCalledWith(
      'https://orcid.test/oauth/authorize?stuff'
    )
  })
})
