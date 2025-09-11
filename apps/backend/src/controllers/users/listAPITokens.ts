import { Request, Response } from 'express'
import { User, IAPIToken } from '@bl1231/bilbomd-mongodb-schema'

const listAPITokens = async (req: Request, res: Response): Promise<void> => {
  const { username } = req.params

  if (!req.user || req.user !== username) {
    res.status(403).json({ message: 'Unauthorized to list tokens for this user' })
    return
  }

  try {
    const user = await User.findOne({ username }).lean()
    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    const tokens: Omit<IAPIToken, 'tokenHash'>[] = (user.apiTokens || []).map(
      ({ _id, label, createdAt, expiresAt }) => ({
        _id,
        label,
        createdAt,
        expiresAt
      })
    )

    res.status(200).json({ tokens })
  } catch (err) {
    console.error('Error listing API tokens:', err)
    res.status(500).json({ message: 'Internal server error' })
  }
}

export { listAPITokens }
