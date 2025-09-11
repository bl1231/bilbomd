import { Request, Response } from 'express'
import { User } from '@bl1231/bilbomd-mongodb-schema'

const deleteAPIToken = async (req: Request, res: Response): Promise<void> => {
  const { username, id } = req.params

  if (!req.user || req.user !== username) {
    res.status(403).json({ message: 'Unauthorized to delete token for this user' })
    return
  }

  try {
    const user = await User.findOne({ username })
    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    const originalCount = user.apiTokens.length
    user.apiTokens = user.apiTokens.filter((token) => token._id?.toString() !== id)

    if (user.apiTokens.length === originalCount) {
      res.status(404).json({ message: 'API token not found' })
      return
    }

    await user.save()
    res.status(200).json({ message: 'API token revoked successfully' })
  } catch (err) {
    console.error('Error deleting API token:', err)
    res.status(500).json({ message: 'Internal server error' })
  }
}

export { deleteAPIToken }
