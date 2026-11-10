import express from 'express'
import { getMwCheck } from '../controllers/mwCheckController.js'
import { mwCheckLimiter } from '../middleware/uploadUtilityLimiter.js'

const router = express.Router()

router.route('/').post(mwCheckLimiter, getMwCheck)

export default router
