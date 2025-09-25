// Set log directory and mailer template path for all tests before anything else
process.env.BILBOMD_LOGS = process.env.BILBOMD_LOGS || '/tmp/bilbomd-logs-test'
process.env.BILBOMD_MAILER_TEMPLATES =
  process.env.BILBOMD_MAILER_TEMPLATES || __dirname + '../src/templates/mailer'
process.env.BILBOMD_MAILER_HOST = process.env.BILBOMD_MAILER_HOST || 'smtp-relay.gmail.com'
process.env.BILBOMD_MAILER_PORT = process.env.BILBOMD_MAILER_PORT || '25'
import { vi, beforeAll, Mock } from 'vitest'

declare global {
  var __useMock: Mock
  var __sendMailMock: Mock
}

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

// Attach mocks to the global object for access in all tests
globalThis.__useMock = __useMock
globalThis.__sendMailMock = __sendMailMock

vi.mock('nodemailer', () => {
  const createTransport = vi.fn(() => ({
    use: globalThis.__useMock,
    sendMail: globalThis.__sendMailMock
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
