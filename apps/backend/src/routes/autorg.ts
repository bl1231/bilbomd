import express from 'express'
import { getAutoRg } from '../controllers/jobs/index.js'
import { verifyJWT } from '../middleware/verifyJWT.js'

const router = express.Router()

router.use(verifyJWT)

router.route('/').post(getAutoRg)

export default router
