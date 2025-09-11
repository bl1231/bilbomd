import { createLogger, transports, format } from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import moment from 'moment-timezone'
import morgan from 'morgan'
import { v4 as uuidv4 } from 'uuid'
import { Request, Response, NextFunction } from 'express'

const { combine, timestamp, label, printf, colorize } = format
const localTimezone = 'America/Los_Angeles'
const logsFolder = `/bilbomd/logs`

const customTimestamp = () => moment().tz(localTimezone).format('YYYY-MM-DD HH:mm:ss')

const logFormat = printf(({ level, message, label, timestamp }) => {
  return `${timestamp} - ${level}: [${label}] ${message}`
})

const loggerTransports = []
if (process.env.NODE_ENV !== 'test') {
  loggerTransports.push(
    new DailyRotateFile({
      filename: `${logsFolder}/bilbomd-backend-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '10m',
      maxFiles: '180d'
    }),
    new DailyRotateFile({
      level: 'error',
      filename: `${logsFolder}/bilbomd-backend-error-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '10m',
      maxFiles: '30d'
    })
  )
}
// Always include Console transport
loggerTransports.push(new transports.Console({ format: combine(colorize(), logFormat) }))

const logger = createLogger({
  level: 'info',
  format: combine(
    label({ label: 'bilbomd-backend' }),
    timestamp({ format: customTimestamp }),
    logFormat
  ),
  transports: loggerTransports
})

morgan.token('id', (req: Request) => req.id as string)

const requestLogger = morgan(
  ':id :method :url :status :response-time ms - :res[content-length]',
  {
    stream: {
      write: (message) => logger.info(message.trim())
    }
  }
)

const assignRequestId = (req: Request, res: Response, next: NextFunction) => {
  req.id = uuidv4() // Assign a unique ID to each request
  next()
}

export { logger, requestLogger, logsFolder, assignRequestId }
