import { Router } from 'express'
import {
  previewTotals,
  holdOrder,
  checkoutOrder,
  listHeldOrders,
  listPaymentMethods,
  listTablesFallback
} from '../services/ordersService.js'
import {
  listOrders,
  getOrder,
  advanceStatus,
  refundOrderItem,
  reassignOrder
} from '../services/orderStatusService.js'

// Expected mount path: /api/orders (wired centrally in main/api/index.js,
// per the same convention as authRoutes.js/syncRoutes.js). Thin routes only
// — every calculation/DB decision lives in ordersService.js.
export const ordersRouter = Router()

ordersRouter.post('/preview', (req, res) => {
  try {
    const { lines, discount, orderType, serviceChargeRate } = req.body ?? {}
    res.json(previewTotals({ lines, discount, orderType, serviceChargeRate }))
  } catch (err) {
    res.status(400).json({ message: err.message })
  }
})

ordersRouter.post('/hold', (req, res) => {
  try {
    const result = holdOrder(req.body ?? {})
    res.json(result)
  } catch (err) {
    res.status(400).json({ message: err.message })
  }
})

ordersRouter.post('/checkout', (req, res) => {
  try {
    const result = checkoutOrder(req.body ?? {})
    res.json(result)
  } catch (err) {
    res.status(400).json({ message: err.message })
  }
})

ordersRouter.get('/held', (req, res) => {
  const restaurantId = req.query.restaurant_id
  if (!restaurantId) {
    return res.status(400).json({ message: 'restaurant_id query param is required.' })
  }
  res.json(listHeldOrders(restaurantId))
})

ordersRouter.get('/payment-methods', (req, res) => {
  const restaurantId = req.query.restaurant_id
  if (!restaurantId) {
    return res.status(400).json({ message: 'restaurant_id query param is required.' })
  }
  res.json(listPaymentMethods(restaurantId))
})

// Fallback only — prefer /api/tables (Tables page's own route) once it's
// mounted; kept here so POS's table picker isn't blocked on that.
ordersRouter.get('/tables-fallback', (req, res) => {
  const restaurantId = req.query.restaurant_id
  if (!restaurantId) {
    return res.status(400).json({ message: 'restaurant_id query param is required.' })
  }
  res.json(listTablesFallback(restaurantId))
})

// --- Orders/KDS additions below (orderStatusService.js) ---------------
// Registered after the existing literal routes above so a request like
// GET /held keeps matching its own handler first; these dynamic /:id
// routes only ever see requests those didn't already claim.

ordersRouter.get('/', (req, res) => {
  const restaurantId = req.query.restaurant_id
  if (!restaurantId) {
    return res.status(400).json({ message: 'restaurant_id query param is required.' })
  }
  try {
    const statuses = req.query.statuses ? String(req.query.statuses).split(',').filter(Boolean) : undefined
    res.json(listOrders({ restaurantId, status: req.query.status, statuses }))
  } catch (err) {
    res.status(400).json({ message: err.message })
  }
})

ordersRouter.get('/:id', (req, res) => {
  try {
    res.json(getOrder(req.params.id))
  } catch (err) {
    res.status(404).json({ message: err.message })
  }
})

ordersRouter.patch('/:id/status', (req, res) => {
  try {
    const { status } = req.body ?? {}
    if (!status) return res.status(400).json({ message: 'status is required.' })
    res.json(advanceStatus(req.params.id, status))
  } catch (err) {
    res.status(400).json({ message: err.message })
  }
})

ordersRouter.post('/:id/refund', (req, res) => {
  try {
    const { orderItemId, qty } = req.body ?? {}
    if (!orderItemId || qty == null) {
      return res.status(400).json({ message: 'orderItemId and qty are required.' })
    }
    res.json(refundOrderItem({ orderId: req.params.id, orderItemId, qty }))
  } catch (err) {
    res.status(400).json({ message: err.message })
  }
})

ordersRouter.patch('/:id/reassign', (req, res) => {
  try {
    const { orderType, tableId } = req.body ?? {}
    res.json(reassignOrder({ orderId: req.params.id, orderType, tableId }))
  } catch (err) {
    res.status(400).json({ message: err.message })
  }
})
