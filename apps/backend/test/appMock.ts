import './mocks/mockRedis.js'
import express, { Request, Response, NextFunction, Application } from 'express'
import cors from 'cors'
import { IUser } from '@bilbomd/mongodb-schema'
import registerRoutes from '../src/routes/register.js'
import verifyRoutes from '../src/routes/verify.js'
import magicklinkRoutes from '../src/routes/magicklink.js'
import usersRoutes from '../src/routes/users.js'
import jobsRoutes from '../src/routes/jobs.js'
import externalRoutes from '../src/routes/external.js'
import { vi } from 'vitest'

const app: Application = express()

app.use(cors())
app.use(express.json())

// Mock express-rate-limit to disable rate limiting in tests
vi.mock('express-rate-limit', () => ({
  default: vi.fn(() => (req: any, res: any, next: any) => next()) // No-op middleware
}))

app.use((req: Request, res: Response, next: NextFunction) => {
  req.apiUser = {
    email: 'testuser@example.com'
  } as IUser
  next()
})
const apiRouter = express.Router()

// Mount only the routes you want to test
apiRouter.use('/v1/register', registerRoutes)
apiRouter.use('/v1/verify', verifyRoutes)
apiRouter.use('/v1/magicklink', magicklinkRoutes)
apiRouter.use('/v1/users', usersRoutes)
apiRouter.use('/v1/jobs', jobsRoutes)
apiRouter.use('/v1/external/jobs', externalRoutes)

app.use('/api', apiRouter)

export default app
