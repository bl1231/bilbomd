import { Document, Date, Schema, ObjectId, model } from 'mongoose'

interface IUser extends Document {
  username: string
  roles: Schema.Types.Array
  refreshToken: Schema.Types.Array
  email: string
  status: string
  active: boolean
  confirmationCode: string
  otp: string
  UUID: string
  createdAt: Date
  last_access: Date
  jobs: ObjectId
}

const userSchema = new Schema<IUser>({
  username: {
    type: String,
    required: true
  },
  roles: {
    type: [String],
    default: ['User']
  },
  refreshToken: [String],
  email: {
    type: String,
    required: true,
    unique: true
  },
  status: {
    type: String,
    enum: ['Pending', 'Active'],
    default: 'Pending'
  },
  active: {
    type: Boolean,
    default: true
  },
  confirmationCode: {
    type: String
  },
  otp: { type: String },
  UUID: {
    type: String
  },
  createdAt: Date,
  last_access: Date,
  jobs: [
    {
      type: Schema.Types.ObjectId,
      ref: 'Job'
    }
  ]
})

const User = model('User', userSchema)

export { User, IUser }
