import { allowedOrigins } from './allowedOrigins.js'

const corsOptions = {
  origin: (
    origin: string | undefined,

    callback: (err: Error | null, allow: boolean) => void
  ) => {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'), false)
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
}

export { corsOptions }
