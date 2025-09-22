import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import type { MockInstance } from 'vitest'
import nodemailer from 'nodemailer'
// hbs import not needed in test
import { sendJobCompleteEmail } from '../mailer.js'
import { logger } from '../loggers.js'

vi.mock('nodemailer', () => {
  const createTransport = vi.fn()
  return {
    default: { createTransport },
    createTransport
  }
})
vi.mock('nodemailer-express-handlebars', () => ({
  default: vi.fn(() => ({}))
}))
vi.mock('../loggers.js', () => ({
  logger: {
    info: vi.fn()
  }
}))

describe('sendJobCompleteEmail', () => {
  let sendMailMock: Mock
  let useMock: Mock

  beforeEach(() => {
    vi.clearAllMocks()
    sendMailMock = vi.fn()
    useMock = vi.fn()
    ;(nodemailer.createTransport as unknown as MockInstance).mockReturnValue({
      use: useMock,
      sendMail: sendMailMock
    })
  })

  it('calls sendMail with correct parameters for job complete', () => {
    sendJobCompleteEmail('test@example.com', 'http://url', 'jobid123', 'Test Job', false)
    expect(sendMailMock).toHaveBeenCalled()
    const mailArg = sendMailMock.mock.calls[0][0]
    expect(mailArg.to).toBe('test@example.com')
    expect(mailArg.template).toBe('jobcomplete')
    expect(mailArg.context).toEqual({ jobid: 'jobid123', url: 'http://url', title: 'Test Job' })
  })

  it('calls sendMail with correct template for error', () => {
    sendJobCompleteEmail('test@example.com', 'http://url', 'jobid123', 'Test Job', true)
    expect(sendMailMock).toHaveBeenCalled()
    const mailArg = sendMailMock.mock.calls[0][0]
    expect(mailArg.template).toBe('joberror')
  })

  it('calls logger.info with expected messages', () => {
    sendJobCompleteEmail('test@example.com', 'http://url', 'jobid123', 'Test Job', false)
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Sending job complete email'))
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Using email template: jobcomplete')
    )
  })

  it('configures handlebars plugin with transporter.use', () => {
    sendJobCompleteEmail('test@example.com', 'http://url', 'jobid123', 'Test Job', false)
    expect(useMock).toHaveBeenCalledWith('compile', expect.any(Object))
    const hbsConfig = useMock.mock.calls[0][1]
    expect(hbsConfig.viewPath).toBe(process.env.BILBOMD_MAILER_TEMPLATES)
  })
})
