import express from 'express'
import {
  getAllJobs,
  getJobById,
  createNewJob,
  deleteJob,
  updateJobStatus,
  downloadJobResults,
  getLogForStep
} from '../controllers/jobs/index.js'
// import { createNewAlphaFoldJob } from '../controllers/alphafoldJobsController.js'
import { createNewSANSJob } from '../controllers/sansJobController.js'
import { createNewMultiJob } from '../controllers/multiMdController.js'
import { downloadPDB, getFoxsData } from '../controllers/downloadController.js'
import { getFile } from '../controllers/fileDownloadController.js'
import { checkFiles } from '../controllers/resubmitController.js'
import { verifyJWT } from '../middleware/verifyJWT.js'

const router = express.Router()

router.use(verifyJWT)

router.route('/').get(getAllJobs).post(createNewJob).patch(updateJobStatus)

router.route('/:id').get(getJobById)
router.route('/:id').delete(deleteJob)
router.route('/:id/results').get(downloadJobResults)
router.route('/:id/results/foxs').get(getFoxsData)
router.route('/:id/results/:pdb').get(downloadPDB)
router.route('/:id/logs').get(getLogForStep)
router.route('/:id/check-files').get(checkFiles)
router.route('/:id/:filename').get(getFile)
router.route('/bilbomd-auto').post(createNewJob)
router.route('/bilbomd-scoper').post(createNewJob)
router.route('/bilbomd-alphafold').post(createNewJob)
router.route('/bilbomd-sans').post(createNewSANSJob)
router.route('/bilbomd-multi').post(createNewMultiJob)

export default router
