import express from 'express'
import {
  verifyNewUser,
  resendVerificationCode
} from '../controllers/verifyController.js'
import { loginLimiter } from '../middleware/loginLimiter.js'

const router = express.Router()

router.route('/').post(loginLimiter, verifyNewUser)
router.route('/resend').post(loginLimiter, resendVerificationCode)
export default router
