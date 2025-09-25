// Set log directory and mailer template path for all tests before anything else
process.env.BILBOMD_LOGS = process.env.BILBOMD_LOGS || '/tmp/bilbomd-logs-test'
process.env.BILBOMD_MAILER_TEMPLATES = process.env.BILBOMD_MAILER_TEMPLATES || __dirname + '../src/templates/mailer'
process.env.BILBOMD_MAILER_HOST = process.env.BILBOMD_MAILER_HOST || 'smtp-relay.gmail.com'
process.env.BILBOMD_MAILER_PORT = process.env.BILBOMD_MAILER_PORT || '25'
import { vi } from 'vitest'

vi.mock('../src/helpers/loggers', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}))

// Hoisted nodemailer mocks so transporter is ready before import of mailer.ts
const { __useMock, __sendMailMock } = vi.hoisted(() => ({
  __useMock: vi.fn(),
  __sendMailMock: vi.fn()
}))

vi.mock('nodemailer', () => {
  const createTransport = vi.fn(() => ({
    use: __useMock,
    sendMail: __sendMailMock
  }))
  return {
    __esModule: true,
    default: { createTransport },
    createTransport
  }
})

vi.mock('nodemailer-express-handlebars', () => ({
  default: vi.fn(() => ({}))
}))

export { __useMock, __sendMailMock }
