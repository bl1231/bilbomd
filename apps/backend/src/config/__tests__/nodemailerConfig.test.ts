import { describe, it, expect, beforeEach, Mock } from 'vitest'
import * as mailer from '../nodemailerConfig.js'

declare global {
  var __useMock: Mock
  var __sendMailMock: Mock
}

describe('nodemailerConfig', () => {
  beforeEach(() => {
    globalThis.__useMock.mockClear()
    globalThis.__sendMailMock.mockClear()
    globalThis.__sendMailMock.mockResolvedValue(undefined)
  })

  it('sendVerificationEmail sends correct mail', async () => {
    await mailer.sendVerificationEmail('test@example.com', 'http://url', 'code123')
    expect(globalThis.__useMock).toHaveBeenCalledWith('compile', expect.any(Object))
    expect(globalThis.__sendMailMock).toHaveBeenCalled()
    const mailArg = globalThis.__sendMailMock.mock.calls[0][0]
    expect(mailArg.to).toBe('test@example.com')
    expect(mailArg.template).toBe('signup')
    expect(mailArg.context).toEqual({ confirmationcode: 'code123', url: 'http://url' })
  })

  it('sendMagickLinkEmail sends correct mail', async () => {
    await mailer.sendMagickLinkEmail('test@example.com', 'http://url', 'otp456')
    expect(globalThis.__useMock).toHaveBeenCalledWith('compile', expect.any(Object))
    expect(globalThis.__sendMailMock).toHaveBeenCalled()
    const mailArg = globalThis.__sendMailMock.mock.calls[0][0]
    expect(mailArg.template).toBe('magicklink')
    expect(mailArg.context).toEqual({ onetimepasscode: 'otp456', url: 'http://url' })
  })

  it('sendOtpEmail sends correct mail', async () => {
    await mailer.sendOtpEmail('test@example.com', 'otp789')
    expect(globalThis.__useMock).toHaveBeenCalledWith('compile', expect.any(Object))
    expect(globalThis.__sendMailMock).toHaveBeenCalled()
    const mailArg = globalThis.__sendMailMock.mock.calls[0][0]
    expect(mailArg.template).toBe('otp')
    expect(mailArg.context).toEqual({ onetimepasscode: 'otp789' })
  })

  it('sendOtpEmailLocal sends correct mail', async () => {
    await mailer.sendOtpEmailLocal('test@example.com', 'otp000')
    expect(globalThis.__sendMailMock).toHaveBeenCalled()
    const mailArg = globalThis.__sendMailMock.mock.calls[0][0]
    expect(mailArg.text).toContain('otp000')
  })

  it('sendUpdatedEmailMessage sends correct mail', async () => {
    await mailer.sendUpdatedEmailMessage('new@example.com', 'old@example.com')
    expect(globalThis.__useMock).toHaveBeenCalledWith('compile', expect.any(Object))
    expect(globalThis.__sendMailMock).toHaveBeenCalled()
    const mailArg = globalThis.__sendMailMock.mock.calls[0][0]
    expect(mailArg.template).toBe('emailUpdated')
    expect(mailArg.context).toEqual({ oldEmail: 'old@example.com', newEmail: 'new@example.com' })
  })

  it('sendDeleteAccountSuccessEmail sends correct mail', async () => {
    await mailer.sendDeleteAccountSuccessEmail('test@example.com', 'testuser')
    expect(globalThis.__useMock).toHaveBeenCalledWith('compile', expect.any(Object))
    expect(globalThis.__sendMailMock).toHaveBeenCalled()
    const mailArg = globalThis.__sendMailMock.mock.calls[0][0]
    expect(mailArg.template).toBe('deleteAccount')
    expect(mailArg.context).toEqual({ username: 'testuser' })
  })
})
