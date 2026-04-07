import { User, IUser } from '@bilbomd/mongodb-schema'
import crypto from 'crypto'

interface SeedOptions {
  email: string
  username: string
  token?: string
  expiresInDays?: number
}

export const seedApiTokenUser = async (
  opts: SeedOptions
): Promise<{ token: string; user: IUser; tokenHash: string }> => {
  const {
    email,
    username,
    token = process.env.BILBOMD_API_TOKEN ?? '12345trewq12345trewq',
    expiresInDays = 1
  } = opts

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  await User.create({
    email,
    username,
    roles: ['User'],
    apiTokens: [
      {
        tokenHash,
        expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      }
    ]
  })

  const user = (await User.findOne({ username })) as unknown as IUser
  return { token, user, tokenHash }
}
