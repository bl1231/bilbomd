import express from 'express'
import path from 'path'

const router = express.Router()

const viewsPath = '/app/views'

router.get(/^\/$|\/index(\.html)?$/, (req, res) => {
  res.sendFile(path.join(viewsPath, 'index.html'))
})

export default router
