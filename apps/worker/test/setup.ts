// Set log directory and mailer template path for all tests before anything else
process.env.BILBOMD_LOGS = process.env.BILBOMD_LOGS || '/tmp/bilbomd-logs-test'
process.env.BILBOMD_MAILER_TEMPLATES || __dirname + '../src/templates/mailer'
import { vi } from 'vitest'

vi.mock('../src/helpers/loggers', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}))
