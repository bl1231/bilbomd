// config.ts or a similar file
import dotenv from 'dotenv'
dotenv.config()

const getEnvVar = (name: string): string => {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Environment variable ${name} is not set`)
  }
  return value
}

export const config = {
  sendEmailNotifications: process.env.SEND_EMAIL_NOTIFICATIONS === 'true', // Explicit boolean conversion
  runOnNERSC: process.env.USE_NERSC === 'true', // Explicit boolean conversion
  bullmqAttempts: process.env.BULLMQ_ATTEMPTS ? parseInt(process.env.BULLMQ_ATTEMPTS) : 3,
  uploadDir: getEnvVar('DATA_VOL')
}
