import { Router } from 'express'
import { getMenu } from '../services/menuService.js'

// Expected mount path: /api/menu (wired centrally in main/api/index.js).
export const menuRouter = Router()

menuRouter.get('/', (req, res) => {
  try {
    res.json(getMenu())
  } catch (err) {
    const status = err.message?.startsWith('No active session') ? 401 : 500
    res.status(status).json({ message: err.message })
  }
})
