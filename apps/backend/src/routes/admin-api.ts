import express from 'express'
import { verifyJWT } from '../middleware/verifyJWT.js'
import { verifyRoles } from '../middleware/verifyRoles.js'
const router = express.Router()
import { getQueues } from '../controllers/admin/getQueues.js'
import { pauseQueue } from '../controllers/admin/pauseQueue.js'
import { resumeQueue } from '../controllers/admin/resumeQueue.js'
import { getJobsByQueue } from '../controllers/admin/getJobsByQueue.js'
import retryQueueJob from '../controllers/admin/retryQueueJob.js'
import deleteQueueJob from '../controllers/admin/deleteQueueJob.js'
import drainQueue from '../controllers/admin/drainQueue.js'
import failQueueJob from '../controllers/admin/failQueueJob.js'
router.use(verifyJWT)
router.use(verifyRoles('Admin', 'Manager'))

router.route('/queues').get(getQueues)
router.post('/queues/:queueName/pause', pauseQueue)
router.post('/queues/:queueName/resume', resumeQueue)
router.post('/queues/:queueName/drain', drainQueue)
router.get('/queues/:queueName/jobs', getJobsByQueue)
router.post('/queues/:queueName/jobs/:jobId/retry', retryQueueJob)
router.delete('/queues/:queueName/jobs/:jobId', deleteQueueJob)
router.post('/queues/:queueName/jobs/:jobId/fail', failQueueJob)

export default router
