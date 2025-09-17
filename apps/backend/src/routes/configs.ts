import express from 'express'
import { getConfigsStuff } from '../controllers/configsController.js'

const router = express.Router()

router.route('/').get(getConfigsStuff)

export default router
