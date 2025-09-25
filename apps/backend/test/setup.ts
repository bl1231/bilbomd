import dotenv from 'dotenv'
dotenv.config({ path: './test/.env.test' })
import { logger } from '../src/middleware/loggers.js'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import { vi, beforeAll, Mock } from 'vitest'
import fs from 'fs-extra'

declare global {
  var __useMock: Mock
  var __sendMailMock: Mock
}

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(logger, 'info').mockImplementation(function (this: typeof logger, ..._args: any[]) {
    return this
  })
  vi.spyOn(logger, 'warn').mockImplementation(function (this: typeof logger, ..._args: any[]) {
    return this
  })
  vi.spyOn(logger, 'error').mockImplementation(function (this: typeof logger, ..._args: any[]) {
    return this
  })
})

// Setup MongoDB Memory Server
export const mongoServer = await MongoMemoryServer.create()
const uri = mongoServer.getUri()

await mongoose.connect(uri)

// Mock bullmq queues
const mockQueue = {
  name: 'bilbomd-mock',
  add: vi.fn().mockResolvedValue({
    id: 'mock-job-id',
    name: 'mock-job',
    data: { foo: 'bar' }
  }),
  close: vi.fn()
}

vi.mock('bullmq', () => {
  return {
    Queue: vi.fn(() => mockQueue),
    Worker: vi.fn(() => ({ close: vi.fn() })),
    QueueScheduler: vi.fn(() => ({ close: vi.fn() })),
    QueueEvents: vi.fn(() => ({ close: vi.fn(), on: vi.fn(), off: vi.fn() }))
  }
})

// 🛠 Clean /tmp/bilbomd-data
const testDataDir = process.env.DATA_VOL ?? '/tmp/bilbomd-data'

await fs.ensureDir(testDataDir)
await fs.emptyDir(testDataDir)
// console.log(`[setup] Emptied test data directory: ${testDataDir}`)

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
