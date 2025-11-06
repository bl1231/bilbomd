import express from 'express'
import { createPublicJob, getPublicJobById } from '../controllers/jobs/index.js'
import { downloadPublicJobResults } from '../controllers/public/downloadPublicJobResults.js'

const router = express.Router()

router.route('/').post(createPublicJob)
router.route('/:publicId').get(getPublicJobById)
router.route('/:publicId/results').get(downloadPublicJobResults)

export default router
