import { createRepository } from './baseRepository.js'

export const categoriesRepository = createRepository({
  table: 'categories',
  columns: ['id', 'restaurant_id', 'name', 'sort_order', 'synced_at', 'dirty']
})
