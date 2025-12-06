import express from 'express'
import { publicJobLimiter } from '../middleware/publicJobLimiter.js'
import { createPublicJob, getPublicJobById } from '../controllers/jobs/index.js'
import { downloadPublicJobResults } from '../controllers/public/downloadPublicJobResults.js'
import getPublicFoxsData from '../controllers/public/getPublicFoxsData.js'
import { getPublicFeedbackData } from '../controllers/public/getPublicFeedbackData.js'
import { downloadPublicJobResultFile } from '../controllers/public/downloadPublicJobResultFile.js'
import { createPublicSANSJob } from '../controllers/jobs/sansJobController.js'

const router = express.Router()

router.route('/').post(publicJobLimiter, createPublicJob)
router.route('/sans').post(publicJobLimiter, createPublicSANSJob)
router.route('/:publicId').get(getPublicJobById)
router.route('/:publicId/results').get(downloadPublicJobResults)
router.route('/:publicId/results/foxs').get(getPublicFoxsData)
router.route('/:publicId/results/feedback').get(getPublicFeedbackData)
router.route('/:publicId/results/:filename').get(downloadPublicJobResultFile)

export default router
