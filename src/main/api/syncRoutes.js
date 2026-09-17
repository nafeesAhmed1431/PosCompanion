import { Router } from 'express'
import { pullBootstrap } from '../services/bootstrapSyncService.js'

// Mounted at /api/sync by main/api/index.js (wired centrally there to avoid
// concurrent edits on that shared file).
export const syncRouter = Router()

syncRouter.post('/bootstrap', async (req, res) => {
  try {
    const summary = await pullBootstrap()
    res.json(summary)
  } catch (err) {
    // "No active session" is the one expected/user-actionable failure (not
    // logged in / no restaurant selected yet) — everything else is treated
    // as an upstream/network problem, matching authRoutes.js's style of
    // surfacing only the human-readable message.
    const status = err.message?.startsWith('No active session') ? 404 : 500
    res.status(status).json({ message: err.message })
  }
})
