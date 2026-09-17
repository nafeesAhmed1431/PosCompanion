import { createRepository } from './baseRepository.js'

export const paymentMethodsRepository = createRepository({
  table: 'payment_methods',
  columns: ['id', 'restaurant_id', 'code', 'label', 'is_active', 'sort_order', 'synced_at', 'dirty']
})
