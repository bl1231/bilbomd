import './mocks/mockRedis.js'
import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import registerRoutes from '../src/routes/register.js'
import verifyRoutes from '../src/routes/verify.js'
import magicklinkRoutes from '../src/routes/magicklink.js'
import usersRoutes from '../src/routes/users.js'
import jobsRoutes from '../src/routes/jobs.js'
import externalRoutes from '../src/routes/external.js'

const app = express()

app.use(cors())
app.use(express.json())

app.use((req: Request, res: Response, next: NextFunction) => {
  req.apiUser = {
    email: 'testuser@example.com'
  }
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
