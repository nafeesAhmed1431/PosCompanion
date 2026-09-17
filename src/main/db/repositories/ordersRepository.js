import { getDb } from '../index.js'
import { createRepository } from './baseRepository.js'

const base = createRepository({
  table: 'orders',
  columns: [
    'id',
    'restaurant_id',
    'order_no',
    'order_type',
    'status',
    'parent_order_id',
    'idempotency_key',
    'table_id',
    'customer_id',
    'subtotal',
    'discount',
    'tax',
    'service_charge',
    'total',
    'payment_method',
    'note',
    'created_at',
    'created_by',
    'shift_id',
    'synced_at',
    'dirty'
  ]
})

// The unique idempotency_key constraint means a sync retry can look this up
// before re-POSTing, matching the server's own replay-safety contract.
function findByIdempotencyKey(key) {
  return getDb().prepare('SELECT * FROM orders WHERE idempotency_key = ?').get(key)
}

function findByShift(shiftId) {
  return getDb().prepare('SELECT * FROM orders WHERE shift_id = ?').all(shiftId)
}

export const ordersRepository = { ...base, findByIdempotencyKey, findByShift }
