import { AsyncLocalStorage } from 'async_hooks'
import { createLogger, transports, format } from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import moment from 'moment-timezone'
import morgan from 'morgan'
import { v4 as uuidv4 } from 'uuid'
import { Request, Response, NextFunction } from 'express'
import { config } from '../config/config.js'

const { combine, timestamp, label, printf, colorize, json } = format
const localTimezone = 'America/Los_Angeles'
const logsFolder = `/bilbomd/logs`

interface RequestContext {
  requestId: string
  userId?: string
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>()

const customTimestamp = () =>
  moment().tz(localTimezone).format('YYYY-MM-DD HH:mm:ss')

const consoleLogFormat = printf(({ level, message, label, timestamp }) => {
  return `${timestamp} - ${level}: [${label}] ${message}`
})

// Validate log level
const validLogLevels = [
  'error',
  'warn',
  'info',
  'http',
  'verbose',
  'debug',
  'silly'
]
const logLevel = validLogLevels.includes(config.logLevel)
  ? config.logLevel
  : 'info'

if (!validLogLevels.includes(config.logLevel)) {
  console.warn(`Invalid LOG_LEVEL "${config.logLevel}", defaulting to "info"`)
}

// Injects requestId and userId from AsyncLocalStorage into every log entry
const contextFormat = format((info) => {
  const ctx = requestContextStorage.getStore()
  if (ctx) {
    info.requestId = ctx.requestId
    if (ctx.userId) info.userId = ctx.userId
  }
  return info
})()

const fileFormat = combine(
  label({ label: 'bilbomd-backend' }),
  timestamp({ format: customTimestamp }),
  contextFormat,
  json()
)

const loggerTransports = []
if (process.env.NODE_ENV !== 'test') {
  loggerTransports.push(
    new DailyRotateFile({
      level: logLevel,
      filename: `${logsFolder}/bilbomd-backend-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '10m',
      maxFiles: '180d',
      format: fileFormat
    }),
    new DailyRotateFile({
      level: 'error',
      filename: `${logsFolder}/bilbomd-backend-error-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '10m',
      maxFiles: '30d',
      format: fileFormat
    })
  )
}
// Always include Console transport — colorized human-readable text
loggerTransports.push(
  new transports.Console({
    format: combine(
      label({ label: 'bilbomd-backend' }),
      timestamp({ format: customTimestamp }),
      colorize(),
      consoleLogFormat
    )
  })
)

const logger = createLogger({
  level: logLevel,
  transports: loggerTransports
})

morgan.token('id', (req: Request) => req.id as string)

const requestLogger = morgan(
  ':id :method :url :status :response-time ms - :res[content-length]',
  {
    stream: {
      write: (message) => logger.http(message.trim())
    }
  }
)

const assignRequestId = (req: Request, res: Response, next: NextFunction) => {
  const context: RequestContext = { requestId: uuidv4() }
  req.id = context.requestId
  requestContextStorage.run(context, next)
}

export { logger, requestLogger, logsFolder, assignRequestId }
