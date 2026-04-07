import crypto from 'crypto'

const HASH_IP_SALT =
  process.env.HASH_IP_SALT || 'bilbomd-default-salt-98765432!@#$%^&*'

export function hashClientIp(ip: string): string {
  return crypto
    .createHash('sha256')
    .update(ip + HASH_IP_SALT)
    .digest('hex')
}
