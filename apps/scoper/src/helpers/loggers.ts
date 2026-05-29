import { createLogger, transports, format } from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import moment from 'moment-timezone'

const { combine, timestamp, label, printf, colorize, json } = format
const localTimezone = 'America/Los_Angeles'
const logsFolder = `/bilbomd/logs`

const customTimestamp = () =>
  moment().tz(localTimezone).format('YYYY-MM-DD HH:mm:ss')

const consoleLogFormat = printf(({ level, message, label, timestamp }) => {
  return `${timestamp} - ${level}: [${label}] ${message}`
})

const fileFormat = combine(
  label({ label: 'bilbomd-scoper' }),
  timestamp({ format: customTimestamp }),
  json()
)

const loggerTransports = [
  new DailyRotateFile({
    filename: `${logsFolder}/bilbomd-scoper-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d',
    format: fileFormat
  }),
  new DailyRotateFile({
    level: 'error',
    filename: `${logsFolder}/bilbomd-scoper-error-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '30d',
    format: fileFormat
  }),
  new transports.Console({
    format: combine(
      label({ label: 'bilbomd-scoper' }),
      timestamp({ format: customTimestamp }),
      colorize(),
      consoleLogFormat
    )
  })
]

const logger = createLogger({
  level: 'info',
  transports: loggerTransports
})

export { logger, logsFolder }
