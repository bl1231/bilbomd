import { logger } from '../middleware/loggers.js'
import { config } from '../config/config.js'
import { User } from '@bl1231/bilbomd-mongodb-schema'
import { Request, Response } from 'express'
import { sendVerificationEmail } from '../config/nodemailerConfig.js'
const characters = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
const bilboMdUrl: string = process.env.BILBOMD_URL ?? ''

const verifyNewUser = async (req: Request, res: Response) => {
  try {
    const { code } = req.body
    if (!code) {
      res.status(400).json({ message: 'Confirmation code required.' })
      return
    }
    logger.info(`Received verification ${code}`)

    const user = await User.findOne({ 'confirmationCode.code': code })

    if (!user) {
      logger.warn(`Unable to verify ${code}`)
      res.status(400).json({ message: `Unable to verify ${code}.` })
      return
    }

    logger.info(`Verification code belongs to user: ${user.username} ${user.email}`)

    user.status = 'Active'
    user.confirmationCode = null
    await user.save()
    logger.info(`User ${user.username} ${user.email} verified`)
    res.json({ message: 'Verified' })
  } catch (error) {
    logger.error(`Error occurred during user verification: ${error}`)
    res.status(500).json({ message: 'Internal server error' })
  }
}

const resendVerificationCode = async (req: Request, res: Response) => {
  try {
    const { email } = req.body
    logger.info(`Request to resendVerificationCode for: ${email}`)

    if (!email) {
      res.status(400).json({ message: 'Email required.' })
      return
    }

    const foundUser = await User.findOne({ email })

    if (!foundUser) {
      res.status(401).json({ message: 'No user with that email.' })
      return
    }

    // Generate a new confirmation code
    let code = ''
    for (let i = 0; i < 36; i++) {
      code += characters[Math.floor(Math.random() * characters.length)]
    }

    const confirmationCode = { code, expiresAt: new Date(Date.now() + 3600000) }

    // Add verification code to the user's MongoDB entry
    foundUser.confirmationCode = confirmationCode
    await foundUser.save()

    logger.info(
      `Updated ${foundUser.username} email: ${foundUser.email} confirmationCode: ${foundUser.confirmationCode.code}`
    )

    // Send verification email
    if (config.sendEmailNotifications) {
      sendVerificationEmail(email, bilboMdUrl, code)
    }

    res.status(201).json({ message: 'OK' })
  } catch (error) {
    logger.error(`Error occurred during resendVerificationCode: ${error}`)
    res.status(500).json({ message: 'Internal server error' })
  }
}

export { verifyNewUser, resendVerificationCode }
