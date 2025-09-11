import express from 'express'
const router = express.Router()
import {
  mockVerifyNewUser,
  mockResendVerificationCode
} from '../controllers/verifyControllerMock'

router.route('/').post(mockVerifyNewUser)
router.route('/resend').post(mockResendVerificationCode)

module.exports = router
