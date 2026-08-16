import { describe, it, expect, beforeEach, Mock } from 'vitest'
import { sendJobCompleteEmail } from '../mailer.js'
import { logger } from '../loggers.js'

declare global {
  var __useMock: Mock
  var __sendMailMock: Mock
}

describe('sendJobCompleteEmail', () => {
  beforeEach(() => {
    globalThis.__useMock.mockClear()
    globalThis.__sendMailMock.mockClear()
    globalThis.__sendMailMock.mockResolvedValue(undefined)
  })

  it('calls sendMail with correct parameters for job complete', () => {
    sendJobCompleteEmail('test@example.com', 'http://url', 'jobid123', 'Test Job', false)
    expect(globalThis.__useMock).toHaveBeenCalled()
    const mailArg = globalThis.__sendMailMock.mock.calls[0][0]
    expect(mailArg.to).toBe('test@example.com')
    expect(mailArg.template).toBe('jobcomplete')
    expect(mailArg.context).toEqual({
      jobid: 'jobid123',
      url: 'http://url',
      title: 'Test Job',
      resultsUrl: 'http://url/dashboard/jobs/jobid123'
    })
  })

  it('links to the tokened public results page when a results token is provided', () => {
    sendJobCompleteEmail(
      'test@example.com',
      'http://url',
      'jobid123',
      'Test Job',
      false,
      'aaaabbbb-cccc-dddd-eeee-ffff00001111'
    )
    const mailArg = globalThis.__sendMailMock.mock.calls[0][0]
    expect(mailArg.context.resultsUrl).toBe(
      'http://url/results/aaaabbbb-cccc-dddd-eeee-ffff00001111'
    )
  })

  it('falls back to the dashboard link when no results token exists', () => {
    sendJobCompleteEmail('test@example.com', 'http://url', 'jobid123', 'Test Job', false)
    const mailArg = globalThis.__sendMailMock.mock.calls[0][0]
    expect(mailArg.context.resultsUrl).toBe('http://url/dashboard/jobs/jobid123')
  })

  it('calls sendMail with correct template for error', () => {
    sendJobCompleteEmail('test@example.com', 'http://url', 'jobid123', 'Test Job', true)
    expect(globalThis.__sendMailMock).toHaveBeenCalled()
    const mailArg = globalThis.__sendMailMock.mock.calls[0][0]
    expect(mailArg.template).toBe('joberror')
  })

  it('calls logger.info with expected messages', () => {
    sendJobCompleteEmail('test@example.com', 'http://url', 'jobid123', 'Test Job', false)
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Sending job complete email'))
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Using email template: jobcomplete')
    )
  })
})
