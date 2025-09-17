import express from 'express'
import { generateMagickLink } from '../controllers/magickLinkController.js'

const router = express.Router()

router.post('/', generateMagickLink)

export default router
