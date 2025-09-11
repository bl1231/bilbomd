import { logger } from './loggers.js'

const cronTest = () => {
  const thresholdDate = new Date()
  thresholdDate.setMonth(thresholdDate.getMonth() - 1)
  const timeZone = 'America/Los_Angeles'
  const formattedDate = thresholdDate.toLocaleString('en-US', { timeZone })
  logger.info(`cronTest ${formattedDate}`)
}

export { cronTest }
