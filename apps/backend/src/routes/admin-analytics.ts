import express from 'express'
import { verifyJWT } from '../middleware/verifyJWT.js'
import { verifyRoles } from '../middleware/verifyRoles.js'
import {
  getSummaryAnalytics,
  getJobsByUser,
  getJobsByType,
  getJobsByStatus,
  getJobsTimeSeries,
  getUsagePerPipeline,
  getUsageSuccessRate,
  getUsageDurationStats,
  getUsageAccessModeSplit,
  getUsageDailyCounts
} from '../controllers/admin/analytics/index.js'

const router = express.Router()

router.use(verifyJWT)
router.use(verifyRoles('Admin', 'Manager'))

router.get('/summary', getSummaryAnalytics)
router.get('/jobs/by-user', getJobsByUser)
router.get('/jobs/by-type', getJobsByType)
router.get('/jobs/by-status', getJobsByStatus)
router.get('/jobs/timeseries', getJobsTimeSeries)

router.get('/usage/per-pipeline', getUsagePerPipeline)
router.get('/usage/success-rate', getUsageSuccessRate)
router.get('/usage/duration-stats', getUsageDurationStats)
router.get('/usage/access-mode-split', getUsageAccessModeSplit)
router.get('/usage/daily', getUsageDailyCounts)

export default router
