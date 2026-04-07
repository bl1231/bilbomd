// Set log directory and mailer template path for all tests before anything else
process.env.BILBOMD_LOGS = process.env.BILBOMD_LOGS || '/tmp/bilbomd-logs-test'
process.env.BILBOMD_MAILER_TEMPLATES =
  process.env.BILBOMD_MAILER_TEMPLATES || __dirname + '../src/templates/mailer'
process.env.BILBOMD_MAILER_HOST =
  process.env.BILBOMD_MAILER_HOST || 'smtp-relay.gmail.com'
process.env.BILBOMD_MAILER_PORT = process.env.BILBOMD_MAILER_PORT || '25'

// Set required environment variables for config.ts
process.env.BILBOMD_URL = process.env.BILBOMD_URL || 'http://localhost:3000'
process.env.SFAPI_URL = process.env.SFAPI_URL || 'https://api.nersc.gov'
process.env.SCRIPT_DIR = process.env.SCRIPT_DIR || '/tmp/scripts'
process.env.UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/uploads'
process.env.WORK_DIR = process.env.WORK_DIR || '/tmp/work'
process.env.DATA_VOL = process.env.DATA_VOL || '/tmp/data'
process.env.CHARMM_TOPOLOGY =
  process.env.CHARMM_TOPOLOGY || '/tmp/charmm/toppar'
process.env.CHARMM_TEMPLATES =
  process.env.CHARMM_TEMPLATES || '/tmp/charmm/templates'
process.env.CHARMM = process.env.CHARMM || '/usr/local/bin/charmm'
process.env.FOXS = process.env.FOXS || '/usr/local/bin/foxs'
process.env.MULTIFOXS = process.env.MULTIFOXS || '/usr/local/bin/multi_foxs'
process.env.PREPARE_CHARMM_SLURM_SCRIPT =
  process.env.PREPARE_CHARMM_SLURM_SCRIPT || '/tmp/prepare_charmm.sh'
process.env.PREPARE_OMM_SLURM_SCRIPT =
  process.env.PREPARE_OMM_SLURM_SCRIPT || '/tmp/prepare_omm.sh'
process.env.CP2CFS_SCRIPT = process.env.CP2CFS_SCRIPT || '/tmp/cp2cfs.sh'
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
