import express from 'express'
import {
  getStatus,
  getOutages,
  getUser,
  getProjectHours
} from '../controllers/sfapiController.js'
import { ensureSFAuthenticated } from '../middleware/tokenManager.js'
// import verifyJWT from '../middleware/verifyJWT'

const router = express.Router()

// router.use(verifyJWT)

// Unauthenticated routes first
router.route('/status').get(getStatus)
router.route('/outages').get(getOutages)

// Our custom middleware to get and apply an accessToken.
router.use(ensureSFAuthenticated)

// Protected routes
router.route('/account').get(getUser)
router.route('/account/projects/:repocode').get(getProjectHours)

export default router
