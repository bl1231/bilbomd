import express from 'express'
import { publicJobLimiter } from '../middleware/publicJobLimiter.js'
import { requireValidLicense } from '../middleware/requireValidLicense.js'
import { createPublicJob, getPublicJobById } from '../controllers/jobs/index.js'
import { downloadPublicJobResults } from '../controllers/public/downloadPublicJobResults.js'
import getPublicFoxsData from '../controllers/public/getPublicFoxsData.js'
import { getPublicFeedbackData } from '../controllers/public/getPublicFeedbackData.js'
import { downloadPublicJobResultFile } from '../controllers/public/downloadPublicJobResultFile.js'
import { createPublicSANSJob } from '../controllers/jobs/sansJobController.js'
import getPublicMovies from '../controllers/public/getPublicMovies.js'
import streamPublicVideo from '../controllers/public/streamPublicVideo.js'

const router = express.Router()

router.route('/').post(publicJobLimiter, requireValidLicense, createPublicJob)
router
  .route('/sans')
  .post(publicJobLimiter, requireValidLicense, createPublicSANSJob)
router.route('/:publicId').get(getPublicJobById)
router.route('/:publicId/movies').get(getPublicMovies)
router.route('/:publicId/movies/:label/:filename').get(streamPublicVideo)
router.route('/:publicId/results').get(downloadPublicJobResults)
router.route('/:publicId/results/foxs').get(getPublicFoxsData)
router.route('/:publicId/results/feedback').get(getPublicFeedbackData)
router.route('/:publicId/results/:filename').get(downloadPublicJobResultFile)

export default router
