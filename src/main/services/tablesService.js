import crypto from 'crypto'
import { getDb } from '../db/index.js'
import { tablesRepository } from '../db/repositories/tablesRepository.js'
import { getCurrentSession } from '../auth/authService.js'

const VALID_STATUSES = ['free', 'occupied', 'reserved']

function requireRestaurantId() {
  const restaurantId = getCurrentSession()?.selectedRestaurantId
  if (!restaurantId) {
    throw new Error('No active session — log in and select a restaurant first.')
  }
  return restaurantId
}

export function listTables() {
  const restaurantId = requireRestaurantId()
  return tablesRepository.findByRestaurant(restaurantId)
}

export function createTable({ name, seats }) {
  if (!name || !name.trim()) throw new Error('Name is required.')
  const restaurantId = requireRestaurantId()

  return tablesRepository.upsert({
    id: crypto.randomUUID(),
    restaurant_id: restaurantId,
    name: name.trim(),
    seats: Number(seats) || 0,
    status: 'free',
    synced_at: null,
    dirty: 1
  })
}

export function updateTable(id, { name, seats }) {
  const existing = tablesRepository.findById(id)
  if (!existing) throw new Error('Table not found.')
  if (!name || !name.trim()) throw new Error('Name is required.')

  return tablesRepository.upsert({
    ...existing,
    name: name.trim(),
    seats: Number(seats) || 0,
    dirty: 1
  })
}

// Split out from updateTable() as its own path (rather than requiring the
// caller to re-send name/seats) since "mark a table free/occupied/reserved"
// is the actual day-to-day floor-view action — a small dedicated UPDATE
// instead of round-tripping the full row through upsert().
export function updateTableStatus(id, status) {
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`Status must be one of: ${VALID_STATUSES.join(', ')}.`)
  }
  const existing = tablesRepository.findById(id)
  if (!existing) throw new Error('Table not found.')

  getDb().prepare('UPDATE restaurant_tables SET status = ?, dirty = 1 WHERE id = ?').run(status, id)
  return tablesRepository.findById(id)
}

export function deleteTable(id) {
  const existing = tablesRepository.findById(id)
  if (!existing) throw new Error('Table not found.')
  tablesRepository.remove(id)
}
