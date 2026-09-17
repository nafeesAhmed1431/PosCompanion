import { Router } from 'express'
import {
  openShift,
  getOpenShift,
  listShifts,
  getShiftFigures,
  closeShift
} from '../services/shiftsService.js'

// Expected mount path: /api/shifts (wired centrally in main/api/index.js).
export const shiftsRouter = Router()

shiftsRouter.post('/open', (req, res) => {
  try {
    const { label, openingBalance, userId, restaurantId } = req.body ?? {}
    if (!restaurantId || !userId) {
      return res.status(400).json({ message: 'restaurantId and userId are required.' })
    }
    res.json(openShift({ label, openingBalance, userId, restaurantId }))
  } catch (err) {
    res.status(400).json({ message: err.message })
  }
})

shiftsRouter.get('/open', (req, res) => {
  const restaurantId = req.query.restaurant_id
  if (!restaurantId) {
    return res.status(400).json({ message: 'restaurant_id query param is required.' })
  }
  res.json(getOpenShift(restaurantId) ?? null)
})

shiftsRouter.get('/', (req, res) => {
  const restaurantId = req.query.restaurant_id
  if (!restaurantId) {
    return res.status(400).json({ message: 'restaurant_id query param is required.' })
  }
  res.json(listShifts(restaurantId))
})

shiftsRouter.get('/:id/figures', (req, res) => {
  try {
    res.json(getShiftFigures(req.params.id))
  } catch (err) {
    res.status(400).json({ message: err.message })
  }
})

shiftsRouter.post('/:id/close', (req, res) => {
  try {
    const { closingBalance } = req.body ?? {}
    res.json(closeShift(req.params.id, closingBalance))
  } catch (err) {
    res.status(400).json({ message: err.message })
  }
})
