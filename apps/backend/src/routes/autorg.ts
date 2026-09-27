import express from 'express'
import { getAutoRg } from '../controllers/jobs/index.js'
import { autoRgLimiter } from '../middleware/uploadUtilityLimiter.js'

const router = express.Router()

router.route('/').post(autoRgLimiter, getAutoRg)

export default router
