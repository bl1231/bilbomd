import express from 'express'
import {
  getClassicPdbExample,
  getClassicCrdExample,
  getClassicAutoExample,
  getClassicAfExample,
  getClassicSansExample,
  getClassicScoperExample
} from '../controllers/examples/getExampleData.js'

const router = express.Router()

router.route('/classic/pdb').get(getClassicPdbExample)
router.route('/classic/crd').get(getClassicCrdExample)
router.route('/auto').get(getClassicAutoExample)
router.route('/af').get(getClassicAfExample)
router.route('/sans').get(getClassicSansExample)
router.route('/scoper').get(getClassicScoperExample)

export default router
