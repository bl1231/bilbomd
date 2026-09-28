import { describe, it, expect, vi } from 'vitest'

// One transporter shared by every import of the module under test, so tests
// that re-import it (to observe import-time setup) see the same mock.
const { transporter, createTransport } = vi.hoisted(() => {
  const transporter = {
    sendMail: vi.fn().mockResolvedValue({ messageId: 'test-message-id' }),
    use: vi.fn()
  }
  return {
    transporter,
    createTransport: vi.fn<
      (options: Record<string, unknown>) => typeof transporter
    >(() => transporter)
  }
})

vi.mock('nodemailer', () => ({ default: { createTransport } }))

vi.mock('../../middleware/loggers.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}))

import * as mailer from '../nodemailerConfig.js'

// Mocks are cleared before each test, so load the module inside the test to
// observe what it does at import time.
const importFresh = async () => {
  vi.resetModules()
  await import('../nodemailerConfig.js')
  return createTransport.mock.calls[0]?.[0] ?? {}
}

describe('transporter configuration', () => {
  it('uses secure: false by default', async () => {
    const config = await importFresh()
    expect(config.secure).toBe(false)
  })

  it('omits auth when BILBOMD_MAILER_USER/PASS are not set', async () => {
    const config = await importFresh()
    expect(config.auth).toBeUndefined()
  })

  it('uses smtp-relay.gmail.com as default host', async () => {
    const config = await importFresh()
    expect(config.host).toBe('smtp-relay.gmail.com')
  })

  it('uses port 25 as default', async () => {
    const config = await importFresh()
    expect(config.port).toBe(25)
  })

  it('registers the handlebars compile plugin once, at import', async () => {
    await importFresh()
    expect(transporter.use).toHaveBeenCalledTimes(1)
    expect(transporter.use).toHaveBeenCalledWith(
      'compile',
      expect.any(Function)
    )
  })
})

describe('nodemailerConfig', () => {
  it('sendVerificationEmail sends correct mail', async () => {
    await mailer.sendVerificationEmail(
      'test@example.com',
      'http://url',
      'code123'
    )
    expect(transporter.use).not.toHaveBeenCalled()
    expect(transporter.sendMail).toHaveBeenCalled()
    const mailArg = transporter.sendMail.mock.calls[0][0]
    expect(mailArg.to).toBe('test@example.com')
    expect(mailArg.template).toBe('signup')
    expect(mailArg.context).toEqual({
      confirmationcode: 'code123',
      url: 'http://url'
    })
  })

  it('sendMagickLinkEmail sends correct mail', async () => {
    await mailer.sendMagickLinkEmail('test@example.com', 'http://url', 'otp456')
    expect(transporter.use).not.toHaveBeenCalled()
    expect(transporter.sendMail).toHaveBeenCalled()
    const mailArg = transporter.sendMail.mock.calls[0][0]
    expect(mailArg.template).toBe('magicklink')
    expect(mailArg.context).toEqual({
      onetimepasscode: 'otp456',
      url: 'http://url'
    })
  })

  it('sendOtpEmail sends correct mail', async () => {
    await mailer.sendOtpEmail('test@example.com', 'http://url', 'otp789')
    expect(transporter.use).not.toHaveBeenCalled()
    expect(transporter.sendMail).toHaveBeenCalled()
    const mailArg = transporter.sendMail.mock.calls[0][0]
    expect(mailArg.template).toBe('otp')
    expect(mailArg.context).toEqual({
      onetimepasscode: 'otp789',
      url: 'http://url'
    })
  })

  it('sendOtpEmailLocal sends correct mail', async () => {
    await mailer.sendOtpEmailLocal('test@example.com', 'http://url', 'otp000')
    expect(transporter.sendMail).toHaveBeenCalled()
    const mailArg = transporter.sendMail.mock.calls[0][0]
    expect(mailArg.text).toContain('otp000')
  })

  it('sendUpdatedEmailMessage sends correct mail', async () => {
    await mailer.sendUpdatedEmailMessage('new@example.com', 'old@example.com')
    expect(transporter.use).not.toHaveBeenCalled()
    expect(transporter.sendMail).toHaveBeenCalled()
    const mailArg = transporter.sendMail.mock.calls[0][0]
    expect(mailArg.template).toBe('emailUpdated')
    expect(mailArg.context).toEqual({
      oldEmail: 'old@example.com',
      newEmail: 'new@example.com'
    })
  })

  it('sendDeleteAccountSuccessEmail sends correct mail', async () => {
    await mailer.sendDeleteAccountSuccessEmail('test@example.com', 'testuser')
    expect(transporter.use).not.toHaveBeenCalled()
    expect(transporter.sendMail).toHaveBeenCalled()
    const mailArg = transporter.sendMail.mock.calls[0][0]
    expect(mailArg.template).toBe('deleteAccount')
    expect(mailArg.context).toEqual({ username: 'testuser' })
  })
})
