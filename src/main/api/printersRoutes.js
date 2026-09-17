import { Router } from 'express'
import { printersService } from '../services/printersService.js'

// Mounted at /api/printers by main/api/index.js (wired centrally there to
// avoid concurrent edits on that shared file).
export const printersRouter = Router()

printersRouter.get('/', (req, res) => {
  res.json(printersService.listPrinters())
})

printersRouter.post('/', (req, res) => {
  try {
    res.status(201).json(printersService.createPrinter(req.body ?? {}))
  } catch (err) {
    res.status(400).json({ message: err.message })
  }
})

printersRouter.put('/:id', (req, res) => {
  try {
    res.json(printersService.updatePrinter(req.params.id, req.body ?? {}))
  } catch (err) {
    const status = err.message === 'Printer not found.' ? 404 : 400
    res.status(status).json({ message: err.message })
  }
})

printersRouter.delete('/:id', (req, res) => {
  printersService.deletePrinter(req.params.id)
  res.json({ success: true })
})

// Stub endpoint — see printersService.testPrint for why this intentionally
// reports failure rather than faking a successful print.
printersRouter.post('/:id/test-print', (req, res) => {
  try {
    res.json(printersService.testPrint(req.params.id))
  } catch (err) {
    res.status(404).json({ message: err.message })
  }
})
