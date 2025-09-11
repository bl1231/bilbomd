import { Request, Response } from 'express'
import crypto from 'crypto'
import { User, IAPIToken } from '@bl1231/bilbomd-mongodb-schema'

const createAPIToken = async (req: Request, res: Response): Promise<void> => {
  const { username } = req.params
  const { label, expiresAt } = req.body
  console.log('Creating API token for user:', username)
  if (!req.user || req.user !== username) {
    res.status(403).json({ message: 'Unauthorized to create token for this user' })
    return
  }

  try {
    const user = await User.findOne({ username })
    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

    const newToken: IAPIToken = {
      tokenHash,
      label,
      createdAt: new Date(),
      expiresAt: expiresAt ? new Date(expiresAt) : undefined
    }

    user.apiTokens.push(newToken)
    await user.save()

    res.status(201).json({ token }) // Only show raw token once
  } catch (err) {
    console.error('Error creating API token:', err)
    res.status(500).json({ message: 'Internal server error' })
  }
}

export { createAPIToken }
