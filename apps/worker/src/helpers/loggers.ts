import { createLogger, transports, format } from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import moment from 'moment-timezone'

const { combine, timestamp, label, printf, colorize } = format
const localTimezone = 'America/Los_Angeles'
// Use process.env.BILBOMD_LOGS directly to ensure it's always up-to-date
const customTimestamp = () =>
  moment().tz(localTimezone).format('YYYY-MM-DD HH:mm:ss')

const logFormat = printf(({ level, message, label, timestamp }) => {
  return `${timestamp} - ${level}: [${label}] ${message}`
})

// Declare as an array of any transport types available
const loggerTransports = [
  new DailyRotateFile({
    level: 'debug', // Debug and above to main log file
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
    level: 'info', // Only info and above to console
    format: combine(colorize(), logFormat)
  })
]

const logger = createLogger({
  level: 'debug', // Set overall logger to debug
  format: combine(
    label({ label: 'bilbomd-worker' }),
    timestamp({ format: customTimestamp }),
    logFormat
  ),
  transports: loggerTransports
})

export { logger }
