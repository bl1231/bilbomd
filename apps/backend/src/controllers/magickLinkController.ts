import { logger } from '../middleware/loggers.js'
import { config } from '../config/config.js'
import crypto from 'crypto'
import { User } from '@bl1231/bilbomd-mongodb-schema'
import { Request, Response } from 'express'
import { sendMagickLinkEmail } from '../config/nodemailerConfig.js'
const bilboMdUrl: string = process.env.BILBOMD_URL ?? ''

const generateMagickLink = async (req: Request, res: Response) => {
  const { email } = req.body

  if (!email) {
    res.status(400).json({ message: 'email is required' })
    return
  }

  const foundUser = await User.findOne({ email }).exec()

  if (!foundUser) {
    // Email not found in current emails, check previousEmails
    const userWithOldEmail = await User.findOne({ previousEmails: email }).exec()

    if (userWithOldEmail) {
      res.status(400).json({
        message:
          'It looks like you have changed your email. Please try logging in with your updated email address or check your inbox for the updated email.'
      })
      return
    } else {
      // Email not found at all
      res.status(401).json({ message: 'no account with that email' })
      return
    }
  }

  if (foundUser.status === 'Pending') {
    res.status(403).json({ message: 'Pending', email })
    return
  }

  if (!foundUser.active) {
    res.status(403).json({ message: 'account deactivated' })
    return
  }

  try {
    const passcode = crypto.randomBytes(17).toString('hex')

    const otp = { code: passcode, expiresAt: new Date(Date.now() + 3600000) }
    foundUser.otp = otp
    await foundUser.save()

    logger.info(`Magicklink requested by ${foundUser.email} send OTP: ${passcode}`)

    if (config.sendEmailNotifications) {
      sendMagickLinkEmail(email, bilboMdUrl, passcode)
    }

    res.status(201).json({ success: `OTP created for ${email}` })
  } catch (error) {
    logger.error(`Failed to generate MagickLink: ${error}`)
    res.status(500).json({ message: error })
  }
}

export { generateMagickLink }
