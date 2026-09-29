import { Request, Response } from 'express'
import { User } from '@bilbomd/mongodb-schema'
import { logger } from '../../middleware/loggers.js'

interface Preferences {
  emailNotifications: boolean
}

// Users created before the setting existed have no value; they get emails
const toPreferences = (user: {
  emailNotifications?: boolean
}): Preferences => ({
  emailNotifications: user.emailNotifications !== false
})

// The signed-in user's own preferences
const getPreferences = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findOne({ username: req.user })
      .select('emailNotifications')
      .lean()
    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }
    res.status(200).json(toPreferences(user))
  } catch (err) {
    logger.error(`Error reading preferences: ${err}`)
    res.status(500).json({ message: 'Internal server error' })
  }
}

const updatePreferences = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { emailNotifications } = req.body ?? {}
  if (typeof emailNotifications !== 'boolean') {
    res.status(400).json({ message: 'emailNotifications must be a boolean' })
    return
  }

  try {
    const user = await User.findOneAndUpdate(
      { username: req.user },
      { $set: { emailNotifications } },
      { new: true, projection: { emailNotifications: 1 } }
    ).lean()
    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }
    logger.info(
      `User ${req.user} turned job emails ${emailNotifications ? 'on' : 'off'}`
    )
    res.status(200).json(toPreferences(user))
  } catch (err) {
    logger.error(`Error updating preferences: ${err}`)
    res.status(500).json({ message: 'Internal server error' })
  }
}

export { getPreferences, updatePreferences }
