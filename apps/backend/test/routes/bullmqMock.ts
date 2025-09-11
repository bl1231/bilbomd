// bullmqMock.ts

import express from 'express'
import { getQueueStatus } from '../controllers/bullmqControllerMock' // Import the controller mock

const router = express.Router()

// Mock the route handler
router.get('/', async (req, res) => {
  try {
    const queueStatus = await getQueueStatus()
    res.status(200).json(queueStatus)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Internal Server Error' })
  }
})

module.exports = router
