import { Types } from 'mongoose'
import { User } from '@bilbomd/mongodb-schema'

type UserRef =
  Types.ObjectId | string | { _id?: Types.ObjectId | string } | null | undefined

const refId = (ref: UserRef) =>
  ref instanceof Types.ObjectId || typeof ref === 'string' ? ref : ref?._id

// Users can turn job emails off in Settings → Preferences. Jobs embed a copy
// of the user without that setting, so read it from the User collection.
// Users created before the setting existed have no value and get emails.
export const wantsJobEmails = async (ref: UserRef): Promise<boolean> => {
  const id = refId(ref)
  if (!id || !Types.ObjectId.isValid(id)) return false
  const user = await User.findById(id)
    .select('emailNotifications')
    .lean<{ emailNotifications?: boolean }>()
    .exec()
  return !!user && user.emailNotifications !== false
}

// Step message for a job whose owner turned job emails off
export const JOB_EMAILS_OFF_MESSAGE =
  'Not sent: job emails are turned off in settings'
