import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'

type MockTransporter = {
  sendMail: Mock
  use: Mock
}

// Mock nodemailer before importing the module under test
vi.mock('nodemailer', () => {
  return {
    default: {
      createTransport: vi.fn(() => ({
        sendMail: vi.fn().mockResolvedValue({ messageId: 'test-message-id' }),
        use: vi.fn()
      }))
    }
  }
})

// Mock logger
vi.mock('../../middleware/loggers.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}))

// Import after mocking
import * as mailer from '../nodemailerConfig.js'
import nodemailer from 'nodemailer'

describe('nodemailerConfig', () => {
  let mockTransporter: MockTransporter

  beforeEach(() => {
    // IMPORTANT: Do NOT clear all mocks here; the transporter instance
    // is created during module import time. Clearing all mocks would
    // erase nodemailer's recorded call and its returned instance.
    // Instead, retrieve the already-created transporter and clear only
    // its method call history to start fresh per test.
    const createTransportMock = nodemailer.createTransport as Mock
    const created = createTransportMock.mock.results[0]?.value
    // Fallback: if not created for some reason, create once now.
    mockTransporter = created || createTransportMock()
    if (mockTransporter.use?.mockClear) mockTransporter.use.mockClear()
    if (mockTransporter.sendMail?.mockClear)
      mockTransporter.sendMail.mockClear()
  })

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
