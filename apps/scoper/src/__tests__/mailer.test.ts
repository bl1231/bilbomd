import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSendMail, mockUse } = vi.hoisted(() => ({
  mockSendMail: vi.fn(),
  mockUse: vi.fn()
}))

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({
      use: mockUse,
      sendMail: mockSendMail
    })
  }
}))

vi.mock('nodemailer-express-handlebars', () => ({
  default: vi.fn().mockReturnValue({})
}))

vi.mock('../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))

import { sendJobCompleteEmail } from '../helpers/mailer.js'
import { logger } from '../helpers/loggers.js'

beforeEach(() => vi.clearAllMocks())

describe('sendJobCompleteEmail', () => {
  it('sends an email with the jobcomplete template when isError is false', () => {
    sendJobCompleteEmail(
      'user@example.com',
      'http://bilbomd.example.com',
      'job-id-123',
      'My Test Job',
      false
    )
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        template: 'jobcomplete',
        subject: 'BilboMD Job Complete: My Test Job'
      })
    )
  })

  it('sends an email with the joberror template when isError is true', () => {
    sendJobCompleteEmail(
      'user@example.com',
      'http://bilbomd.example.com',
      'job-id-456',
      'Failed Job',
      true
    )
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'joberror'
      })
    )
  })

  it('logs the email send attempt', () => {
    sendJobCompleteEmail('a@b.com', 'http://x.com', 'id', 'title', false)
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Sending job complete email')
    )
  })

  it('includes jobid, url, and title in the email context', () => {
    sendJobCompleteEmail(
      'user@example.com',
      'http://bilbomd.example.com',
      'job-id-789',
      'Context Job',
      false
    )
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          jobid: 'job-id-789',
          url: 'http://bilbomd.example.com',
          title: 'Context Job'
        })
      })
    )
  })

  it('links to the tokened public results page when a results token is provided', () => {
    sendJobCompleteEmail(
      'user@example.com',
      'http://bilbomd.example.com',
      'job-id-789',
      'Token Job',
      false,
      'aaaabbbb-cccc-dddd-eeee-ffff00001111'
    )
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          resultsUrl:
            'http://bilbomd.example.com/results/aaaabbbb-cccc-dddd-eeee-ffff00001111'
        })
      })
    )
  })

  it('falls back to the dashboard link when no results token exists', () => {
    sendJobCompleteEmail(
      'user@example.com',
      'http://bilbomd.example.com',
      'job-id-789',
      'Legacy Job',
      false
    )
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          resultsUrl: 'http://bilbomd.example.com/dashboard/jobs/job-id-789'
        })
      })
    )
  })
})
