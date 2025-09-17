import express from 'express'
import { verifyNewUser, resendVerificationCode } from '../controllers/verifyController.js'
const router = express.Router()

router.route('/').post(verifyNewUser)
router.route('/resend').post(resendVerificationCode)

export default router
