import express from 'express'
import {
  createNewConstFile,
  downloadConstFile,
  getAf2PaeStatus,
  getVizJson,
  getPaeBin,
  getPaePng,
  getVizPng
} from '../controllers/af2paeController.js'
import { verifyJWT } from '../middleware/verifyJWT.js'

const router = express.Router()

router.use(verifyJWT)

router.route('/').get(downloadConstFile).post(createNewConstFile)

router.route('/status').get(getAf2PaeStatus)

// Visualization endpoints
router.get('/:uuid/viz.json', getVizJson)
router.get('/:uuid/pae.bin', getPaeBin)
router.get('/:uuid/pae.png', getPaePng)
router.get('/:uuid/viz.png', getVizPng)

export default router
