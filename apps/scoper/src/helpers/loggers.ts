import { createLogger, transports, format } from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import moment from 'moment-timezone'

const { combine, timestamp, label, printf, colorize } = format
const localTimezone = 'America/Los_Angeles'
const logsFolder = `/bilbomd/logs`

const customTimestamp = () => moment().tz(localTimezone).format('YYYY-MM-DD HH:mm:ss')

const logFormat = printf(({ level, message, label, timestamp }) => {
  return `${timestamp} - ${level}: [${label}] ${message}`
})

// Declare as an array of any transport types available
const loggerTransports = [
  new DailyRotateFile({
    filename: `${logsFolder}/bilbomd-scoper-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d'
  }),
  new DailyRotateFile({
    level: 'error',
    filename: `${logsFolder}/bilbomd-scoper-error-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '30d'
  }),
  new transports.Console({ format: combine(colorize(), logFormat) })
]

const logger = createLogger({
  level: 'info',
  format: combine(
    label({ label: 'bilbomd-scoper' }),
    timestamp({ format: customTimestamp }),
    logFormat
  ),
  transports: loggerTransports
})

export { logger, logsFolder }
