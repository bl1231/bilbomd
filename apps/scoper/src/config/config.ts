import dotenv from 'dotenv'
dotenv.config()

const getEnvVar = (name: string): string => {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Environment variable ${name} is not set`)
  }
  return value
}

const toBoolean = (value?: string): boolean =>
  value === 'true' || value === '1' || value?.toLowerCase() === 'yes'

export const config = {
  bilbomdUrl: getEnvVar('BILBOMD_URL'),
  sendEmailNotifications: toBoolean(process.env.SEND_EMAIL_NOTIFICATIONS),
  bullmqAttempts: process.env.BULLMQ_ATTEMPTS
    ? parseInt(process.env.BULLMQ_ATTEMPTS)
    : 3
}
