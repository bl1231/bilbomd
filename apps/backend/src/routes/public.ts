import express from 'express'
import { createPublicJob, getPublicJobById } from '../controllers/jobs/index.js'
import { downloadPublicJobResults } from '../controllers/public/downloadPublicJobResults.js'
import getPublicFoxsData from '../controllers/public/getPublicFoxsData.js'
import { getPublicFeedbackData } from '../controllers/public/getPublicFeedbackData.js'

const router = express.Router()

router.route('/').post(createPublicJob)
router.route('/:publicId').get(getPublicJobById)
router.route('/:publicId/results').get(downloadPublicJobResults)
router.route('/:publicId/results/foxs').get(getPublicFoxsData)
router.route('/:publicId/results/feedback').get(getPublicFeedbackData)

export default router
