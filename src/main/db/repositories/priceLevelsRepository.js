import { createRepository } from './baseRepository.js'

export const priceLevelsRepository = createRepository({
  table: 'price_levels',
  columns: ['id', 'name', 'sort_order', 'synced_at', 'dirty']
})
