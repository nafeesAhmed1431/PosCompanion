import { createRepository } from './baseRepository.js'

export const tablesRepository = createRepository({
  table: 'restaurant_tables',
  columns: ['id', 'restaurant_id', 'name', 'seats', 'status', 'synced_at', 'dirty']
})
