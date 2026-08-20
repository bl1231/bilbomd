import express from 'express'
import {
  getAllJobs,
  getJobById,
  createNewJob,
  deleteJob,
  downloadJobResults,
  getLogForStep
} from '../controllers/jobs/index.js'
import { createSANSJob } from '../controllers/jobs/sansJobController.js'
import { createNewMultiJob } from '../controllers/jobs/multiMdController.js'
import { downloadPDB, getFoxsData } from '../controllers/foxsController.js'
import { getFile } from '../controllers/fileDownloadController.js'
import getMovies from '../controllers/movies/getMovies.js'
import streamVideo from '../controllers/movies/streamVideo.js'
import { checkFiles } from '../controllers/resubmitController.js'
import { verifyJWT } from '../middleware/verifyJWT.js'
import { verifyJobOwnership } from '../middleware/verifyJobOwnership.js'
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

// Every /:id route must pass verifyJobOwnership: the caller has to own the job
// or hold the Admin/Manager role. The movie routes enforce ownership inline.
router
  .route('/:id')
  .get(verifyJobOwnership, getJobById)
  .delete(verifyJobOwnership, deleteJob)
router.route('/:id/results').get(verifyJobOwnership, downloadJobResults)
router.route('/:id/results/foxs').get(verifyJobOwnership, getFoxsData)
router.route('/:id/results/:pdb').get(verifyJobOwnership, downloadPDB)
router.route('/:id/logs').get(verifyJobOwnership, getLogForStep)
router.route('/:id/check-files').get(verifyJobOwnership, checkFiles)
router.route('/:id/movies').get(getMovies)
router
  .route('/:id/movies/:label/:filename')
  .get(verifyVideoSession, streamVideo)
router.route('/:id/:filename').get(verifyJobOwnership, getFile)
router.route('/bilbomd-auto').post(createNewJob)
router.route('/bilbomd-scoper').post(createNewJob)
router.route('/bilbomd-alphafold').post(createNewJob)
router.route('/bilbomd-openfold').post(createNewJob)
router.route('/bilbomd-sans').post(createSANSJob)
router.route('/bilbomd-multi').post(createNewMultiJob)

export default router
