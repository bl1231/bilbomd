import { describe, it, expect, beforeEach, vi } from 'vitest'

// Hoisted so the same transporter instance survives vi.resetModules() below —
// mock factories re-run on re-import, which would otherwise hand the module a
// different transporter than the one we assert on.
const { createTransport, mockTransporter } = vi.hoisted(() => {
  const mockTransporter = {
    sendMail: vi.fn().mockResolvedValue({ messageId: 'test-message-id' }),
    use: vi.fn()
  }
  return {
    mockTransporter,
    createTransport: vi.fn<
      (config: Record<string, unknown>) => typeof mockTransporter
    >(() => mockTransporter)
  }
})

vi.mock('nodemailer', () => ({ default: { createTransport } }))

vi.mock('../../middleware/loggers.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}))

type MailerModule = typeof import('../nodemailerConfig.js')

let mailer: MailerModule

// The transporter is created as a module side effect. Vitest clears mock call
// records before every test, so re-import the module per test to observe the
// createTransport call. Call history on mockTransporter is cleared by the same
// mechanism, so each test starts fresh.
beforeEach(async () => {
  vi.resetModules()
  mailer = await import('../nodemailerConfig.js')
})

describe('transporter configuration', () => {
  const transportConfig = () => createTransport.mock.calls[0][0]

  it('uses secure: false by default', () => {
    expect(transportConfig().secure).toBe(false)
  })

  it('omits auth when BILBOMD_MAILER_USER/PASS are not set', () => {
    expect(transportConfig().auth).toBeUndefined()
  })

  it('uses smtp-relay.gmail.com as default host', () => {
    expect(transportConfig().host).toBe('smtp-relay.gmail.com')
  })

  it('uses port 25 as default', () => {
    expect(transportConfig().port).toBe(25)
  })
})

describe('nodemailerConfig', () => {
  it('sendVerificationEmail sends correct mail', async () => {
    await mailer.sendVerificationEmail(
      'test@example.com',
      'http://url',
      'code123'
    )
    expect(mockTransporter.use).toHaveBeenCalledWith(
      'compile',
      expect.any(Function)
    )
    expect(mockTransporter.sendMail).toHaveBeenCalled()
    const mailArg = mockTransporter.sendMail.mock.calls[0][0]
    expect(mailArg.to).toBe('test@example.com')
    expect(mailArg.template).toBe('signup')
    expect(mailArg.context).toEqual({
      confirmationcode: 'code123',
      url: 'http://url'
    })
  })

  it('sendMagickLinkEmail sends correct mail', async () => {
    await mailer.sendMagickLinkEmail('test@example.com', 'http://url', 'otp456')
    expect(mockTransporter.use).toHaveBeenCalledWith(
      'compile',
      expect.any(Function)
    )
    expect(mockTransporter.sendMail).toHaveBeenCalled()
    const mailArg = mockTransporter.sendMail.mock.calls[0][0]
    expect(mailArg.template).toBe('magicklink')
    expect(mailArg.context).toEqual({
      onetimepasscode: 'otp456',
      url: 'http://url'
    })
  })

  it('sendOtpEmail sends correct mail', async () => {
    await mailer.sendOtpEmail('test@example.com', 'http://url', 'otp789')
    expect(mockTransporter.use).toHaveBeenCalledWith(
      'compile',
      expect.any(Function)
    )
    expect(mockTransporter.sendMail).toHaveBeenCalled()
    const mailArg = mockTransporter.sendMail.mock.calls[0][0]
    expect(mailArg.template).toBe('otp')
    expect(mailArg.context).toEqual({
      onetimepasscode: 'otp789',
      url: 'http://url'
    })
  })

  it('sendOtpEmailLocal sends correct mail', async () => {
    await mailer.sendOtpEmailLocal('test@example.com', 'http://url', 'otp000')
    expect(mockTransporter.sendMail).toHaveBeenCalled()
    const mailArg = mockTransporter.sendMail.mock.calls[0][0]
    expect(mailArg.text).toContain('otp000')
  })

  it('sendUpdatedEmailMessage sends correct mail', async () => {
    await mailer.sendUpdatedEmailMessage('new@example.com', 'old@example.com')
    expect(mockTransporter.use).toHaveBeenCalledWith(
      'compile',
      expect.any(Function)
    )
    expect(mockTransporter.sendMail).toHaveBeenCalled()
    const mailArg = mockTransporter.sendMail.mock.calls[0][0]
    expect(mailArg.template).toBe('emailUpdated')
    expect(mailArg.context).toEqual({
      oldEmail: 'old@example.com',
      newEmail: 'new@example.com'
    })
  })

  it('sendDeleteAccountSuccessEmail sends correct mail', async () => {
    await mailer.sendDeleteAccountSuccessEmail('test@example.com', 'testuser')
    expect(mockTransporter.use).toHaveBeenCalledWith(
      'compile',
      expect.any(Function)
    )
    expect(mockTransporter.sendMail).toHaveBeenCalled()
    const mailArg = mockTransporter.sendMail.mock.calls[0][0]
    expect(mailArg.template).toBe('deleteAccount')
    expect(mailArg.context).toEqual({ username: 'testuser' })
  })
})
