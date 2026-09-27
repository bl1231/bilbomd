import type { Request } from 'express'

// The address of the client that made the request. Behind Cloudflare, req.ip
// is the address of a Cloudflare server, so prefer the CF-Connecting-IP
// header that Cloudflare sets, and fall back to req.ip where it's absent
// (e.g. local development). IPv4-mapped IPv6 addresses (::ffff:1.2.3.4) are
// reduced to plain IPv4. Use this for anything keyed per client: rate
// limits, quotas, logging.
export const clientIp = (req: Request): string => {
  const header = req.headers['cf-connecting-ip']
  const fromHeader = (Array.isArray(header) ? header[0] : header)?.trim()
  const ip = fromHeader || req.ip || 'unknown'
  return ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip
}
