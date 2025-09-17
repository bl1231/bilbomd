import express from 'express'
import { otp, refresh, logout } from '../controllers/authController.js'
import { handleOrcidLogin } from '../controllers/auth/handleOrcidLogin.js'
import { handleOrcidCallback } from '../controllers/auth/handleOrcidCallback.js'
import { loginLimiter } from '../middleware/loginLimiter.js'
import { handleOrcidFinalize } from '../controllers/auth/handleOrcidFinalize.js'
import { handleOrcidConfirmation } from '../controllers/auth/handleOrcidConfirmation.js'

const router = express.Router()

router.route('/otp').post(loginLimiter, otp)
router.route('/refresh').get(refresh)
router.route('/logout').post(logout)

router.route('/orcid/login').get(handleOrcidLogin)
router.route('/orcid/callback').get(handleOrcidCallback)
router.route('/orcid/confirmation').get(handleOrcidConfirmation)
router.route('/orcid/finalize').post(handleOrcidFinalize)

export default router
