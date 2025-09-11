import 'dotenv/config'
import express, { Express, Request, Response } from 'express'
import path from 'path'
import cors from 'cors'
import { corsOptions } from './config/corsOptions.js'
import { corsOptionsPublic } from './config/corsOptionsPublic.js'
// import { loginLimiter } from './middleware/loginLimiter.js'
import { externalApiLimiter } from './middleware/externalApiLimiter.js'
import { logger, requestLogger, assignRequestId } from './middleware/loggers.js'
import cookieParser from 'cookie-parser'
import session from 'express-session'
import { router as adminRoutes } from './routes/admin.js'
import mongoose from 'mongoose'
import { connectDB } from './config/dbConn.js'
import { initOrcidClient } from './controllers/auth/orcidClientConfig.js'
import { CronJob } from 'cron'
import { deleteOldJobs } from './middleware/jobCleaner.js'
import sfapiRoutes from './routes/sfapi.js'
import registerRoutes from './routes/register.js'
import verifyRoutes from './routes/verify.js'
import magicklinkRoutes from './routes/magicklink.js'
import authRoutes from './routes/auth.js'
import jobsRoutes from './routes/jobs.js'
import usersRoutes from './routes/users.js'
import af2paeRoutes from './routes/af2pae.js'
import autorgRoutes from './routes/autorg.js'
import bullmqRoutes from './routes/bullmq.js'
import configsRoutes from './routes/configs.js'
import statsRoutes from './routes/stats.js'
import externalRoutes from './routes/external.js'
import adminApiRoutes from './routes/admin-api.js'
import './workers/deleteBilboMDJobsWorker.js'
import swaggerUi from 'swagger-ui-express'
import swaggerSpec from './openapi/swagger.js'

// Instantiate the app
const app: Express = express()

const environment: string = process.env.NODE_ENV || 'development'

const viewsPath = '/app/views'

logger.info(`Starting in ${environment} mode`)

// Trust the first proxy in front of the app
// ChatGPT suggested this
app.set('trust proxy', 1)

// Connect to MongoDB
connectDB()

// Initialize the ORCID client configuration
await initOrcidClient()

// custom middleware logger
app.use(assignRequestId)
app.use(requestLogger)

// Rate limiting middleware
// app.use(loginLimiter)

// Cross Origin Resource Sharing
// prevents unwanted clients from accessing our backend API.
app.use(cors(corsOptions))

// built-in middleware to handle urlencoded FORM data
app.use(express.urlencoded({ extended: true, limit: '150mb' }))

// built-in middleware for JSON
app.use(express.json({ limit: '150mb' }))

// middleware for COOKIES
app.use(cookieParser())

// Session management
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'bilbomd-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // true if HTTPS
      maxAge: 1000 * 60 * 15 // 15 minutes
    }
  })
)

// Serve static files
app.use('/', express.static('public'))

// Root routes (no version)
// app.use('/', rootRoutes)

app.use('/admin/bullmq', adminRoutes)

app.use('/sfapi', sfapiRoutes)

// Group version 1 routes under /api/v1
const v1Router = express.Router()

// Register our v1 routes
v1Router.use('/register', registerRoutes)
v1Router.use('/verify', verifyRoutes)
v1Router.use('/magicklink', magicklinkRoutes)
v1Router.use('/auth', authRoutes)
v1Router.use('/jobs', jobsRoutes)
v1Router.use('/users', usersRoutes)
v1Router.use('/af2pae', af2paeRoutes)
v1Router.use('/autorg', autorgRoutes)
v1Router.use('/bullmq', bullmqRoutes)
v1Router.use('/configs', configsRoutes)
v1Router.use('/stats', statsRoutes)
v1Router.use(
  '/external/jobs',
  cors(corsOptionsPublic),
  externalApiLimiter,
  externalRoutes
)
v1Router.use('/admin', adminApiRoutes)

// Apply v1Router under /api/v1
app.use('/api/v1', v1Router)

// Route to dynamically serve our Swagger API documentation
app.use(
  '/api-docs',
  cors(corsOptionsPublic),
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec)
)

// Serve the Swagger docs in JSON format
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json')
  res.status(200).json(swaggerSpec)
})

// Health check route
// Define the possible MongoDB connection states
const mongoConnectionStates: { [key: number]: string } = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting'
}

// Health check route
app.get('/healthcheck', (req: Request, res: Response) => {
  const mongoState: number = mongoose.connection.readyState

  const healthStatus = {
    app: 'healthy',
    mongo: mongoConnectionStates[mongoState] || 'unknown'
  }

  if (mongoState !== 1) {
    res.status(503).json(healthStatus) // Return 503 if MongoDB is not connected
  } else {
    res.status(200).json(healthStatus) // Return 200 if everything is healthy
  }
})

// cron
new CronJob('11 1 * * *', deleteOldJobs, null, true, 'America/Los_Angeles')
// job.start()

app.all(/.*/, (req, res) => {
  res.status(404)
  if (req.accepts('html')) {
    res.sendFile(path.join(viewsPath, '404.html'))
  } else if (req.accepts('json')) {
    res.json({ error: '404 Not Found' })
  } else {
    res.type('txt').send('404 Not Found')
  }
})

mongoose.connection.on('error', (err) => {
  console.log('mongoose error: ', err)
  logger.error(
    `${err.no}: ${err.code}\t${err.syscall}\t${err.hostname}`,
    'mongo_error.log'
  )
})

export default app
