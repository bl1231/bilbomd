import express from 'express'
import { generateMagickLink } from '../controllers/magickLinkController.js'
import { loginLimiter } from '../middleware/loginLimiter.js'

const router = express.Router()

router.post('/', loginLimiter, generateMagickLink)

export default router
