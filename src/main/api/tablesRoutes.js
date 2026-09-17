import { Router } from 'express'
import {
  listTables,
  createTable,
  updateTable,
  updateTableStatus,
  deleteTable
} from '../services/tablesService.js'

// Expected mount path: /api/tables (wired centrally in main/api/index.js).
export const tablesRouter = Router()

function handleError(err, res) {
  const status = err.message?.startsWith('No active session')
    ? 401
    : err.message?.endsWith('not found.')
      ? 404
      : 400
  res.status(status).json({ message: err.message })
}

tablesRouter.get('/', (req, res) => {
  try {
    res.json(listTables())
  } catch (err) {
    handleError(err, res)
  }
})

tablesRouter.post('/', (req, res) => {
  try {
    res.status(201).json(createTable(req.body ?? {}))
  } catch (err) {
    handleError(err, res)
  }
})

tablesRouter.put('/:id', (req, res) => {
  try {
    res.json(updateTable(req.params.id, req.body ?? {}))
  } catch (err) {
    handleError(err, res)
  }
})

// Separate from the general PUT so the floor-view "mark free/occupied/
// reserved" action doesn't need to resend name/seats just to change status.
tablesRouter.patch('/:id/status', (req, res) => {
  try {
    res.json(updateTableStatus(req.params.id, req.body?.status))
  } catch (err) {
    handleError(err, res)
  }
})

tablesRouter.delete('/:id', (req, res) => {
  try {
    deleteTable(req.params.id)
    res.json({ success: true })
  } catch (err) {
    handleError(err, res)
  }
})
