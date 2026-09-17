import { getDb } from '../index.js'
import { createRepository } from './baseRepository.js'

const base = createRepository({
  table: 'restaurants',
  columns: [
    'id',
    'name',
    'address',
    'phone',
    'is_active',
    'supports_dine_in',
    'supports_takeaway',
    'supports_delivery',
    'default_price_level_id',
    'agent_token',
    'synced_at',
    'dirty'
  ]
})

// There is only ever one pinned restaurant row on a till, so this is a
// convenience over findAll()[0] for callers that don't care about the
// (currently theoretical) multi-row case.
function getPinned() {
  return getDb().prepare('SELECT * FROM restaurants LIMIT 1').get()
}

export const restaurantsRepository = { ...base, getPinned }
