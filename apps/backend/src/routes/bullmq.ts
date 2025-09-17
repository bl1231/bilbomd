import express from 'express'
import { getQueueStatus } from '../controllers/bullmqController.js'
import { verifyJWT } from '../middleware/verifyJWT.js'

const router = express.Router()

router.use(verifyJWT)

router.route('/').get(getQueueStatus)

export default router
