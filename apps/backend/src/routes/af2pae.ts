import express from 'express'
import {
  createNewConstFile,
  downloadConstFile,
  getAf2PaeStatus
} from '../controllers/af2paeController.js'
import { verifyJWT } from '../middleware/verifyJWT.js'

const router = express.Router()

router.use(verifyJWT)

router.route('/').get(downloadConstFile).post(createNewConstFile)

router.route('/status').get(getAf2PaeStatus)

// router.route('/:uuid/const.inp').get(downloadConstFile)

export default router
