import { Router } from 'express'
import { getDashboardStats } from '../services/statsService.js'

// Mounted at /api/stats by main/api/index.js (wired centrally there to
// avoid concurrent edits on that shared file).
export const statsRouter = Router()

statsRouter.get('/', (req, res) => {
  res.json(getDashboardStats())
})
