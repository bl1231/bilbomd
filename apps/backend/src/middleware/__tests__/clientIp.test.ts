import { describe, it, expect } from 'vitest'
import type { Request } from 'express'
import { clientIp } from '../clientIp.js'

const req = (headers: Record<string, string | string[]>, ip?: string) =>
  ({ headers, ip }) as unknown as Request

describe('clientIp', () => {
  it('prefers the CF-Connecting-IP header', () => {
    expect(
      clientIp(req({ 'cf-connecting-ip': '203.0.113.7' }, '10.0.0.1'))
    ).toBe('203.0.113.7')
  })

  it('falls back to req.ip without the header', () => {
    expect(clientIp(req({}, '198.51.100.4'))).toBe('198.51.100.4')
  })

  it('falls back to req.ip when the header is blank', () => {
    expect(clientIp(req({ 'cf-connecting-ip': '  ' }, '198.51.100.4'))).toBe(
      '198.51.100.4'
    )
  })

  it('uses the first value of a repeated header', () => {
    expect(
      clientIp(req({ 'cf-connecting-ip': ['203.0.113.7', '203.0.113.8'] }))
    ).toBe('203.0.113.7')
  })

  it('reduces IPv4-mapped IPv6 addresses to IPv4', () => {
    expect(clientIp(req({}, '::ffff:192.0.2.9'))).toBe('192.0.2.9')
  })

  it('keeps real IPv6 addresses', () => {
    expect(clientIp(req({ 'cf-connecting-ip': '2001:db8::1' }))).toBe(
      '2001:db8::1'
    )
  })

  it("returns 'unknown' when there is no address at all", () => {
    expect(clientIp(req({}))).toBe('unknown')
  })
})
