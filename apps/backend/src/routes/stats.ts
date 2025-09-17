import express from 'express'
import { getStats } from '../controllers/statsController.js'
import { verifyJWT } from '../middleware/verifyJWT.js'

const router = express.Router()
router.use(verifyJWT)
router.route('/').get(getStats)

export default router
