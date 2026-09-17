import { getDb } from '../index.js'
import { createRepository } from './baseRepository.js'

const base = createRepository({
  table: 'products',
  columns: [
    'id',
    'restaurant_id',
    'category_id',
    'name',
    'sku',
    'image_url',
    'price',
    'tax_rate',
    'is_active',
    'is_refundable',
    'is_ready_to_sale',
    'synced_at',
    'dirty'
  ]
})

function findByCategory(categoryId) {
  return getDb().prepare('SELECT * FROM products WHERE category_id = ?').all(categoryId)
}

function findActiveByRestaurant(restaurantId) {
  return getDb()
    .prepare('SELECT * FROM products WHERE restaurant_id = ? AND is_active = 1')
    .all(restaurantId)
}

export const productsRepository = { ...base, findByCategory, findActiveByRestaurant }
