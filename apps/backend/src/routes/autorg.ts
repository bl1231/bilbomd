import express from 'express'
import { getAutoRg } from '../controllers/jobs/index.js'

const router = express.Router()

router.route('/').post(getAutoRg)

export default router
