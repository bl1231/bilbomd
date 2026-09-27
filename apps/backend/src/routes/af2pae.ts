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
import { af2paeLimiter } from '../middleware/uploadUtilityLimiter.js'

const router = express.Router()

router.route('/').get(downloadConstFile).post(af2paeLimiter, createNewConstFile)

router.route('/status').get(getAf2PaeStatus)

// Visualization endpoints
router.get('/:uuid/viz.json', getVizJson)
router.get('/:uuid/pae.bin', getPaeBin)
router.get('/:uuid/pae.png', getPaePng)
router.get('/:uuid/viz.png', getVizPng)

export default router
