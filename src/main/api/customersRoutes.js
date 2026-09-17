import { Router } from 'express'
import {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer
} from '../services/customersService.js'

// Expected mount path: /api/customers (wired centrally in main/api/index.js).
export const customersRouter = Router()

function handleError(err, res) {
  const status = err.message?.startsWith('No active session')
    ? 401
    : err.message?.endsWith('not found.')
      ? 404
      : 400
  res.status(status).json({ message: err.message })
}

customersRouter.get('/', (req, res) => {
  try {
    res.json(listCustomers({ search: req.query.search }))
  } catch (err) {
    handleError(err, res)
  }
})

customersRouter.get('/:id', (req, res) => {
  try {
    res.json(getCustomer(req.params.id))
  } catch (err) {
    handleError(err, res)
  }
})

customersRouter.post('/', (req, res) => {
  try {
    res.status(201).json(createCustomer(req.body ?? {}))
  } catch (err) {
    handleError(err, res)
  }
})

customersRouter.put('/:id', (req, res) => {
  try {
    res.json(updateCustomer(req.params.id, req.body ?? {}))
  } catch (err) {
    handleError(err, res)
  }
})

customersRouter.delete('/:id', (req, res) => {
  try {
    deleteCustomer(req.params.id)
    res.json({ success: true })
  } catch (err) {
    handleError(err, res)
  }
})
