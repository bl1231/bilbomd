import { Document, Schema, ObjectId, model } from 'mongoose'

interface IOtp {
  code: string
  expiresAt: Date
}

interface IConfirmationCode {
  code: string
  expiresAt: Date
}

interface IUser extends Document {
  username: string
  roles: string[]
  refreshToken: Schema.Types.Array
  email: string
  status: string
  active: boolean
  confirmationCode: IConfirmationCode | null
  otp: IOtp | null
  UUID: string
  createdAt: Date
  last_access: Date
  jobs: ObjectId
}

const userSchema = new Schema<IUser>(
  {
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
      code: {
        type: String
      },
      expiresAt: {
        type: Date,
        expires: '2m',
        index: { expireAfterSeconds: 0 }
      }
    },
    otp: {
      code: {
        type: String
      },
      expiresAt: {
        type: Date
      }
    },
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
  },
  {
    timestamps: true
  }
)

const User = model('User', userSchema)

export { User, IUser }
