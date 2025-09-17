import express from 'express'
import {
  getAllUsers,
  updateUser,
  deleteUserById,
  getUser,
  sendChangeEmailOtp,
  verifyOtp,
  resendOtp,
  deleteUserByUsername
} from '../controllers/usersController.js'
import { createAPIToken } from '../controllers/users/createAPIToken.js'
import { listAPITokens } from '../controllers/users/listAPITokens.js'
import { deleteAPIToken } from '../controllers/users/deleteAPIToken.js'
import { verifyJWT } from '../middleware/verifyJWT.js'
import { logApiRequest } from '../middleware/logApiRequests.js'

const router = express.Router()
router.use(verifyJWT)
router.route('/').get(getAllUsers).patch(updateUser)
router.route('/:id').get(getUser).delete(deleteUserById)
router.delete('/delete-user-by-username/:username', deleteUserByUsername)
router.post('/change-email', sendChangeEmailOtp)
router.post('/verify-otp', verifyOtp)
router.post('/resend-otp', resendOtp)
router.post('/:username/tokens', logApiRequest, createAPIToken)
router.get('/:username/tokens', logApiRequest, listAPITokens)
router.delete('/:username/tokens/:id', logApiRequest, deleteAPIToken)
export default router
