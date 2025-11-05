import express from 'express'
import { createPublicJob, getPublicJobById } from '../controllers/jobs/index.js'

const router = express.Router()

router.route('/').post(createPublicJob)
router.route('/:publicId').get(getPublicJobById)

export default router
