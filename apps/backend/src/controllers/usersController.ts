import { User } from '@bl1231/bilbomd-mongodb-schema'
import { Job } from '@bl1231/bilbomd-mongodb-schema'
import { logger } from '../middleware/loggers.js'
import { Request, Response } from 'express'
import {
  sendOtpEmail,
  sendUpdatedEmailMessage,
  sendDeleteAccountSuccessEmail
} from '../config/nodemailerConfig.js'
import crypto from 'crypto'

// Helper function to validate email format
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

// Helper function to validate username format
const isValidUsername = (username: string): boolean => {
  const usernameRegex = /^[a-zA-Z0-9_]+$/
  return usernameRegex.test(username)
}

const getAllUsers = async (req: Request, res: Response) => {
  try {
    const users = await User.find().lean()
    res.json({ success: true, data: users })
  } catch (error) {
    logger.error(`Failed to get all users: ${error}`)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

const updateUser = async (req: Request, res: Response): Promise<void> => {
  const { id, username, roles, active, email } = req.body

  // Validate inputs
  if (!id) {
    res.status(400).json({ success: false, message: 'User ID is required' })
    return
  }
  if (!username || !isValidUsername(username)) {
    res.status(400).json({ success: false, message: 'Invalid username format' })
    return
  }
  if (!Array.isArray(roles) || !roles.length) {
    res.status(400).json({ success: false, message: 'Roles are required' })
    return
  }
  if (typeof active !== 'boolean') {
    res.status(400).json({ success: false, message: 'Active status is required' })
    return
  }
  if (!email || !isValidEmail(email)) {
    res.status(400).json({ success: false, message: 'Invalid email format' })
    return
  }

  try {
    const user = await User.findById(id).exec()

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' })
      return
    }

    const duplicate = await User.findOne({ username })
      .collation({ locale: 'en', strength: 2 }) // provide case-insensitive search
      .lean()
      .exec()

    if (duplicate && duplicate?._id.toString() !== id) {
      res.status(409).json({ success: false, message: 'Duplicate username' })
      return
    }

    user.username = username
    user.roles = roles
    user.active = active
    user.email = email

    const updatedUser = await user.save()

    res.status(200).json({ success: true, message: `${updatedUser.username} updated` })
  } catch (error) {
    logger.error(`Failed to update user: ${error}`)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

const deleteUserById = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params

  if (!id) {
    res.status(400).json({ success: false, message: 'User ID is required' })
    return
  }

  try {
    const job = await Job.findOne({ user: id }).lean().exec()
    if (job) {
      res.status(400).json({ success: false, message: 'User has jobs' })
      return
    }

    const user = await User.findById(id).exec()

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' })
      return
    }

    const deleteResult = await user.deleteOne()

    if (deleteResult.deletedCount === 0) {
      res.status(404).json({ success: false, message: 'No user was deleted' })
      return
    }

    const reply = `Username ${user.username} with ID ${user._id} deleted`

    res.status(200).json({ success: true, message: reply })
  } catch (error) {
    logger.error(`Failed to delete user: ${error}`)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

const deleteUserByUsername = async (req: Request, res: Response): Promise<void> => {
  const username = req.params.username

  if (!username || !isValidUsername(username)) {
    res.status(400).json({ success: false, message: 'Invalid username format' })
    return
  }

  try {
    const user = await User.findOne({ username }).exec()
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' })
      return
    }

    const hasAssignedJobs = await Job.exists({ user: user._id })
    if (hasAssignedJobs) {
      res.status(409).json({ success: false, message: 'User has assigned jobs' })
      return
    }

    const deleteResult = await User.deleteOne({ _id: user._id }).exec()
    if (deleteResult.deletedCount === 0) {
      logger.error(`Failed to delete user ${username} with ID ${user._id}`)
      res.status(500).json({ success: false, message: 'Failed to delete user' })
      return
    }

    try {
      sendDeleteAccountSuccessEmail(user.email, user.username)
      logger.info(`Deletion success email sent to ${user.email}`)
    } catch (emailError) {
      logger.error(`Failed to send deletion email to ${user.email}: ${emailError}`)
    }

    const reply = `User ${user.username} with ID ${user._id} deleted successfully`
    res.status(200).json({ success: true, message: reply })
  } catch (error) {
    logger.error(`Failed to delete user ${username}: ${error}`)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

const getUser = async (req: Request, res: Response): Promise<void> => {
  if (!req?.params?.id) {
    res.status(400).json({ success: false, message: 'User ID is required' })
    return
  }

  try {
    const user = await User.findOne({ _id: req.params.id }).lean().exec()
    if (!user) {
      res
        .status(404)
        .json({ success: false, message: `User ID ${req.params.id} not found` })
      return
    }
    res.json({ success: true, data: user })
  } catch (error) {
    logger.error(`Failed to get user: ${error}`)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

const sendChangeEmailOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, currentEmail, newEmail } = req.body

    if (!isValidEmail(currentEmail) || !isValidEmail(newEmail)) {
      res.status(400).json({ success: false, message: 'Invalid email format' })
      return
    }

    const user = await User.findOne({ username })

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' })
      return
    }

    if (user.email === newEmail) {
      res.status(400).json({
        success: false,
        message: 'The new email is the same as the current email.'
      })
      return
    }

    const duplicate = await User.findOne({ email: newEmail })
    if (duplicate) {
      res.status(409).json({ success: false, message: 'Duplicate email' })
      return
    }

    if (user.email !== currentEmail) {
      res.status(400).json({ success: false, message: 'Current email does not match' })
      return
    }

    const otpCode = generateOtp()

    user.otp = {
      code: otpCode,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes from now
    }
    user.newEmail = newEmail // Store the new email in the user's record
    await user.save()

    sendOtpEmail(newEmail, otpCode) // Send OTP to new email

    res.status(200).json({ success: true, message: 'OTP sent successfully' })
  } catch (error) {
    logger.error(`Failed to send OTP: ${error}`)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

const verifyOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, otp } = req.body

    const user = await User.findOne({ username })

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' })
      return
    }

    if (
      user.otp?.code !== otp ||
      (user.otp?.expiresAt && user.otp.expiresAt < new Date())
    ) {
      res.status(400).json({ success: false, message: 'Invalid or expired OTP' })
      return
    }
    const oldEmail = user.email

    if (!user.newEmail) {
      res.status(400).json({ success: false, message: 'No new email address found' })
      return
    }
    user.previousEmails.push(user.email)
    user.email = user.newEmail
    user.newEmail = null // Clear the new email field
    user.otp = null
    await user.save()

    sendUpdatedEmailMessage(user.email, oldEmail)

    res.status(200).json({ success: true, message: 'Email address updated successfully' })
  } catch (error) {
    logger.error(`Failed to verify OTP: ${error}`)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

const resendOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username } = req.body

    if (!username || !isValidUsername(username)) {
      res.status(400).json({ success: false, message: 'Invalid username format' })
      return
    }

    const user = await User.findOne({ username })
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' })
      return
    }

    if (!user.newEmail) {
      res.status(400).json({ success: false, message: 'No new email address found' })
      return
    }

    const otpCode = generateOtp()

    user.otp = {
      code: otpCode,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes from now
    }
    await user.save()

    sendOtpEmail(user.newEmail, otpCode) // Send OTP to new email

    res.status(200).json({ success: true, message: 'OTP resent successfully' })
  } catch (error) {
    logger.error(`Failed to resend OTP: ${error}`)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

function generateOtp(): string {
  const otp = crypto.randomBytes(3).toString('hex') // Generates a 6-character OTP
  return otp
}

export {
  getAllUsers,
  updateUser,
  deleteUserById,
  deleteUserByUsername,
  getUser,
  sendChangeEmailOtp,
  verifyOtp,
  resendOtp
}
