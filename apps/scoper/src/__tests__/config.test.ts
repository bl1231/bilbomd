import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('dotenv', () => ({ default: { config: vi.fn() } }))

describe('config', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it('reads values from env vars', async () => {
    vi.stubEnv('BILBOMD_URL', 'http://bilbomd.example.com')
    vi.stubEnv('SEND_EMAIL_NOTIFICATIONS', 'false')
    vi.stubEnv('BULLMQ_ATTEMPTS', '5')
    const { config } = await import('../config/config.js')
    expect(config.bilbomdUrl).toBe('http://bilbomd.example.com')
    expect(config.sendEmailNotifications).toBe(false)
    expect(config.bullmqAttempts).toBe(5)
  })

  it('throws when BILBOMD_URL is missing', async () => {
    vi.stubEnv('BILBOMD_URL', '')
    await expect(import('../config/config.js')).rejects.toThrow(
      'Environment variable BILBOMD_URL is not set'
    )
  })

  it('parses SEND_EMAIL_NOTIFICATIONS=true', async () => {
    vi.stubEnv('BILBOMD_URL', 'http://test.local')
    vi.stubEnv('SEND_EMAIL_NOTIFICATIONS', 'true')
    const { config } = await import('../config/config.js')
    expect(config.sendEmailNotifications).toBe(true)
  })

  it('parses SEND_EMAIL_NOTIFICATIONS=1', async () => {
    vi.stubEnv('BILBOMD_URL', 'http://test.local')
    vi.stubEnv('SEND_EMAIL_NOTIFICATIONS', '1')
    const { config } = await import('../config/config.js')
    expect(config.sendEmailNotifications).toBe(true)
  })

  it('parses SEND_EMAIL_NOTIFICATIONS=yes', async () => {
    vi.stubEnv('BILBOMD_URL', 'http://test.local')
    vi.stubEnv('SEND_EMAIL_NOTIFICATIONS', 'yes')
    const { config } = await import('../config/config.js')
    expect(config.sendEmailNotifications).toBe(true)
  })

  it('defaults bullmqAttempts to 3 when BULLMQ_ATTEMPTS is not set', async () => {
    vi.stubEnv('BILBOMD_URL', 'http://test.local')
    vi.stubEnv('BULLMQ_ATTEMPTS', '')
    const { config } = await import('../config/config.js')
    expect(config.bullmqAttempts).toBe(3)
  })
})
