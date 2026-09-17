import { getDb } from '../index.js'
import { createRepository } from './baseRepository.js'

const base = createRepository({
  table: 'shifts',
  columns: [
    'id',
    'restaurant_id',
    'user_id',
    'label',
    'opening_balance',
    'closing_balance',
    'opened_at',
    'closed_at',
    'status',
    'synced_at',
    'dirty'
  ]
})

function findOpenForRestaurant(restaurantId) {
  return getDb()
    .prepare("SELECT * FROM shifts WHERE restaurant_id = ? AND status = 'open' LIMIT 1")
    .get(restaurantId)
}

export const shiftsRepository = { ...base, findOpenForRestaurant }
