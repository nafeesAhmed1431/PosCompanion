import { getDb } from '../index.js'
import { createRepository } from './baseRepository.js'

const base = createRepository({
  table: 'customers',
  columns: [
    'id',
    'restaurant_id',
    'name',
    'phone',
    'address',
    'default_price_level_id',
    'customer_code',
    'synced_at',
    'dirty'
  ]
})

// Simple substring search over name/phone/customer_code for the Customers
// page's search box — no FTS needed at this data volume (single-restaurant
// till, not a multi-tenant server).
function search(query) {
  const like = `%${query}%`
  return getDb()
    .prepare(
      `SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ? OR customer_code LIKE ?`
    )
    .all(like, like, like)
}

export const customersRepository = { ...base, search }
