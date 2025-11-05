import express from 'express'
import {
  getAllJobs,
  getJobById,
  createNewJob,
  deleteJob,
  downloadJobResults,
  getLogForStep
} from '../controllers/jobs/index.js'
import { createNewSANSJob } from '../controllers/jobs/sansJobController.js'
import { createNewMultiJob } from '../controllers/jobs/multiMdController.js'
import { downloadPDB, getFoxsData } from '../controllers/downloadController.js'
import { getFile } from '../controllers/fileDownloadController.js'
import getMovies from '../controllers/movies/getMovies.js'
import streamVideo from '../controllers/movies/streamVideo.js'
import { checkFiles } from '../controllers/resubmitController.js'
import { verifyJWT } from '../middleware/verifyJWT.js'
import { setVideoSession, verifyVideoSession } from '../middleware/videoAuth.js'
import { logger } from '../middleware/loggers.js'
const router = express.Router()

// Most routes use JWT authentication + set video session
router.use((req, res, next) => {
  // Skip JWT for video streaming route, use session auth instead
  if (req.path.match(/\/[^/]+\/movies\/[^/]+\/[^/]+$/)) {
    return next()
  }
  // All other routes use JWT + set video session
  verifyJWT(req, res, (err) => {
    if (err) {
      logger.error(`JWT verification failed: ${err}`)
      return next(err)
    }
    logger.debug(`JWT verified, req.user: ${req.user}`)
    setVideoSession(req, res, next)
  })
})

router.route('/').get(getAllJobs).post(createNewJob)

router.route('/:id').get(getJobById)
router.route('/:id').delete(deleteJob)
router.route('/:id/results').get(downloadJobResults)
router.route('/:id/results/foxs').get(getFoxsData)
router.route('/:id/results/:pdb').get(downloadPDB)
router.route('/:id/logs').get(getLogForStep)
router.route('/:id/check-files').get(checkFiles)
router.route('/:id/movies').get(getMovies)
router
  .route('/:id/movies/:label/:filename')
  .get(verifyVideoSession, streamVideo)
router.route('/:id/:filename').get(getFile)
router.route('/bilbomd-auto').post(createNewJob)
router.route('/bilbomd-scoper').post(createNewJob)
router.route('/bilbomd-alphafold').post(createNewJob)
router.route('/bilbomd-sans').post(createNewSANSJob)
router.route('/bilbomd-multi').post(createNewMultiJob)

export default router
