import { getDb } from '../index.js'
import { createRepository } from './baseRepository.js'

const base = createRepository({
  table: 'order_items',
  columns: [
    'id',
    'restaurant_id',
    'order_id',
    'product_id',
    'name',
    'note',
    'qty',
    'unit_price',
    'line_total',
    'refunded_qty',
    'is_refundable',
    'synced_at',
    'dirty'
  ]
})

function findByOrder(orderId) {
  return getDb().prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId)
}

export const orderItemsRepository = { ...base, findByOrder }
