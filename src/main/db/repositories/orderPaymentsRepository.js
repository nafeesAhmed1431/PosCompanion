import { getDb } from '../index.js'
import { createRepository } from './baseRepository.js'

const base = createRepository({
  table: 'order_payments',
  columns: [
    'id',
    'order_id',
    'method',
    'amount',
    'tendered_amount',
    'change_amount',
    'synced_at',
    'dirty'
  ]
})

function findByOrder(orderId) {
  return getDb().prepare('SELECT * FROM order_payments WHERE order_id = ?').all(orderId)
}

export const orderPaymentsRepository = { ...base, findByOrder }
