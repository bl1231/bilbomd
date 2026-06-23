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
import { verifyRoles } from '../middleware/verifyRoles.js'
import { verifyAccountOwnership } from '../middleware/verifyAccountOwnership.js'
import { logApiRequest } from '../middleware/logApiRequests.js'

const router = express.Router()
router.use(verifyJWT)

// Administrative endpoints that operate on arbitrary users — Managers/Admins only.
router
  .route('/')
  .get(verifyRoles('Admin', 'Manager'), getAllUsers)
  .patch(verifyRoles('Admin', 'Manager'), updateUser)
router
  .route('/:id')
  .get(verifyRoles('Admin', 'Manager'), getUser)
  .delete(verifyRoles('Admin', 'Manager'), deleteUserById)

// Self-service endpoints — callers may only act on their own account.
router.delete(
  '/delete-user-by-username/:username',
  verifyAccountOwnership('params'),
  deleteUserByUsername
)
router.post('/change-email', verifyAccountOwnership('body'), sendChangeEmailOtp)
router.post('/verify-otp', verifyAccountOwnership('body'), verifyOtp)
router.post('/resend-otp', verifyAccountOwnership('body'), resendOtp)
router.post('/:username/tokens', logApiRequest, createAPIToken)
router.get('/:username/tokens', logApiRequest, listAPITokens)
router.delete('/:username/tokens/:id', logApiRequest, deleteAPIToken)
export default router
