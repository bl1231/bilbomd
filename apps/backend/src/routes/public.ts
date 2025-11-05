import express from 'express'
import { createPublicJob, getPublicJobById } from '../controllers/jobs/index.js'
// import { createNewSANSJob } from '../controllers/jobs/sansJobController.js'
// import { createNewMultiJob } from '../controllers/jobs/multiMdController.js'
// import { downloadPDB, getFoxsData } from '../controllers/downloadController.js'
// import { getFile } from '../controllers/fileDownloadController.js'
// import getMovies from '../controllers/movies/getMovies.js'
// import streamVideo from '../controllers/movies/streamVideo.js'
// import { checkFiles } from '../controllers/resubmitController.js'
// import { setVideoSession, verifyVideoSession } from '../middleware/videoAuth.js'
// import { logger } from '../middleware/loggers.js'
const router = express.Router()

router.route('/').post(createPublicJob)
router.route('/:publicId').get(getPublicJobById)

// router.route('/:publicId/results').get(downloadJobResults)
// router.route('/:publicId/results/foxs').get(getFoxsData)
// router.route('/:publicId/results/:pdb').get(downloadPDB)
// router.route('/:publicId/logs').get(getLogForStep)
// router.route('/:publicId/check-files').get(checkFiles)
// router.route('/:publicId/movies').get(getMovies)
// router
//   .route('/:id/movies/:label/:filename')
//   .get(verifyVideoSession, streamVideo)
// router.route('/:id/:filename').get(getFile)
// router.route('/bilbomd-auto').post(createNewJob)
// router.route('/bilbomd-scoper').post(createNewJob)
// router.route('/bilbomd-alphafold').post(createNewJob)
// router.route('/bilbomd-sans').post(createNewSANSJob)
// router.route('/bilbomd-multi').post(createNewMultiJob)

export default router
