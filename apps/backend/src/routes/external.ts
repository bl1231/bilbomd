import express from 'express'
import { createApiJob } from '../controllers/external/createApiJob.js'
import { getApiJobStatus } from '../controllers/external/jobStatus.js'
import { getExternalJobResults } from '../controllers/external/getResults.js'
import { verifyAPIToken } from '../middleware/verifyAPIToken.js'
import { logApiRequest } from '../middleware/logApiRequests.js'

const router = express.Router()

router.use(verifyAPIToken)
router.use(logApiRequest)

// Health check or root endpoint for /external
router.get('/', (req, res) => {
  res.json({ message: 'External API route is working.' })
})

/**
 * @swagger
 * /external/jobs:
 *   post:
 *     summary: Submit a new job
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             oneOf:
 *               - title: PDB Job
 *                 required: [title, bilbomd_mode, pdb_file, crd_file, const_inp_file, dat_file]
 *                 properties:
 *                   bilbomd_mode:
 *                     type: string
 *                     enum: [pdb]
 *                     description: Must be set to "pdb" for this job type.
 *                   title:
 *                     type: string
 *                     description: User-defined title for the job.
 *                   pdb_file:
 *                     type: string
 *                     format: binary
 *                     description: Upload the PDB file containing the atomic coordinates.
 *                   crd_file:
 *                     type: string
 *                     format: binary
 *                     description: Upload the CHARMM CRD file associated with the structure.
 *                   const_inp_file:
 *                     type: string
 *                     format: binary
 *                     description: Upload the const.inp configuration file used by BilboMD.
 *                   dat_file:
 *                     type: string
 *                     format: binary
 *                     description: Upload the experimental SAXS .dat file for fitting analysis.
 *               - title: CRD/PSF Job
 *                 required: [title, bilbomd_mode, crd_file, psf_file, const_inp_file, dat_file]
 *                 properties:
 *                   bilbomd_mode:
 *                     type: string
 *                     enum: [crd_psf]
 *                     description: Must be set to "crd_psf" for this job type.
 *                   title:
 *                     type: string
 *                     description: User-defined title for the job.
 *                   crd_file:
 *                     type: string
 *                     format: binary
 *                     description: Upload the CHARMM CRD file containing structure coordinates.
 *                   psf_file:
 *                     type: string
 *                     format: binary
 *                     description: Upload the PSF file containing topology information.
 *                   const_inp_file:
 *                     type: string
 *                     format: binary
 *                     description: Upload the const.inp configuration file for BilboMD.
 *                   dat_file:
 *                     type: string
 *                     format: binary
 *                     description: Upload the experimental SAXS .dat file for fitting.
 *               - title: Auto Job
 *                 required: [title, bilbomd_mode, pdb_file, pae_file, dat_file]
 *                 properties:
 *                   bilbomd_mode:
 *                     type: string
 *                     enum: [auto]
 *                     description: Must be set to "auto" for this job type.
 *                   title:
 *                     type: string
 *                     description: User-defined title for the job.
 *                   pdb_file:
 *                     type: string
 *                     format: binary
 *                     description: Upload the PDB file containing the full predicted structure.
 *                   pae_file:
 *                     type: string
 *                     format: binary
 *                     description: Upload the PAE (Predicted Aligned Error) matrix file from AlphaFold.
 *                   dat_file:
 *                     type: string
 *                     format: binary
 *                     description: Upload the experimental SAXS .dat file for fitting.
 *               - title: AlphaFold Job
 *                 required: [title, bilbomd_mode, dat_file, entities_json]
 *                 properties:
 *                   bilbomd_mode:
 *                     type: string
 *                     enum: [alphafold]
 *                     description: Must be set to "alphafold" for this job type.
 *                   title:
 *                     type: string
 *                     description: User-defined title for the job.
 *                   dat_file:
 *                     type: string
 *                     format: binary
 *                     description: Upload the experimental SAXS .dat file for fitting.
 *                   entities_json:
 *                     $ref: '#/components/schemas/EntitiesJson'
 *                     description: JSON file containing entity information for the job.
 *     responses:
 *       200:
 *         description: Job submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "New auto job successfully created"
 *                 jobid:
 *                   type: string
 *                   example: "680aa4ffce4a325a086cbced"
 *                 uuid:
 *                   type: string
 *                   example: "f4ba7568-369a-465a-b0d1-a78969bb816b"
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenAlphaFold'
 */
router.post('/', createApiJob)

/**
 * @swagger
 * /external/jobs/{id}/status:
 *   get:
 *     summary: Get job status
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The MongoDB job ID
 *     responses:
 *       200:
 *         description: Job status returned
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/JobStatusResponse'
 *       400:
 *         description: Invalid job ID
 *         content:
 *           application/json:
 *             example:
 *               message: "Invalid job ID format"
 *       404:
 *         description: Job not found
 *         content:
 *           application/json:
 *             example:
 *               message: "No job found with ID: 680aa4ffce4a325a086cbced"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error retrieving job status
 *         content:
 *           application/json:
 *             example:
 *               message: "Failed to retrieve job status"
 */
router.get('/:id/status', getApiJobStatus)

/**
 * @swagger
 * /external/jobs/{id}/results:
 *   get:
 *     summary: Download job results as a tarball archive
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ID of the job (either Job or MultiJob)
 *     responses:
 *       200:
 *         description: A tarball archive containing the job results
 *         content:
 *           application/gzip:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Invalid request
 *         content:
 *           application/json:
 *             examples:
 *               MissingID:
 *                 summary: Missing job ID
 *                 value:
 *                   message: Job ID required.
 *               NotCompleted:
 *                 summary: Job not yet completed
 *                 value:
 *                   message: "Job is not complete (status: Running). You may only download results for a job that has completed successfully."
 *               NullDoc:
 *                 summary: Job document is null or undefined
 *                 value:
 *                   message: Job document is null or undefined.
 *       404:
 *         description: Job or result file not found
 *         content:
 *           application/json:
 *             examples:
 *               NoJob:
 *                 summary: Job not found
 *                 value:
 *                   message: "No job matches ID 680aa4ffce4a325a086cbced."
 *               NoResultsFile:
 *                 summary: Results file missing
 *                 value:
 *                   message: Results file not found.
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             examples:
 *               DownloadError:
 *                 summary: Error during file download
 *                 value:
 *                   message: "Could not download the file: ENOENT: no such file or directory"
 *               Unexpected:
 *                 summary: Unexpected server error
 *                 value:
 *                   message: An error occurred while processing your request.
 */
router.get('/:id/results', getExternalJobResults)

export default router
