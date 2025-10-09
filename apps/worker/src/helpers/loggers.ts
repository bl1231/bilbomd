import { createLogger, transports, format } from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import moment from 'moment-timezone'
import { config } from '../config/config.js'

const { combine, timestamp, label, printf, colorize } = format
const localTimezone = 'America/Los_Angeles'

const customTimestamp = () =>
  moment().tz(localTimezone).format('YYYY-MM-DD HH:mm:ss')

const logFormat = printf(({ level, message, label, timestamp }) => {
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

const loggerTransports = [
  new DailyRotateFile({
    level: logLevel,
    filename: `${process.env.BILBOMD_LOGS}/bilbomd-worker-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '10m',
    maxFiles: '14d'
  }),
  new DailyRotateFile({
    level: 'error',
    filename: `${process.env.BILBOMD_LOGS}/bilbomd-worker-error-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '10m',
    maxFiles: '30d'
  }),
  new transports.Console({
    level: logLevel,
    format: combine(colorize(), logFormat)
  })
]

const logger = createLogger({
  level: logLevel,
  format: combine(
    label({ label: 'bilbomd-worker' }),
    timestamp({ format: customTimestamp }),
    logFormat
  ),
  transports: loggerTransports
})

// Log the current log level on startup
logger.info(`Logger initialized with level: ${logLevel}`)

export { logger }
