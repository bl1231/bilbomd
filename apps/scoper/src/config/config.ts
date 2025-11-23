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
  bilbomdUrl: getEnvVar('BILBOMD_URL'),
  sendEmailNotifications: process.env.SEND_EMAIL_NOTIFICATIONS === 'true',
  bullmqAttempts: process.env.BULLMQ_ATTEMPTS
    ? parseInt(process.env.BULLMQ_ATTEMPTS)
    : 3
}
