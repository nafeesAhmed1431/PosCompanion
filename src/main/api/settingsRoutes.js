import { Router } from 'express'
import { settingsService } from '../services/settingsService.js'

// Mounted at /api/settings by main/api/index.js (wired centrally there to
// avoid concurrent edits on that shared file).
export const settingsRouter = Router()

settingsRouter.get('/sync', (req, res) => {
  res.json(settingsService.getSyncSettings())
})

settingsRouter.put('/sync', (req, res) => {
  try {
    res.json(settingsService.setSyncInterval(req.body?.intervalMinutes))
  } catch (err) {
    res.status(400).json({ message: err.message })
  }
})
