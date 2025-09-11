import { logger } from '../middleware/loggers.js'
import { config } from '../config/config.js'
import { User } from '@bl1231/bilbomd-mongodb-schema'
import { v4 as uuid } from 'uuid'
import { Request, Response } from 'express'
import { sendVerificationEmail } from '../config/nodemailerConfig.js'
const characters = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
const bilboMdUrl: string = process.env.BILBOMD_URL ?? ''

const handleNewUser = async (req: Request, res: Response) => {
  const { user, email } = req.body
  logger.info(`handleNewUser ${user}, ${email}`)
  // confirm we have required data
  if (!user || !email) {
    res.status(400).json({
      message: 'Username and email are required.'
    })
    return
  }

  // check for duplicate username in the db
  const duplicateUser = await User.findOne({ username: user })
    .collation({ locale: 'en', strength: 2 }) // provide case-insensitive search
    .lean()
    .exec()
  if (duplicateUser) {
    res.status(409).json({ message: 'Duplicate username' })
    return
  }

  // Check for duplicate email in the email field
  const duplicateEmail = await User.findOne({ email: email })
    .collation({ locale: 'en', strength: 2 }) // provide case-insensitive search
    .lean()
    .exec()

  if (duplicateEmail) {
    res.status(409).json({
      message: 'Duplicate email'
    })
    return
  }

  const duplicatePreviousEmail = await User.findOne({
    previousEmails: { $in: [email] }
  })
    .collation({ locale: 'en', strength: 2 }) // provide case-insensitive search
    .lean()
    .exec()

  if (duplicatePreviousEmail) {
    res.status(409).json({
      message:
        'It looks like you have changed your email. Please try logging in with your updated email address or check your inbox for the updated email.'
    })
    return
  }

  try {
    //create a unique confirmation code
    let code = ''
    for (let i = 0; i < 36; i++) {
      code += characters[Math.floor(Math.random() * characters.length)]
    }
    logger.info(`New user ${user} confirmationCode: ${code}`)

    //  120000 ms = 2 min
    // 3600000 ms = 1 hour
    const confirmationCode = { code: code, expiresAt: new Date(Date.now() + 3600000) }

    // unique UUID for each user
    const UUID = uuid()

    // create and store the new user
    const newUser = await User.create({
      username: user,
      email: email,
      roles: ['User'],
      confirmationCode: confirmationCode,
      UUID: UUID,
      createdAt: Date()
    })
    logger.info(`Created ${newUser.username}`)

    if (config.sendEmailNotifications) {
      sendVerificationEmail(email, bilboMdUrl, code)
    }

    res.status(201).json({ success: `New user ${user} created!`, code: code })
  } catch (error) {
    logger.error(`error creating new user: ${error}`)
    res.status(400).json({ message: 'Invalid user data received' })
  }
}

export { handleNewUser }
